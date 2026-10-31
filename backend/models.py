"""
models.py
---------
SQLAlchemy ORM models for the Cyber Incident Platform.
Defines all database tables with proper relationships and constraints.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from database import Base


# ── User Model ────────────────────────────────────────────────────────────────
class User(Base):
    """
    Represents a platform user with role-based access control.
    Roles: 'admin' | 'analyst'
    """
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    full_name     = Column(String(120), nullable=False)
    email         = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role          = Column(String(20), nullable=False, default="analyst")  # 'admin' | 'analyst'
    is_premium    = Column(Boolean, default=False, nullable=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    assets        = relationship("Asset", back_populates="owner", cascade="all, delete-orphan")


# ── Asset Model ───────────────────────────────────────────────────────────────
class Asset(Base):
    """
    Represents a network asset being monitored.
    Device types: Server | Database | Network | Workstation | IoT | Cloud
    """
    __tablename__ = "assets"

    id            = Column(Integer, primary_key=True, index=True)
    asset_name    = Column(String(60), nullable=False)
    ip_address    = Column(String(45), unique=True, nullable=False)  # Supports IPv4 & IPv6
    device_type   = Column(String(30), nullable=False)
    owner_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    owner         = relationship("User", back_populates="assets")
    incidents     = relationship("Incident", back_populates="asset", cascade="all, delete-orphan")
    vulnerabilities = relationship("Vulnerability", back_populates="asset", cascade="all, delete-orphan")


# ── Incident Model ────────────────────────────────────────────────────────────
class Incident(Base):
    """
    Tracks security incidents tied to monitored assets.
    Severity: Critical | High | Medium | Low
    Status:   Open | In Progress | Resolved
    """
    __tablename__ = "incidents"

    id            = Column(Integer, primary_key=True, index=True)
    title         = Column(String(200), nullable=False)
    description   = Column(Text, nullable=True)
    severity      = Column(String(20), nullable=False)   # Critical | High | Medium | Low
    status        = Column(String(20), nullable=False, default="Open")
    cvss_score    = Column(Float, nullable=True)
    exposure      = Column(String(50), nullable=True)
    data_at_risk  = Column(String(50), nullable=True)
    exploit_status = Column(String(50), nullable=True)
    calculated_score = Column(Float, nullable=True)
    asset_id      = Column(Integer, ForeignKey("assets.id"), nullable=True)
    reporter_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at   = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    asset         = relationship("Asset", back_populates="incidents")
    reporter      = relationship("User", foreign_keys=[reporter_id])
    history       = relationship("IncidentHistory", back_populates="incident", cascade="all, delete-orphan")


# ── Incident History Model ────────────────────────────────────────────────────
class IncidentHistory(Base):
    """
    Audit trail for incident status changes and notes.
    """
    __tablename__ = "incident_history"

    id            = Column(Integer, primary_key=True, index=True)
    incident_id   = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    author_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    action        = Column(String(100), nullable=False)   # e.g. "Status changed to Resolved"
    note          = Column(Text, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    incident      = relationship("Incident", back_populates="history")
    author        = relationship("User", foreign_keys=[author_id])


# ── Vulnerability Model ───────────────────────────────────────────────────────
class Vulnerability(Base):
    """
    Tracks CVE vulnerabilities discovered on assets via port scanning.
    """
    __tablename__ = "vulnerabilities"

    id            = Column(Integer, primary_key=True, index=True)
    cve_id        = Column(String(30), nullable=False)
    description   = Column(Text, nullable=True)
    cvss_score    = Column(Float, nullable=True)
    severity      = Column(String(20), nullable=True)  # Computed from CVSS
    port          = Column(Integer, nullable=True)
    service       = Column(String(50), nullable=True)
    asset_id      = Column(Integer, ForeignKey("assets.id"), nullable=False)
    discovered_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    asset         = relationship("Asset", back_populates="vulnerabilities")


# ── Scan Record Model ─────────────────────────────────────────────────────────
class ScanRecord(Base):
    """
    Logs every port scan executed against an asset.
    """
    __tablename__ = "scan_records"

    id            = Column(Integer, primary_key=True, index=True)
    asset_id      = Column(Integer, ForeignKey("assets.id"), nullable=False)
    scanned_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    open_ports    = Column(Integer, default=0)
    cve_count     = Column(Integer, default=0)
    scan_result   = Column(Text, nullable=True)  # JSON string of detailed results
    scanned_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    asset         = relationship("Asset")
    user          = relationship("User", foreign_keys=[scanned_by])


# ── Invoice Model ─────────────────────────────────────────────────────────────
class Invoice(Base):
    """
    Records payment invoices for Premium subscriptions.
    """
    __tablename__ = "invoices"

    id            = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(20), unique=True, nullable=False)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount_cents  = Column(Integer, nullable=False, default=2900)
    currency      = Column(String(3), default="USD")
    status        = Column(String(20), default="paid")
    stripe_session_id = Column(String(200), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user          = relationship("User")


# ── Webhook Event Log Model ───────────────────────────────────────────────────
class WebhookEvent(Base):
    """
    Audit log for Stripe webhook events received and processed.
    """
    __tablename__ = "webhook_events"

    id            = Column(Integer, primary_key=True, index=True)
    event_type    = Column(String(100), nullable=False)
    stripe_event_id = Column(String(200), nullable=True)
    status_code   = Column(Integer, nullable=False)  # 200 = verified, 400 = rejected
    message       = Column(Text, nullable=True)
    payload_json  = Column(Text, nullable=True)
    received_at   = Column(DateTime(timezone=True), server_default=func.now())


# ── Activity Feed Model ───────────────────────────────────────────────────────
class ActivityEntry(Base):
    """
    Platform-wide activity log for the dashboard feed.
    """
    __tablename__ = "activity_entries"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=True)
    action        = Column(String(300), nullable=False)
    entity_type   = Column(String(50), nullable=True)  # 'asset' | 'incident' | 'vulnerability' | 'user'
    entity_id     = Column(Integer, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user          = relationship("User", foreign_keys=[user_id])
