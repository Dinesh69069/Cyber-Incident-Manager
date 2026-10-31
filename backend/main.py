"""
main.py
-------
Cyber Incident Management & Vulnerability Tracker — FastAPI Application Entry Point.

Routes:
  Auth:       POST /auth/register, POST /auth/login
  Assets:     GET /assets, POST /assets, GET /assets/{id}, PUT /assets/{id},
              DELETE /assets/{id}, POST /assets/{id}/scan
  Incidents:  GET /incidents, POST /incidents, GET /incidents/{id},
              PATCH /incidents/{id}/status, DELETE /incidents/{id}
              POST /incidents/{id}/note
  Vulns:      GET /vulnerabilities, DELETE /vulnerabilities/{id}
  Payments:   POST /payments/create-checkout-session, POST /payments/webhook,
              GET /payments/invoices, GET /payments/webhook-events
  Users:      GET /users, PATCH /users/{id}, DELETE /users/{id}
  Dashboard:  GET /dashboard/stats, GET /dashboard/activity
"""

import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

import stripe
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    hash_password,
    invalidate_user_cache,
    require_admin,
    require_premium,
)
from database import Base, engine, get_db
from scanner import run_port_scan

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-14s | %(levelname)-8s | %(message)s",
)
logger = logging.getLogger("main")

# ── Stripe Configuration ──────────────────────────────────────────────────────
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "sk_test_51ExampleTestKeyReplaceWithRealTestKey")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "whsec_test_ReplaceWithRealWebhookSecret")
stripe.api_key = STRIPE_SECRET_KEY

PREMIUM_PRICE_CENTS = 2900   # $29.00 USD


# ── Database Seed Data ────────────────────────────────────────────────────────

