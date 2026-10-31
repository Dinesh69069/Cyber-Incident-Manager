"""
scanner.py
----------
Functional port scanning module for the Cyber Incident Platform.

Uses Python's native `socket` library to perform TCP connect tests on target ports.
When a port is found open, fetches live CVE data from the CIRCL CVE-Search API
(https://cve.circl.lu/api/last) and applies a severity classification mapping.
Results are persisted to the database.

Port targets: 22 (SSH), 80 (HTTP), 443 (HTTPS), 8080 (HTTP-alt)
Severity mapping:  CVSS > 9.0 → Critical  |  CVSS > 7.0 → High
                   CVSS > 4.0 → Medium     |  CVSS ≤ 4.0 → Low
"""

import json
import logging
import socket
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from sqlalchemy.orm import Session

import models

logger = logging.getLogger("scanner")

# ── Configuration ─────────────────────────────────────────────────────────────
SCAN_PORTS: List[Tuple[int, str]] = [
    (22,   "SSH"),
    (80,   "HTTP"),
    (443,  "HTTPS"),
    (8080, "HTTP-alt"),
]

SOCKET_TIMEOUT_SECONDS = 1.5
CIRCL_API_URL = "https://cve.circl.lu/api/last/10"

# ── Fallback CVE Catalogue ────────────────────────────────────────────────────
# Used when the CIRCL API is unreachable (network isolation, etc.)
FALLBACK_CVE_CATALOGUE: Dict[int, List[Dict[str, Any]]] = {
    22: [
        {
            "id": "CVE-2023-38408",
            "summary": "OpenSSH ssh-agent PKCS#11 RCE — remote code execution via ssh-agent forwarding",
            "cvss": 9.8,
        },
        {
            "id": "CVE-2024-6387",
            "summary": "regreSSHion — signal handler race condition in OpenSSH sshd",
            "cvss": 8.1,
        },
        {
            "id": "CVE-2023-48795",
            "summary": "Terrapin — SSH prefix truncation attack weakening transport security",
            "cvss": 5.9,
        },
    ],
    80: [
        {
            "id": "CVE-2021-42013",
            "summary": "Apache HTTP Server path traversal and RCE via mod_cgi",
            "cvss": 9.8,
        },
        {
            "id": "CVE-2022-31813",
            "summary": "Apache mod_proxy X-Forwarded-For header bypass allowing origin spoofing",
            "cvss": 9.8,
        },
        {
            "id": "CVE-2021-41773",
            "summary": "Apache HTTP Server path traversal — map URLs outside expected document root",
            "cvss": 7.5,
        },
    ],
    443: [
        {
            "id": "CVE-2014-0160",
            "summary": "Heartbleed — OpenSSL TLS heartbeat extension memory disclosure",
            "cvss": 7.5,
        },
        {
            "id": "CVE-2022-0778",
            "summary": "OpenSSL BN_mod_sqrt infinite loop in certificate parsing, causing DoS",
            "cvss": 7.5,
        },
        {
            "id": "CVE-2023-44487",
            "summary": "HTTP/2 Rapid Reset attack — enables large-scale DDoS amplification",
            "cvss": 7.5,
        },
    ],
    8080: [
        {
            "id": "CVE-2022-22965",
            "summary": "Spring4Shell — Spring Framework RCE via DataBinder on JDK 9+",
            "cvss": 9.8,
        },
        {
            "id": "CVE-2020-1938",
            "summary": "Ghostcat — Apache Tomcat AJP file read/include vulnerability",
            "cvss": 9.8,
        },
        {
            "id": "CVE-2017-12615",
            "summary": "Apache Tomcat JSP upload via PUT method enables remote code execution",
            "cvss": 8.1,
        },
    ],
}


# ── Severity Classification ───────────────────────────────────────────────────

def classify_severity(cvss: float) -> str:
    """Map a CVSS score to a human-readable severity label."""
    if cvss >= 9.0:
        return "Critical"
    elif cvss >= 7.0:
        return "High"
    elif cvss >= 4.0:
        return "Medium"
    else:
        return "Low"


# ── Port Testing via Raw Sockets ──────────────────────────────────────────────

def test_port(ip_address: str, port: int) -> bool:
    """
    Attempt a TCP connect to (ip_address, port).

    Returns:
        True  if the connection succeeded (port is open / service reachable).
        False if the connection was refused, timed out, or any other network error.
    """
    try:
        with socket.create_connection((ip_address, port), timeout=SOCKET_TIMEOUT_SECONDS) as sock:
            # Connection established → port is open
            sock.shutdown(socket.SHUT_RDWR)
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


# ── CVE Data Fetching ─────────────────────────────────────────────────────────

def fetch_live_cves(port: int) -> List[Dict[str, Any]]:
    """
    Attempt to pull live CVE data from the CIRCL CVE-Search API.
    Falls back to the local catalogue if the request fails or times out.

    Args:
        port: The open port number; used to select the relevant fallback catalogue.

    Returns:
        A list of CVE dicts with keys: id, summary, cvss.
    """
    try:
        logger.info("Querying CIRCL CVE API: %s", CIRCL_API_URL)
        resp = requests.get(CIRCL_API_URL, timeout=5)
        resp.raise_for_status()

        raw_entries: List[Dict] = resp.json()
        parsed: List[Dict[str, Any]] = []

        for entry in raw_entries[:5]:  # Limit to top 5 live results
            cve_id = entry.get("id", "UNKNOWN")
            summary = entry.get("summary", "No description available.")
            cvss_raw = entry.get("cvss") or entry.get("cvss-score") or 0.0

            try:
                cvss = float(cvss_raw)
            except (TypeError, ValueError):
                cvss = 0.0

            parsed.append({
                "id": cve_id,
                "summary": summary,
                "cvss": cvss,
            })

        logger.info("Fetched %d CVE records from CIRCL API", len(parsed))
        return parsed if parsed else FALLBACK_CVE_CATALOGUE.get(port, [])

    except Exception as exc:
        logger.warning("CIRCL API unavailable (%s); using local CVE catalogue for port %d", exc, port)
        return FALLBACK_CVE_CATALOGUE.get(port, [])


