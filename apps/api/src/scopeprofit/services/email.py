"""Transactional email through Brevo (approved document delivery)."""

import base64
from dataclasses import dataclass
from http import HTTPStatus
from typing import Protocol

import httpx

from scopeprofit.errors import DomainError, ErrorCode

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


@dataclass(frozen=True)
class Attachment:
    name: str
    content: bytes


class EmailSender(Protocol):
    @property
    def enabled(self) -> bool: ...

    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        attachments: list[Attachment] | None = None,
        idempotency_key: str | None = None,
    ) -> str: ...


class BrevoEmail:
    def __init__(
        self,
        api_key: str | None,
        sender_email: str | None,
        sender_name: str | None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self.sender_email = sender_email
        self.sender_name = sender_name
        self.transport = transport

    @property
    def enabled(self) -> bool:
        return bool(self.api_key and self.sender_email)

    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        attachments: list[Attachment] | None = None,
        idempotency_key: str | None = None,
    ) -> str:
        if not self.api_key or not self.sender_email:
            raise DomainError(
                ErrorCode.email_not_configured,
                "Email delivery needs BREVO_API_KEY and BREVO_SENDER_EMAIL",
                HTTPStatus.SERVICE_UNAVAILABLE,
            )
        sender: dict[str, str] = {"email": self.sender_email}
        if self.sender_name:
            sender["name"] = self.sender_name
        body: dict[str, object] = {"sender": sender, "to": [{"email": to}], "subject": subject, "htmlContent": html}
        if attachments:
            body["attachment"] = [
                {"name": item.name, "content": base64.b64encode(item.content).decode()} for item in attachments
            ]
        if idempotency_key:
            body["headers"] = {"idempotencyKey": idempotency_key}
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=20.0) as client:
                response = await client.post(
                    BREVO_SEND_URL, json=body, headers={"api-key": self.api_key, "accept": "application/json"}
                )
        except httpx.HTTPError as error:
            raise DomainError(ErrorCode.email_delivery_failed, status=HTTPStatus.BAD_GATEWAY) from error
        if response.is_error:
            raise DomainError(ErrorCode.email_delivery_failed, status=HTTPStatus.BAD_GATEWAY)
        message_id = response.json().get("messageId")
        return str(message_id) if message_id else ""
