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


SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_LENGTH = 32
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 256


def hash_password(password: str) -> str:
    """`scrypt$N$r$p$<salt>$<hash>` (base64url), using the standard library's scrypt."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_LENGTH, maxmem=64 * 1024 * 1024
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 6 or parts[0] != "scrypt":
        return False
    try:
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt, expected = _unb64(parts[4]), _unb64(parts[5])
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=len(expected), maxmem=64 * 1024 * 1024)
    return hmac.compare_digest(digest, expected)


def pkce_s256(verifier: str) -> str:
    """RFC 7636 S256 code challenge for `verifier`."""
    return _b64(hashlib.sha256(verifier.encode("ascii")).digest())