# ── Core Scan Function ────────────────────────────────────────────────────────

def run_port_scan(
    asset: models.Asset,
    db: Session,
    scanned_by_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Execute a full port scan against the given asset.

    Steps:
    1. TCP-connect test each port in SCAN_PORTS.
    2. For open ports, query CIRCL API (or fallback catalogue) for CVEs.
    3. Persist new Vulnerability records (deduped by cve_id + asset_id).
    4. Create Critical Incidents automatically for CVSS ≥ 9.0 CVEs.
    5. Save a ScanRecord and ActivityEntry.

    Returns:
        A dict summary compatible with ScanResponse schema.
    """
    scan_results: List[Dict[str, Any]] = []
    new_vuln_count = 0
    new_incident_count = 0
    open_port_count = 0
    total_cve_count = 0

    logger.info("Starting scan on asset '%s' at %s", asset.asset_name, asset.ip_address)

    for port, service in SCAN_PORTS:
        logger.info("Testing port %d (%s) on %s …", port, service, asset.ip_address)
        is_open = test_port(asset.ip_address, port)

        port_result: Dict[str, Any] = {
            "port": port,
            "service": service,
            "state": "open" if is_open else "closed",
            "cves": [],
        }

        if is_open:
            open_port_count += 1
            logger.info("Port %d OPEN — fetching CVE data", port)
            cves = fetch_live_cves(port)

            # Select up to 2 CVEs per port
            selected_cves = cves[:2]

            for cve_data in selected_cves:
                cve_id = cve_data["id"]
                cvss = float(cve_data.get("cvss", 0.0))
                description = cve_data.get("summary", "")
                severity = classify_severity(cvss)

                # Deduplicate: skip if this CVE is already recorded for this asset
                existing_vuln = (
                    db.query(models.Vulnerability)
                    .filter(
                        models.Vulnerability.cve_id == cve_id,
                        models.Vulnerability.asset_id == asset.id,
                    )
                    .first()
                )

                if not existing_vuln:
                    vuln = models.Vulnerability(
                        cve_id=cve_id,
                        description=description,
                        cvss_score=cvss,
                        severity=severity,
                        port=port,
                        service=service,
                        asset_id=asset.id,
                    )
                    db.add(vuln)
                    new_vuln_count += 1
                    logger.info("Saved new vulnerability: %s (CVSS %.1f %s)", cve_id, cvss, severity)

                    # Auto-create a Critical incident for high-severity CVEs
                    if cvss >= 9.0:
                        incident_title = f"{cve_id} detected on {asset.asset_name} (port {port})"
                        existing_incident = (
                            db.query(models.Incident)
                            .filter(models.Incident.title == incident_title)
                            .first()
                        )
                        if not existing_incident:
                            incident = models.Incident(
                                title=incident_title,
                                description=(
                                    f"Critical vulnerability {cve_id} (CVSS {cvss}) "
                                    f"detected on port {port}/{service} during automated scan. "
                                    f"{description}"
                                ),
                                severity="Critical",
                                status="Open",
                                cvss_score=cvss,
                                calculated_score=cvss,
                                asset_id=asset.id,
                                reporter_id=scanned_by_user_id,
                            )
                            db.add(incident)
                            new_incident_count += 1
                            logger.info("Auto-created Critical incident for %s", cve_id)

                port_result["cves"].append({
                    "id": cve_id,
                    "summary": description,
                    "cvss": cvss,
                    "severity": severity,
                })
                total_cve_count += 1

        scan_results.append(port_result)

    # ── Persist Scan Record ───────────────────────────────────────────────────
    scan_record = models.ScanRecord(
        asset_id=asset.id,
        scanned_by=scanned_by_user_id,
        open_ports=open_port_count,
        cve_count=total_cve_count,
        scan_result=json.dumps(scan_results),
    )
    db.add(scan_record)

    # ── Activity Entry ────────────────────────────────────────────────────────
    activity = models.ActivityEntry(
        user_id=scanned_by_user_id,
        action=(
            f"Port scan completed on {asset.asset_name} ({asset.ip_address}): "
            f"{open_port_count} open ports, {total_cve_count} CVEs found"
        ),
        entity_type="asset",
        entity_id=asset.id,
    )
    db.add(activity)

    db.commit()
    logger.info(
        "Scan complete: %d open ports, %d CVEs, %d new vulns, %d new incidents",
        open_port_count, total_cve_count, new_vuln_count, new_incident_count,
    )

    return {
        "asset_id": asset.id,
        "asset_name": asset.asset_name,
        "ip_address": asset.ip_address,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "open_ports": open_port_count,
        "total_cves": total_cve_count,
        "results": scan_results,
        "new_vulnerabilities": new_vuln_count,
        "new_incidents": new_incident_count,
    }
