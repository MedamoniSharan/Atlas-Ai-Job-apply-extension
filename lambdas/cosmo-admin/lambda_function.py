"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-admin
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoUsers           PK=email  GSI UserIdIndex (userId)
  CosmoApplications    PK=userId SK=eventId
  CosmoPayments        PK=paymentId  GSI UserPaymentsIndex (userId, createdAt)
  CosmoSubscriptions   PK=subscriptionId  GSI UserSubsIndex (userId, createdAt)
  CosmoPlanConfigs     PK=tier
  CosmoSiteOffers      PK=offerId
  CosmoSiteBanners     PK=bannerId
  CosmoCoupons         PK=code
  CosmoCouponRedemptions PK=redemptionId (user/code usage tracking)
  CosmoAdminAudit      PK=auditId  GSI CreatedAtIndex (entityType, createdAt)
  CosmoUninstallFeedback PK=feedbackId GSI CreatedAtIndex (entityType, createdAt)
  CosmoScanSessions    PK=userId SK=sessionId  (optional metrics)

S3: INVOICES_BUCKET (default cosmo-invoices)
"""

import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import boto3
from boto3.dynamodb.conditions import Key

USERS_TABLE = os.environ.get("USERS_TABLE", "CosmoUsers")
APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "CosmoApplications")
PAYMENTS_TABLE = os.environ.get("PAYMENTS_TABLE", "CosmoPayments")
SUBSCRIPTIONS_TABLE = os.environ.get("SUBSCRIPTIONS_TABLE", "CosmoSubscriptions")
PLAN_CONFIGS_TABLE = os.environ.get("PLAN_CONFIGS_TABLE", "CosmoPlanConfigs")
SITE_OFFERS_TABLE = os.environ.get("SITE_OFFERS_TABLE", "CosmoSiteOffers")
SITE_BANNERS_TABLE = os.environ.get("SITE_BANNERS_TABLE", "CosmoSiteBanners")
COUPONS_TABLE = os.environ.get("COUPONS_TABLE", "CosmoCoupons")
COUPON_REDEMPTIONS_TABLE = os.environ.get("COUPON_REDEMPTIONS_TABLE", "CosmoCouponRedemptions")
AUDIT_TABLE = os.environ.get("AUDIT_TABLE", "CosmoAdminAudit")
UNINSTALL_FEEDBACK_TABLE = os.environ.get("UNINSTALL_FEEDBACK_TABLE", "CosmoUninstallFeedback")
SCAN_SESSIONS_TABLE = os.environ.get("SCAN_SESSIONS_TABLE", "CosmoScanSessions")
INVOICES_BUCKET = os.environ.get("INVOICES_BUCKET", "cosmo-invoices")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
IMPERSONATION_EXPIRES = 30 * 60
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

PLAN_PRICES_PAISE = {"pro": 9900, "max": 29900}
PLAN_COMPARE_AT_PAISE = {"free": None, "pro": 29900, "max": 79900}
PLAN_DISPLAY = {"free": "Basic", "pro": "Premium", "max": "UltraMag"}
PLAN_LIMITS = {
    "free": {"monthlyApplies": 30, "monthlyScans": 500, "appliesPerHour": 6, "appliesPerDay": 15},
    "pro": {"monthlyApplies": 300, "monthlyScans": 1500, "appliesPerHour": 12, "appliesPerDay": 40},
    "max": {"monthlyApplies": 1000, "monthlyScans": 5000, "appliesPerHour": 18, "appliesPerDay": 60},
}
PLAN_DESC = {
    "free": "Starter access with limited automated applies",
    "pro": "Higher apply volume for active job seekers",
    "max": "Highest monthly volume and scan capacity",
}
PLAN_FEATURES = {
    "free": [
        "30 assisted applies / month",
        "Safety: 15/day",
        "500 multi-board scans",
    ],
    "pro": [
        "300 assisted applies / month",
        "Safety: 40/day",
        "1500 multi-board scans",
        "Human-paced co-pilot sessions",
    ],
    "max": [
        "1000 assisted applies / month",
        "Safety: 60/day",
        "5000 multi-board scans",
        "Human-paced co-pilot sessions",
    ],
}
PLAN_LOCK_NOTE = {
    "free": None,
    "pro": "Price locks forever when you upgrade",
    "max": "Price locks forever when you upgrade",
}
PLAN_BADGE = {"free": None, "pro": "Popular", "max": None}
PLAN_HIGHLIGHTED = {"free": False, "pro": True, "max": False}
ACTIVE_SUB = frozenset({"created", "authenticated", "active", "pending", "halted"})
PAID = frozenset({"pro", "max"})
PLAN_MARKETING_FIELDS = ("compareAtPaise", "features", "badge", "highlighted", "lockNote")

ddb = boto3.resource("dynamodb")
_S3_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-2"
s3 = boto3.client(
    "s3",
    region_name=_S3_REGION,
    endpoint_url=f"https://s3.{_S3_REGION}.amazonaws.com",
)
users_tbl = ddb.Table(USERS_TABLE)
apps_tbl = ddb.Table(APPLICATIONS_TABLE)
payments_tbl = ddb.Table(PAYMENTS_TABLE)
subs_tbl = ddb.Table(SUBSCRIPTIONS_TABLE)
plans_tbl = ddb.Table(PLAN_CONFIGS_TABLE)
offers_tbl = ddb.Table(SITE_OFFERS_TABLE)
banners_tbl = ddb.Table(SITE_BANNERS_TABLE)
coupons_tbl = ddb.Table(COUPONS_TABLE)
audit_tbl = ddb.Table(AUDIT_TABLE)
feedback_tbl = ddb.Table(UNINSTALL_FEEDBACK_TABLE)
scan_sessions_tbl = ddb.Table(SCAN_SESSIONS_TABLE)

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
    return {"statusCode": status, "headers": cors_headers(event), "body": json.dumps(body, default=_json_default)}


def ok(event: Dict[str, Any], data: Any, message: str = "Operation completed") -> Dict[str, Any]:
    return response(event, 200, {"success": True, "message": message, "data": data, "error": None})


def err(event: Dict[str, Any], msg: str, status: int = 400, code: str = "ERROR") -> Dict[str, Any]:
    return response(event, status, {"success": False, "message": msg, "data": None, "error": {"code": code}})


def http_method(event: Dict[str, Any]) -> str:
    return (event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method") or "GET").upper()


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


def qs(event: Dict[str, Any]) -> Dict[str, str]:
    return {k: str(v) for k, v in (event.get("queryStringParameters") or {}).items() if v is not None}


def header(event: Dict[str, Any], name: str) -> str:
    for k, v in (event.get("headers") or {}).items():
        if k.lower() == name.lower():
            return v or ""
    return ""


def client_ip(event: Dict[str, Any]) -> Optional[str]:
    xf = header(event, "x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()
    rc = event.get("requestContext") or {}
    return (rc.get("http") or {}).get("sourceIp") or (rc.get("identity") or {}).get("sourceIp")


def b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_jwt(payload: Dict[str, Any], secret: str, expires_in: int) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    body = {**payload, "iat": now, "exp": now + expires_in}
    h = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    p = b64url_encode(json.dumps(body, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}.{b64url_encode(sig)}"


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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def page_limit(q: Dict[str, str], default: int = 20) -> Tuple[int, int]:
    return max(1, as_int(q.get("page"), 1)), min(100, max(1, as_int(q.get("limit"), default)))


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


def paginate(items: List[Any], page: int, limit: int) -> Dict[str, Any]:
    total = len(items)
    start = (page - 1) * limit
    return {
        "items": items[start : start + limit],
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": max(1, (total + limit - 1) // limit),
    }


# ─── Auth ──────────────────────────────────────────────────────


def require_admin(event: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    auth = header(event, "authorization")
    if not auth.startswith("Bearer "):
        return None, err(event, "Unauthorized", 401, "UNAUTHORIZED")
    try:
        payload = verify_jwt(auth[7:], JWT_ACCESS_SECRET)
    except Exception:
        return None, err(event, "Unauthorized", 401, "UNAUTHORIZED")
    if (payload.get("role") or "") != "admin":
        return None, err(event, "Admin access required", 403, "FORBIDDEN")
    return payload, None


# ─── Users / helpers ───────────────────────────────────────────


def get_user_by_id(uid: str) -> Optional[Dict[str, Any]]:
    items = (users_tbl.query(IndexName="UserIdIndex", KeyConditionExpression=Key("userId").eq(uid), Limit=1).get("Items") or [])
    return items[0] if items else None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    return users_tbl.get_item(Key={"email": email.lower()}).get("Item")


def update_user(email: str, updates: Dict[str, Any], remove: Optional[List[str]] = None) -> None:
    names, values, parts = {}, {":u": now_iso()}, ["updatedAt = :u"]
    for i, (k, v) in enumerate(updates.items()):
        names[f"#k{i}"], values[f":v{i}"] = k, v
        parts.append(f"#k{i} = :v{i}")
    expr = "SET " + ", ".join(parts)
    if remove:
        r = {f"#r{i}": f for i, f in enumerate(remove)}
        names.update(r)
        expr += " REMOVE " + ", ".join(r)
    kw: Dict[str, Any] = {"Key": {"email": email}, "UpdateExpression": expr, "ExpressionAttributeValues": values}
    if names:
        kw["ExpressionAttributeNames"] = names
    users_tbl.update_item(**kw)


def count_admins() -> int:
    return sum(1 for u in scan_all(users_tbl, ProjectionExpression="#r", ExpressionAttributeNames={"#r": "role"}) if (u.get("role") or "") == "admin")


def effective_plan(item: Dict[str, Any], now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    plan = item.get("plan") or "free"
    if plan == "free":
        return "free"
    exp = parse_iso(item.get("planExpiresAt"))
    return plan if exp and exp > now else "free"


def public_user(u: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": u.get("userId"), "email": u.get("email"), "name": u.get("name"),
        "role": u.get("role") or "user", "status": u.get("status") or "active",
        "plan": u.get("plan") or "free", "planExpiresAt": u.get("planExpiresAt"),
        "extensionConnectedAt": u.get("extensionConnectedAt"), "createdAt": u.get("createdAt"),
    }


def empty_job_stats() -> Dict[str, int]:
    return {"sessions": 0, "scanned": 0, "matched": 0, "applied": 0}


def sum_job_stats(
    items: List[Dict[str, Any]],
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Dict[str, int]:
    totals = empty_job_stats()
    for item in items:
        if since is not None or until is not None:
            started = parse_iso(item.get("startedAt"))
            if not started:
                continue
            if since is not None and started < since:
                continue
            if until is not None and started >= until:
                continue
        totals["sessions"] += 1
        totals["scanned"] += as_int(item.get("scanned"))
        totals["matched"] += as_int(item.get("matched"))
        totals["applied"] += as_int(item.get("applied"))
    return totals


def user_scan_sessions(uid: str) -> List[Dict[str, Any]]:
    items, start = [], None
    while True:
        kwargs: Dict[str, Any] = {
            "KeyConditionExpression": Key("userId").eq(uid),
        }
        if start:
            kwargs["ExclusiveStartKey"] = start
        res = scan_sessions_tbl.query(**kwargs)
        items.extend(res.get("Items") or [])
        start = res.get("LastEvaluatedKey")
        if not start:
            return items


def write_audit(admin_id: str, action: str, target_type: str, target_id: Optional[str] = None,
                before: Any = None, after: Any = None, ip: Optional[str] = None) -> None:
    audit_tbl.put_item(Item={
        "auditId": str(uuid.uuid4()), "entityType": "admin", "createdAt": now_iso(),
        "adminId": admin_id, "action": action, "targetType": target_type, "targetId": target_id,
        "before": before, "after": after, "ip": ip,
    })


def seed_plans() -> List[Dict[str, Any]]:
    out = []
    for tier in ("free", "pro", "max"):
        item = plans_tbl.get_item(Key={"tier": tier}).get("Item")
        if not item:
            compare_at = PLAN_COMPARE_AT_PAISE[tier]
            item = {
                "tier": tier, "name": PLAN_DISPLAY[tier], "description": PLAN_DESC[tier],
                "amountPaise": 0 if tier == "free" else PLAN_PRICES_PAISE[tier],
                "compareAtPaise": 0 if compare_at is None else compare_at,
                "features": list(PLAN_FEATURES[tier]),
                "badge": PLAN_BADGE[tier],
                "highlighted": PLAN_HIGHLIGHTED[tier],
                "lockNote": PLAN_LOCK_NOTE[tier],
                "limits": dict(PLAN_LIMITS[tier]), "razorpayPlanId": None, "active": True,
                "createdAt": now_iso(), "updatedAt": now_iso(),
            }
            plans_tbl.put_item(Item=item)
        elif tier == "free":
            limits = dict(item.get("limits") or {})
            if as_int(limits.get("monthlyApplies"), 0) == 50:
                limits["monthlyApplies"] = PLAN_LIMITS["free"]["monthlyApplies"]
                item = {**item, "limits": limits, "updatedAt": now_iso()}
                plans_tbl.put_item(Item=item)
        out.append(item)
    return out


def plan_public(p: Dict[str, Any]) -> Dict[str, Any]:
    t = p.get("tier") or "free"
    features = p.get("features")
    if not isinstance(features, list) or not features:
        features = list(PLAN_FEATURES.get(t, []))
    compare_default = PLAN_COMPARE_AT_PAISE.get(t)
    if "compareAtPaise" in p and p.get("compareAtPaise") is not None:
        compare_at = as_int(p.get("compareAtPaise"))
        if t == "free" and compare_at == 0:
            compare_at = None
    else:
        compare_at = compare_default
    badge = p.get("badge") if "badge" in p else PLAN_BADGE.get(t)
    lock_note = p.get("lockNote") if "lockNote" in p else PLAN_LOCK_NOTE.get(t)
    highlighted = p.get("highlighted") if "highlighted" in p else PLAN_HIGHLIGHTED.get(t, False)
    return {
        "tier": t, "name": p.get("name"), "description": p.get("description"),
        "amountPaise": as_int(p.get("amountPaise")),
        "compareAtPaise": compare_at,
        "features": features,
        "badge": badge,
        "highlighted": bool(highlighted),
        "lockNote": lock_note,
        "limits": p.get("limits") or PLAN_LIMITS.get(t),
        "razorpayPlanId": p.get("razorpayPlanId"), "active": bool(p.get("active", True)),
        "displayFallback": PLAN_DISPLAY.get(t, t),
    }


def user_subs(uid: str, limit: int = 25) -> List[Dict[str, Any]]:
    return subs_tbl.query(IndexName="UserSubsIndex", KeyConditionExpression=Key("userId").eq(uid),
                          ScanIndexForward=False, Limit=limit).get("Items") or []


def user_payments(uid: str, limit: int = 20) -> List[Dict[str, Any]]:
    return payments_tbl.query(IndexName="UserPaymentsIndex", KeyConditionExpression=Key("userId").eq(uid),
                              ScanIndexForward=False, Limit=limit).get("Items") or []


def umap(ids: List[Optional[str]]) -> Dict[str, Dict[str, Any]]:
    out = {}
    for uid in {i for i in ids if i}:
        u = get_user_by_id(uid)
        if u:
            out[uid] = u
    return out


def uinfo(m: Dict[str, Dict[str, Any]], uid: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    u = m.get(uid or "") or {}
    return u.get("name"), u.get("email")


def grant_plan(user: Dict[str, Any], plan: str, period_end: datetime, source: str = "admin_grant") -> str:
    now = datetime.now(timezone.utc)
    sid = str(uuid.uuid4())
    subs_tbl.put_item(Item={
        "subscriptionId": sid, "userId": user["userId"], "tier": plan, "status": "active",
        "source": source, "cancelAtPeriodEnd": True,
        "currentPeriodStart": now.isoformat(), "currentPeriodEnd": period_end.isoformat(),
        "createdAt": now.isoformat(), "updatedAt": now.isoformat(),
    })
    update_user(user["email"], {"plan": plan, "planExpiresAt": period_end.isoformat(), "activeSubscriptionId": sid})
    return sid


def revoke_plan(user: Dict[str, Any]) -> None:
    for s in user_subs(user["userId"], 50):
        if s.get("status") in ACTIVE_SUB:
            subs_tbl.update_item(
                Key={"subscriptionId": s["subscriptionId"]},
                UpdateExpression="SET #s=:s, cancelledAt=:c, cancelAtPeriodEnd=:f, updatedAt=:u",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":s": "cancelled", ":c": now_iso(), ":f": False, ":u": now_iso()},
            )
    update_user(user["email"], {"plan": "free"}, remove=["planExpiresAt", "activeSubscriptionId"])


# ─── Handlers ──────────────────────────────────────────────────


def get_metrics(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    q, now = qs(event), datetime.now(timezone.utc)
    rk = q.get("range") or ("7d" if q.get("days") == "7" else "90d" if q.get("days") == "90" else "30d")
    year = month = None
    if rk == "all":
        since, until, grain, label = datetime(1970, 1, 1, tzinfo=timezone.utc), now, "month", "All time"
        year = now.year
    elif rk in ("7d", "30d", "90d"):
        days = {"7d": 7, "30d": 30, "90d": 90}[rk]
        since, until, grain, label = now - timedelta(days=days), now, "day", rk
        year = now.year
    elif rk == "month":
        year, month = as_int(q.get("year"), now.year), as_int(q.get("month"), now.month)
        since = datetime(year, month, 1, tzinfo=timezone.utc)
        until = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12 else datetime(year, month + 1, 1, tzinfo=timezone.utc)
        grain, label = "day", f"{year}-{month:02d}"
    else:
        year = as_int(q.get("year"), now.year)
        since, until = datetime(year, 1, 1, tzinfo=timezone.utc), datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        grain, label, rk = "month", str(year), "year"

    users, payments, subs = scan_all(users_tbl), scan_all(payments_tbl), scan_all(subs_tbl)
    try:
        scan_sessions = scan_all(scan_sessions_tbl)
    except Exception:
        scan_sessions = []
    day7 = now - timedelta(days=7)

    def in_p(iso: Optional[str]) -> bool:
        dt = parse_iso(iso)
        return bool(dt and since <= dt < until)

    def bucket(iso: Optional[str]) -> str:
        dt = parse_iso(iso)
        return "" if not dt else (dt.strftime("%Y-%m") if grain == "month" else dt.strftime("%Y-%m-%d"))

    mix = {"free": 0, "pro": 0, "max": 0}
    for u in users:
        ep = effective_plan(u, now)
        mix[ep] = mix.get(ep, 0) + 1
    active = [s for s in subs if s.get("status") in ACTIVE_SUB]
    prices = {p["tier"]: as_int(p.get("amountPaise"), PLAN_PRICES_PAISE.get(p["tier"], 0)) for p in seed_plans()}
    paid_p = [p for p in payments if p.get("status") == "paid" and in_p(p.get("createdAt"))]
    rev_map: Dict[str, Dict[str, int]] = {}
    for p in paid_p:
        b = bucket(p.get("createdAt"))
        if b:
            rev_map.setdefault(b, {"amountPaise": 0, "count": 0})
            rev_map[b]["amountPaise"] += as_int(p.get("amountPaise"))
            rev_map[b]["count"] += 1
    signup_map: Dict[str, int] = {}
    for u in users:
        if in_p(u.get("createdAt")):
            b = bucket(u.get("createdAt"))
            if b:
                signup_map[b] = signup_map.get(b, 0) + 1
    outcomes: Dict[str, int] = {}
    for p in payments:
        if in_p(p.get("createdAt")):
            outcomes[p.get("status") or "?"] = outcomes.get(p.get("status") or "?", 0) + 1

    job_all = sum_job_stats(scan_sessions)
    job_period = sum_job_stats(scan_sessions, since=since, until=until)
    jobs_map: Dict[str, Dict[str, int]] = {}
    for s in scan_sessions:
        if not in_p(s.get("startedAt")):
            continue
        b = bucket(s.get("startedAt"))
        if not b:
            continue
        row = jobs_map.setdefault(b, {"sessions": 0, "scanned": 0, "matched": 0, "applied": 0})
        row["sessions"] += 1
        row["scanned"] += as_int(s.get("scanned"))
        row["matched"] += as_int(s.get("matched"))
        row["applied"] += as_int(s.get("applied"))

    applied_by_user: Dict[str, int] = {}
    for s in scan_sessions:
        if not in_p(s.get("startedAt")):
            continue
        uid = s.get("userId") or ""
        if not uid:
            continue
        applied_by_user[uid] = applied_by_user.get(uid, 0) + as_int(s.get("applied"))
    top_power = sorted(
        ((uid, n) for uid, n in applied_by_user.items() if n > 0),
        key=lambda x: x[1],
        reverse=True,
    )[:10]
    power_map = umap([uid for uid, _ in top_power])
    power_users = [
        {
            "rank": i + 1,
            "userId": uid,
            "userName": uinfo(power_map, uid)[0],
            "userEmail": uinfo(power_map, uid)[1],
            "applied": applied,
        }
        for i, (uid, applied) in enumerate(top_power)
    ]

    m = umap([p.get("userId") for p in payments] + [s.get("userId") for s in subs])
    recent = sorted([p for p in payments if p.get("status") == "paid"], key=lambda x: x.get("createdAt") or "", reverse=True)[:8]
    week = now + timedelta(days=7)
    expiring = sorted(
        [s for s in active if s.get("status") in ("active", "authenticated")
         and (pe := parse_iso(s.get("currentPeriodEnd"))) and now <= pe <= week],
        key=lambda x: x.get("currentPeriodEnd") or "",
    )[:8]
    halted = sorted([s for s in subs if s.get("status") == "halted"], key=lambda x: x.get("updatedAt") or "", reverse=True)[:8]
    rev = sum(as_int(p.get("amountPaise")) for p in paid_p)

    return ok(event, {
        "period": {"range": rk, "grain": grain, "label": label, "year": year, "month": month,
                   "since": since.isoformat(), "until": until.isoformat()},
        "kpis": {
            "totalUsers": len(users),
            "newUsers7": sum(1 for u in users if (parse_iso(u.get("createdAt")) or datetime.min.replace(tzinfo=timezone.utc)) >= day7),
            "newUsers30": sum(1 for u in users if in_p(u.get("createdAt"))),
            "activePaid": mix["pro"] + mix["max"], "mrrPaise": sum(prices.get(s.get("tier"), 0) for s in active),
            "revenueMtdPaise": rev, "revenueYtdPaise": rev,
            "failedPayments": sum(1 for p in payments if p.get("status") == "failed" and in_p(p.get("createdAt"))),
            "churnCancels": sum(1 for s in subs if s.get("status") == "cancelled" and in_p(s.get("cancelledAt"))),
            "jobsScanned": job_all["scanned"],
            "jobsMatched": job_all["matched"],
            "jobsApplied": job_all["applied"],
            "scanSessions": job_all["sessions"],
            "jobsScannedPeriod": job_period["scanned"],
            "jobsMatchedPeriod": job_period["matched"],
            "jobsAppliedPeriod": job_period["applied"],
            "scanSessionsPeriod": job_period["sessions"],
        },
        "series": {
            "revenueDaily": [{"date": d, **v} for d, v in sorted(rev_map.items())],
            "signupsDaily": [{"date": d, "count": c} for d, c in sorted(signup_map.items())],
            "jobsDaily": [{"date": d, **v} for d, v in sorted(jobs_map.items())],
            "planMix": [{"tier": t, "count": mix[t]} for t in ("free", "pro", "max")],
            "paymentOutcomes": [{"status": s, "count": c} for s, c in outcomes.items()],
            "subsByTier": [{"tier": t, "count": sum(1 for s in active if s.get("tier") == t)} for t in ("pro", "max")],
        },
        "lists": {
            "recentPayments": [
                {"id": p.get("paymentId"), "plan": p.get("plan"), "amountPaise": as_int(p.get("amountPaise")),
                 "paidAt": p.get("createdAt"), "userName": uinfo(m, p.get("userId"))[0], "userEmail": uinfo(m, p.get("userId"))[1]}
                for p in recent
            ],
            "expiringSoon": [
                {"id": s.get("subscriptionId"), "tier": s.get("tier"), "currentPeriodEnd": s.get("currentPeriodEnd"),
                 "userName": uinfo(m, s.get("userId"))[0], "userEmail": uinfo(m, s.get("userId"))[1]}
                for s in expiring
            ],
            "haltedSubs": [
                {"id": s.get("subscriptionId"), "tier": s.get("tier"), "updatedAt": s.get("updatedAt"),
                 "userName": uinfo(m, s.get("userId"))[0], "userEmail": uinfo(m, s.get("userId"))[1]}
                for s in halted
            ],
            "powerUsers": power_users,
        },
    })


def utc_day_start(day: str) -> Optional[datetime]:
    dt = parse_iso(day)
    if not dt:
        return None
    return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)


def utc_day_end_exclusive(day: str) -> Optional[datetime]:
    start = utc_day_start(day)
    return None if not start else start + timedelta(days=1)


def list_users(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    q = qs(event)
    page, limit = page_limit(q, 10)
    needle = (q.get("q") or "").strip().lower()
    fr, to = utc_day_start(q.get("from") or ""), utc_day_end_exclusive(q.get("to") or "")
    filtered = []
    for u in scan_all(users_tbl):
        if q.get("plan") and (u.get("plan") or "free") != q["plan"]:
            continue
        if q.get("role") and (u.get("role") or "user") != q["role"]:
            continue
        if q.get("status") and (u.get("status") or "active") != q["status"]:
            continue
        if needle and needle not in f"{u.get('email','')} {u.get('name','')}".lower():
            continue
        if fr or to:
            created = parse_iso(u.get("createdAt"))
            if not created:
                continue
            if fr and created < fr:
                continue
            if to and created >= to:
                continue
        filtered.append(u)
    filtered.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    data = paginate(filtered, page, limit)
    data["items"] = [public_user(u) for u in data["items"]]
    return ok(event, data)


def get_user_detail(event: Dict[str, Any], _aid: str, uid: str, message: str = "Operation completed") -> Dict[str, Any]:
    user = get_user_by_id(uid)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    subs, pays = user_subs(uid, 5), user_payments(uid, 20)
    sub = subs[0] if subs else None
    try:
        job_stats = sum_job_stats(user_scan_sessions(uid))
    except Exception:
        job_stats = empty_job_stats()
    data = public_user(user)
    data.update({
        "preferences": user.get("preferences"),
        "preferencesCompletedAt": user.get("preferencesCompletedAt"),
        "razorpayCustomerId": user.get("razorpayCustomerId"),
        "jobStats": job_stats,
        "subscription": ({
            "id": sub.get("subscriptionId"), "tier": sub.get("tier"), "status": sub.get("status"),
            "source": sub.get("source"), "cancelAtPeriodEnd": sub.get("cancelAtPeriodEnd"),
            "currentPeriodStart": sub.get("currentPeriodStart"), "currentPeriodEnd": sub.get("currentPeriodEnd"),
            "razorpaySubscriptionId": sub.get("razorpaySubscriptionId"),
        } if sub else None),
        "payments": [{
            "id": p.get("paymentId"), "plan": p.get("plan"), "amountPaise": as_int(p.get("amountPaise")),
            "status": p.get("status"), "type": p.get("type"), "invoiceNumber": p.get("invoiceNumber"),
            "createdAt": p.get("createdAt"),
        } for p in pays],
    })
    return ok(event, data, message)


def patch_user(event: Dict[str, Any], aid: str, uid: str, body: Dict[str, Any], message: str = "User updated") -> Dict[str, Any]:
    user = get_user_by_id(uid)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    before = {k: user.get(k) for k in ("name", "email", "role", "status")}
    if body.get("role") == "user" and (user.get("role") or "") == "admin":
        if count_admins() <= 1:
            return err(event, "Cannot demote the last admin", 400, "LAST_ADMIN")
        if aid == uid:
            return err(event, "Cannot demote yourself", 400, "SELF_DEMOTE")
    email_key = user["email"]
    if body.get("email"):
        new_email = str(body["email"]).strip().lower()
        if new_email != user["email"]:
            if get_user_by_email(new_email):
                return err(event, "Email already registered", 409, "EMAIL_EXISTS")
            new_item = {**user, "email": new_email, "updatedAt": now_iso()}
            users_tbl.put_item(Item=new_item)
            users_tbl.delete_item(Key={"email": email_key})
            email_key, user = new_email, new_item
    updates = {}
    if body.get("name") is not None:
        updates["name"] = str(body["name"]).strip()
    if body.get("role") is not None:
        updates["role"] = body["role"]
    if body.get("status") is not None:
        updates["status"] = body["status"]
    if updates:
        update_user(email_key, updates)
        user.update(updates)
    write_audit(aid, "user.patch", "user", uid, before,
                {k: user.get(k) for k in ("name", "email", "role", "status")}, client_ip(event))
    return get_user_detail(event, aid, uid, message)


def impersonate_user(event: Dict[str, Any], aid: str, uid: str) -> Dict[str, Any]:
    if aid == uid:
        return err(event, "Cannot impersonate yourself", 400, "SELF_IMPERSONATE")
    user = get_user_by_id(uid)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    if (user.get("status") or "active") == "suspended":
        return err(event, "Cannot impersonate a suspended user", 403, "ACCOUNT_SUSPENDED")
    role = user.get("role") or "user"
    token = sign_jwt(
        {
            "sub": uid,
            "email": user.get("email"),
            "role": role,
            "impersonatedBy": aid,
        },
        JWT_ACCESS_SECRET,
        IMPERSONATION_EXPIRES,
    )
    write_audit(
        aid,
        "user.impersonate",
        "user",
        uid,
        None,
        {
            "email": user.get("email"),
            "name": user.get("name"),
            "role": role,
            "status": user.get("status") or "active",
        },
        client_ip(event),
    )
    return ok(
        event,
        {
            "accessToken": token,
            "expiresInSeconds": IMPERSONATION_EXPIRES,
            "user": public_user(user),
        },
        "Impersonation started",
    )


def delete_user(event: Dict[str, Any], aid: str, uid: str) -> Dict[str, Any]:
    user = get_user_by_id(uid)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    if aid == uid:
        return err(event, "Cannot delete your own account", 400, "SELF_DELETE")
    if (user.get("role") or "") == "admin" and count_admins() <= 1:
        return err(event, "Cannot delete the last admin", 400, "LAST_ADMIN")
    before = {k: user.get(k) for k in ("name", "email", "role", "status", "plan")}
    try:
        for p in user_payments(uid, 200):
            payments_tbl.delete_item(Key={"paymentId": p["paymentId"]})
        for s in user_subs(uid, 200):
            subs_tbl.delete_item(Key={"subscriptionId": s["subscriptionId"]})
        res = apps_tbl.query(KeyConditionExpression=Key("userId").eq(uid))
        with apps_tbl.batch_writer() as batch:
            for it in res.get("Items") or []:
                batch.delete_item(Key={"userId": it["userId"], "eventId": it["eventId"]})
    except Exception:
        pass
    users_tbl.delete_item(Key={"email": user["email"]})
    write_audit(aid, "user.delete", "user", uid, before, {"deleted": True}, client_ip(event))
    return ok(event, {"id": uid, "deleted": True}, "User deleted")


def set_user_plan(event: Dict[str, Any], aid: str, uid: str, body: Dict[str, Any]) -> Dict[str, Any]:
    user = get_user_by_id(uid)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    before = {"plan": user.get("plan"), "planExpiresAt": user.get("planExpiresAt")}
    action, now = body.get("action"), datetime.now(timezone.utc)
    if action == "revoke" or body.get("plan") == "free":
        revoke_plan(user)
        audit_action = "user.plan.revoke"
    else:
        plan = body.get("plan") or ("pro" if (user.get("plan") or "free") == "free" else user.get("plan"))
        if plan not in PAID:
            return err(event, "plan must be pro or max", 400, "VALIDATION_ERROR")
        if body.get("planExpiresAt"):
            period_end = parse_iso(body["planExpiresAt"])
            if not period_end:
                return err(event, "Invalid planExpiresAt", 400, "VALIDATION_ERROR")
        else:
            days = max(1, as_int(body.get("days"), 30))
            base = now
            if action == "extend":
                existing = parse_iso(user.get("planExpiresAt"))
                if existing and existing > now:
                    base = existing
            period_end = base + timedelta(days=days)
        grant_plan(user, plan, period_end)
        payments_tbl.put_item(Item={
            "paymentId": str(uuid.uuid4()), "userId": uid, "plan": plan, "amountPaise": 0,
            "currency": "INR", "type": "admin", "status": "paid", "createdAt": now_iso(),
        })
        audit_action = f"user.plan.{action or 'grant'}"
    refreshed = get_user_by_id(uid) or user
    write_audit(aid, audit_action, "user", uid, before,
                {"plan": refreshed.get("plan"), "planExpiresAt": refreshed.get("planExpiresAt")}, client_ip(event))
    return get_user_detail(event, aid, uid, "Plan updated")


def list_subscriptions(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    q = qs(event)
    page, limit = page_limit(q)
    items = scan_all(subs_tbl)
    if q.get("status"):
        items = [s for s in items if s.get("status") == q["status"]]
    if q.get("tier"):
        items = [s for s in items if s.get("tier") == q["tier"]]
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    data = paginate(items, page, limit)
    m = umap([s.get("userId") for s in data["items"]])
    data["items"] = [{
        "id": s.get("subscriptionId"), "userId": s.get("userId"),
        "userName": uinfo(m, s.get("userId"))[0], "userEmail": uinfo(m, s.get("userId"))[1],
        "tier": s.get("tier"), "status": s.get("status"), "source": s.get("source"),
        "cancelAtPeriodEnd": s.get("cancelAtPeriodEnd"),
        "currentPeriodStart": s.get("currentPeriodStart"), "currentPeriodEnd": s.get("currentPeriodEnd"),
        "razorpaySubscriptionId": s.get("razorpaySubscriptionId"), "createdAt": s.get("createdAt"),
    } for s in data["items"]]
    return ok(event, data)


def cancel_subscription(event: Dict[str, Any], aid: str, sid: str, immediate: bool) -> Dict[str, Any]:
    sub = subs_tbl.get_item(Key={"subscriptionId": sid}).get("Item")
    if not sub:
        return err(event, "Subscription not found", 404, "NOT_FOUND")
    before = {"status": sub.get("status"), "cancelAtPeriodEnd": sub.get("cancelAtPeriodEnd")}
    if immediate:
        subs_tbl.update_item(
            Key={"subscriptionId": sid},
            UpdateExpression="SET #s=:s, cancelledAt=:c, cancelAtPeriodEnd=:f, updatedAt=:u",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "cancelled", ":c": now_iso(), ":f": False, ":u": now_iso()},
        )
        user = get_user_by_id(sub.get("userId") or "")
        if user:
            update_user(user["email"], {"plan": "free"}, remove=["planExpiresAt", "activeSubscriptionId"])
        status, cap = "cancelled", False
    else:
        subs_tbl.update_item(
            Key={"subscriptionId": sid},
            UpdateExpression="SET cancelAtPeriodEnd=:t, updatedAt=:u",
            ExpressionAttributeValues={":t": True, ":u": now_iso()},
        )
        status, cap = sub.get("status"), True
    write_audit(aid, "subscription.cancel.immediate" if immediate else "subscription.cancel.period_end",
                "subscription", sid, before, {"status": status, "cancelAtPeriodEnd": cap}, client_ip(event))
    return ok(event, {"id": sid, "status": status, "cancelAtPeriodEnd": cap}, "Subscription cancelled")


def extend_subscription(event: Dict[str, Any], aid: str, sid: str, body: Dict[str, Any]) -> Dict[str, Any]:
    sub = subs_tbl.get_item(Key={"subscriptionId": sid}).get("Item")
    if not sub:
        return err(event, "Subscription not found", 404, "NOT_FOUND")
    days = as_int(body.get("days"), 0)
    if days < 1:
        return err(event, "days is required", 400, "VALIDATION_ERROR")
    now = datetime.now(timezone.utc)
    before = {"currentPeriodEnd": sub.get("currentPeriodEnd")}
    base = parse_iso(sub.get("currentPeriodEnd"))
    if not base or base < now:
        base = now
    period_end = base + timedelta(days=days)
    expr, vals = "SET currentPeriodEnd=:e, updatedAt=:u", {":e": period_end.isoformat(), ":u": now_iso()}
    names = None
    if sub.get("status") in ("cancelled", "expired"):
        expr += ", #s=:s"
        vals[":s"] = "active"
        names = {"#s": "status"}
    kw: Dict[str, Any] = {"Key": {"subscriptionId": sid}, "UpdateExpression": expr, "ExpressionAttributeValues": vals}
    if names:
        kw["ExpressionAttributeNames"] = names
    subs_tbl.update_item(**kw)
    user = get_user_by_id(sub.get("userId") or "")
    if user:
        update_user(user["email"], {"plan": sub.get("tier") or "pro", "planExpiresAt": period_end.isoformat(),
                                    "activeSubscriptionId": sid})
    write_audit(aid, "subscription.extend", "subscription", sid, before,
                {"currentPeriodEnd": period_end.isoformat(), "days": days}, client_ip(event))
    return ok(event, {"id": sid, "currentPeriodEnd": period_end.isoformat()}, "Subscription extended")


def list_payments(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    q = qs(event)
    page, limit = page_limit(q)
    items = scan_all(payments_tbl)
    if q.get("status"):
        items = [p for p in items if p.get("status") == q["status"]]
    if q.get("plan"):
        items = [p for p in items if p.get("plan") == q["plan"]]
    fr, to = parse_iso(q.get("from")), parse_iso(q.get("to"))
    if fr or to:
        items = [p for p in items if (dt := parse_iso(p.get("createdAt"))) and (not fr or dt >= fr) and (not to or dt <= to)]
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    data = paginate(items, page, limit)
    m = umap([p.get("userId") for p in data["items"]])
    data["items"] = [{
        "id": p.get("paymentId"), "userId": p.get("userId"),
        "userName": uinfo(m, p.get("userId"))[0], "userEmail": uinfo(m, p.get("userId"))[1],
        "plan": p.get("plan"), "amountPaise": as_int(p.get("amountPaise")), "currency": p.get("currency"),
        "status": p.get("status"), "type": p.get("type"), "invoiceNumber": p.get("invoiceNumber"),
        "razorpayPaymentId": p.get("razorpayPaymentId"), "razorpayOrderId": p.get("razorpayOrderId"),
        "razorpaySubscriptionId": p.get("razorpaySubscriptionId"), "createdAt": p.get("createdAt"),
    } for p in data["items"]]
    return ok(event, data)


def reconcile_payment(event: Dict[str, Any], aid: str, pid: str) -> Dict[str, Any]:
    payment = payments_tbl.get_item(Key={"paymentId": pid}).get("Item")
    if not payment:
        return err(event, "Payment not found", 404, "NOT_FOUND")
    before = {"status": payment.get("status")}
    payments_tbl.update_item(
        Key={"paymentId": pid},
        UpdateExpression="SET #s=:s, updatedAt=:u",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": "paid", ":u": now_iso()},
    )
    plan, user = payment.get("plan"), get_user_by_id(payment.get("userId") or "")
    if user and plan in PAID:
        grant_plan(user, plan, datetime.now(timezone.utc) + timedelta(days=30), "admin_reconcile")
    write_audit(aid, "payment.reconcile", "payment", pid, before, {"status": "paid", "planGranted": plan}, client_ip(event))
    return ok(event, {"id": pid, "status": "paid"}, "Payment reconciled")


def invoice_object_key(payment: Dict[str, Any]) -> Optional[str]:
    """Prefer migrated S3 key; never use local Mongo disk paths as S3 keys."""
    key = payment.get("invoiceS3Key")
    if isinstance(key, str) and key.startswith("invoices/"):
        return key
    inv = payment.get("invoiceNumber")
    path = payment.get("invoicePath")
    if isinstance(path, str) and path.strip():
        name = path.replace("\\", "/").rstrip("/").split("/")[-1]
        if name:
            return f"invoices/{name}"
    if inv:
        # Migrated PDFs use .pdf; newly generated placeholders use .txt
        return f"invoices/{inv}.pdf"
    return None


def payment_invoice(event: Dict[str, Any], _aid: str, pid: str) -> Dict[str, Any]:
    payment = payments_tbl.get_item(Key={"paymentId": pid}).get("Item")
    if not payment or payment.get("status") != "paid":
        return err(event, "Invoice not available", 404, "NOT_FOUND")
    key = invoice_object_key(payment)
    if not key:
        return err(event, "Invoice not available", 404, "NOT_FOUND")
    try:
        s3.head_object(Bucket=INVOICES_BUCKET, Key=key)
    except Exception:
        # Fall back to .txt placeholder key if PDF missing
        if key.endswith(".pdf"):
            alt = key[:-4] + ".txt"
            try:
                s3.head_object(Bucket=INVOICES_BUCKET, Key=alt)
                key = alt
            except Exception:
                return err(event, "Invoice file missing in S3", 404, "INVOICE_MISSING")
        else:
            return err(event, "Invoice file missing in S3", 404, "INVOICE_MISSING")
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": INVOICES_BUCKET, "Key": key},
            ExpiresIn=3600,
        )
    except Exception:
        return err(event, "Failed to presign invoice", 502, "INVOICE_ERROR")
    return ok(event, {"url": url, "invoiceNumber": payment.get("invoiceNumber"), "key": key})


def list_plans(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    return ok(event, [plan_public(p) for p in seed_plans()])


def update_plan(event: Dict[str, Any], aid: str, tier: str, body: Dict[str, Any]) -> Dict[str, Any]:
    if tier not in ("free", "pro", "max"):
        return err(event, "Invalid plan tier", 400, "VALIDATION_ERROR")
    seed_plans()
    plan = plans_tbl.get_item(Key={"tier": tier}).get("Item")
    if not plan:
        return err(event, "Plan not found", 404, "NOT_FOUND")
    audit_keys = ("name", "amountPaise", "limits", "active", "razorpayPlanId") + PLAN_MARKETING_FIELDS
    before = {k: plan.get(k) for k in audit_keys}
    updates = {"updatedAt": now_iso()}
    for f in ("name", "description", "active", "amountPaise", "limits") + PLAN_MARKETING_FIELDS:
        if f in body:
            updates[f] = body[f]
    names = {f"#k{i}": k for i, k in enumerate(updates)}
    vals = {f":v{i}": v for i, v in enumerate(updates.values())}
    plans_tbl.update_item(
        Key={"tier": tier},
        UpdateExpression="SET " + ", ".join(f"{n}={v}" for n, v in zip(names, vals)),
        ExpressionAttributeNames=names, ExpressionAttributeValues=vals,
    )
    plan.update(updates)
    write_audit(aid, "plan.update", "plan", tier, before, {k: plan.get(k) for k in audit_keys}, client_ip(event))
    return ok(event, plan_public(plan), "Plan updated")


def offer_public(o: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "offerId": o.get("offerId"),
        "message": o.get("message") or "",
        "couponCode": o.get("couponCode"),
        "linkUrl": o.get("linkUrl"),
        "imageUrl": o.get("imageUrl"),
        "showBird": bool(o.get("showBird", True)),
        "showFlag": bool(o.get("showFlag", True)),
        "active": bool(o.get("active", True)),
        "startsAt": o.get("startsAt"),
        "endsAt": o.get("endsAt"),
        "priority": as_int(o.get("priority")),
        "createdAt": o.get("createdAt"),
        "updatedAt": o.get("updatedAt"),
    }


def list_offers(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    items = scan_all(offers_tbl)
    items.sort(key=lambda x: (as_int(x.get("priority")), x.get("createdAt") or ""), reverse=True)
    return ok(event, [offer_public(o) for o in items])


def create_offer(event: Dict[str, Any], aid: str, body: Dict[str, Any]) -> Dict[str, Any]:
    message = str(body.get("message") or "").strip()
    if not message:
        return err(event, "message is required", 400, "VALIDATION_ERROR")
    now = now_iso()
    offer_id = str(uuid.uuid4())
    coupon_code = body.get("couponCode")
    link_url = body.get("linkUrl")
    item = {
        "offerId": offer_id,
        "message": message,
        "couponCode": (str(coupon_code).strip() or None) if coupon_code is not None else None,
        "linkUrl": (str(link_url).strip() or None) if link_url is not None else None,
        "imageUrl": (str(body.get("imageUrl")).strip() or None) if body.get("imageUrl") else None,
        "showBird": bool(body.get("showBird", True)),
        "showFlag": bool(body.get("showFlag", True)),
        "active": bool(body.get("active", True)),
        "startsAt": body.get("startsAt"),
        "endsAt": body.get("endsAt"),
        "priority": as_int(body.get("priority")),
        "createdAt": now,
        "updatedAt": now,
    }
    offers_tbl.put_item(Item=item)
    write_audit(aid, "offer.create", "offer", offer_id, None, offer_public(item), client_ip(event))
    return ok(event, offer_public(item), "Offer created")


def update_offer(event: Dict[str, Any], aid: str, offer_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    offer = offers_tbl.get_item(Key={"offerId": offer_id}).get("Item")
    if not offer:
        return err(event, "Offer not found", 404, "NOT_FOUND")
    fields = ("message", "couponCode", "linkUrl", "imageUrl", "showBird", "showFlag", "active", "startsAt", "endsAt", "priority")
    before = {k: offer.get(k) for k in fields}
    updates = {"updatedAt": now_iso()}
    if "message" in body:
        message = str(body.get("message") or "").strip()
        if not message:
            return err(event, "message is required", 400, "VALIDATION_ERROR")
        updates["message"] = message
    if "couponCode" in body:
        raw = body.get("couponCode")
        updates["couponCode"] = (str(raw).strip() or None) if raw is not None else None
    if "linkUrl" in body:
        raw = body.get("linkUrl")
        updates["linkUrl"] = (str(raw).strip() or None) if raw is not None else None
    if "imageUrl" in body:
        raw = body.get("imageUrl")
        updates["imageUrl"] = (str(raw).strip() or None) if raw is not None else None
    if "showBird" in body and body["showBird"] is not None:
        updates["showBird"] = bool(body["showBird"])
    if "showFlag" in body and body["showFlag"] is not None:
        updates["showFlag"] = bool(body["showFlag"])
    if "active" in body and body["active"] is not None:
        updates["active"] = bool(body["active"])
    if "startsAt" in body:
        updates["startsAt"] = body["startsAt"]
    if "endsAt" in body:
        updates["endsAt"] = body["endsAt"]
    if "priority" in body and body["priority"] is not None:
        updates["priority"] = as_int(body["priority"])
    names = {f"#k{i}": k for i, k in enumerate(updates)}
    vals = {f":v{i}": v for i, v in enumerate(updates.values())}
    offers_tbl.update_item(
        Key={"offerId": offer_id},
        UpdateExpression="SET " + ", ".join(f"{n}={v}" for n, v in zip(names, vals)),
        ExpressionAttributeNames=names, ExpressionAttributeValues=vals,
    )
    offer.update(updates)
    write_audit(aid, "offer.update", "offer", offer_id, before, {k: offer.get(k) for k in fields}, client_ip(event))
    return ok(event, offer_public(offer), "Offer updated")


def delete_offer(event: Dict[str, Any], aid: str, offer_id: str) -> Dict[str, Any]:
    offer = offers_tbl.get_item(Key={"offerId": offer_id}).get("Item")
    if not offer:
        return err(event, "Offer not found", 404, "NOT_FOUND")
    before = offer_public(offer)
    offers_tbl.delete_item(Key={"offerId": offer_id})
    write_audit(aid, "offer.delete", "offer", offer_id, before, {"deleted": True}, client_ip(event))
    return ok(event, {"offerId": offer_id, "deleted": True}, "Offer deleted")


def banner_public(b: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "bannerId": b.get("bannerId"),
        "imageUrl": b.get("imageUrl") or "",
        "linkUrl": b.get("linkUrl"),
        "altText": b.get("altText"),
        "active": bool(b.get("active", True)),
        "priority": as_int(b.get("priority")),
        "createdAt": b.get("createdAt"),
        "updatedAt": b.get("updatedAt"),
    }


def list_banners(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    items = scan_all(banners_tbl)
    items.sort(key=lambda x: (as_int(x.get("priority")), x.get("createdAt") or ""), reverse=True)
    return ok(event, [banner_public(b) for b in items])


def create_banner(event: Dict[str, Any], aid: str, body: Dict[str, Any]) -> Dict[str, Any]:
    image_url = str(body.get("imageUrl") or "").strip()
    if not image_url:
        return err(event, "imageUrl is required", 400, "VALIDATION_ERROR")
    now = now_iso()
    banner_id = str(uuid.uuid4())
    link_url = body.get("linkUrl")
    alt_text = body.get("altText")
    item = {
        "bannerId": banner_id,
        "imageUrl": image_url,
        "linkUrl": (str(link_url).strip() or None) if link_url is not None else None,
        "altText": (str(alt_text).strip() or None) if alt_text is not None else None,
        "active": bool(body.get("active", True)),
        "priority": as_int(body.get("priority")),
        "createdAt": now,
        "updatedAt": now,
    }
    banners_tbl.put_item(Item=item)
    write_audit(aid, "banner.create", "banner", banner_id, None, banner_public(item), client_ip(event))
    return ok(event, banner_public(item), "Banner created")


def update_banner(event: Dict[str, Any], aid: str, banner_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    banner = banners_tbl.get_item(Key={"bannerId": banner_id}).get("Item")
    if not banner:
        return err(event, "Banner not found", 404, "NOT_FOUND")
    fields = ("imageUrl", "linkUrl", "altText", "active", "priority")
    before = {k: banner.get(k) for k in fields}
    updates = {"updatedAt": now_iso()}
    if "imageUrl" in body:
        image_url = str(body.get("imageUrl") or "").strip()
        if not image_url:
            return err(event, "imageUrl is required", 400, "VALIDATION_ERROR")
        updates["imageUrl"] = image_url
    if "linkUrl" in body:
        raw = body.get("linkUrl")
        updates["linkUrl"] = (str(raw).strip() or None) if raw is not None else None
    if "altText" in body:
        raw = body.get("altText")
        updates["altText"] = (str(raw).strip() or None) if raw is not None else None
    if "active" in body and body["active"] is not None:
        updates["active"] = bool(body["active"])
    if "priority" in body and body["priority"] is not None:
        updates["priority"] = as_int(body["priority"])
    names = {f"#{k}": k for k in updates}
    vals = {f":{k}": v for k, v in updates.items()}
    banners_tbl.update_item(
        Key={"bannerId": banner_id},
        UpdateExpression="SET " + ", ".join(f"{n}={v}" for n, v in zip(names, vals)),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=vals,
    )
    banner.update(updates)
    write_audit(aid, "banner.update", "banner", banner_id, before, {k: banner.get(k) for k in fields}, client_ip(event))
    return ok(event, banner_public(banner), "Banner updated")


def delete_banner(event: Dict[str, Any], aid: str, banner_id: str) -> Dict[str, Any]:
    banner = banners_tbl.get_item(Key={"bannerId": banner_id}).get("Item")
    if not banner:
        return err(event, "Banner not found", 404, "NOT_FOUND")
    before = banner_public(banner)
    banners_tbl.delete_item(Key={"bannerId": banner_id})
    write_audit(aid, "banner.delete", "banner", banner_id, before, {"deleted": True}, client_ip(event))
    return ok(event, {"bannerId": banner_id, "deleted": True}, "Banner deleted")


def coupon_public(c: Dict[str, Any]) -> Dict[str, Any]:
    plans = c.get("applicablePlans") or []
    if not isinstance(plans, list):
        plans = []
    return {
        "code": c.get("code"),
        "type": c.get("type"),
        "value": as_int(c.get("value")),
        "applicablePlans": plans,
        "maxRedemptions": c.get("maxRedemptions"),
        "redemptionCount": as_int(c.get("redemptionCount")),
        "perUserLimit": as_int(c.get("perUserLimit"), 1),
        "active": bool(c.get("active", True)),
        "startsAt": c.get("startsAt"),
        "endsAt": c.get("endsAt"),
        "description": c.get("description"),
        "createdAt": c.get("createdAt"),
        "updatedAt": c.get("updatedAt"),
    }


def list_coupons(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    items = scan_all(coupons_tbl)
    items.sort(key=lambda x: (x.get("code") or ""))
    return ok(event, [coupon_public(c) for c in items])


def create_coupon(event: Dict[str, Any], aid: str, body: Dict[str, Any]) -> Dict[str, Any]:
    code = str(body.get("code") or "").strip().upper()
    if len(code) < 2:
        return err(event, "code is required", 400, "VALIDATION_ERROR")
    ctype = body.get("type")
    if ctype not in ("percent", "fixedPaise"):
        return err(event, "type must be percent or fixedPaise", 400, "VALIDATION_ERROR")
    value = as_int(body.get("value"), 0)
    if value < 1:
        return err(event, "value must be a positive integer", 400, "VALIDATION_ERROR")
    existing = coupons_tbl.get_item(Key={"code": code}).get("Item")
    if existing:
        return err(event, "Coupon code already exists", 409, "CODE_EXISTS")
    plans = body.get("applicablePlans")
    if not isinstance(plans, list) or not plans:
        plans = ["pro", "max"]
    plans = [p for p in plans if p in PAID]
    if not plans:
        return err(event, "applicablePlans must include pro and/or max", 400, "VALIDATION_ERROR")
    now = now_iso()
    item = {
        "code": code,
        "type": ctype,
        "value": value,
        "applicablePlans": plans,
        "maxRedemptions": body.get("maxRedemptions"),
        "redemptionCount": 0,
        "perUserLimit": max(1, as_int(body.get("perUserLimit"), 1)),
        "active": bool(body.get("active", True)),
        "startsAt": body.get("startsAt"),
        "endsAt": body.get("endsAt"),
        "description": body.get("description"),
        "createdAt": now,
        "updatedAt": now,
    }
    coupons_tbl.put_item(Item=item)
    write_audit(aid, "coupon.create", "coupon", code, None, coupon_public(item), client_ip(event))
    return ok(event, coupon_public(item), "Coupon created")


def update_coupon(event: Dict[str, Any], aid: str, code: str, body: Dict[str, Any]) -> Dict[str, Any]:
    code = str(code or "").strip().upper()
    coupon = coupons_tbl.get_item(Key={"code": code}).get("Item")
    if not coupon:
        return err(event, "Coupon not found", 404, "NOT_FOUND")
    fields = ("type", "value", "applicablePlans", "maxRedemptions", "perUserLimit", "active", "startsAt", "endsAt", "description")
    before = {k: coupon.get(k) for k in fields}
    updates = {"updatedAt": now_iso()}
    if "type" in body and body["type"] is not None:
        if body["type"] not in ("percent", "fixedPaise"):
            return err(event, "type must be percent or fixedPaise", 400, "VALIDATION_ERROR")
        updates["type"] = body["type"]
    if "value" in body and body["value"] is not None:
        value = as_int(body["value"], 0)
        if value < 1:
            return err(event, "value must be a positive integer", 400, "VALIDATION_ERROR")
        updates["value"] = value
    if "applicablePlans" in body and body["applicablePlans"] is not None:
        plans = body["applicablePlans"]
        if not isinstance(plans, list):
            return err(event, "applicablePlans must be a list", 400, "VALIDATION_ERROR")
        plans = [p for p in plans if p in PAID]
        if not plans:
            return err(event, "applicablePlans must include pro and/or max", 400, "VALIDATION_ERROR")
        updates["applicablePlans"] = plans
    if "maxRedemptions" in body:
        updates["maxRedemptions"] = body["maxRedemptions"]
    if "perUserLimit" in body and body["perUserLimit"] is not None:
        updates["perUserLimit"] = max(1, as_int(body["perUserLimit"], 1))
    if "active" in body and body["active"] is not None:
        updates["active"] = bool(body["active"])
    if "startsAt" in body:
        updates["startsAt"] = body["startsAt"]
    if "endsAt" in body:
        updates["endsAt"] = body["endsAt"]
    if "description" in body:
        updates["description"] = body["description"]
    names = {f"#k{i}": k for i, k in enumerate(updates)}
    vals = {f":v{i}": v for i, v in enumerate(updates.values())}
    coupons_tbl.update_item(
        Key={"code": code},
        UpdateExpression="SET " + ", ".join(f"{n}={v}" for n, v in zip(names, vals)),
        ExpressionAttributeNames=names, ExpressionAttributeValues=vals,
    )
    coupon.update(updates)
    write_audit(aid, "coupon.update", "coupon", code, before, {k: coupon.get(k) for k in fields}, client_ip(event))
    return ok(event, coupon_public(coupon), "Coupon updated")


def delete_coupon(event: Dict[str, Any], aid: str, code: str) -> Dict[str, Any]:
    code = str(code or "").strip().upper()
    coupon = coupons_tbl.get_item(Key={"code": code}).get("Item")
    if not coupon:
        return err(event, "Coupon not found", 404, "NOT_FOUND")
    before = coupon_public(coupon)
    coupons_tbl.delete_item(Key={"code": code})
    write_audit(aid, "coupon.delete", "coupon", code, before, {"deleted": True}, client_ip(event))
    return ok(event, {"code": code, "deleted": True}, "Coupon deleted")


def list_audit(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    q = qs(event)
    page, limit = page_limit(q, 40)
    try:
        items, start = [], None
        while True:
            kw: Dict[str, Any] = {
                "IndexName": "CreatedAtIndex",
                "KeyConditionExpression": Key("entityType").eq("admin"),
                "ScanIndexForward": False,
            }
            if start:
                kw["ExclusiveStartKey"] = start
            res = audit_tbl.query(**kw)
            items.extend(res.get("Items") or [])
            start = res.get("LastEvaluatedKey")
            if not start:
                break
    except Exception:
        items = sorted(scan_all(audit_tbl), key=lambda x: x.get("createdAt") or "", reverse=True)
    data = paginate(items, page, limit)
    m = umap([a.get("adminId") for a in data["items"]])
    data["items"] = [{
        "id": a.get("auditId"), "action": a.get("action"), "targetType": a.get("targetType"),
        "targetId": a.get("targetId"), "before": a.get("before"), "after": a.get("after"),
        "ip": a.get("ip"), "adminName": uinfo(m, a.get("adminId"))[0], "adminEmail": uinfo(m, a.get("adminId"))[1],
        "createdAt": a.get("createdAt"),
    } for a in data["items"]]
    return ok(event, data)


def list_uninstall_feedback(event: Dict[str, Any], _aid: str) -> Dict[str, Any]:
    q = qs(event)
    page, limit = page_limit(q, 40)
    reason = (q.get("reason") or "").strip()
    try:
        items, start = [], None
        while True:
            kw: Dict[str, Any] = {
                "IndexName": "CreatedAtIndex",
                "KeyConditionExpression": Key("entityType").eq("uninstall"),
                "ScanIndexForward": False,
            }
            if start:
                kw["ExclusiveStartKey"] = start
            res = feedback_tbl.query(**kw)
            items.extend(res.get("Items") or [])
            start = res.get("LastEvaluatedKey")
            if not start:
                break
    except Exception:
        items = sorted(
            [i for i in scan_all(feedback_tbl) if (i.get("entityType") or "uninstall") == "uninstall"],
            key=lambda x: x.get("createdAt") or "",
            reverse=True,
        )
    if reason:
        items = [i for i in items if i.get("reason") == reason]
    data = paginate(items, page, limit)
    data["items"] = [{
        "id": a.get("feedbackId"),
        "reason": a.get("reason"),
        "comment": a.get("comment") or "",
        "email": a.get("email") or "",
        "extensionVersion": a.get("extensionVersion") or "",
        "browser": a.get("browser") or "",
        "source": a.get("source") or "",
        "ip": a.get("ip") or "",
        "createdAt": a.get("createdAt"),
    } for a in data["items"]]
    return ok(event, data)


# ─── Routing ───────────────────────────────────────────────────

_RE_USER = re.compile(r"/admin/users/([^/]+)(?:/(plan|suspend|unsuspend|impersonate))?$")
_RE_SUB = re.compile(r"/admin/subscriptions/([^/]+)/(cancel|extend)$")
_RE_PAY = re.compile(r"/admin/payments/([^/]+)(?:/(reconcile|invoice))?$")
_RE_PLAN = re.compile(r"/admin/plans/([^/]+)$")
_RE_OFFER = re.compile(r"/admin/offers/([^/]+)$")
_RE_BANNER = re.compile(r"/admin/banners/([^/]+)$")
_RE_COUPON = re.compile(r"/admin/coupons/([^/]+)$")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    if http_method(event) == "OPTIONS":
        return ok(event, {})
    try:
        body = parse_body(event)
    except Exception:
        return err(event, "Invalid JSON body", 400, "VALIDATION_ERROR")

    q = qs(event)
    for k, v in q.items():
        body.setdefault(k, v)
    method, path = http_method(event), path_of(event)
    action = (body.get("action") or event.get("action") or "").strip()
    uid = body.get("id") or body.get("userId") or ""
    sid = body.get("id") or body.get("subscriptionId") or ""
    pid = body.get("id") or body.get("paymentId") or ""

    payload, auth_err = require_admin(event)
    if auth_err:
        return auth_err
    admin_id = payload["sub"]  # type: ignore[index]

    actions = {
        "metrics": get_metrics,
        "listUsers": list_users,
        "listSubscriptions": list_subscriptions,
        "listPayments": list_payments,
        "listPlans": list_plans,
        "listAudit": list_audit,
        "listUninstallFeedback": list_uninstall_feedback,
        "listOffers": list_offers,
        "listBanners": list_banners,
        "listCoupons": list_coupons,
    }
    if action in actions:
        return actions[action](event, admin_id)
    if action == "getUser":
        return get_user_detail(event, admin_id, uid)
    if action == "patchUser":
        return patch_user(event, admin_id, uid, body)
    if action == "deleteUser":
        return delete_user(event, admin_id, uid)
    if action == "setUserPlan":
        return set_user_plan(event, admin_id, uid, body)
    if action == "suspendUser":
        return patch_user(event, admin_id, uid, {"status": "suspended"}, "User suspended")
    if action == "unsuspendUser":
        return patch_user(event, admin_id, uid, {"status": "active"}, "User unsuspended")
    if action == "impersonateUser":
        return impersonate_user(event, admin_id, uid)
    if action == "cancelSubscription":
        imm = str(body.get("immediate", "")).lower() in ("1", "true", "yes")
        return cancel_subscription(event, admin_id, sid, imm)
    if action == "extendSubscription":
        return extend_subscription(event, admin_id, sid, body)
    if action == "reconcilePayment":
        return reconcile_payment(event, admin_id, pid)
    if action == "paymentInvoice":
        return payment_invoice(event, admin_id, pid)
    if action == "updatePlan":
        return update_plan(event, admin_id, body.get("tier") or "", body)
    if action == "createOffer":
        return create_offer(event, admin_id, body)
    if action == "updateOffer":
        return update_offer(event, admin_id, body.get("offerId") or body.get("id") or "", body)
    if action == "deleteOffer":
        return delete_offer(event, admin_id, body.get("offerId") or body.get("id") or "")
    if action == "createBanner":
        return create_banner(event, admin_id, body)
    if action == "updateBanner":
        return update_banner(event, admin_id, body.get("bannerId") or body.get("id") or "", body)
    if action == "deleteBanner":
        return delete_banner(event, admin_id, body.get("bannerId") or body.get("id") or "")
    if action == "createCoupon":
        return create_coupon(event, admin_id, body)
    if action == "updateCoupon":
        return update_coupon(event, admin_id, body.get("code") or body.get("id") or "", body)
    if action == "deleteCoupon":
        return delete_coupon(event, admin_id, body.get("code") or body.get("id") or "")

    rest = {
        ("/admin/metrics", "GET"): get_metrics,
        ("/admin/users", "GET"): list_users,
        ("/admin/subscriptions", "GET"): list_subscriptions,
        ("/admin/payments", "GET"): list_payments,
        ("/admin/plans", "GET"): list_plans,
        ("/admin/audit", "GET"): list_audit,
        ("/admin/feedback/uninstall", "GET"): list_uninstall_feedback,
        ("/admin/offers", "GET"): list_offers,
        ("/admin/offers", "POST"): create_offer,
        ("/admin/banners", "GET"): list_banners,
        ("/admin/banners", "POST"): create_banner,
        ("/admin/coupons", "GET"): list_coupons,
        ("/admin/coupons", "POST"): create_coupon,
    }
    for suffix, mth in list(rest.keys()):
        if path.endswith(suffix) and method == mth:
            handler = rest[(suffix, mth)]
            if mth == "POST" and suffix in ("/admin/offers", "/admin/banners", "/admin/coupons"):
                return handler(event, admin_id, body)
            return handler(event, admin_id)

    m = _RE_USER.search(path)
    if m:
        u, sub = m.group(1), m.group(2)
        if not sub and method == "GET":
            return get_user_detail(event, admin_id, u)
        if not sub and method == "PATCH":
            return patch_user(event, admin_id, u, body)
        if not sub and method == "DELETE":
            return delete_user(event, admin_id, u)
        if sub == "plan" and method == "POST":
            return set_user_plan(event, admin_id, u, body)
        if sub == "suspend" and method == "POST":
            return patch_user(event, admin_id, u, {"status": "suspended"}, "User suspended")
        if sub == "unsuspend" and method == "POST":
            return patch_user(event, admin_id, u, {"status": "active"}, "User unsuspended")
        if sub == "impersonate" and method == "POST":
            return impersonate_user(event, admin_id, u)

    m = _RE_SUB.search(path)
    if m and method == "POST":
        s, op = m.group(1), m.group(2)
        if op == "cancel":
            imm = str(q.get("immediate") or body.get("immediate") or "") in ("1", "true")
            return cancel_subscription(event, admin_id, s, imm)
        if op == "extend":
            return extend_subscription(event, admin_id, s, body)

    m = _RE_PAY.search(path)
    if m:
        p, op = m.group(1), m.group(2)
        if op == "reconcile" and method == "POST":
            return reconcile_payment(event, admin_id, p)
        if op == "invoice" and method == "GET":
            return payment_invoice(event, admin_id, p)

    m = _RE_PLAN.search(path)
    if m and method == "PATCH":
        return update_plan(event, admin_id, m.group(1), body)

    m = _RE_OFFER.search(path)
    if m:
        oid = m.group(1)
        if method == "GET":
            offer = offers_tbl.get_item(Key={"offerId": oid}).get("Item")
            if not offer:
                return err(event, "Offer not found", 404, "NOT_FOUND")
            return ok(event, offer_public(offer))
        if method == "PATCH":
            return update_offer(event, admin_id, oid, body)
        if method == "DELETE":
            return delete_offer(event, admin_id, oid)

    m = _RE_BANNER.search(path)
    if m:
        bid = m.group(1)
        if method == "GET":
            banner = banners_tbl.get_item(Key={"bannerId": bid}).get("Item")
            if not banner:
                return err(event, "Banner not found", 404, "NOT_FOUND")
            return ok(event, banner_public(banner))
        if method == "PATCH":
            return update_banner(event, admin_id, bid, body)
        if method == "DELETE":
            return delete_banner(event, admin_id, bid)

    m = _RE_COUPON.search(path)
    if m:
        code = m.group(1)
        if method == "GET":
            coupon = coupons_tbl.get_item(Key={"code": str(code).strip().upper()}).get("Item")
            if not coupon:
                return err(event, "Coupon not found", 404, "NOT_FOUND")
            return ok(event, coupon_public(coupon))
        if method == "PATCH":
            return update_coupon(event, admin_id, code, body)
        if method == "DELETE":
            return delete_coupon(event, admin_id, code)

    return err(event, f"Unknown route: {method} {path}", 404, "NOT_FOUND")
