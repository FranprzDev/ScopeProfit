"""Short-lived, unauthenticated download links for one document artifact."""

import uuid
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel

from scopeprofit.domain.views import ExportLink
from scopeprofit.enums import ExportFormat
from scopeprofit.security import sign_model, verify_model

EXPORT_PURPOSE = "document-export"


class ExportClaim(BaseModel):
    project_id: uuid.UUID
    version: int
    format: ExportFormat
    exp: int


class ExportSigner:
    def __init__(self, key: bytes, public_api_url: str, ttl_minutes: int) -> None:
        self.key = key
        self.public_api_url = public_api_url
        self.ttl = timedelta(minutes=ttl_minutes)

    def link(self, project_id: uuid.UUID, version: int, export_format: ExportFormat) -> ExportLink:
        expires = datetime.now(UTC) + self.ttl
        claim = ExportClaim(project_id=project_id, version=version, format=export_format, exp=int(expires.timestamp()))
        token = sign_model(self.key, EXPORT_PURPOSE, claim)
        return ExportLink(
            project_id=project_id,
            version=version,
            format=export_format,
            url=f"{self.public_api_url}/api/exports/{token}",
            expires_at=expires,
        )

    def verify(self, token: str) -> ExportClaim | None:
        claim = verify_model(self.key, EXPORT_PURPOSE, token, ExportClaim)
        if claim is None or claim.exp < int(datetime.now(UTC).timestamp()):
            return None
        return claim
