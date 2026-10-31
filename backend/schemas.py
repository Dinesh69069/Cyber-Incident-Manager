"""
schemas.py
----------
Pydantic v2 request/response schemas for the Cyber Incident Platform.
Provides strict type validation and serialization contracts for all API endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ══════════════════════════════════════════════════════════════════════════════
#  AUTH SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class UserRegister(BaseModel):
    """Registration payload — new user sign-up."""
    full_name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=5, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=8, description="Minimum 8 characters")


class UserLogin(BaseModel):
    """Login payload — returns a JWT access token."""
    email: str = Field(..., min_length=3, max_length=120)
    password: str


class TokenResponse(BaseModel):
    """JWT token envelope returned after successful authentication."""
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    role: str
    is_premium: bool


class UserPublic(BaseModel):
    """Safe user representation — never exposes hashed_password."""
    id: int
    full_name: str
    email: str
    role: str
    is_premium: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Payload for admin updating user role or premium status."""
    role: Optional[str] = None
    is_premium: Optional[bool] = None
    full_name: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
#  ASSET SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class AssetCreate(BaseModel):
    """Create a new monitored asset."""
    asset_name: str = Field(..., min_length=1, max_length=60)
    ip_address: str = Field(..., description="Valid IPv4 address")
    device_type: str = Field(..., description="Server|Database|Network|Workstation|IoT|Cloud")
    owner_id: Optional[int] = None  # Admin can assign; Analyst defaults to self

    @field_validator("ip_address")
    @classmethod
    def validate_ipv4(cls, v: str) -> str:
        parts = v.split(".")
        if len(parts) != 4:
            raise ValueError("IP address must have exactly 4 octets")
        for part in parts:
            if not part.isdigit():
                raise ValueError("Each octet must be a digit")
            if part != str(int(part)):
                raise ValueError("Octets must not have leading zeros")
            if not (0 <= int(part) <= 255):
                raise ValueError("Each octet must be between 0 and 255")
        return v

    @field_validator("device_type")
    @classmethod
    def validate_device_type(cls, v: str) -> str:
        allowed = {"Server", "Database", "Network", "Workstation", "IoT", "Cloud"}
        if v not in allowed:
            raise ValueError(f"device_type must be one of: {', '.join(allowed)}")
        return v


class AssetUpdate(BaseModel):
    """Partial update for an existing asset."""
    asset_name: Optional[str] = Field(None, max_length=60)
    ip_address: Optional[str] = None
    device_type: Optional[str] = None
    owner_id: Optional[int] = None


class AssetResponse(BaseModel):
    """Full asset representation with aggregated CVE and incident counts."""
    id: int
    asset_name: str
    ip_address: str
    device_type: str
    owner_id: int
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    cve_count: int = 0
    open_incident_count: int = 0
    max_cvss: Optional[float] = None
    highest_severity: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
#  INCIDENT SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class IncidentCreate(BaseModel):
    """Report a new security incident."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    asset_id: Optional[int] = None
    exposure: Optional[str] = Field(
        None,
        description="Internal network | DMZ or partner-facing | Internet-facing"
    )
    data_at_risk: Optional[str] = Field(
        None,
        description="Public | Internal | Confidential | Regulated"
    )
    exploit_status: Optional[str] = Field(
        None,
        description="No known exploit | Public proof of concept | Exploited in the wild"
    )
    cvss_score: Optional[float] = Field(None, ge=0.0, le=10.0)


class IncidentStatusUpdate(BaseModel):
    """PATCH payload for transitioning incident status."""
    status: str = Field(..., description="Open | In Progress | Resolved")
    note: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = {"Open", "In Progress", "Resolved"}
        if v not in allowed:
            raise ValueError(f"status must be one of: {', '.join(allowed)}")
        return v


class IncidentHistoryResponse(BaseModel):
    id: int
    action: str
    note: Optional[str]
    author_name: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class IncidentResponse(BaseModel):
    """Full incident representation."""
    id: int
    title: str
    description: Optional[str]
    severity: str
    status: str
    cvss_score: Optional[float]
    calculated_score: Optional[float]
    exposure: Optional[str]
    data_at_risk: Optional[str]
    exploit_status: Optional[str]
    asset_id: Optional[int]
    asset_name: Optional[str]
    reporter_id: Optional[int]
    reporter_name: Optional[str]
    resolved_at: Optional[datetime]
    created_at: datetime
    history: List[IncidentHistoryResponse] = []

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
#  VULNERABILITY SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class VulnerabilityResponse(BaseModel):
    """CVE vulnerability record as returned from the API."""
    id: int
    cve_id: str
    description: Optional[str]
    cvss_score: Optional[float]
    severity: Optional[str]
    port: Optional[int]
    service: Optional[str]
    asset_id: int
    asset_name: Optional[str]
    discovered_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
#  SCANNER SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class ScanRequest(BaseModel):
    """Trigger a port scan against the specified asset."""
    asset_id: int


class ScanPortResult(BaseModel):
    """Result for a single scanned port."""
    port: int
    service: str
    state: str  # "open" | "closed"
    cves: List[dict] = []


class ScanResponse(BaseModel):
    """Full scan result envelope."""
    asset_id: int
    asset_name: str
    ip_address: str
    scanned_at: str
    open_ports: int
    total_cves: int
    results: List[ScanPortResult]
    new_vulnerabilities: int
    new_incidents: int


# ══════════════════════════════════════════════════════════════════════════════
#  PAYMENT / BILLING SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class CheckoutSessionRequest(BaseModel):
    """Request to create a Stripe checkout session."""
    user_id: Optional[int] = None
    success_url: Optional[str] = "http://localhost:5173/billing?success=1"
    cancel_url: Optional[str] = "http://localhost:5173/billing?cancelled=1"


class CheckoutSessionResponse(BaseModel):
    """Stripe checkout session metadata returned to the client."""
    session_id: str
    url: str
    status: str
    amount_total: int
    currency: str
    user_id: int


class WebhookEventResponse(BaseModel):
    """Stripe webhook event log entry."""
    id: int
    event_type: str
    stripe_event_id: Optional[str]
    status_code: int
    message: Optional[str]
    received_at: datetime

    model_config = {"from_attributes": True}


class InvoiceResponse(BaseModel):
    """Invoice record for the billing page."""
    id: int
    invoice_number: str
    user_id: int
    amount_cents: int
    currency: str
    status: str
    stripe_session_id: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
#  DASHBOARD SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class DashboardStats(BaseModel):
    """Aggregated statistics for the dashboard overview."""
    open_incidents: int
    incidents_this_week: int
    critical_open: int
    total_assets: int
    assets_with_cves: int
    total_vulnerabilities: int
    mean_cvss: float
    total_users: int
    premium_users: int
    scans_run: int
    mean_resolution_hours: float


class ActivityEntryResponse(BaseModel):
    """Single activity feed entry."""
    id: int
    action: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    user_email: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
