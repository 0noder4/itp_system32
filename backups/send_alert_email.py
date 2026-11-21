#!/usr/bin/env python3
"""Minimal SMTP alert sender for backup failures (stdlib only)."""
from __future__ import annotations

import argparse
from email.message import EmailMessage
import os
import smtplib
import ssl
import sys

DEFAULT_ADMIN_PLACEHOLDER = "admin@example.com"


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("true", "1", "yes")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def send_alert(to_email: str, subject: str, body: str) -> int:
    recipient = (to_email or "").strip()
    if not recipient or recipient.lower() == DEFAULT_ADMIN_PLACEHOLDER:
        print(
            f"WARNING: Alert email skipped (invalid or default recipient: {recipient!r}).",
            file=sys.stderr,
        )
        return 0

    host = os.getenv("EMAIL_HOST", "").strip()
    if not host:
        print("WARNING: Alert email skipped (EMAIL_HOST is not set).", file=sys.stderr)
        return 0

    port = _env_int("EMAIL_PORT", 587)
    user = os.getenv("EMAIL_HOST_USER", "").strip()
    password = os.getenv("EMAIL_HOST_PASSWORD", "")
    use_ssl = _env_bool("EMAIL_USE_SSL", False)
    use_tls = _env_bool("EMAIL_USE_TLS", False)
    timeout = _env_int("EMAIL_TIMEOUT", 15)
    from_email = (
        os.getenv("DEFAULT_FROM_EMAIL", "").strip()
        or user
        or "noreply@targipracy.org.pl"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = recipient
    msg.set_content(body)

    context = ssl.create_default_context()
    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=context) as server:
            if user and password:
                server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=timeout) as server:
            server.ehlo()
            if use_tls:
                server.starttls(context=context)
                server.ehlo()
            if user and password:
                server.login(user, password)
            server.send_message(msg)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Send backup failure alert email.")
    parser.add_argument("--to", required=True, help="Recipient email address.")
    parser.add_argument("--subject", required=True, help="Email subject.")
    args = parser.parse_args()

    body = sys.stdin.read()
    try:
        return send_alert(args.to, args.subject, body)
    except Exception as exc:
        print(f"ERROR: Failed to send backup alert email via SMTP: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
