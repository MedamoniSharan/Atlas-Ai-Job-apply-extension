"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-scan-sessions
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoScanSessions  PK=userId  SK=sessionId
    GSI UserStartedIndex  PK=userId  SK=startedAt
"""

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import boto3
from boto3.dynamodb.conditions import Key

SCAN_SESSIONS_TABLE = os.environ.get("SCAN_SESSIONS_TABLE", "CosmoScanSessions")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

REPORT_TZ = ZoneInfo("Asia/Kolkata")
TERMINAL_STATUSES = frozenset({"completed", "stopped", "failed"})
COUNTER_KEYS = ("scanned", "matched", "applied", "skipped", "pagesScanned")

dynamodb = boto3.resource("dynamodb")
sessions_tbl = dynamodb.Table(SCAN_SESSIONS_TABLE)

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
    raw = event.get("rawPath") or event.get("path") or "/"
    return raw.rstrip("/") or "/"


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


def query_params(event: Dict[str, Any]) -> Dict[str, str]:
    params = event.get("queryStringParameters") or {}
    return {k: str(v) for k, v in params.items() if v is not None}


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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_scan_session(item: Dict[str, Any]) -> Dict[str, Any]:
    session_id = item.get("sessionId") or ""
    return {
        "id": item.get("id") or session_id,
        "sessionId": session_id,
        "platform": item.get("platform") or "naukri",
        "keyword": item.get("keyword") or "",
        "status": item.get("status") or "running",
        "scanned": _as_int(item.get("scanned")),
        "matched": _as_int(item.get("matched")),
        "applied": _as_int(item.get("applied")),
        "skipped": _as_int(item.get("skipped")),
        "pagesScanned": _as_int(item.get("pagesScanned")),
        "startedAt": item.get("startedAt"),
        "endedAt": item.get("endedAt"),
    }


def empty_totals() -> Dict[str, int]:
    return {
        "sessions": 0,
        "scanned": 0,
        "matched": 0,
        "applied": 0,
        "skipped": 0,
    }


def sum_counters(items: List[Dict[str, Any]]) -> Dict[str, int]:
    totals = empty_totals()
    totals["sessions"] = len(items)
    for item in items:
        for key in ("scanned", "matched", "applied", "skipped"):
            totals[key] += _as_int(item.get(key))
    return totals


def ist_date(iso_str: str) -> str:
    raw = (iso_str or "").replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return "1970-01-01"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(REPORT_TZ).strftime("%Y-%m-%d")


def query_all_for_user(user_id: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    kwargs: Dict[str, Any] = {
        "KeyConditionExpression": Key("userId").eq(user_id),
    }
    while True:
        res = sessions_tbl.query(**kwargs)
        items.extend(res.get("Items") or [])
        lek = res.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek
    return items


def query_by_started_range(
    user_id: str,
    since_iso: str,
    until_iso: Optional[str] = None,
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if until_iso:
        cond = Key("userId").eq(user_id) & Key("startedAt").between(since_iso, until_iso)
    else:
        cond = Key("userId").eq(user_id) & Key("startedAt").gte(since_iso)
    kwargs: Dict[str, Any] = {
        "IndexName": "UserStartedIndex",
        "KeyConditionExpression": cond,
    }
    while True:
        res = sessions_tbl.query(**kwargs)
        batch = res.get("Items") or []
        # between is inclusive on both ends; treat until as exclusive when provided
        if until_iso:
            batch = [i for i in batch if (i.get("startedAt") or "") < until_iso]
        items.extend(batch)
        lek = res.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek
    return items


def query_recent(user_id: str, limit: int) -> List[Dict[str, Any]]:
    res = sessions_tbl.query(
        IndexName="UserStartedIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=max(1, min(limit, 50)),
    )
    return res.get("Items") or []


def upsert_scan_session(user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    session_id = (body.get("sessionId") or "").strip()
    if not session_id:
        raise ValueError("sessionId is required")

    status = (body.get("status") or "running").strip()
    is_terminal = status in TERMINAL_STATUSES
    started_at = body.get("startedAt") or now_iso()
    platform = body.get("platform") or "naukri"
    keyword = body.get("keyword") or ""

    existing = sessions_tbl.get_item(
        Key={"userId": user_id, "sessionId": session_id}
    ).get("Item")

    if existing:
        item = dict(existing)
        item["platform"] = platform
        item["keyword"] = keyword
        for key in COUNTER_KEYS:
            incoming = _as_int(body.get(key))
            item[key] = max(_as_int(item.get(key)), incoming)
        if is_terminal:
            item["status"] = status
            item["endedAt"] = body.get("endedAt") or now_iso()
        item["updatedAt"] = now_iso()
        # Preserve original startedAt for GSI stability
        if not item.get("startedAt"):
            item["startedAt"] = started_at
    else:
        item = {
            "userId": user_id,
            "sessionId": session_id,
            "id": session_id,
            "platform": platform,
            "keyword": keyword,
            "status": status if is_terminal else (status or "running"),
            "startedAt": started_at,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        for key in COUNTER_KEYS:
            item[key] = _as_int(body.get(key))
        if is_terminal:
            item["endedAt"] = body.get("endedAt") or now_iso()
        else:
            item["endedAt"] = None

    sessions_tbl.put_item(Item=item)
    return to_scan_session(item)


def parse_stats_query(params: Dict[str, str], body: Dict[str, Any]) -> Dict[str, Any]:
    # Prefer query string; allow action-console body overrides
    src = {**body, **params}
    try:
        days = int(src.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    try:
        limit = int(src.get("limit", 10))
    except (TypeError, ValueError):
        limit = 10
    days = max(1, min(days, 366))
    limit = max(1, min(limit, 50))
    from_s = src.get("from") or None
    to_s = src.get("to") or None
    return {"days": days, "limit": limit, "from": from_s, "to": to_s}


def get_scan_stats(user_id: str, query: Dict[str, Any]) -> Dict[str, Any]:
    from_date = None
    to_date = None
    if query.get("from"):
        try:
            from_date = datetime.fromisoformat(query["from"].replace("Z", "+00:00"))
        except ValueError:
            from_date = None
    if query.get("to"):
        try:
            to_date = datetime.fromisoformat(query["to"].replace("Z", "+00:00"))
        except ValueError:
            to_date = None

    use_range = (
        from_date is not None
        and to_date is not None
        and from_date.tzinfo is not None
        and to_date.tzinfo is not None
        and from_date < to_date
    ) or (
        from_date is not None
        and to_date is not None
        and from_date.timestamp() < to_date.timestamp()
    )

    if use_range and from_date and to_date:
        since = from_date
        until = to_date
        days = max(1, int((until.timestamp() - since.timestamp() + 86_399) // 86_400))
    else:
        days = query["days"]
        since = datetime.now(timezone.utc).timestamp() - days * 86_400
        since = datetime.fromtimestamp(since, tz=timezone.utc)
        until = None

    since_iso = since.isoformat()
    until_iso = until.isoformat() if until else None

    all_items = query_all_for_user(user_id)
    window_items = query_by_started_range(user_id, since_iso, until_iso)
    recent_items = query_recent(user_id, query["limit"])

    totals = sum_counters(all_items)
    window = sum_counters(window_items)
    window_out: Dict[str, Any] = {"days": days, **window}
    if use_range and until:
        window_out["from"] = since.isoformat()
        window_out["to"] = until.isoformat()

    series_map: Dict[str, Dict[str, int]] = {}
    for item in window_items:
        date = ist_date(item.get("startedAt") or "")
        bucket = series_map.setdefault(
            date,
            {"sessions": 0, "scanned": 0, "matched": 0, "applied": 0, "skipped": 0},
        )
        bucket["sessions"] += 1
        for key in ("scanned", "matched", "applied", "skipped"):
            bucket[key] += _as_int(item.get(key))

    series = [
        {"date": date, **series_map[date]}
        for date in sorted(series_map.keys())
    ]

    recent = [to_scan_session(i) for i in recent_items]
    return {
        "totals": totals,
        "window": window_out,
        "series": series,
        "recent": recent,
        "lastScanAt": recent[0]["startedAt"] if recent else None,
    }


def handle_upsert(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    auth = require_auth(event)
    if not auth:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    user_id = auth.get("sub") or ""
    if not user_id:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    if not (body.get("sessionId") or "").strip():
        return err(event, "sessionId is required", 400, "VALIDATION_ERROR")
    if not body.get("startedAt"):
        return err(event, "startedAt is required", 400, "VALIDATION_ERROR")
    try:
        session = upsert_scan_session(user_id, body)
    except ValueError as exc:
        return err(event, str(exc), 400, "VALIDATION_ERROR")
    return ok(event, session, "Scan session saved")


def handle_stats(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    auth = require_auth(event)
    if not auth:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    user_id = auth.get("sub") or ""
    if not user_id:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    query = parse_stats_query(query_params(event), body)
    stats = get_scan_stats(user_id, query)
    return ok(event, stats)


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

    # Console / action routing
    if action in ("upsert", "save", "scanSession"):
        return handle_upsert(event, body)
    if action in ("stats", "scanStats"):
        return handle_stats(event, body)

    # REST routing
    if path.endswith("/scan-sessions/stats") and method == "GET":
        return handle_stats(event, body)
    if path.endswith("/scan-sessions") and method == "POST":
        return handle_upsert(event, body)

    return err(event, f"Unknown route: {method} {path}", 404, "NOT_FOUND")
