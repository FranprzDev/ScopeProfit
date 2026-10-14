"""Server-rendered OAuth consent page: sign in, sign up (email + password) or paste an API key.

No JavaScript. Styles carry a per-response nonce and the CSP only lets the forms post back to this
origin (and the client's redirect target, which browsers check on the redirect that follows).
"""

import secrets
from html import escape
from urllib.parse import urlsplit

from fastapi.responses import HTMLResponse

from scopeprofit.enums import ConsentDecision, ConsentMode
from scopeprofit.security import MIN_PASSWORD_LENGTH
from scopeprofit.services.oauth import PendingAuthorization

STYLE = """
:root { color-scheme: light; --ink: #1f2937; --muted: #6b7280; --line: #d5d9de; --accent: #4b7f73; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink);
  background: #f6f7f8; }
main { max-width: 440px; margin: 48px auto; padding: 0 20px; }
h1 { font-size: 22px; margin: 0 0 4px; }
p { margin: 0 0 16px; color: var(--muted); }
.card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 20px; margin-bottom: 16px; }
h2 { font-size: 16px; margin: 0 0 12px; }
label { display: block; font-size: 13px; margin: 10px 0 4px; }
input { width: 100%; padding: 9px 10px; border: 1px solid var(--line); border-radius: 6px; font: inherit; }
button { margin-top: 14px; width: 100%; padding: 10px; border: 0; border-radius: 6px; background: var(--ink);
  color: #fff; font: inherit; cursor: pointer; }
button.secondary { background: #fff; color: var(--ink); border: 1px solid var(--line); }
.error { background: #fdecea; border: 1px solid #f5c2bd; color: #8a1c13; border-radius: 6px; padding: 10px;
  margin-bottom: 16px; }
.client { font-weight: 600; color: var(--ink); }
"""


def _origin(uri: str) -> str:
    parts = urlsplit(uri)
    if parts.scheme in {"http", "https"}:
        return f"{parts.scheme}://{parts.netloc}"
    return f"{parts.scheme}:"


def security_headers(nonce: str, redirect_uri: str | None) -> dict[str, str]:
    targets = "'self'" + (f" {_origin(redirect_uri)}" if redirect_uri else "")
    return {
        "content-security-policy": (
            f"default-src 'none'; style-src 'nonce-{nonce}'; form-action {targets}; frame-ancestors 'none'; "
            "base-uri 'none'"
        ),
        "cache-control": "no-store",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
    }


def _page(title: str, body: str, nonce: str) -> str:
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>{escape(title)} · ScopeProfit</title><style nonce="{nonce}">{STYLE}</style></head>'
        f"<body><main>{body}</main></body></html>"
    )


def _form(sealed: str, mode: ConsentMode, title: str, fields: str, button: str) -> str:
    return (
        f'<form class="card" method="post" action="/oauth/authorize"><h2>{title}</h2>'
        f'<input type="hidden" name="request" value="{escape(sealed)}">'
        f'<input type="hidden" name="mode" value="{mode.value}">{fields}'
        f'<button type="submit" name="decision" value="{ConsentDecision.allow.value}">{button}</button></form>'
    )


def consent_page(
    pending: PendingAuthorization, sealed: str, error: str | None = None, status: int = 200
) -> HTMLResponse:
    nonce = secrets.token_urlsafe(16)
    host = urlsplit(pending.redirect_uri).netloc or pending.redirect_uri
    email = '<label for="{id}">Email</label><input id="{id}" name="email" type="email" autocomplete="email" required>'
    secret_input = (
        '<label for="{id}">Password</label><input id="{id}" name="password" type="password" '
        'autocomplete="{autocomplete}" minlength="{min}" required>'
    )
    body = (
        "<h1>Connect ScopeProfit</h1>"
        f'<p><span class="client">{escape(pending.client_name)}</span> ({escape(host)}) wants to read and edit '
        "your ScopeProfit projects, scope briefs and documents.</p>"
        + (f'<div class="error" role="alert">{escape(error)}</div>' if error else "")
        + _form(
            sealed,
            ConsentMode.sign_in,
            "Sign in",
            email.format(id="signin-email")
            + secret_input.format(id="signin-password", autocomplete="current-password", min=1),
            "Sign in and allow",
        )
        + _form(
            sealed,
            ConsentMode.sign_up,
            "Create an account",
            email.format(id="signup-email")
            + secret_input.format(id="signup-password", autocomplete="new-password", min=MIN_PASSWORD_LENGTH),
            "Create account and allow",
        )
        + _form(
            sealed,
            ConsentMode.api_key,
            "Use an API key",
            '<label for="api-key">API key (sp_live_…)</label>'
            '<input id="api-key" name="api_key" type="password" autocomplete="off" required>',
            "Allow with this key",
        )
        + '<form method="post" action="/oauth/authorize">'
        f'<input type="hidden" name="request" value="{escape(sealed)}">'
        f'<input type="hidden" name="mode" value="{ConsentMode.sign_in.value}">'
        f'<button class="secondary" type="submit" name="decision" value="{ConsentDecision.deny.value}">Deny</button>'
        "</form>"
    )
    return HTMLResponse(
        _page("Connect", body, nonce), status_code=status, headers=security_headers(nonce, pending.redirect_uri)
    )


def error_page(message: str, status: int) -> HTMLResponse:
    nonce = secrets.token_urlsafe(16)
    body = f'<h1>Cannot connect</h1><div class="error" role="alert">{escape(message)}</div>'
    return HTMLResponse(_page("Error", body, nonce), status_code=status, headers=security_headers(nonce, None))
