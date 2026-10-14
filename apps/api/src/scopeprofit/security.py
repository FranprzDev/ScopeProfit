"""Hashing, random tokens and HMAC-signed payloads."""

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime

from pydantic import BaseModel, ValidationError


def utcnow() -> datetime:
    """Naive UTC timestamp, matching the `TIMESTAMP(3)` columns created by the original schema."""
    return datetime.now(UTC).replace(tzinfo=None)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def random_token(num_bytes: int = 32) -> str:
    return secrets.token_urlsafe(num_bytes)


def secure_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode(), right.encode())


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(key: bytes, purpose: str, payload: str) -> str:
    return _b64(hmac.new(key, f"{purpose}:{payload}".encode(), hashlib.sha256).digest())


def sign_model(key: bytes, purpose: str, model: BaseModel) -> str:
    """`<base64url(json)>.<base64url(hmac)>`; `purpose` separates link types sharing one key."""
    payload = _b64(json.dumps(model.model_dump(mode="json"), separators=(",", ":")).encode())
    return f"{payload}.{_signature(key, purpose, payload)}"


def verify_model[ModelT: BaseModel](key: bytes, purpose: str, token: str, model: type[ModelT]) -> ModelT | None:
    payload, _, signature = token.partition(".")
    if not payload or not signature or not secure_equal(_signature(key, purpose, payload), signature):
        return None
    try:
        return model.model_validate_json(_unb64(payload))
    except (ValidationError, ValueError):
        return None
