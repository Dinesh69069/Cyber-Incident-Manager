"""
auth.py
-------
Authentication module for the Cyber Incident Platform.
Implements bcrypt password hashing (via Passlib) and JWT token signing/verification
using PyJWT. Provides FastAPI dependency for extracting the current authenticated user.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
import models

# ── Configuration ─────────────────────────────────────────────────────────────
# In production, load from environment variables / secrets manager (never hardcode)
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "cyber-incident-platform-super-secret-key-change-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

# ── HTTP Bearer Token Extractor ───────────────────────────────────────────────
security = HTTPBearer()


# ── Password Utilities ────────────────────────────────────────────────────────

def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    pwd_bytes = plain_password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


# ── JWT Token Utilities ───────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Sign and return a JWT access token.

    Args:
        data: Payload dict. Must include 'sub' (user email), 'user_id', 'role', 'is_premium'.
        expires_delta: Custom TTL; defaults to ACCESS_TOKEN_EXPIRE_HOURS.

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    )
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "alg": ALGORITHM,
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and validate a JWT access token.

    Raises:
        HTTPException 401 if expired or invalid.

    Returns:
        Decoded payload dict.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── User In-Memory Cache (60s TTL) ───────────────────────────────────────────
import time
_USER_CACHE = {}

def invalidate_user_cache(user_id: Optional[int] = None):
    """Invalidate cached user entries when profile, role, or premium status changes."""
    if user_id:
        _USER_CACHE.pop(user_id, None)
    else:
        _USER_CACHE.clear()


# ── FastAPI Dependencies ──────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    """
    FastAPI dependency: extracts and validates the Bearer JWT from the request,
    then fetches and returns the authenticated User (with in-memory 60s cache).

    Raises:
        HTTPException 401 if the token is invalid or the user no longer exists.
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    user_id: Optional[int] = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing user_id.",
        )

    cached = _USER_CACHE.get(user_id)
    if cached and (time.time() - cached["time"] < 60):
        try:
            return db.merge(cached["user"], load=False)
        except Exception:
            _USER_CACHE.pop(user_id, None)

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this token no longer exists.",
        )

    _USER_CACHE[user_id] = {"user": user, "time": time.time()}
    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    """
    FastAPI dependency: ensures the authenticated user has the 'admin' role.

    Raises:
        HTTPException 403 if the user is not an admin.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required for this action.",
        )
    return current_user


def require_premium(current_user: models.User = Depends(get_current_user)) -> models.User:
    """
    FastAPI dependency: ensures the authenticated user has an active Premium subscription.

    Raises:
        HTTPException 403 if the user does not have Premium access.
    """
    if not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required to run network scans.",
        )
    return current_user


# ── User Lookup Helpers ───────────────────────────────────────────────────────

def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    """
    Retrieve a user by email and verify the provided password.

    Returns:
        The authenticated User object, or None if credentials are invalid.
    """
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