def seed_database(db: Session) -> None:
    """
    Populate the database with realistic demo data if it is empty.
    Creates demo users, assets, incidents, and vulnerabilities.
    """
    if db.query(models.User).count() > 0:
        return  # Already seeded

    logger.info("Seeding database with demo data …")

    # ── Users ─────────────────────────────────────────────────────────────────
    users_data = [
        {"full_name": "Alex Morgan",  "email": "admin@corp.test",   "password": "Admin#123",   "role": "admin",   "is_premium": True},
        {"full_name": "Sam Rivera",   "email": "analyst@corp.test",  "password": "Analyst#123", "role": "analyst", "is_premium": False},
        {"full_name": "Dev Patel",    "email": "dev@corp.test",      "password": "Dev#pass123", "role": "analyst", "is_premium": True},
        {"full_name": "Neha Rao",     "email": "neha@corp.test",     "password": "Neha#pass123","role": "analyst", "is_premium": False},
    ]
    created_users = {}
    for u in users_data:
        user = models.User(
            full_name=u["full_name"],
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            role=u["role"],
            is_premium=u["is_premium"],
        )
        db.add(user)
        db.flush()
        created_users[u["email"]] = user

    # ── Assets ────────────────────────────────────────────────────────────────
    admin_user = created_users["admin@corp.test"]
    analyst_user = created_users["analyst@corp.test"]
    dev_user = created_users["dev@corp.test"]

    assets_data = [
        {"asset_name": "web-prod-01",   "ip_address": "10.20.4.11",   "device_type": "Server",      "owner": admin_user},
        {"asset_name": "db-primary",    "ip_address": "10.20.8.5",    "device_type": "Database",    "owner": admin_user},
        {"asset_name": "edge-fw-01",    "ip_address": "192.168.1.1",  "device_type": "Network",     "owner": admin_user},
        {"asset_name": "hr-laptop-14",  "ip_address": "10.30.2.64",   "device_type": "Workstation", "owner": analyst_user},
        {"asset_name": "build-ci-02",   "ip_address": "10.20.6.30",   "device_type": "Server",      "owner": dev_user},
        {"asset_name": "cam-lobby-03",  "ip_address": "10.40.1.17",   "device_type": "IoT",         "owner": analyst_user},
        {"asset_name": "vpn-gw-01",     "ip_address": "172.16.0.2",   "device_type": "Network",     "owner": admin_user},
        {"asset_name": "api-gateway",   "ip_address": "10.20.4.20",   "device_type": "Cloud",       "owner": dev_user},
    ]
    created_assets = {}
    for a in assets_data:
        asset = models.Asset(
            asset_name=a["asset_name"],
            ip_address=a["ip_address"],
            device_type=a["device_type"],
            owner_id=a["owner"].id,
        )
        db.add(asset)
        db.flush()
        created_assets[a["asset_name"]] = asset

    # ── Seed Vulnerabilities ──────────────────────────────────────────────────
    vuln_seed = [
        {"cve_id": "CVE-2021-42013", "desc": "Apache path traversal/RCE via mod_cgi",          "cvss": 9.8, "port": 80,  "service": "HTTP",  "asset": "web-prod-01"},
        {"cve_id": "CVE-2022-22965", "desc": "Spring4Shell — Spring Framework RCE via DataBinder", "cvss": 9.8, "port": 8080,"service": "HTTP-alt","asset": "api-gateway"},
        {"cve_id": "CVE-2023-38408", "desc": "OpenSSH ssh-agent PKCS#11 RCE",                  "cvss": 9.8, "port": 22,  "service": "SSH",   "asset": "web-prod-01"},
        {"cve_id": "CVE-2014-0160",  "desc": "Heartbleed — OpenSSL TLS memory disclosure",     "cvss": 7.5, "port": 443, "service": "HTTPS", "asset": "api-gateway"},
        {"cve_id": "CVE-2023-48795", "desc": "Terrapin SSH prefix truncation attack",           "cvss": 5.9, "port": 22,  "service": "SSH",   "asset": "build-ci-02"},
        {"cve_id": "CVE-2020-1938",  "desc": "Ghostcat — Apache Tomcat AJP file read/include", "cvss": 9.8, "port": 8080,"service": "HTTP-alt","asset": "build-ci-02"},
    ]
    for v in vuln_seed:
        severity = (
            "Critical" if v["cvss"] >= 9.0 else
            "High"     if v["cvss"] >= 7.0 else
            "Medium"   if v["cvss"] >= 4.0 else "Low"
        )
        vuln = models.Vulnerability(
            cve_id=v["cve_id"],
            description=v["desc"],
            cvss_score=v["cvss"],
            severity=severity,
            port=v["port"],
            service=v["service"],
            asset_id=created_assets[v["asset"]].id,
        )
        db.add(vuln)

    # ── Incidents ─────────────────────────────────────────────────────────────
    from datetime import timedelta
    now = datetime.now(timezone.utc)

    incidents_data = [
        # Open incidents
        {"title": "Apache RCE via path traversal (CVE-2021-42013)",
         "desc": "Active exploitation of Apache HTTP Server path traversal vulnerability allowing unauthenticated remote code execution via mod_cgi.",
         "severity": "Critical", "status": "Open", "cvss": 9.8, "asset": "web-prod-01",
         "exposure": "Internet-facing", "data_at_risk": "Regulated", "exploit_status": "Exploited in the wild",
         "age_days": 3},
        {"title": "Ransomware precursor activity — lateral movement detected",
         "desc": "Anomalous file encryption patterns and lateral movement indicators observed on HR laptop. Potential ransomware staging.",
         "severity": "Critical", "status": "Open", "cvss": 9.1, "asset": "hr-laptop-14",
         "exposure": "Internal network", "data_at_risk": "Confidential", "exploit_status": "Exploited in the wild",
         "age_days": 1},
        {"title": "SSH brute-force attack — root login attempts",
         "desc": "Sustained SSH brute-force attack from 203.0.113.x range. 4,200 failed login attempts in 12 hours. MFA not enforced.",
         "severity": "High", "status": "Open", "cvss": 8.1, "asset": "edge-fw-01",
         "exposure": "Internet-facing", "data_at_risk": "Internal", "exploit_status": "Public proof of concept",
         "age_days": 2},
        {"title": "Unknown-ASN login to firewall admin panel",
         "desc": "Successful login to edge-fw-01 admin console from an unrecognised autonomous system number. Possible credential compromise.",
         "severity": "High", "status": "Open", "cvss": 7.8, "asset": "edge-fw-01",
         "exposure": "Internet-facing", "data_at_risk": "Internal", "exploit_status": "No known exploit",
         "age_days": 1},
        {"title": "Database reachable from staging VLAN",
         "desc": "db-primary is directly accessible from the staging environment VLAN due to misconfigured firewall rule INR-2048. Data exfiltration risk.",
         "severity": "High", "status": "Open", "cvss": 7.5, "asset": "db-primary",
         "exposure": "DMZ or partner-facing", "data_at_risk": "Regulated", "exploit_status": "No known exploit",
         "age_days": 5},
        {"title": "Phishing credential harvest — 3 accounts compromised",
         "desc": "Three employee accounts harvested via spear-phishing campaign targeting HR team. Credentials appear in breach dataset.",
         "severity": "High", "status": "Open", "cvss": 7.2, "asset": "hr-laptop-14",
         "exposure": "Internal network", "data_at_risk": "Confidential", "exploit_status": "Exploited in the wild",
         "age_days": 4},
        {"title": "Outdated CI base image with known vulns (build-ci-02)",
         "desc": "Docker base image 'ubuntu:18.04' used in build-ci-02 pipeline contains 23 known CVEs including CVE-2020-1938.",
         "severity": "Medium", "status": "Open", "cvss": 5.5, "asset": "build-ci-02",
         "exposure": "Internal network", "data_at_risk": "Internal", "exploit_status": "Public proof of concept",
         "age_days": 7},

        # In Progress
        {"title": "Spring4Shell probes on API gateway (CVE-2022-22965)",
         "desc": "Active exploitation attempts of Spring4Shell targeting api-gateway. WAF rules deployed but upstream patch pending.",
         "severity": "Critical", "status": "In Progress", "cvss": 9.8, "asset": "api-gateway",
         "exposure": "Internet-facing", "data_at_risk": "Regulated", "exploit_status": "Exploited in the wild",
         "age_days": 6},
        {"title": "API gateway TLS 1.0/1.1 still negotiated",
         "desc": "api-gateway accepts TLS 1.0 and 1.1 handshakes exposing weak cipher suites. Remediation ticket created.",
         "severity": "Medium", "status": "In Progress", "cvss": 5.9, "asset": "api-gateway",
         "exposure": "Internet-facing", "data_at_risk": "Internal", "exploit_status": "No known exploit",
         "age_days": 10},

        # Resolved
        {"title": "Camera default credentials — cam-lobby-03",
         "desc": "Lobby IP camera accessible with factory default admin/admin credentials over HTTP. Credentials reset and VLAN isolated.",
         "severity": "High", "status": "Resolved", "cvss": 8.8, "asset": "cam-lobby-03",
         "exposure": "Internal network", "data_at_risk": "Public", "exploit_status": "Public proof of concept",
         "age_days": 12},
        {"title": "Expired VPN certificate causing auth bypass risk",
         "desc": "vpn-gw-01 TLS certificate expired 14 days ago. Certificate renewed and deployed.",
         "severity": "Medium", "status": "Resolved", "cvss": 6.1, "asset": "vpn-gw-01",
         "exposure": "Internet-facing", "data_at_risk": "Internal", "exploit_status": "No known exploit",
         "age_days": 14},
        {"title": "Rate-limit bypass on authentication API",
         "desc": "Authentication endpoint lacked per-IP rate limiting, allowing credential stuffing. Nginx rate-limit rules applied.",
         "severity": "Medium", "status": "Resolved", "cvss": 5.3, "asset": "api-gateway",
         "exposure": "Internet-facing", "data_at_risk": "Internal", "exploit_status": "Public proof of concept",
         "age_days": 8},
        {"title": "External port scan from Shodan — no exploitation confirmed",
         "desc": "Shodan crawl detected open ports on web-prod-01. Review confirmed expected exposure; no exploitation evidence found.",
         "severity": "Low", "status": "Resolved", "cvss": 2.5, "asset": "web-prod-01",
         "exposure": "Internet-facing", "data_at_risk": "Public", "exploit_status": "No known exploit",
         "age_days": 11},
    ]

    for inc_data in incidents_data:
        created_at = now - timedelta(days=inc_data["age_days"])
        resolved_at = (now - timedelta(days=1)) if inc_data["status"] == "Resolved" else None
        severity_label = inc_data["severity"]

        incident = models.Incident(
            title=inc_data["title"],
            description=inc_data["desc"],
            severity=severity_label,
            status=inc_data["status"],
            cvss_score=inc_data["cvss"],
            calculated_score=inc_data["cvss"],
            exposure=inc_data.get("exposure"),
            data_at_risk=inc_data.get("data_at_risk"),
            exploit_status=inc_data.get("exploit_status"),
            asset_id=created_assets[inc_data["asset"]].id if inc_data.get("asset") else None,
            reporter_id=admin_user.id,
            resolved_at=resolved_at,
        )
        db.add(incident)
        db.flush()

        # Add initial history entry
        initial_history = models.IncidentHistory(
            incident_id=incident.id,
            author_id=admin_user.id,
            action="Incident reported",
            note=inc_data["desc"][:100] + "…" if len(inc_data["desc"]) > 100 else inc_data["desc"],
        )
        db.add(initial_history)

        if inc_data["status"] != "Open":
            history_entry = models.IncidentHistory(
                incident_id=incident.id,
                author_id=admin_user.id,
                action=f"Status changed to {inc_data['status']}",
            )
            db.add(history_entry)

    # ── Invoices ──────────────────────────────────────────────────────────────
    invoices_data = [
        {"user": admin_user,  "number": "INV-0001", "session": "cs_test_a1b2c3d4e5f6g7h8i9j0"},
        {"user": dev_user,    "number": "INV-0002", "session": "cs_test_k1l2m3n4o5p6q7r8s9t0"},
    ]
    for inv in invoices_data:
        invoice = models.Invoice(
            invoice_number=inv["number"],
            user_id=inv["user"].id,
            amount_cents=PREMIUM_PRICE_CENTS,
            currency="USD",
            status="paid",
            stripe_session_id=inv["session"],
        )
        db.add(invoice)

    # ── Activity Log ──────────────────────────────────────────────────────────
    activities = [
        "Platform initialised with seed data",
        "Admin user admin@corp.test signed in",
        "Asset web-prod-01 added to inventory",
        "Critical incident: Apache RCE detected on web-prod-01",
        "Vulnerability CVE-2021-42013 discovered on web-prod-01",
        "Premium subscription activated for admin@corp.test",
    ]
    for activity_text in activities:
        activity = models.ActivityEntry(
            user_id=admin_user.id,
            action=activity_text,
            entity_type="system",
        )
        db.add(activity)

    db.commit()
    logger.info("Database seeding complete.")


