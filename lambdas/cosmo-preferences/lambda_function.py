"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-preferences
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoUsers  PK=email  GSI UserIdIndex (userId)
  CosmoApplications  PK=userId  SK=eventId
"""

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

import boto3
from boto3.dynamodb.conditions import Key

USERS_TABLE = os.environ.get("USERS_TABLE", "CosmoUsers")
APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "CosmoApplications")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

DEFAULT_PREFS = {
    "titles": [],
    "keywords": [],
    "locations": [],
    "experienceMin": 0,
    "experienceMax": 5,
    "minSalaryLpa": 2,
    "workMode": "any",
    "autoScanEnabled": True,
    "autoApplyEnabled": True,
}

dynamodb = boto3.resource("dynamodb")
users_tbl = dynamodb.Table(USERS_TABLE)
apps_tbl = dynamodb.Table(APPLICATIONS_TABLE)

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
    origin = (
        (event.get("headers") or {}).get("origin")
        or (event.get("headers") or {}).get("Origin")
        or ""
    )
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
    return response(
        event, 200, {"success": True, "message": message, "data": data, "error": None}
    )


def err(
    event: Dict[str, Any], msg: str, status: int = 400, code: str = "ERROR"
) -> Dict[str, Any]:
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
    body = event.get("body")
    if event.get("isBase64Encoded") and isinstance(body, str):
        body = base64.b64decode(body).decode("utf-8")
    if isinstance(body, str):
        return json.loads(body) if body.strip() else {}
    if isinstance(body, dict) and body:
        return body
    if event.get("action"):
        return event
    return {}


def b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def verify_jwt(token: str, secret: str) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("bad token")
    h, p, s = parts
    expected = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode("ascii")
    if not hmac.compare_digest(expected, s):
        raise ValueError("bad signature")
    payload = json.loads(b64url_decode(p))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("expired")
    return payload


def require_auth(event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    headers = event.get("headers") or {}
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    try:
        return verify_jwt(auth[7:], JWT_ACCESS_SECRET)
    except Exception:
        return None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    res = users_tbl.query(
        IndexName="UserIdIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        Limit=1,
    )
    items = res.get("Items") or []
    return items[0] if items else None


def normalize_prefs(raw: Any) -> Dict[str, Any]:
    raw = raw or {}
    return {
        "titles": list(raw.get("titles") or []),
        "keywords": list(raw.get("keywords") or []),
        "locations": list(raw.get("locations") or []),
        "experienceMin": int(raw.get("experienceMin") or 0),
        "experienceMax": int(raw.get("experienceMax") if raw.get("experienceMax") is not None else 5),
        "minSalaryLpa": raw.get("minSalaryLpa") if raw.get("minSalaryLpa") is not None else 2,
        "workMode": raw.get("workMode") or "any",
        "autoScanEnabled": bool(raw.get("autoScanEnabled", True)),
        "autoApplyEnabled": bool(raw.get("autoApplyEnabled", True)),
    }


def prefs_complete(prefs: Dict[str, Any]) -> bool:
    return len(prefs.get("titles") or []) >= 3 and len(prefs.get("keywords") or []) >= 4


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_preferences(event: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    return ok(event, normalize_prefs(user.get("preferences")))


def update_preferences(event: Dict[str, Any], user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    prefs = normalize_prefs(body)
    if prefs["experienceMin"] > prefs["experienceMax"]:
        return err(
            event,
            "experienceMin cannot exceed experienceMax",
            400,
            "VALIDATION_ERROR",
        )
    if not prefs_complete(prefs):
        return err(
            event,
            "Add at least 3 job titles and 4 keywords",
            400,
            "VALIDATION_ERROR",
        )
    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    completed_at = now_iso()
    users_tbl.update_item(
        Key={"email": user["email"]},
        UpdateExpression="SET preferences = :p, preferencesCompletedAt = :c, updatedAt = :u",
        ExpressionAttributeValues={
            ":p": prefs,
            ":c": completed_at,
            ":u": now_iso(),
        },
    )
    return ok(
        event,
        {"preferences": prefs, "preferencesCompleted": True},
        "Preferences saved",
    )


def count_applications(user_id: str) -> int:
    total = 0
    kwargs: Dict[str, Any] = {
        "KeyConditionExpression": Key("userId").eq(user_id),
        "Select": "COUNT",
    }
    while True:
        res = apps_tbl.query(**kwargs)
        total += int(res.get("Count") or 0)
        if not res.get("LastEvaluatedKey"):
            break
        kwargs["ExclusiveStartKey"] = res["LastEvaluatedKey"]
    return total


def onboarding_status(event: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    prefs = normalize_prefs(user.get("preferences"))
    status = {
        "accountCreated": True,
        "extensionConnected": bool(user.get("extensionConnectedAt")),
        "preferencesCompleted": bool(user.get("preferencesCompletedAt")) or prefs_complete(prefs),
        "hasApplications": count_applications(user_id) > 0,
        "extensionConnectedAt": user.get("extensionConnectedAt"),
    }
    return ok(event, status)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    if http_method(event) == "OPTIONS":
        return ok(event, {})

    try:
        body = parse_body(event)
    except Exception:
        return err(event, "Invalid JSON body", 400, "VALIDATION_ERROR")

    method = http_method(event)
    path = path_of(event)
    action = (body.get("action") or "").strip()

    auth = require_auth(event)
    if not auth and action not in ():
        # all routes require auth
        pass

    if not auth:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    user_id = auth.get("sub") or ""

    if action == "getPreferences" or (
        method == "GET" and path.rstrip("/").endswith("/preferences")
    ):
        return get_preferences(event, user_id)
    if action == "updatePreferences" or (
        method == "PUT" and path.rstrip("/").endswith("/preferences")
    ):
        return update_preferences(event, user_id, body)
    if action == "onboardingStatus" or (
        method == "GET" and path.endswith("/onboarding/status")
    ):
        return onboarding_status(event, user_id)

    return err(event, f"Unknown route: {method} {path}", 404, "NOT_FOUND")
