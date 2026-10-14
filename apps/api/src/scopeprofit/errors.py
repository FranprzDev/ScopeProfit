"""Domain errors with stable codes shared by REST, MCP and Telegram."""

from enum import StrEnum
from http import HTTPStatus


class ErrorCode(StrEnum):
    validation_failed = "VALIDATION_FAILED"
    unauthenticated = "UNAUTHENTICATED"
    invalid_api_key = "INVALID_API_KEY"
    forbidden = "FORBIDDEN"
    not_found = "NOT_FOUND"
    rate_limited = "RATE_LIMITED"
    internal_error = "INTERNAL_ERROR"
    project_not_found = "PROJECT_NOT_FOUND"
    project_locked = "PROJECT_LOCKED"
    project_not_reviewable = "PROJECT_NOT_REVIEWABLE"
    brief_not_found = "BRIEF_NOT_FOUND"
    brief_version_not_found = "BRIEF_VERSION_NOT_FOUND"
    invalid_brief = "INVALID_BRIEF"
    invalid_estimate = "INVALID_ESTIMATE"
    invalid_section_value = "INVALID_SECTION_VALUE"
    invalid_requirement_source = "INVALID_REQUIREMENT_SOURCE"
    version_conflict = "VERSION_CONFLICT"
    invalid_text = "INVALID_TEXT"
    empty_input = "EMPTY_INPUT"
    invalid_project_name = "INVALID_PROJECT_NAME"
    question_not_found = "QUESTION_NOT_FOUND"
    document_not_found = "DOCUMENT_NOT_FOUND"
    document_not_approved = "DOCUMENT_NOT_APPROVED"
    document_incomplete = "DOCUMENT_INCOMPLETE"
    unmitigated_risk = "UNMITIGATED_RISK"
    estimate_blocked = "ESTIMATE_BLOCKED"
    client_email_required = "CLIENT_EMAIL_REQUIRED"
    email_not_configured = "EMAIL_NOT_CONFIGURED"
    email_delivery_failed = "EMAIL_DELIVERY_FAILED"
    invalid_image = "INVALID_IMAGE"
    invalid_image_url = "INVALID_IMAGE_URL"
    image_fetch_failed = "IMAGE_FETCH_FAILED"
    invalid_file_path = "INVALID_FILE_PATH"
    invalid_export_link = "INVALID_EXPORT_LINK"
    invalid_change_request = "INVALID_CHANGE_REQUEST"
    change_request_not_found = "CHANGE_REQUEST_NOT_FOUND"
    api_key_not_found = "API_KEY_NOT_FOUND"
    account_exists = "ACCOUNT_EXISTS"
    invalid_credentials = "INVALID_CREDENTIALS"
    weak_password = "WEAK_PASSWORD"
    no_open_questions = "NO_OPEN_QUESTIONS"
    telegram_not_configured = "TELEGRAM_NOT_CONFIGURED"


class DomainError(Exception):
    """A recoverable, user-facing failure. `code` is stable; `message` is human readable."""

    def __init__(
        self,
        code: ErrorCode,
        message: str | None = None,
        status: HTTPStatus = HTTPStatus.BAD_REQUEST,
    ) -> None:
        self.code = code
        self.message = message or code.value
        self.status = status
        super().__init__(f"{code.value}: {self.message}")


def not_found(code: ErrorCode, message: str | None = None) -> DomainError:
    return DomainError(code, message, HTTPStatus.NOT_FOUND)


def conflict(code: ErrorCode, message: str | None = None) -> DomainError:
    return DomainError(code, message, HTTPStatus.CONFLICT)