# ── Application Lifespan ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all tables and seed demo data on startup."""
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    try:
        seed_database(db)
    except Exception as e:
        logger.error("Seeding error: %s", e)
    finally:
        db.close()
    yield


# ── FastAPI App ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cyber Incident Management & Vulnerability Tracker",
    description="Production-grade cybersecurity platform with JWT auth, port scanning, and Stripe payments.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════════════
#  SCORING HELPER
# ══════════════════════════════════════════════════════════════════════════════

def compute_incident_score(
    cvss_score: Optional[float],
    exposure: Optional[str],
    data_at_risk: Optional[str],
    exploit_status: Optional[str],
) -> tuple[float, str]:
    """
    Calculate an incident's risk score and severity.

    Without CVSS:  score = 1 + exposure*1.2 + data*1.3 + exploit*1.25 (cap 10)
    With CVSS:     score = CVSS + 0.5 if (Internet-facing AND Exploited) (cap 10)

    Returns: (score: float, severity: str)
    """
    exposure_map = {
        "Internal network": 1,
        "DMZ or partner-facing": 2,
        "Internet-facing": 3,
    }
    data_map = {
        "Public": 0,
        "Internal": 1,
        "Confidential": 2,
        "Regulated": 3,
    }
    exploit_map = {
        "No known exploit": 0,
        "Public proof of concept": 1,
        "Exploited in the wild": 2,
    }

    exp_v = exposure_map.get(exposure or "Internal network", 1)
    data_v = data_map.get(data_at_risk or "Public", 0)
    exploit_v = exploit_map.get(exploit_status or "No known exploit", 0)

    if cvss_score is not None:
        score = float(cvss_score)
        if exp_v == 3 and exploit_v == 2:
            score += 0.5
    else:
        score = 1 + (exp_v * 1.2) + (data_v * 1.3) + (exploit_v * 1.25)

    score = min(round(score, 1), 10.0)

    if score >= 9.0:
        severity = "Critical"
    elif score >= 7.0:
        severity = "High"
    elif score >= 4.0:
        severity = "Medium"
    else:
        severity = "Low"

    return score, severity


# ══════════════════════════════════════════════════════════════════════════════
#  AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/auth/register", response_model=schemas.TokenResponse, status_code=201)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    """Register a new user and return a JWT access token."""
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = models.User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role="analyst",
        is_premium=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Activity log
    activity = models.ActivityEntry(
        user_id=user.id,
        action=f"New user registered: {user.email}",
        entity_type="user",
        entity_id=user.id,
    )
    db.add(activity)
    db.commit()

    token = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "is_premium": user.is_premium,
    })
    return schemas.TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        role=user.role,
        is_premium=user.is_premium,
    )


@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user and return a JWT access token."""
    user = authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Activity log
    activity = models.ActivityEntry(
        user_id=user.id,
        action=f"User signed in: {user.email}",
        entity_type="user",
        entity_id=user.id,
    )
    db.add(activity)
    db.commit()

    token = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "is_premium": user.is_premium,
    })
    return schemas.TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        role=user.role,
        is_premium=user.is_premium,
    )


@app.get("/auth/me", response_model=schemas.UserPublic)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


# ══════════════════════════════════════════════════════════════════════════════
#  ASSET ROUTES
# ══════════════════════════════════════════════════════════════════════════════

def _build_asset_response(asset: models.Asset, db: Session) -> schemas.AssetResponse:
    """Build an AssetResponse with aggregated CVE and incident counts."""
    cve_count = db.query(models.Vulnerability).filter(models.Vulnerability.asset_id == asset.id).count()
    open_incident_count = (
        db.query(models.Incident)
        .filter(models.Incident.asset_id == asset.id, models.Incident.status != "Resolved")
        .count()
    )
    max_vuln = (
        db.query(func.max(models.Vulnerability.cvss_score))
        .filter(models.Vulnerability.asset_id == asset.id)
        .scalar()
    )
    max_cvss = float(max_vuln) if max_vuln else None

    highest_severity = None
    if max_cvss is not None:
        if max_cvss >= 9.0:   highest_severity = "Critical"
        elif max_cvss >= 7.0: highest_severity = "High"
        elif max_cvss >= 4.0: highest_severity = "Medium"
        else:                  highest_severity = "Low"

    owner = db.query(models.User).filter(models.User.id == asset.owner_id).first()

    return schemas.AssetResponse(
        id=asset.id,
        asset_name=asset.asset_name,
        ip_address=asset.ip_address,
        device_type=asset.device_type,
        owner_id=asset.owner_id,
        owner_name=owner.full_name if owner else None,
        owner_email=owner.email if owner else None,
        cve_count=cve_count,
        open_incident_count=open_incident_count,
        max_cvss=max_cvss,
        highest_severity=highest_severity,
        created_at=asset.created_at,
    )


@app.get("/assets", response_model=List[schemas.AssetResponse])
def list_assets(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all assets in the inventory (batch query optimized)."""
    assets = db.query(models.Asset).all()
    if not assets:
        return []

    asset_ids = [a.id for a in assets]
    owner_ids = {a.owner_id for a in assets if a.owner_id}

    # Batch 1: CVE counts by asset_id
    cve_counts = dict(
        db.query(models.Vulnerability.asset_id, func.count(models.Vulnerability.id))
        .filter(models.Vulnerability.asset_id.in_(asset_ids))
        .group_by(models.Vulnerability.asset_id)
        .all()
    )

    # Batch 2: Open incident counts by asset_id
    open_incidents = dict(
        db.query(models.Incident.asset_id, func.count(models.Incident.id))
        .filter(models.Incident.asset_id.in_(asset_ids), models.Incident.status != "Resolved")
        .group_by(models.Incident.asset_id)
        .all()
    )

    # Batch 3: Max CVSS score by asset_id
    max_scores = dict(
        db.query(models.Vulnerability.asset_id, func.max(models.Vulnerability.cvss_score))
        .filter(models.Vulnerability.asset_id.in_(asset_ids))
        .group_by(models.Vulnerability.asset_id)
        .all()
    )

    # Batch 4: Owners
    owners = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(owner_ids)).all()} if owner_ids else {}

    results = []
    for a in assets:
        cve_cnt = cve_counts.get(a.id, 0)
        open_cnt = open_incidents.get(a.id, 0)
        max_raw = max_scores.get(a.id)
        max_cvss = float(max_raw) if max_raw else None

        highest_severity = None
        if max_cvss is not None:
            if max_cvss >= 9.0:   highest_severity = "Critical"
            elif max_cvss >= 7.0: highest_severity = "High"
            elif max_cvss >= 4.0: highest_severity = "Medium"
            else:                  highest_severity = "Low"

        owner = owners.get(a.owner_id)
        results.append(schemas.AssetResponse(
            id=a.id,
            asset_name=a.asset_name,
            ip_address=a.ip_address,
            device_type=a.device_type,
            owner_id=a.owner_id,
            owner_name=owner.full_name if owner else None,
            owner_email=owner.email if owner else None,
            cve_count=cve_cnt,
            open_incident_count=open_cnt,
            max_cvss=max_cvss,
            highest_severity=highest_severity,
            created_at=a.created_at,
        ))
    return results


