"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-leaderboard
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoUsers         PK=email  GSI UserIdIndex (userId)
  CosmoScanSessions  PK=userId SK=sessionId

API Gateway routes:
  ANY /api/v1/leaderboard
  ANY /api/v1/leaderboard/{proxy+}
"""

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import boto3
from boto3.dynamodb.conditions import Key

USERS_TABLE = os.environ.get("USERS_TABLE", "CosmoUsers")
SCAN_SESSIONS_TABLE = os.environ.get("SCAN_SESSIONS_TABLE", "CosmoScanSessions")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

IST = ZoneInfo("Asia/Kolkata")
PERIODS = frozenset({"month", "last_month", "year", "all"})
PLATFORMS = frozenset(
    {"all", "naukri", "linkedin", "foundit", "indeed", "wellfound", "internshala", "unknown"}
)

dynamodb = boto3.resource("dynamodb")
users_tbl = dynamodb.Table(USERS_TABLE)
sessions_tbl = dynamodb.Table(SCAN_SESSIONS_TABLE)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET",
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


def query_params(event: Dict[str, Any]) -> Dict[str, str]:
    params = event.get("queryStringParameters") or {}
    return {k: str(v) for k, v in params.items() if v is not None}


def b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


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


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def as_int(v: Any, d: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return d


def scan_all(table, **kwargs) -> List[Dict[str, Any]]:
    items, start = [], None
    while True:
        args = dict(kwargs)
        if start:
            args["ExclusiveStartKey"] = start
        res = table.scan(**args)
        items.extend(res.get("Items") or [])
        start = res.get("LastEvaluatedKey")
        if not start:
            return items


def get_user_by_id(uid: str) -> Optional[Dict[str, Any]]:
    items = (
        users_tbl.query(
            IndexName="UserIdIndex",
            KeyConditionExpression=Key("userId").eq(uid),
            Limit=1,
        ).get("Items")
        or []
    )
    return items[0] if items else None


def get_ist_month_bounds(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(IST)
    period_start = datetime(local.year, local.month, 1, tzinfo=IST)
    if local.month == 12:
        period_end = datetime(local.year + 1, 1, 1, tzinfo=IST)
    else:
        period_end = datetime(local.year, local.month + 1, 1, tzinfo=IST)
    return period_start, period_end


def resolve_period(period: str, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(IST)

    if period == "all":
        return {
            "since": datetime.min.replace(tzinfo=timezone.utc),
            "until": now,
            "label": "All time",
            "key": "all",
            "prev_since": datetime.min.replace(tzinfo=timezone.utc),
            "prev_until": datetime.min.replace(tzinfo=timezone.utc),
        }

    if period == "month":
        since, until = get_ist_month_bounds(now)
        prev_anchor = since - timedelta(hours=12)
        prev_since, prev_until = get_ist_month_bounds(prev_anchor)
        return {
            "since": since,
            "until": until,
            "label": "This month",
            "key": "month",
            "prev_since": prev_since,
            "prev_until": prev_until,
        }

    if period == "last_month":
        this_start, _ = get_ist_month_bounds(now)
        anchor = this_start - timedelta(hours=12)
        since, until = get_ist_month_bounds(anchor)
        prev_anchor = since - timedelta(hours=12)
        prev_since, prev_until = get_ist_month_bounds(prev_anchor)
        return {
            "since": since,
            "until": until,
            "label": "Last month",
            "key": "last_month",
            "prev_since": prev_since,
            "prev_until": prev_until,
        }

    year = local.year
    since = datetime(year, 1, 1, tzinfo=IST)
    until = datetime(year + 1, 1, 1, tzinfo=IST)
    prev_since = datetime(year - 1, 1, 1, tzinfo=IST)
    return {
        "since": since,
        "until": until,
        "label": "This year",
        "key": "year",
        "prev_since": prev_since,
        "prev_until": since,
    }


def in_range(dt: Optional[datetime], since: datetime, until: datetime) -> bool:
    if not dt:
        return False
    return since <= dt < until


def ist_day_key(dt: datetime) -> str:
    return dt.astimezone(IST).strftime("%Y-%m-%d")


def last_7_day_keys(until: datetime) -> List[str]:
    end = min(until, datetime.now(timezone.utc))
    keys = []
    for i in range(6, -1, -1):
        keys.append(ist_day_key(end - timedelta(days=i)))
    return keys


def public_display_name(rank: int) -> str:
    return f"Player {rank}"


def public_initials(rank: int) -> str:
    return f"#{rank}"


def display_handle(rank: int) -> str:
    return f"@player-{rank}"


def primary_platform(platforms: List[str]) -> str:
    counts: Dict[str, int] = {}
    for p in platforms:
        counts[p] = counts.get(p, 0) + 1
    if not counts:
        return "naukri"
    return max(counts.items(), key=lambda x: x[1])[0]


def series_from_buckets(day_keys: List[str], buckets: Dict[str, int]) -> List[int]:
    return [buckets.get(k, 0) for k in day_keys]


def get_leaderboard(
    period: str,
    platform: str,
    current_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    bounds = resolve_period(period)
    since, until = bounds["since"], bounds["until"]
    prev_since, prev_until = bounds["prev_since"], bounds["prev_until"]
    sessions = scan_all(sessions_tbl)

    user_stats: Dict[str, Dict[str, Any]] = {}
    prev_stats: Dict[str, Dict[str, int]] = {}
    trend_applied: Dict[str, Dict[str, int]] = {}
    trend_matched: Dict[str, Dict[str, int]] = {}
    trend_scanned: Dict[str, Dict[str, int]] = {}

    day_keys = last_7_day_keys(until)
    trend_since = datetime.strptime(day_keys[0] + " 00:00:00+05:30", "%Y-%m-%d %H:%M:%S%z")
    trend_until = datetime.strptime(day_keys[-1] + " 00:00:00+05:30", "%Y-%m-%d %H:%M:%S%z") + timedelta(days=1)

    for s in sessions:
        uid = s.get("userId") or ""
        if not uid:
            continue
        plat = s.get("platform") or "naukri"
        if platform != "all" and plat != platform:
            continue
        started = parse_iso(s.get("startedAt"))
        applied = as_int(s.get("applied"))
        matched = as_int(s.get("matched"))
        scanned = as_int(s.get("scanned"))

        if in_range(started, since, until):
            row = user_stats.setdefault(
                uid,
                {
                    "applied": 0,
                    "matched": 0,
                    "scanned": 0,
                    "platforms": [],
                },
            )
            row["applied"] += applied
            row["matched"] += matched
            row["scanned"] += scanned
            row["platforms"].append(plat)

        if period != "all" and in_range(started, prev_since, prev_until):
            prev = prev_stats.setdefault(uid, {"applied": 0, "matched": 0, "scanned": 0})
            prev["applied"] += applied
            prev["matched"] += matched
            prev["scanned"] += scanned

        if started and in_range(started, trend_since, trend_until):
            dk = ist_day_key(started)
            if dk in day_keys:
                trend_applied.setdefault(uid, {})[dk] = (
                    trend_applied.get(uid, {}).get(dk, 0) + applied
                )
                trend_matched.setdefault(uid, {})[dk] = (
                    trend_matched.get(uid, {}).get(dk, 0) + matched
                )
                trend_scanned.setdefault(uid, {})[dk] = (
                    trend_scanned.get(uid, {}).get(dk, 0) + scanned
                )

    ranked = sorted(
        ((uid, stats) for uid, stats in user_stats.items() if stats["applied"] > 0),
        key=lambda x: x[1]["applied"],
        reverse=True,
    )[:10]

    entries = []
    for i, (uid, stats) in enumerate(ranked):
        prev = prev_stats.get(uid, {"applied": 0, "matched": 0, "scanned": 0})
        rank = i + 1
        is_you = bool(current_user_id and uid == current_user_id)
        entries.append(
            {
                "rank": rank,
                "displayName": public_display_name(rank),
                "handle": display_handle(rank),
                "initials": public_initials(rank),
                "platform": primary_platform(stats["platforms"]),
                "applied": stats["applied"],
                "matched": stats["matched"],
                "scanned": stats["scanned"],
                "points": stats["applied"] * 100,
                "isYou": is_you,
                "trends": {
                    "applied": series_from_buckets(day_keys, trend_applied.get(uid, {})),
                    "matched": series_from_buckets(day_keys, trend_matched.get(uid, {})),
                    "scanned": series_from_buckets(day_keys, trend_scanned.get(uid, {})),
                },
                "change": {
                    "applied": stats["applied"] - prev["applied"],
                    "matched": stats["matched"] - prev["matched"],
                    "scanned": stats["scanned"] - prev["scanned"],
                },
            }
        )

    current_user_rank = None
    if current_user_id:
        for e in entries:
            if e.get("isYou"):
                current_user_rank = e["rank"]
                break
        if current_user_rank is None:
            all_ranked = sorted(
                ((uid, stats) for uid, stats in user_stats.items() if stats["applied"] > 0),
                key=lambda x: x[1]["applied"],
                reverse=True,
            )
            for idx, (uid, _) in enumerate(all_ranked):
                if uid == current_user_id:
                    current_user_rank = idx + 1
                    break

    return {
        "period": {"label": bounds["label"], "key": bounds["key"]},
        "platform": platform,
        "entries": entries,
        "currentUserRank": current_user_rank,
    }


def handle_get(event: Dict[str, Any]) -> Dict[str, Any]:
    auth = require_auth(event)
    q = query_params(event)
    period = q.get("period") or "month"
    platform = q.get("platform") or "all"
    if period not in PERIODS:
        period = "month"
    if platform not in PLATFORMS:
        platform = "all"
    current_user_id = auth.get("sub") if auth else None
    data = get_leaderboard(period, platform, current_user_id)
    return ok(event, data)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    if http_method(event) == "OPTIONS":
        return ok(event, {})

    path = path_of(event)
    if path.endswith("/leaderboard") and http_method(event) == "GET":
        return handle_get(event)

    return err(event, f"Unknown route: {http_method(event)} {path}", 404, "NOT_FOUND")
