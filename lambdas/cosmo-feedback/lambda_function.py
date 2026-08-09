"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-feedback
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Public uninstall / feedback endpoints (no JWT).

Tables:
  CosmoUninstallFeedback  PK=feedbackId  GSI CreatedAtIndex (entityType, createdAt)
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

import boto3

FEEDBACK_TABLE = os.environ.get("UNINSTALL_FEEDBACK_TABLE", "CosmoUninstallFeedback")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

REASONS = frozenset(
    {"not_useful", "bugs", "too_expensive", "privacy", "switched", "other"}
)
SOURCES = frozenset({"chrome", "edge", "firefox", "other"})
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

ddb = boto3.resource("dynamodb")
feedback_tbl = ddb.Table(FEEDBACK_TABLE)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
    "Content-Type": "application/json",
}


def _json_default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(type(obj))


def cors_headers(event: Dict[str, Any]) -> Dict[str, str]:
    headers = dict(CORS)
    origin = (event.get("headers") or {}).get("origin") or (event.get("headers") or {}).get("Origin") or ""
    if "*" in CORS_ORIGINS or not CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin or "*"
    elif origin in CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
    return headers


def response(event: Dict[str, Any], status: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status,
        "headers": cors_headers(event),
        "body": json.dumps(body, default=_json_default),
    }


def ok(event: Dict[str, Any], data: Any, message: str = "Operation completed") -> Dict[str, Any]:
    return response(event, 200, {"success": True, "message": message, "data": data, "error": None})


def err(event: Dict[str, Any], msg: str, status: int = 400, code: str = "ERROR") -> Dict[str, Any]:
    return response(
        event,
        status,
        {"success": False, "message": msg, "data": None, "error": {"code": code}},
    )


def http_method(event: Dict[str, Any]) -> str:
    return (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or "GET"
    ).upper()


def path_of(event: Dict[str, Any]) -> str:
    return (event.get("rawPath") or event.get("path") or "/").rstrip("/") or "/"


def parse_body(event: Dict[str, Any]) -> Dict[str, Any]:
    raw = event.get("body")
    if raw is None:
        return {}
    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode("utf-8")
    if isinstance(raw, dict):
        return raw
    if not str(raw).strip():
        return {}
    return json.loads(raw)


def client_ip(event: Dict[str, Any]) -> Optional[str]:
    headers = event.get("headers") or {}
    forwarded = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For") or ""
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return (
        event.get("requestContext", {}).get("http", {}).get("sourceIp")
        or event.get("requestContext", {}).get("identity", {}).get("sourceIp")
    )


def clean_str(value: Any, max_len: int) -> str:
    if value is None:
        return ""
    return str(value).strip()[:max_len]


def submit_uninstall(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    reason = clean_str(body.get("reason"), 40)
    if reason not in REASONS:
        return err(event, "Please choose a valid uninstall reason", 400, "VALIDATION_ERROR")

    comment = clean_str(body.get("comment"), 1000)
    email = clean_str(body.get("email"), 200).lower()
    if email and not EMAIL_RE.match(email):
        return err(event, "Invalid email", 400, "VALIDATION_ERROR")

    source = clean_str(body.get("source"), 20).lower() or "chrome"
    if source not in SOURCES:
        source = "other"

    extension_version = clean_str(body.get("extensionVersion"), 40)
    browser = clean_str(body.get("browser"), 40)
    now = datetime.now(timezone.utc).isoformat()
    feedback_id = str(uuid.uuid4())

    item = {
        "feedbackId": feedback_id,
        "entityType": "uninstall",
        "reason": reason,
        "comment": comment,
        "email": email,
        "extensionVersion": extension_version,
        "browser": browser,
        "source": source,
        "ip": client_ip(event) or "",
        "createdAt": now,
    }
    feedback_tbl.put_item(Item=item)
    return ok(event, {"id": feedback_id}, "Thanks for your feedback")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    if http_method(event) == "OPTIONS":
        return ok(event, {})

    try:
        body = parse_body(event)
    except Exception:
        return err(event, "Invalid JSON body", 400, "VALIDATION_ERROR")

    method, path = http_method(event), path_of(event)
    action = (body.get("action") or event.get("action") or "").strip()

    if action == "submitUninstall" or (
        method == "POST" and path.endswith("/feedback/uninstall")
    ):
        return submit_uninstall(event, body)

    return err(event, f"Unknown path: {path}", 404, "NOT_FOUND")