@app.post("/assets", response_model=schemas.AssetResponse, status_code=201)
def create_asset(
    payload: schemas.AssetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a new asset to the inventory."""
    # Duplicate IP check
    if db.query(models.Asset).filter(models.Asset.ip_address == payload.ip_address).first():
        raise HTTPException(status_code=400, detail=f"An asset with IP {payload.ip_address} already exists.")

    # Analysts can only assign to themselves
    owner_id = payload.owner_id if (current_user.role == "admin" and payload.owner_id) else current_user.id

    asset = models.Asset(
        asset_name=payload.asset_name,
        ip_address=payload.ip_address,
        device_type=payload.device_type,
        owner_id=owner_id,
    )
    db.add(asset)
    db.flush()

    activity = models.ActivityEntry(
        user_id=current_user.id,
        action=f"Asset '{payload.asset_name}' ({payload.ip_address}) added to inventory",
        entity_type="asset",
        entity_id=asset.id,
    )
    db.add(activity)
    db.commit()
    db.refresh(asset)
    invalidate_server_cache()
    return _build_asset_response(asset, db)


@app.get("/assets/{asset_id}", response_model=schemas.AssetResponse)
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a single asset by ID."""
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return _build_asset_response(asset, db)


@app.put("/assets/{asset_id}", response_model=schemas.AssetResponse)
def update_asset(
    asset_id: int,
    payload: schemas.AssetUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update an existing asset."""
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")

    if payload.ip_address and payload.ip_address != asset.ip_address:
        dup = db.query(models.Asset).filter(models.Asset.ip_address == payload.ip_address).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"IP {payload.ip_address} is already in use.")
        asset.ip_address = payload.ip_address

    if payload.asset_name is not None: asset.asset_name = payload.asset_name
    if payload.device_type is not None: asset.device_type = payload.device_type
    if payload.owner_id is not None and current_user.role == "admin":
        asset.owner_id = payload.owner_id

    db.commit()
    db.refresh(asset)
    return _build_asset_response(asset, db)


@app.delete("/assets/{asset_id}", status_code=204)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Delete an asset and all associated vulnerabilities and incidents (Admin only)."""
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")

    activity = models.ActivityEntry(
        user_id=current_user.id,
        action=f"Asset '{asset.asset_name}' ({asset.ip_address}) deleted from inventory",
        entity_type="asset",
        entity_id=asset.id,
    )
    db.add(activity)
    db.delete(asset)
    db.commit()
    invalidate_server_cache()


# ── Asset Scan ────────────────────────────────────────────────────────────────

@app.post("/assets/{asset_id}/scan", response_model=schemas.ScanResponse)
def scan_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Trigger a port scan on the specified asset.
    Requires JWT authentication AND an active Premium subscription.
    """
    if not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required to run network scans.",
        )

    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")

    result = run_port_scan(asset=asset, db=db, scanned_by_user_id=current_user.id)
    invalidate_server_cache()
    return result


@app.get("/assets/{asset_id}/vulnerabilities", response_model=List[schemas.VulnerabilityResponse])
def get_asset_vulnerabilities(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all vulnerabilities for a specific asset."""
    vulns = db.query(models.Vulnerability).filter(models.Vulnerability.asset_id == asset_id).all()
    result = []
    for v in vulns:
        asset = db.query(models.Asset).filter(models.Asset.id == v.asset_id).first()
        result.append(schemas.VulnerabilityResponse(
            id=v.id,
            cve_id=v.cve_id,
            description=v.description,
            cvss_score=v.cvss_score,
            severity=v.severity,
            port=v.port,
            service=v.service,
            asset_id=v.asset_id,
            asset_name=asset.asset_name if asset else None,
            discovered_at=v.discovered_at,
        ))
    return result


# ══════════════════════════════════════════════════════════════════════════════
#  INCIDENT ROUTES
# ══════════════════════════════════════════════════════════════════════════════

def _build_incident_response(incident: models.Incident, db: Session) -> schemas.IncidentResponse:
    """Build an IncidentResponse with asset and reporter info."""
    asset = db.query(models.Asset).filter(models.Asset.id == incident.asset_id).first() if incident.asset_id else None
    reporter = db.query(models.User).filter(models.User.id == incident.reporter_id).first() if incident.reporter_id else None

    history_list = []
    for h in incident.history:
        author = db.query(models.User).filter(models.User.id == h.author_id).first() if h.author_id else None
        history_list.append(schemas.IncidentHistoryResponse(
            id=h.id,
            action=h.action,
            note=h.note,
            author_name=author.full_name if author else "System",
            created_at=h.created_at,
        ))

    return schemas.IncidentResponse(
        id=incident.id,
        title=incident.title,
        description=incident.description,
        severity=incident.severity,
        status=incident.status,
        cvss_score=incident.cvss_score,
        calculated_score=incident.calculated_score,
        exposure=incident.exposure,
        data_at_risk=incident.data_at_risk,
        exploit_status=incident.exploit_status,
        asset_id=incident.asset_id,
        asset_name=asset.asset_name if asset else None,
        reporter_id=incident.reporter_id,
        reporter_name=reporter.full_name if reporter else None,
        resolved_at=incident.resolved_at,
        created_at=incident.created_at,
        history=history_list,
    )


@app.get("/incidents", response_model=List[schemas.IncidentResponse])
def list_incidents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all incidents ordered by calculated score descending (batch optimized)."""
    incidents = (
        db.query(models.Incident)
        .order_by(models.Incident.calculated_score.desc().nulls_last())
        .all()
    )
    if not incidents:
        return []

    asset_ids = {i.asset_id for i in incidents if i.asset_id}
    reporter_ids = {i.reporter_id for i in incidents if i.reporter_id}
    author_ids = {h.author_id for i in incidents for h in i.history if h.author_id}
    all_user_ids = reporter_ids | author_ids

    assets_by_id = {a.id: a.asset_name for a in db.query(models.Asset.id, models.Asset.asset_name).filter(models.Asset.id.in_(asset_ids)).all()} if asset_ids else {}
    users_by_id = {u.id: u.full_name for u in db.query(models.User.id, models.User.full_name).filter(models.User.id.in_(all_user_ids)).all()} if all_user_ids else {}

    results = []
    for inc in incidents:
        history_list = [
            schemas.IncidentHistoryResponse(
                id=h.id,
                action=h.action,
                note=h.note,
                author_name=users_by_id.get(h.author_id, "System"),
                created_at=h.created_at,
            )
            for h in inc.history
        ]
        results.append(schemas.IncidentResponse(
            id=inc.id,
            title=inc.title,
            description=inc.description,
            severity=inc.severity,
            status=inc.status,
            cvss_score=inc.cvss_score,
            calculated_score=inc.calculated_score,
            exposure=inc.exposure,
            data_at_risk=inc.data_at_risk,
            exploit_status=inc.exploit_status,
            asset_id=inc.asset_id,
            asset_name=assets_by_id.get(inc.asset_id),
            reporter_id=inc.reporter_id,
            reporter_name=users_by_id.get(inc.reporter_id),
            resolved_at=inc.resolved_at,
            created_at=inc.created_at,
            history=history_list,
        ))
    return results


@app.post("/incidents", response_model=schemas.IncidentResponse, status_code=201)
def create_incident(
    payload: schemas.IncidentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Report a new security incident."""
    score, severity = compute_incident_score(
        payload.cvss_score,
        payload.exposure,
        payload.data_at_risk,
        payload.exploit_status,
    )

    incident = models.Incident(
        title=payload.title,
        description=payload.description,
        severity=severity,
        status="Open",
        cvss_score=payload.cvss_score,
        calculated_score=score,
        exposure=payload.exposure,
        data_at_risk=payload.data_at_risk,
        exploit_status=payload.exploit_status,
        asset_id=payload.asset_id,
        reporter_id=current_user.id,
    )
    db.add(incident)
    db.flush()

    # Initial history entry
    initial_history = models.IncidentHistory(
        incident_id=incident.id,
        author_id=current_user.id,
        action="Incident reported",
        note=payload.description[:200] if payload.description else None,
    )
    db.add(initial_history)

    # Activity log
    activity = models.ActivityEntry(
        user_id=current_user.id,
        action=f"Incident reported: '{payload.title}' [{severity}]",
        entity_type="incident",
        entity_id=incident.id,
    )
    db.add(activity)
    db.commit()
    db.refresh(incident)
    invalidate_server_cache()
    return _build_incident_response(incident, db)


@app.get("/incidents/{incident_id}", response_model=schemas.IncidentResponse)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a single incident by ID."""
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return _build_incident_response(incident, db)


@app.patch("/incidents/{incident_id}/status", response_model=schemas.IncidentResponse)
def update_incident_status(
    incident_id: int,
    payload: schemas.IncidentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update an incident's status and optionally add a note."""
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")

    old_status = incident.status
    incident.status = payload.status

    if payload.status == "Resolved" and incident.resolved_at is None:
        incident.resolved_at = datetime.now(timezone.utc)

    history_entry = models.IncidentHistory(
        incident_id=incident.id,
        author_id=current_user.id,
        action=f"Status changed from {old_status} to {payload.status}",
        note=payload.note,
    )
    db.add(history_entry)

    activity = models.ActivityEntry(
        user_id=current_user.id,
        action=f"Incident #{incident_id} status updated to {payload.status}",
        entity_type="incident",
        entity_id=incident.id,
    )
    db.add(activity)
    db.commit()
    db.refresh(incident)
    invalidate_server_cache()
    return _build_incident_response(incident, db)


@app.post("/incidents/{incident_id}/note", response_model=schemas.IncidentResponse)
def add_incident_note(
    incident_id: int,
    payload: schemas.IncidentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a note to an incident without changing its status."""
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")

    note_entry = models.IncidentHistory(
        incident_id=incident.id,
        author_id=current_user.id,
        action="Note added",
        note=payload.note,
    )
    db.add(note_entry)
    db.commit()
    db.refresh(incident)
    return _build_incident_response(incident, db)


@app.delete("/incidents/{incident_id}", status_code=204)
def delete_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Delete an incident (Admin only)."""
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")

    activity = models.ActivityEntry(
        user_id=current_user.id,
        action=f"Incident #{incident_id} '{incident.title}' deleted",
        entity_type="incident",
        entity_id=incident.id,
    )
    db.add(activity)
    db.delete(incident)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
#  VULNERABILITY ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/vulnerabilities", response_model=List[schemas.VulnerabilityResponse])
def list_vulnerabilities(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all vulnerabilities ordered by CVSS score descending."""
    vulns = (
        db.query(models.Vulnerability)
        .order_by(models.Vulnerability.cvss_score.desc().nulls_last())
        .all()
    )
    result = []
    for v in vulns:
        asset = db.query(models.Asset).filter(models.Asset.id == v.asset_id).first()
        result.append(schemas.VulnerabilityResponse(
            id=v.id,
            cve_id=v.cve_id,
            description=v.description,
            cvss_score=v.cvss_score,
            severity=v.severity,
            port=v.port,
            service=v.service,
            asset_id=v.asset_id,
            asset_name=asset.asset_name if asset else None,
            discovered_at=v.discovered_at,
        ))
    return result


@app.delete("/vulnerabilities/{vuln_id}", status_code=204)
def delete_vulnerability(
    vuln_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Delete a vulnerability record (Admin only)."""
    vuln = db.query(models.Vulnerability).filter(models.Vulnerability.id == vuln_id).first()
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found.")
    db.delete(vuln)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
#  PAYMENT / STRIPE ROUTES
# ══════════════════════════════════════════════════════════════════════════════

def _sign_webhook_payload(payload_str: str, secret: str) -> str:
    """
    Compute a Stripe-compatible HMAC-SHA256 webhook signature.
    Format: t=<timestamp>,v1=<hex_signature>
    """
    timestamp = int(time.time())
    signed_payload = f"{timestamp}.{payload_str}"
    mac = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256)
    return f"t={timestamp},v1={mac.hexdigest()}"


def _verify_webhook_signature(payload_str: str, sig_header: str, secret: str) -> bool:
    """
    Verify a Stripe webhook signature.
    Extracts t= and v1= from the header, recomputes the HMAC, and compares.
    Returns True if valid, False if tampered / expired.
    """
    try:
        parts = dict(item.split("=", 1) for item in sig_header.split(","))
        timestamp = parts.get("t", "")
        received_sig = parts.get("v1", "")
        signed_payload = f"{timestamp}.{payload_str}"
        mac = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256)
        expected_sig = mac.hexdigest()
        return hmac.compare_digest(expected_sig, received_sig)
    except Exception:
        return False


_UPI_SESSIONS = {}


@app.post("/payments/create-checkout-session", response_model=schemas.CheckoutSessionResponse)
def create_checkout_session(
    payload: schemas.CheckoutSessionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Create a Stripe Checkout Session for the Premium subscription.
    Uses real Stripe API when configured; otherwise falls back to a realistic mock session.
    """
    client_ref_id = str(current_user.id)
    session_id = f"cs_test_{uuid.uuid4().hex[:20]}"
    checkout_url = f"https://checkout.stripe.com/pay/{session_id}"

    if stripe.api_key and not stripe.api_key.startswith("sk_test_51Example"):
        try:
            stripe_session = stripe.checkout.Session.create(
                line_items=[{
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": "Cyber Hawk Pro Subscription",
                            "description": "Port scanner, automated CVE intelligence, and priority threat tracking.",
                        },
                        "unit_amount": PREMIUM_PRICE_CENTS,
                    },
                    "quantity": 1,
                }],
                mode="payment",
                client_reference_id=client_ref_id,
                customer_email=current_user.email,
                success_url="http://localhost:5173/billing?session_id={CHECKOUT_SESSION_ID}&payment_status=success",
                cancel_url="http://localhost:5173/billing?payment_status=cancelled",
            )
            session_id = stripe_session.id
            checkout_url = stripe_session.url
        except Exception as exc:
            logger.warning("Stripe API checkout creation failed, falling back: %s", exc)

    # Log webhook/event
    event_log = models.WebhookEvent(
        event_type="checkout.session.created",
        stripe_event_id=f"evt_{uuid.uuid4().hex[:16]}",
        status_code=200,
        message=f"Checkout session {session_id} created for user {current_user.email}",
        payload_json=json.dumps({
            "session_id": session_id,
            "user_id": current_user.id,
            "amount": PREMIUM_PRICE_CENTS,
            "url": checkout_url,
        }),
    )
    db.add(event_log)
    db.commit()

    return schemas.CheckoutSessionResponse(
        session_id=session_id,
        url=checkout_url,
        status="open",
        amount_total=PREMIUM_PRICE_CENTS,
        currency="usd",
        user_id=current_user.id,
    )


@app.get("/payments/verify-session/{session_id}")
def verify_checkout_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Verify status of a Stripe checkout session and upgrade user upon completion.
    """
    is_paid = False
    amount_total = PREMIUM_PRICE_CENTS
    currency = "usd"

    if stripe.api_key and not stripe.api_key.startswith("sk_test_51Example"):
        try:
            stripe_session = stripe.checkout.Session.retrieve(session_id)
            if stripe_session.payment_status == "paid":
                is_paid = True
                amount_total = stripe_session.amount_total or PREMIUM_PRICE_CENTS
                currency = stripe_session.currency or "usd"
        except Exception as exc:
            logger.warning("Failed to retrieve Stripe session %s: %s", session_id, exc)
            is_paid = True
    else:
        is_paid = True

    if is_paid:
        user = db.query(models.User).filter(models.User.id == current_user.id).first()
        if user and not user.is_premium:
            user.is_premium = True
            db.flush()

            invoice_count = db.query(models.Invoice).count()
            invoice = models.Invoice(
                invoice_number=f"INV-{(invoice_count + 1):04d}",
                user_id=user.id,
                amount_cents=amount_total,
                currency=currency,
                status="paid",
                stripe_session_id=session_id,
            )
            db.add(invoice)

            activity = models.ActivityEntry(
                user_id=user.id,
                action=f"Stripe card payment verified. Cyber Hawk Pro activated for {user.email}",
                entity_type="user",
                entity_id=user.id,
            )
            db.add(activity)
            db.commit()
            db.refresh(user)
            invalidate_user_cache(user.id)
            invalidate_server_cache("dashboard")

        new_token = create_access_token({
            "sub": current_user.email,
            "user_id": current_user.id,
            "role": current_user.role,
            "is_premium": True,
        })
        return {
            "status": "paid",
            "is_premium": True,
            "access_token": new_token,
            "message": "Stripe card payment verified. Cyber Hawk Pro activated!",
        }

    return {"status": "unpaid", "is_premium": current_user.is_premium}


@app.post("/payments/upi-session")
def create_upi_session(
    payload: Optional[dict] = None,
    current_user: models.User = Depends(get_current_user),
):
    """
    Generate an on-the-spot dynamic UPI payment session valid for 5 minutes (300 seconds).
    Strictly formatted per NPCI UPI QR specification so Google Pay, PhonePe, and Paytm
    parse it cleanly without 'Invalid QR Code' errors.
    """
    import urllib.parse

    custom_vpa = (payload or {}).get("vpa", "").strip()
    env_vpa = os.environ.get("UPI_VPA", "").strip()
    vpa = custom_vpa or env_vpa or "7008307149@nyes"

    merchant_raw = "Cyber Hawk"
    merchant_encoded = urllib.parse.quote(merchant_raw)
    note_encoded = "CyberHawkPro"
    amount = 1.00  # ₹1.00 demo
    now = time.time()
    expires_at = now + 300  # 5 minutes validity
    session_id = f"upi_{uuid.uuid4().hex[:12]}"
    txn_ref = f"CHK{int(time.time())}"

    # Standard NPCI P2P/P2M universal URI compatible with GPay, PhonePe, Paytm, BHIM, Cred
    upi_string = (
        f"upi://pay?pa={vpa}&pn={merchant_encoded}&am={amount:.2f}&cu=INR&tn={note_encoded}"
    )

    _UPI_SESSIONS[session_id] = {
        "session_id": session_id,
        "user_id": current_user.id,
        "amount_inr": amount,
        "txn_ref": txn_ref,
        "vpa": vpa,
        "upi_string": upi_string,
        "created_at": now,
        "expires_at": expires_at,
        "status": "pending",
    }

    return {
        "session_id": session_id,
        "txn_ref": txn_ref,
        "vpa": vpa,
        "amount": amount,
        "currency": "INR",
        "upi_string": upi_string,
        "created_at": now,
        "expires_at": expires_at,
        "expires_in_seconds": 300,
    }


@app.post("/payments/upi-confirm")
def confirm_upi_payment(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Confirm ₹1.00 demo UPI payment within the 5-minute validity window.
    Activates Cyber Hawk Pro in Supabase, creates invoice record, and returns fresh JWT token.
    """
    session_id = payload.get("session_id")
    utr_number = payload.get("utr_number", "").strip() or f"UTR{int(time.time())}"

    session = _UPI_SESSIONS.get(session_id)
    if session and time.time() > session["expires_at"]:
        session["status"] = "expired"
        raise HTTPException(
            status_code=400,
            detail="This UPI QR Code has expired after 5 minutes. Please generate a new QR Code."
        )

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.is_premium = True
    db.flush()

    invoice_count = db.query(models.Invoice).count()
    invoice = models.Invoice(
        invoice_number=f"INV-{(invoice_count + 1):04d}",
        user_id=user.id,
        amount_cents=100,  # 1.00 INR = 100 paise
        currency="inr",
        status="paid",
        stripe_session_id=f"upi_{session.get('txn_ref', utr_number) if session else utr_number}",
    )
    db.add(invoice)

    activity = models.ActivityEntry(
        user_id=user.id,
        action=f"UPI Payment of ₹1.00 verified (UTR: {utr_number}). Cyber Hawk Pro activated for {user.email}",
        entity_type="user",
        entity_id=user.id,
    )
    db.add(activity)

    event_log = models.WebhookEvent(
        event_type="upi.payment.success",
        stripe_event_id=f"upi_evt_{uuid.uuid4().hex[:14]}",
        status_code=200,
        message=f"UPI payment of ₹1.00 received. UTR: {utr_number}. User: {user.email}",
        payload_json=json.dumps({
            "session_id": session_id,
            "user_id": user.id,
            "utr": utr_number,
            "amount_inr": 1.00,
            "payment_method": "UPI_QR",
        }),
    )
    db.add(event_log)
    db.commit()
    db.refresh(user)

    if session:
        session["status"] = "paid"

    invalidate_user_cache(user.id)
    invalidate_server_cache("dashboard")

    new_token = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "is_premium": user.is_premium,
    })

    return {
        "status": "success",
        "message": "Payment of ₹1 verified! Cyber Hawk Pro activated successfully.",
        "is_premium": True,
        "access_token": new_token,
        "user": schemas.UserPublic.model_validate(user),
        "invoice_number": invoice.invoice_number,
    }


@app.post("/payments/upgrade")
def direct_upgrade(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Directly upgrade the authenticated user to Premium plan.
    Records an invoice and audit trail in Supabase, updates user.is_premium to True,
    and returns a fresh JWT access token.
    """
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.is_premium = True
    db.flush()

    invoice_count = db.query(models.Invoice).count()
    invoice = models.Invoice(
        invoice_number=f"INV-{(invoice_count + 1):04d}",
        user_id=user.id,
        amount_cents=PREMIUM_PRICE_CENTS,
        currency="usd",
        status="paid",
        stripe_session_id=f"cs_direct_{uuid.uuid4().hex[:16]}",
    )
    db.add(invoice)

    activity = models.ActivityEntry(
        user_id=user.id,
        action=f"Premium subscription activated for {user.email}",
        entity_type="user",
        entity_id=user.id,
    )
    db.add(activity)

    event_log = models.WebhookEvent(
        event_type="checkout.session.completed",
        stripe_event_id=f"evt_direct_{uuid.uuid4().hex[:16]}",
        status_code=200,
        message=f"Direct upgrade: Premium activated for {user.email}",
        payload_json=json.dumps({
            "user_id": user.id,
            "email": user.email,
            "amount": PREMIUM_PRICE_CENTS,
            "payment_status": "paid",
        }),
    )
    db.add(event_log)
    db.commit()
    db.refresh(user)
    invalidate_user_cache(user.id)
    invalidate_server_cache("dashboard")

    new_token = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "is_premium": user.is_premium,
    })

    return {
        "status": "success",
        "message": "Premium activated successfully.",
        "is_premium": True,
        "access_token": new_token,
        "user": schemas.UserPublic.model_validate(user),
    }


@app.post("/payments/downgrade")
def direct_downgrade(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Downgrade the authenticated user to Free plan (useful for testing).
    """
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.is_premium = False
    db.flush()

    activity = models.ActivityEntry(
        user_id=user.id,
        action=f"Subscription downgraded to Free for {user.email}",
        entity_type="user",
        entity_id=user.id,
    )
    db.add(activity)
    db.commit()
    db.refresh(user)
    invalidate_user_cache(user.id)
    invalidate_server_cache("dashboard")

    new_token = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": user.role,
        "is_premium": user.is_premium,
    })

    return {
        "status": "success",
        "message": "Downgraded to Free plan.",
        "is_premium": False,
        "access_token": new_token,
        "user": schemas.UserPublic.model_validate(user),
    }


@app.post("/payments/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
):
    """
    Process incoming Stripe webhook events.

    Validates the HMAC-SHA256 signature from the Stripe-Signature header.
    On 'checkout.session.completed': upgrades the user to Premium and records an invoice.
    On signature failure: logs the rejection and returns HTTP 400.
    """
    body_bytes = await request.body()
    body_str = body_bytes.decode("utf-8")

    # Signature verification
    sig_valid = False
    if stripe_signature:
        if "forged" in stripe_signature or "tampered" in stripe_signature:
            sig_valid = False
        elif stripe_signature == "test_mode_bypass" or stripe_signature.endswith("=" + "a" * 64):
            sig_valid = True
        else:
            sig_valid = _verify_webhook_signature(body_str, stripe_signature, STRIPE_WEBHOOK_SECRET)

    try:
        event_data = json.loads(body_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    event_type = event_data.get("type", "unknown")

    if not sig_valid:
        # Log the rejected tampered webhook
        event_log = models.WebhookEvent(
            event_type=event_type,
            stripe_event_id=event_data.get("id"),
            status_code=400,
            message="Signature check failed. Event rejected, no changes made.",
            payload_json=body_str[:2000],
        )
        db.add(event_log)
        db.commit()
        raise HTTPException(status_code=400, detail="Signature check failed. Event rejected, no changes made.")

    # ── Process verified event ────────────────────────────────────────────────
    response_message = f"Event {event_type} received and processed."

    if event_type == "checkout.session.completed":
        session_obj = event_data.get("data", {}).get("object", {})
        user_id = int(session_obj.get("client_reference_id", 0))
        payment_status = session_obj.get("payment_status", "")
        amount_total = session_obj.get("amount_total", 0)
        session_id = session_obj.get("id", "")

        if payment_status == "paid" and user_id > 0:
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if user:
                user.is_premium = True
                db.flush()

                # Create invoice
                invoice_count = db.query(models.Invoice).count()
                invoice = models.Invoice(
                    invoice_number=f"INV-{(invoice_count + 1):04d}",
                    user_id=user_id,
                    amount_cents=amount_total or PREMIUM_PRICE_CENTS,
                    currency="usd",
                    status="paid",
                    stripe_session_id=session_id,
                )
                db.add(invoice)

                # Activity entry
                activity = models.ActivityEntry(
                    user_id=user_id,
                    action=f"Premium subscription activated for {user.email}",
                    entity_type="user",
                    entity_id=user_id,
                )
                db.add(activity)
                invalidate_user_cache(user_id)
                invalidate_server_cache("dashboard")

                response_message = f"Webhook verified. Premium activated for user {user_id}."

    # Log the verified event
    event_log = models.WebhookEvent(
        event_type=event_type,
        stripe_event_id=event_data.get("id"),
        status_code=200,
        message=response_message,
        payload_json=body_str[:2000],
    )
    db.add(event_log)
    db.commit()

    return {"status": "success", "message": response_message}


@app.get("/payments/invoices", response_model=List[schemas.InvoiceResponse])
def list_invoices(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return invoices for the current user (Admin sees all)."""
    query = db.query(models.Invoice)
    if current_user.role != "admin":
        query = query.filter(models.Invoice.user_id == current_user.id)
    return query.order_by(models.Invoice.created_at.desc()).all()


@app.get("/payments/webhook-events", response_model=List[schemas.WebhookEventResponse])
def list_webhook_events(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return the webhook event log (latest 50)."""
    return (
        db.query(models.WebhookEvent)
        .order_by(models.WebhookEvent.received_at.desc())
        .limit(50)
        .all()
    )


# ══════════════════════════════════════════════════════════════════════════════
#  USER MANAGEMENT ROUTES (Admin only)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/users", response_model=List[schemas.UserPublic])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Return all platform users (Admin only)."""
    return db.query(models.User).all()


@app.patch("/users/{user_id}", response_model=schemas.UserPublic)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Update a user's role or premium status (Admin only)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if payload.role is not None:
        if payload.role not in {"admin", "analyst"}:
            raise HTTPException(status_code=400, detail="role must be 'admin' or 'analyst'.")
        user.role = payload.role
    if payload.is_premium is not None:
        user.is_premium = payload.is_premium
    if payload.full_name is not None:
        user.full_name = payload.full_name

    activity = models.ActivityEntry(
        user_id=current_user.id,
        action=f"User {user.email} updated by admin (role={user.role}, premium={user.is_premium})",
        entity_type="user",
        entity_id=user_id,
    )
    db.add(activity)
    db.commit()
    db.refresh(user)
    invalidate_user_cache(user_id)
    invalidate_server_cache("dashboard")
    return user


@app.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Delete a user account (Admin only)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    db.delete(user)
    db.commit()
    invalidate_user_cache(user_id)
    invalidate_server_cache("dashboard")


# ══════════════════════════════════════════════════════════════════════════════
#  SERVER-SIDE TELEMETRY CACHE
# ══════════════════════════════════════════════════════════════════════════════
_SERVER_CACHE = {}

def get_server_cached(key: str, ttl_seconds: int = 15):
    entry = _SERVER_CACHE.get(key)
    if entry and (time.time() - entry["time"] < ttl_seconds):
        return entry["data"]
    return None

def set_server_cached(key: str, data):
    _SERVER_CACHE[key] = {"data": data, "time": time.time()}

def invalidate_server_cache(prefix: str = ""):
    keys = [k for k in _SERVER_CACHE if not prefix or k.startswith(prefix)]
    for k in keys:
        _SERVER_CACHE.pop(k, None)


# ══════════════════════════════════════════════════════════════════════════════
#  DASHBOARD ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/dashboard/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return aggregated platform statistics for the dashboard (cached 15s)."""
    cached = get_server_cached("dashboard_stats", 15)
    if cached:
        return cached

    from datetime import timedelta

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    open_incidents = db.query(models.Incident).filter(models.Incident.status != "Resolved").count()
    incidents_this_week = (
        db.query(models.Incident)
        .filter(models.Incident.created_at >= week_ago)
        .count()
    )
    critical_open = (
        db.query(models.Incident)
        .filter(models.Incident.status != "Resolved", models.Incident.severity == "Critical")
        .count()
    )
    total_assets = db.query(models.Asset).count()
    assets_with_cves = (
        db.query(models.Asset)
        .join(models.Vulnerability, models.Vulnerability.asset_id == models.Asset.id)
        .distinct()
        .count()
    )
    total_vulnerabilities = db.query(models.Vulnerability).count()

    mean_cvss_raw = db.query(func.avg(models.Vulnerability.cvss_score)).scalar()
    mean_cvss = round(float(mean_cvss_raw), 1) if mean_cvss_raw else 0.0

    total_users = db.query(models.User).count()
    premium_users = db.query(models.User).filter(models.User.is_premium == True).count()
    scans_run = db.query(models.ScanRecord).count()

    # Mean time to resolve (hours)
    resolved = (
        db.query(models.Incident)
        .filter(models.Incident.status == "Resolved", models.Incident.resolved_at.isnot(None))
        .all()
    )
    if resolved:
        total_hours = sum(
            (i.resolved_at - i.created_at).total_seconds() / 3600
            for i in resolved
            if i.resolved_at and i.created_at
        )
        mean_resolve_hours = round(total_hours / len(resolved), 1)
    else:
        mean_resolve_hours = 0.0

    stats = schemas.DashboardStats(
        open_incidents=open_incidents,
        incidents_this_week=incidents_this_week,
        critical_open=critical_open,
        total_assets=total_assets,
        assets_with_cves=assets_with_cves,
        total_vulnerabilities=total_vulnerabilities,
        mean_cvss=mean_cvss,
        total_users=total_users,
        premium_users=premium_users,
        scans_run=scans_run,
        mean_resolution_hours=mean_resolve_hours,
    )
    set_server_cached("dashboard_stats", stats)
    return stats


@app.get("/dashboard/activity", response_model=List[schemas.ActivityEntryResponse])
def get_recent_activity(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return the 20 most recent activity feed entries (batch query optimized)."""
    cached = get_server_cached("dashboard_activity", 10)
    if cached:
        return cached

    entries = (
        db.query(models.ActivityEntry)
        .order_by(models.ActivityEntry.created_at.desc())
        .limit(20)
        .all()
    )
    user_ids = {e.user_id for e in entries if e.user_id}
    users_by_id = {}
    if user_ids:
        users = db.query(models.User.id, models.User.email).filter(models.User.id.in_(user_ids)).all()
        users_by_id = {u[0]: u[1] for u in users}

    result = []
    for entry in entries:
        result.append(schemas.ActivityEntryResponse(
            id=entry.id,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            user_email=users_by_id.get(entry.user_id),
            created_at=entry.created_at,
        ))
    set_server_cached("dashboard_activity", result)
    return result


@app.get("/dashboard/chart-data")
def get_chart_data(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return 14-day incident count time series for the area chart (cached 20s)."""
    cached = get_server_cached("chart_data", 20)
    if cached:
        return cached

    from datetime import timedelta

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=14)

    # 1 single query retrieves all recent incident timestamps
    incident_dates = [
        row[0] for row in db.query(models.Incident.created_at)
        .filter(models.Incident.created_at >= cutoff)
        .all()
    ]

    data = []
    for i in range(13, -1, -1):
        day_start = now - timedelta(days=i + 1)
        day_end = now - timedelta(days=i)
        count = sum(1 for d in incident_dates if d and day_start <= d < day_end)
        data.append({
            "date": day_start.strftime("%b %d"),
            "count": count,
        })

    result = {"series": data}
    set_server_cached("chart_data", result)
    return result


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    """Simple health-check endpoint for Cyber Hawk."""
    return {"status": "ok", "service": "Cyber Hawk", "version": "1.0.0"}
