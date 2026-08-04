"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-billing
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoUsers           PK=email  GSI UserIdIndex (userId)
  CosmoPayments         PK=paymentId
    GSI UserPaymentsIndex   PK=userId SK=createdAt
    GSI InvoiceNumberIndex  PK=invoiceNumber
  CosmoSubscriptions    PK=subscriptionId
    GSI UserSubsIndex       PK=userId SK=createdAt
    GSI RazorpaySubIndex    PK=razorpaySubscriptionId
  CosmoPlanConfigs      PK=tier
  CosmoApplyCounters    PK=userId  SK=periodKey
  CosmoApplications     PK=userId  SK=eventId  (optional usage fallback)
    GSI UserCreatedIndex    PK=userId SK=createdAt

S3: INVOICES_BUCKET (default cosmo-invoices)
"""

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import boto3
from boto3.dynamodb.conditions import Attr, Key

USERS_TABLE = os.environ.get("USERS_TABLE", "CosmoUsers")
PAYMENTS_TABLE = os.environ.get("PAYMENTS_TABLE", "CosmoPayments")
SUBSCRIPTIONS_TABLE = os.environ.get("SUBSCRIPTIONS_TABLE", "CosmoSubscriptions")
PLAN_CONFIGS_TABLE = os.environ.get("PLAN_CONFIGS_TABLE", "CosmoPlanConfigs")
APPLY_COUNTERS_TABLE = os.environ.get("APPLY_COUNTERS_TABLE", "CosmoApplyCounters")
APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "CosmoApplications")
INVOICES_BUCKET = os.environ.get("INVOICES_BUCKET", "cosmo-invoices")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

# From shared/src/models.ts PLAN_PRICES_PAISE
PLAN_PRICES_PAISE = {"pro": 9900, "max": 29900}
PLAN_DISPLAY_NAMES = {"free": "Basic", "pro": "Premium", "max": "UltraMag"}
PLAN_LIMITS = {
    "free": {
        "monthlyApplies": 50,
        "monthlyScans": 500,
        "appliesPerHour": 6,
        "appliesPerDay": 15,
    },
    "pro": {
        "monthlyApplies": 300,
        "monthlyScans": 1500,
        "appliesPerHour": 12,
        "appliesPerDay": 40,
    },
    "max": {
        "monthlyApplies": 1000,
        "monthlyScans": 5000,
        "appliesPerHour": 18,
        "appliesPerDay": 60,
    },
}
DEFAULT_DESCRIPTIONS = {
    "free": "Starter access with limited automated applies",
    "pro": "Higher apply volume for active job seekers",
    "max": "Highest monthly volume and scan capacity",
}
SUBSCRIPTION_TOTAL_COUNT = 120
ACTIVE_SUB_STATUSES = frozenset(
    {"created", "authenticated", "active", "pending", "halted"}
)
IST = ZoneInfo("Asia/Kolkata")
RAZORPAY_API = "https://api.razorpay.com/v1"

dynamodb = boto3.resource("dynamodb")
_S3_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-2"
s3 = boto3.client(
    "s3",
    region_name=_S3_REGION,
    endpoint_url=f"https://s3.{_S3_REGION}.amazonaws.com",
)
users_tbl = dynamodb.Table(USERS_TABLE)
payments_tbl = dynamodb.Table(PAYMENTS_TABLE)
subs_tbl = dynamodb.Table(SUBSCRIPTIONS_TABLE)
plans_tbl = dynamodb.Table(PLAN_CONFIGS_TABLE)
counters_tbl = dynamodb.Table(APPLY_COUNTERS_TABLE)
apps_tbl = dynamodb.Table(APPLICATIONS_TABLE)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Razorpay-Signature",
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


def created(event: Dict[str, Any], data: Any, message: str) -> Dict[str, Any]:
    return response(
        event, 201, {"success": True, "message": message, "data": data, "error": None}
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


def raw_body_bytes(event: Dict[str, Any]) -> bytes:
    body = event.get("body")
    if body is None:
        return b""
    if event.get("isBase64Encoded") and isinstance(body, str):
        return base64.b64decode(body)
    if isinstance(body, bytes):
        return body
    if isinstance(body, str):
        return body.encode("utf-8")
    return json.dumps(body).encode("utf-8")


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


def header(event: Dict[str, Any], name: str) -> str:
    headers = event.get("headers") or {}
    for k, v in headers.items():
        if k.lower() == name.lower():
            return v or ""
    return ""


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
    auth = header(event, "authorization")
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


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ─── Users ─────────────────────────────────────────────────────


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    res = users_tbl.query(
        IndexName="UserIdIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        Limit=1,
    )
    items = res.get("Items") or []
    return items[0] if items else None


def update_user_fields(email: str, updates: Dict[str, Any]) -> None:
    names: Dict[str, str] = {}
    values: Dict[str, Any] = {":u": now_iso()}
    parts = ["updatedAt = :u"]
    for i, (k, v) in enumerate(updates.items()):
        nk = f"#k{i}"
        vk = f":v{i}"
        names[nk] = k
        values[vk] = v
        parts.append(f"{nk} = {vk}")
    kwargs: Dict[str, Any] = {
        "Key": {"email": email},
        "UpdateExpression": "SET " + ", ".join(parts),
        "ExpressionAttributeValues": values,
    }
    if names:
        kwargs["ExpressionAttributeNames"] = names
    users_tbl.update_item(**kwargs)


def remove_user_fields(email: str, fields: List[str]) -> None:
    names = {f"#f{i}": f for i, f in enumerate(fields)}
    users_tbl.update_item(
        Key={"email": email},
        UpdateExpression="REMOVE " + ", ".join(names.keys()) + " SET updatedAt = :u",
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={":u": now_iso()},
    )


# ─── Plan helpers ──────────────────────────────────────────────


def get_effective_plan(
    plan: Optional[str], plan_expires_at: Optional[str], now: Optional[datetime] = None
) -> str:
    now = now or datetime.now(timezone.utc)
    tier = plan or "free"
    if tier == "free":
        return "free"
    exp = parse_iso(plan_expires_at)
    if not exp or exp.timestamp() <= now.timestamp():
        return "free"
    return tier


def get_ist_month_bounds(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(IST)
    period_start = datetime(local.year, local.month, 1, tzinfo=IST)
    if local.month == 12:
        period_end = datetime(local.year + 1, 1, 1, tzinfo=IST)
    else:
        period_end = datetime(local.year, local.month + 1, 1, tzinfo=IST)
    return period_start, period_end


def get_ist_day_bounds(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(IST)
    day_start = datetime(local.year, local.month, local.day, tzinfo=IST)
    day_end = day_start + timedelta(days=1)
    return day_start, day_end


def period_keys(now: Optional[datetime] = None) -> Dict[str, str]:
    """Must match cosmo-events CosmoApplyCounters periodKey format."""
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(IST)
    return {
        "hour": f"hour#{local.strftime('%Y-%m-%d')}T{local.strftime('%H')}",
        "day": f"day#{local.strftime('%Y-%m-%d')}",
        "month": f"month#{local.strftime('%Y-%m')}",
    }


def seed_plan_configs() -> List[Dict[str, Any]]:
    seeded = []
    for tier in ("free", "pro", "max"):
        existing = plans_tbl.get_item(Key={"tier": tier}).get("Item")
        if existing:
            seeded.append(existing)
            continue
        item = {
            "tier": tier,
            "name": PLAN_DISPLAY_NAMES[tier],
            "description": DEFAULT_DESCRIPTIONS[tier],
            "amountPaise": 0 if tier == "free" else PLAN_PRICES_PAISE[tier],
            "limits": dict(PLAN_LIMITS[tier]),
            "razorpayPlanId": None,
            "active": True,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        plans_tbl.put_item(Item=item)
        seeded.append(item)
    return seeded


def get_plan_config(tier: str) -> Dict[str, Any]:
    item = plans_tbl.get_item(Key={"tier": tier}).get("Item")
    if item:
        return item
    seed_plan_configs()
    item = plans_tbl.get_item(Key={"tier": tier}).get("Item")
    if item:
        return item
    return {
        "tier": tier,
        "name": PLAN_DISPLAY_NAMES.get(tier, tier),
        "description": DEFAULT_DESCRIPTIONS.get(tier, ""),
        "amountPaise": 0 if tier == "free" else PLAN_PRICES_PAISE.get(tier, 0),
        "limits": dict(PLAN_LIMITS.get(tier, PLAN_LIMITS["free"])),
        "razorpayPlanId": None,
        "active": True,
    }


def get_paid_plan_amount(plan: str) -> int:
    cfg = get_plan_config(plan)
    return _as_int(cfg.get("amountPaise"), PLAN_PRICES_PAISE.get(plan, 0))


# ─── Razorpay HTTP ─────────────────────────────────────────────


def razorpay_configured() -> bool:
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)


def razorpay_request(
    method: str, path: str, payload: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    if not razorpay_configured():
        raise RuntimeError("RAZORPAY_NOT_CONFIGURED")
    url = f"{RAZORPAY_API}{path}"
    data = None
    headers = {
        "Authorization": "Basic "
        + base64.b64encode(
            f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode()
        ).decode(),
        "Content-Type": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8"))
        except Exception:
            detail = {"error": {"description": str(exc)}}
        description = (
            (detail.get("error") or {}).get("description")
            or (detail.get("error") or {}).get("code")
            or str(exc)
        )
        err_obj = RuntimeError(description)
        err_obj.status_code = exc.code  # type: ignore[attr-defined]
        err_obj.razorpay = detail  # type: ignore[attr-defined]
        raise err_obj from exc


def verify_hmac_hex(message: str, signature: str, secret: str) -> bool:
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    try:
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


def verify_order_signature(order_id: str, payment_id: str, signature: str) -> bool:
    return verify_hmac_hex(
        f"{order_id}|{payment_id}", signature, RAZORPAY_KEY_SECRET
    )


def verify_subscription_signature(
    payment_id: str, subscription_id: str, signature: str
) -> bool:
    return verify_hmac_hex(
        f"{payment_id}|{subscription_id}", signature, RAZORPAY_KEY_SECRET
    )


def verify_webhook_signature(raw: bytes, signature: str) -> bool:
    if not RAZORPAY_WEBHOOK_SECRET or not signature:
        return False
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256
    ).hexdigest()
    try:
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


# ─── Payments / invoices ───────────────────────────────────────


def next_invoice_number() -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"COSMO-{year}-"
    # Best-effort: scan recent invoices for max sequence (small tables)
    seq = 1
    try:
        res = payments_tbl.scan(
            FilterExpression=Attr("invoiceNumber").begins_with(prefix),
            ProjectionExpression="invoiceNumber",
        )
        for item in res.get("Items") or []:
            num = item.get("invoiceNumber") or ""
            part = num.split("-")[-1]
            if part.isdigit():
                seq = max(seq, int(part) + 1)
    except Exception:
        pass
    return f"{prefix}{seq:04d}"


def invoice_text(payload: Dict[str, Any]) -> bytes:
    lines = [
        "COSMO TAX INVOICE",
        f"Invoice: {payload.get('invoiceNumber')}",
        f"Customer: {payload.get('customerName')} <{payload.get('customerEmail')}>",
        f"Plan: {payload.get('plan')}",
        f"Amount: {(_as_int(payload.get('amountPaise')) / 100):.2f} {payload.get('currency', 'INR')}",
        f"Period: {payload.get('periodStart')} – {payload.get('periodEnd')}",
        f"Paid at: {payload.get('paidAt')}",
        f"Order/Sub: {payload.get('razorpayOrderId')}",
        f"Payment: {payload.get('razorpayPaymentId')}",
        "Status: PAID",
        "This is a computer-generated receipt from cosmovai.",
    ]
    return ("\n".join(lines) + "\n").encode("utf-8")


def upload_invoice(invoice_number: str, payload: Dict[str, Any]) -> str:
    key = f"invoices/{invoice_number}.txt"
    s3.put_object(
        Bucket=INVOICES_BUCKET,
        Key=key,
        Body=invoice_text(payload),
        ContentType="text/plain; charset=utf-8",
    )
    return key


def presign_invoice(key: str, expires: int = 3600) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": INVOICES_BUCKET, "Key": key},
        ExpiresIn=expires,
    )


def find_payment_by_order_id(order_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    # paymentId is set to razorpay order id for legacy orders
    item = payments_tbl.get_item(Key={"paymentId": order_id}).get("Item")
    if item and item.get("userId") == user_id:
        return item
    res = payments_tbl.query(
        IndexName="UserPaymentsIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=50,
    )
    for p in res.get("Items") or []:
        if p.get("razorpayOrderId") == order_id:
            return p
    return None


def find_payment_by_razorpay_payment_id(payment_id: str) -> Optional[Dict[str, Any]]:
    item = payments_tbl.get_item(Key={"paymentId": payment_id}).get("Item")
    if item and item.get("razorpayPaymentId") == payment_id:
        return item
    # Fallback scan (small scale)
    try:
        res = payments_tbl.scan(
            FilterExpression=Attr("razorpayPaymentId").eq(payment_id),
            Limit=5,
        )
        items = res.get("Items") or []
        return items[0] if items else None
    except Exception:
        return None


def put_payment(item: Dict[str, Any]) -> Dict[str, Any]:
    payments_tbl.put_item(Item=item)
    return item


# ─── Subscriptions ─────────────────────────────────────────────


def find_sub_by_razorpay_id(razorpay_sub_id: str) -> Optional[Dict[str, Any]]:
    res = subs_tbl.query(
        IndexName="RazorpaySubIndex",
        KeyConditionExpression=Key("razorpaySubscriptionId").eq(razorpay_sub_id),
        Limit=1,
    )
    items = res.get("Items") or []
    return items[0] if items else None


def find_active_sub(user_id: str) -> Optional[Dict[str, Any]]:
    res = subs_tbl.query(
        IndexName="UserSubsIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=25,
    )
    for item in res.get("Items") or []:
        if item.get("status") in ACTIVE_SUB_STATUSES:
            return item
    return None


def list_user_payments(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    res = payments_tbl.query(
        IndexName="UserPaymentsIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=limit * 2,
    )
    paid = [p for p in (res.get("Items") or []) if p.get("status") == "paid"]
    return paid[:limit]


def apply_entitlement(
    user: Dict[str, Any],
    plan: str,
    period_end: datetime,
    subscription_id: Optional[str] = None,
) -> None:
    updates: Dict[str, Any] = {
        "plan": plan,
        "planExpiresAt": period_end.isoformat(),
    }
    if subscription_id:
        updates["activeSubscriptionId"] = subscription_id
    update_user_fields(user["email"], updates)


def period_from_unix(
    start: Optional[int], end: Optional[int]
) -> Tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    period_start = datetime.fromtimestamp(start, tz=timezone.utc) if start else now
    period_end = (
        datetime.fromtimestamp(end, tz=timezone.utc)
        if end
        else period_start + timedelta(days=30)
    )
    return period_start, period_end


def ensure_razorpay_customer(user: Dict[str, Any]) -> str:
    existing = user.get("razorpayCustomerId")
    if existing:
        try:
            razorpay_request("GET", f"/customers/{existing}")
            return existing
        except Exception:
            pass
    customer = razorpay_request(
        "POST",
        "/customers",
        {
            "name": user.get("name") or "Cosmo user",
            "email": user.get("email"),
            "fail_existing": 0,
            "notes": {"userId": user.get("userId")},
        },
    )
    cid = customer["id"]
    update_user_fields(user["email"], {"razorpayCustomerId": cid})
    user["razorpayCustomerId"] = cid
    return cid


def ensure_razorpay_plan_id(plan: str) -> str:
    cfg = get_plan_config(plan)
    existing = cfg.get("razorpayPlanId")
    if existing:
        try:
            razorpay_request("GET", f"/plans/{existing}")
            return existing
        except Exception:
            pass
    amount = _as_int(cfg.get("amountPaise")) or PLAN_PRICES_PAISE.get(plan, 0)
    if amount <= 0:
        raise RuntimeError("PLAN_AMOUNT_INVALID")
    created_plan = razorpay_request(
        "POST",
        "/plans",
        {
            "period": "monthly",
            "interval": 1,
            "item": {
                "name": f"Cosmo {cfg.get('name')}",
                "amount": amount,
                "currency": "INR",
                "description": cfg.get("description")
                or f"{cfg.get('name')} monthly",
            },
            "notes": {"tier": plan},
        },
    )
    plans_tbl.update_item(
        Key={"tier": plan},
        UpdateExpression="SET razorpayPlanId = :p, updatedAt = :u",
        ExpressionAttributeValues={":p": created_plan["id"], ":u": now_iso()},
    )
    return created_plan["id"]


# ─── Apply usage ───────────────────────────────────────────────


def counter_count(user_id: str, period_key: str) -> Optional[int]:
    try:
        item = counters_tbl.get_item(
            Key={"userId": user_id, "periodKey": period_key}
        ).get("Item")
        if item is None:
            return None
        return _as_int(item.get("count"))
    except Exception:
        return None


def count_apps_in_range(user_id: str, start: datetime, end: datetime) -> int:
    try:
        kwargs: Dict[str, Any] = {
            "IndexName": "UserCreatedIndex",
            "KeyConditionExpression": Key("userId").eq(user_id)
            & Key("createdAt").between(start.isoformat(), end.isoformat()),
        }
        total = 0
        while True:
            res = apps_tbl.query(**kwargs)
            for item in res.get("Items") or []:
                created = item.get("createdAt") or ""
                if created >= end.isoformat():
                    continue
                meta = item.get("metadata") or {}
                if meta.get("skipped") is True:
                    continue
                if item.get("status") == "applied" or meta.get("source") == "auto_apply":
                    total += 1
            lek = res.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return total
    except Exception:
        return 0


def get_apply_usage(user_id: str) -> Dict[str, int]:
    now = datetime.now(timezone.utc)
    keys = period_keys(now)
    hour_c = counter_count(user_id, keys["hour"])
    day_c = counter_count(user_id, keys["day"])
    month_c = counter_count(user_id, keys["month"])

    hour_from = now - timedelta(hours=1)
    day_start, day_end = get_ist_day_bounds(now)
    month_start, month_end = get_ist_month_bounds(now)

    return {
        "hour": hour_c if hour_c is not None else count_apps_in_range(user_id, hour_from, now),
        "day": day_c if day_c is not None else count_apps_in_range(user_id, day_start, day_end),
        "month": month_c
        if month_c is not None
        else count_apps_in_range(user_id, month_start, month_end),
    }


# ─── Route handlers ────────────────────────────────────────────


def create_order(event: Dict[str, Any], user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    if not razorpay_configured():
        return err(event, "Razorpay is not configured", 503, "RAZORPAY_NOT_CONFIGURED")
    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    plan = (body.get("plan") or "").strip()
    if plan not in ("pro", "max"):
        return err(event, "plan must be pro or max", 400, "VALIDATION_ERROR")

    amount_paise = get_paid_plan_amount(plan)
    receipt = f"cosmo_{plan}_{int(time.time())}"[:40]
    try:
        order = razorpay_request(
            "POST",
            "/orders",
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": {"userId": user_id, "plan": plan},
            },
        )
    except RuntimeError as exc:
        return err(event, str(exc), 502, "RAZORPAY_ERROR")

    created_at = now_iso()
    put_payment(
        {
            "paymentId": order["id"],
            "userId": user_id,
            "plan": plan,
            "amountPaise": amount_paise,
            "currency": "INR",
            "type": "order",
            "razorpayOrderId": order["id"],
            "status": "created",
            "createdAt": created_at,
            "updatedAt": created_at,
        }
    )
    return created(
        event,
        {
            "orderId": order["id"],
            "amount": amount_paise,
            "currency": "INR",
            "keyId": RAZORPAY_KEY_ID,
            "plan": plan,
        },
        "Order created",
    )


def verify_payment(event: Dict[str, Any], user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    order_id = body.get("razorpay_order_id") or ""
    payment_id = body.get("razorpay_payment_id") or ""
    signature = body.get("razorpay_signature") or ""
    plan = body.get("plan") or ""
    if not order_id or not payment_id or not signature or plan not in ("pro", "max"):
        return err(event, "Invalid verify payload", 400, "VALIDATION_ERROR")

    payment = find_payment_by_order_id(order_id, user_id)
    if not payment:
        return err(event, "Order not found", 404, "ORDER_NOT_FOUND")
    if payment.get("plan") != plan:
        return err(event, "Plan mismatch", 400, "PLAN_MISMATCH")

    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")

    if payment.get("status") == "paid" and payment.get("invoiceNumber"):
        period_end = user.get("planExpiresAt") or (
            datetime.now(timezone.utc) + timedelta(days=30)
        ).isoformat()
        return ok(
            event,
            {
                "paymentId": payment["paymentId"],
                "plan": payment["plan"],
                "planExpiresAt": period_end,
                "invoiceUrl": f"/api/v1/billing/invoices/{payment['paymentId']}",
                "invoiceNumber": payment.get("invoiceNumber"),
            },
            "Payment verified",
        )

    if not verify_order_signature(order_id, payment_id, signature):
        payment["status"] = "failed"
        payment["updatedAt"] = now_iso()
        put_payment(payment)
        return err(event, "Invalid payment signature", 400, "SIGNATURE_INVALID")

    paid_at = datetime.now(timezone.utc)
    period_end = paid_at + timedelta(days=30)
    invoice_number = payment.get("invoiceNumber") or next_invoice_number()
    invoice_key = upload_invoice(
        invoice_number,
        {
            "invoiceNumber": invoice_number,
            "customerName": user.get("name"),
            "customerEmail": user.get("email"),
            "plan": plan,
            "amountPaise": payment.get("amountPaise"),
            "currency": payment.get("currency", "INR"),
            "periodStart": paid_at.isoformat(),
            "periodEnd": period_end.isoformat(),
            "razorpayOrderId": order_id,
            "razorpayPaymentId": payment_id,
            "paidAt": paid_at.isoformat(),
        },
    )

    payment.update(
        {
            "status": "paid",
            "razorpayPaymentId": payment_id,
            "razorpaySignature": signature,
            "invoiceNumber": invoice_number,
            "invoicePath": invoice_key,
            "updatedAt": now_iso(),
        }
    )
    put_payment(payment)

    sub_id = str(uuid.uuid4())
    created_at = now_iso()
    subs_tbl.put_item(
        Item={
            "subscriptionId": sub_id,
            "userId": user_id,
            "tier": plan,
            "status": "active",
            "currentPeriodStart": paid_at.isoformat(),
            "currentPeriodEnd": period_end.isoformat(),
            "cancelAtPeriodEnd": True,
            "source": "legacy",
            "createdAt": created_at,
            "updatedAt": created_at,
        }
    )
    apply_entitlement(user, plan, period_end, sub_id)

    return ok(
        event,
        {
            "paymentId": payment["paymentId"],
            "plan": plan,
            "planExpiresAt": period_end.isoformat(),
            "invoiceUrl": f"/api/v1/billing/invoices/{payment['paymentId']}",
            "invoiceNumber": invoice_number,
        },
        "Payment verified",
    )


def create_subscription(
    event: Dict[str, Any], user_id: str, body: Dict[str, Any]
) -> Dict[str, Any]:
    if not razorpay_configured():
        return err(event, "Razorpay is not configured", 503, "RAZORPAY_NOT_CONFIGURED")
    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")
    if (user.get("status") or "active") == "suspended":
        return err(event, "Account suspended", 403, "ACCOUNT_SUSPENDED")

    plan = (body.get("plan") or "").strip()
    if plan not in ("pro", "max"):
        return err(event, "plan must be pro or max", 400, "VALIDATION_ERROR")

    plan_cfg = get_plan_config(plan)
    if plan_cfg.get("active") is False:
        return err(event, "Plan is not available", 400, "PLAN_INACTIVE")

    try:
        customer_id = ensure_razorpay_customer(user)
        razorpay_plan_id = ensure_razorpay_plan_id(plan)
    except RuntimeError as exc:
        code = str(exc)
        if code == "RAZORPAY_NOT_CONFIGURED":
            return err(event, "Razorpay is not configured", 503, code)
        if code == "PLAN_AMOUNT_INVALID":
            return err(event, f"Cannot create Razorpay plan for {plan}", 500, code)
        return err(event, str(exc), 502, "RAZORPAY_ERROR")

    # Cancel local draft subscriptions
    try:
        res = subs_tbl.query(
            IndexName="UserSubsIndex",
            KeyConditionExpression=Key("userId").eq(user_id),
            ScanIndexForward=False,
            Limit=20,
        )
        for draft in res.get("Items") or []:
            if draft.get("status") == "created" and draft.get("source") == "razorpay":
                draft["status"] = "cancelled"
                draft["cancelledAt"] = now_iso()
                draft["updatedAt"] = now_iso()
                subs_tbl.put_item(Item=draft)
    except Exception:
        pass

    try:
        subscription = razorpay_request(
            "POST",
            "/subscriptions",
            {
                "plan_id": razorpay_plan_id,
                "total_count": SUBSCRIPTION_TOTAL_COUNT,
                "customer_notify": 1,
                "quantity": 1,
                "customer_id": customer_id,
                "notes": {"userId": user_id, "plan": plan},
            },
        )
    except RuntimeError as exc:
        return err(event, str(exc), 502, "RAZORPAY_ERROR")

    local_id = str(uuid.uuid4())
    created_at = now_iso()
    subs_tbl.put_item(
        Item={
            "subscriptionId": local_id,
            "userId": user_id,
            "tier": plan,
            "status": "created",
            "razorpaySubscriptionId": subscription["id"],
            "razorpayPlanId": razorpay_plan_id,
            "source": "razorpay",
            "cancelAtPeriodEnd": False,
            "createdAt": created_at,
            "updatedAt": created_at,
        }
    )
    return created(
        event,
        {
            "subscriptionId": subscription["id"],
            "localSubscriptionId": local_id,
            "keyId": RAZORPAY_KEY_ID,
            "plan": plan,
            "amountPaise": _as_int(plan_cfg.get("amountPaise")),
        },
        "Subscription created",
    )


def verify_subscription(
    event: Dict[str, Any], user_id: str, body: Dict[str, Any]
) -> Dict[str, Any]:
    sub_rz_id = body.get("razorpay_subscription_id") or ""
    payment_id = body.get("razorpay_payment_id") or ""
    signature = body.get("razorpay_signature") or ""
    plan = body.get("plan") or ""
    if not sub_rz_id or not payment_id or not signature or plan not in ("pro", "max"):
        return err(event, "Invalid verify payload", 400, "VALIDATION_ERROR")

    sub = find_sub_by_razorpay_id(sub_rz_id)
    if not sub or sub.get("userId") != user_id:
        return err(event, "Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND")
    if sub.get("tier") != plan:
        return err(event, "Plan mismatch", 400, "PLAN_MISMATCH")

    if not verify_subscription_signature(payment_id, sub_rz_id, signature):
        return err(event, "Invalid payment signature", 400, "SIGNATURE_INVALID")

    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")

    now = datetime.now(timezone.utc)
    period_end = parse_iso(sub.get("currentPeriodEnd")) or (now + timedelta(days=30))
    period_start = parse_iso(sub.get("currentPeriodStart")) or now

    if sub.get("status") in ("created", "authenticated"):
        sub["status"] = "active"
    sub["currentPeriodStart"] = period_start.isoformat()
    sub["currentPeriodEnd"] = period_end.isoformat()
    sub["updatedAt"] = now_iso()
    subs_tbl.put_item(Item=sub)

    apply_entitlement(user, sub["tier"], period_end, sub["subscriptionId"])

    payment = find_payment_by_razorpay_payment_id(payment_id)
    if not payment:
        amount_paise = get_paid_plan_amount(sub["tier"])
        invoice_number = next_invoice_number()
        invoice_key = upload_invoice(
            invoice_number,
            {
                "invoiceNumber": invoice_number,
                "customerName": user.get("name"),
                "customerEmail": user.get("email"),
                "plan": sub["tier"],
                "amountPaise": amount_paise,
                "currency": "INR",
                "periodStart": period_start.isoformat(),
                "periodEnd": period_end.isoformat(),
                "razorpayOrderId": sub_rz_id,
                "razorpayPaymentId": payment_id,
                "paidAt": now.isoformat(),
            },
        )
        created_at = now_iso()
        payment = put_payment(
            {
                "paymentId": payment_id,
                "userId": user_id,
                "plan": sub["tier"],
                "amountPaise": amount_paise,
                "currency": "INR",
                "type": "subscription",
                "razorpayPaymentId": payment_id,
                "razorpaySignature": signature,
                "razorpaySubscriptionId": sub_rz_id,
                "status": "paid",
                "invoiceNumber": invoice_number,
                "invoicePath": invoice_key,
                "createdAt": created_at,
                "updatedAt": created_at,
            }
        )

    return ok(
        event,
        {
            "paymentId": payment["paymentId"],
            "subscriptionId": sub["subscriptionId"],
            "plan": sub["tier"],
            "planExpiresAt": period_end.isoformat(),
            "invoiceUrl": f"/api/v1/billing/invoices/{payment['paymentId']}",
            "invoiceNumber": payment.get("invoiceNumber") or "",
        },
        "Subscription verified",
    )


def cancel_subscription(
    event: Dict[str, Any], user_id: str, body: Dict[str, Any]
) -> Dict[str, Any]:
    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")

    sub = find_active_sub(user_id)
    if not sub:
        return err(event, "No active subscription", 404, "NO_SUBSCRIPTION")

    immediate = body.get("immediate") is True
    if sub.get("source") == "razorpay" and sub.get("razorpaySubscriptionId"):
        if not razorpay_configured():
            return err(
                event, "Razorpay is not configured", 503, "RAZORPAY_NOT_CONFIGURED"
            )
        try:
            # cancel_at_cycle_end = not immediate
            path = f"/subscriptions/{sub['razorpaySubscriptionId']}/cancel"
            razorpay_request(
                "POST",
                path,
                {"cancel_at_cycle_end": 0 if immediate else 1},
            )
        except RuntimeError as exc:
            return err(event, str(exc), 502, "RAZORPAY_ERROR")

    if immediate:
        sub["status"] = "cancelled"
        sub["cancelledAt"] = now_iso()
        sub["cancelAtPeriodEnd"] = False
        sub["updatedAt"] = now_iso()
        subs_tbl.put_item(Item=sub)
        update_user_fields(
            user["email"],
            {"plan": "free", "planExpiresAt": None, "activeSubscriptionId": None},
        )
    else:
        sub["cancelAtPeriodEnd"] = True
        sub["updatedAt"] = now_iso()
        subs_tbl.put_item(Item=sub)

    return ok(
        event,
        {
            "subscriptionId": sub["subscriptionId"],
            "cancelAtPeriodEnd": sub.get("cancelAtPeriodEnd"),
            "status": sub.get("status"),
            "planExpiresAt": user.get("planExpiresAt"),
        },
        "Subscription cancellation scheduled",
    )


def billing_me(event: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    user = get_user_by_id(user_id)
    if not user:
        return err(event, "User not found", 404, "NOT_FOUND")

    seed_plan_configs()
    period_start, period_end = get_ist_month_bounds()
    effective = get_effective_plan(user.get("plan"), user.get("planExpiresAt"))
    limits = PLAN_LIMITS.get(effective, PLAN_LIMITS["free"])
    # Prefer DB plan config limits when present
    cfg_limits = (get_plan_config(effective).get("limits") or {})
    applies_limit = _as_int(cfg_limits.get("monthlyApplies"), limits["monthlyApplies"])
    hour_limit = _as_int(cfg_limits.get("appliesPerHour"), limits["appliesPerHour"])
    day_limit = _as_int(cfg_limits.get("appliesPerDay"), limits["appliesPerDay"])

    usage = get_apply_usage(user_id)
    subscription = find_active_sub(user_id)
    payments = list_user_payments(user_id, 20)

    return ok(
        event,
        {
            "plan": effective,
            "planExpiresAt": user.get("planExpiresAt"),
            "appliesUsed": usage["month"],
            "appliesLimit": applies_limit,
            "appliesHourUsed": usage["hour"],
            "appliesHourLimit": hour_limit,
            "appliesDayUsed": usage["day"],
            "appliesDayLimit": day_limit,
            "periodStart": period_start.isoformat(),
            "periodEnd": period_end.isoformat(),
            "razorpayKeyId": RAZORPAY_KEY_ID,
            "subscription": (
                {
                    "id": subscription["subscriptionId"],
                    "tier": subscription.get("tier"),
                    "status": subscription.get("status"),
                    "source": subscription.get("source"),
                    "cancelAtPeriodEnd": bool(subscription.get("cancelAtPeriodEnd")),
                    "currentPeriodStart": subscription.get("currentPeriodStart"),
                    "currentPeriodEnd": subscription.get("currentPeriodEnd"),
                    "razorpaySubscriptionId": subscription.get("razorpaySubscriptionId"),
                }
                if subscription
                else None
            ),
            "payments": [
                {
                    "id": p["paymentId"],
                    "plan": p.get("plan"),
                    "amountPaise": _as_int(p.get("amountPaise")),
                    "currency": p.get("currency", "INR"),
                    "invoiceNumber": p.get("invoiceNumber"),
                    "invoiceUrl": f"/api/v1/billing/invoices/{p['paymentId']}",
                    "paidAt": p.get("updatedAt") or p.get("createdAt"),
                }
                for p in payments
            ],
        },
    )


def invoice_object_key(payment: Dict[str, Any]) -> Optional[str]:
    key = payment.get("invoiceS3Key")
    if isinstance(key, str) and key.startswith("invoices/"):
        return key
    inv = payment.get("invoiceNumber")
    path = payment.get("invoicePath")
    if isinstance(path, str) and path.strip():
        # Ignore absolute/local Mongo paths; only keep basename under invoices/
        name = path.replace("\\", "/").rstrip("/").split("/")[-1]
        if name and not name.startswith("invoices/"):
            return f"invoices/{name}"
        if name.startswith("invoices/"):
            return name
    if inv:
        return f"invoices/{inv}.pdf"
    return None


def get_invoice(event: Dict[str, Any], user_id: str, payment_id: str) -> Dict[str, Any]:
    payment = payments_tbl.get_item(Key={"paymentId": payment_id}).get("Item")
    if not payment or payment.get("userId") != user_id:
        return err(event, "Invoice not found", 404, "NOT_FOUND")
    if payment.get("status") != "paid" or not payment.get("invoiceNumber"):
        return err(event, "Invoice not ready", 404, "INVOICE_NOT_READY")

    key = invoice_object_key(payment) or f"invoices/{payment['invoiceNumber']}.txt"
    user = get_user_by_id(user_id)
    try:
        s3.head_object(Bucket=INVOICES_BUCKET, Key=key)
    except Exception:
        # Try .txt if .pdf missing, else generate placeholder
        tried = key
        if key.endswith(".pdf"):
            alt = key[:-4] + ".txt"
            try:
                s3.head_object(Bucket=INVOICES_BUCKET, Key=alt)
                key = alt
                tried = None
            except Exception:
                pass
        if tried is not None:
            key = upload_invoice(
                payment["invoiceNumber"],
                {
                    "invoiceNumber": payment["invoiceNumber"],
                    "customerName": (user or {}).get("name"),
                    "customerEmail": (user or {}).get("email"),
                    "plan": payment.get("plan"),
                    "amountPaise": payment.get("amountPaise"),
                    "currency": payment.get("currency", "INR"),
                    "periodStart": payment.get("createdAt"),
                    "periodEnd": payment.get("updatedAt"),
                    "razorpayOrderId": payment.get("razorpayOrderId")
                    or payment.get("razorpaySubscriptionId")
                    or "",
                    "razorpayPaymentId": payment.get("razorpayPaymentId") or "",
                    "paidAt": payment.get("updatedAt") or payment.get("createdAt"),
                },
            )
            payment["invoiceS3Key"] = key
            payment["updatedAt"] = now_iso()
            put_payment(payment)

    url = presign_invoice(key)
    return ok(event, {"url": url, "invoiceNumber": payment.get("invoiceNumber"), "key": key})


def upsert_subscription_from_razorpay(
    entity: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    razorpay_subscription_id = str(entity.get("id") or "")
    if not razorpay_subscription_id:
        return None

    sub = find_sub_by_razorpay_id(razorpay_subscription_id)
    notes = entity.get("notes") or {}
    if not isinstance(notes, dict):
        notes = {}
    user_id = notes.get("userId") or (sub or {}).get("userId")
    plan = notes.get("plan") or (sub or {}).get("tier")

    if not sub:
        if not user_id or not plan:
            return None
        created_at = now_iso()
        sub = {
            "subscriptionId": str(uuid.uuid4()),
            "userId": user_id,
            "tier": plan,
            "status": "created",
            "razorpaySubscriptionId": razorpay_subscription_id,
            "razorpayPlanId": str(entity.get("plan_id") or ""),
            "source": "razorpay",
            "cancelAtPeriodEnd": False,
            "createdAt": created_at,
            "updatedAt": created_at,
        }

    status = str(entity.get("status") or sub.get("status"))
    status_map = {
        "created": "created",
        "authenticated": "authenticated",
        "active": "active",
        "pending": "pending",
        "halted": "halted",
        "cancelled": "cancelled",
        "completed": "completed",
        "expired": "expired",
    }
    sub["status"] = status_map.get(status, sub.get("status"))

    period_start, period_end = period_from_unix(
        entity.get("current_start") if isinstance(entity.get("current_start"), int) else None,
        entity.get("current_end") if isinstance(entity.get("current_end"), int) else None,
    )
    if entity.get("current_start"):
        sub["currentPeriodStart"] = period_start.isoformat()
    if entity.get("current_end"):
        sub["currentPeriodEnd"] = period_end.isoformat()
    if status in ("cancelled", "completed", "expired"):
        sub["cancelledAt"] = sub.get("cancelledAt") or now_iso()
    sub["updatedAt"] = now_iso()
    subs_tbl.put_item(Item=sub)
    return sub


def handle_webhook(event: Dict[str, Any]) -> Dict[str, Any]:
    raw = raw_body_bytes(event)
    signature = header(event, "X-Razorpay-Signature")
    if not verify_webhook_signature(raw, signature):
        return err(event, "Invalid webhook signature", 400, "WEBHOOK_INVALID")

    try:
        body = json.loads(raw.decode("utf-8"))
    except Exception:
        return err(event, "Invalid webhook body", 400, "VALIDATION_ERROR")

    evt = body.get("event") or ""
    payload = body.get("payload") or {}
    sub_entity = ((payload.get("subscription") or {}).get("entity")) or None
    payment_entity = ((payload.get("payment") or {}).get("entity")) or None

    if sub_entity and isinstance(sub_entity, dict):
        sub = upsert_subscription_from_razorpay(sub_entity)
        if sub:
            user = get_user_by_id(sub["userId"])
            if user and evt in (
                "subscription.activated",
                "subscription.authenticated",
                "subscription.charged",
            ):
                end = parse_iso(sub.get("currentPeriodEnd")) or (
                    datetime.now(timezone.utc) + timedelta(days=30)
                )
                apply_entitlement(user, sub["tier"], end, sub["subscriptionId"])

            if user and evt in ("subscription.cancelled", "subscription.completed"):
                end = parse_iso(sub.get("currentPeriodEnd"))
                if not end or end.timestamp() <= time.time():
                    update_user_fields(
                        user["email"],
                        {
                            "plan": "free",
                            "planExpiresAt": None,
                            "activeSubscriptionId": None,
                        },
                    )
                else:
                    sub["cancelAtPeriodEnd"] = True
                    sub["updatedAt"] = now_iso()
                    subs_tbl.put_item(Item=sub)

    if evt in ("subscription.charged", "payment.captured") and isinstance(
        payment_entity, dict
    ):
        rz_payment_id = str(payment_entity.get("id") or "")
        subscription_id = str(
            payment_entity.get("subscription_id")
            or (sub_entity or {}).get("id")
            or ""
        )
        if rz_payment_id and not find_payment_by_razorpay_payment_id(rz_payment_id):
            sub = (
                find_sub_by_razorpay_id(subscription_id) if subscription_id else None
            )
            notes = payment_entity.get("notes") or {}
            if not isinstance(notes, dict):
                notes = {}
            user_id = (sub or {}).get("userId") or notes.get("userId") or ""
            plan = (sub or {}).get("tier") or notes.get("plan")
            if user_id and plan in ("pro", "max"):
                user = get_user_by_id(user_id)
                if user:
                    amount_paise = _as_int(payment_entity.get("amount")) or get_paid_plan_amount(
                        plan
                    )
                    created_at_unix = payment_entity.get("created_at")
                    paid_at = (
                        datetime.fromtimestamp(created_at_unix, tz=timezone.utc)
                        if isinstance(created_at_unix, int)
                        else datetime.now(timezone.utc)
                    )
                    period_end = parse_iso((sub or {}).get("currentPeriodEnd")) or (
                        paid_at + timedelta(days=30)
                    )
                    period_start = parse_iso((sub or {}).get("currentPeriodStart")) or paid_at
                    invoice_number = next_invoice_number()
                    invoice_key = upload_invoice(
                        invoice_number,
                        {
                            "invoiceNumber": invoice_number,
                            "customerName": user.get("name"),
                            "customerEmail": user.get("email"),
                            "plan": plan,
                            "amountPaise": amount_paise,
                            "currency": str(payment_entity.get("currency") or "INR"),
                            "periodStart": period_start.isoformat(),
                            "periodEnd": period_end.isoformat(),
                            "razorpayOrderId": subscription_id or rz_payment_id,
                            "razorpayPaymentId": rz_payment_id,
                            "paidAt": paid_at.isoformat(),
                        },
                    )
                    created_at = now_iso()
                    put_payment(
                        {
                            "paymentId": rz_payment_id,
                            "userId": user_id,
                            "plan": plan,
                            "amountPaise": amount_paise,
                            "currency": str(payment_entity.get("currency") or "INR"),
                            "type": "subscription",
                            "razorpayPaymentId": rz_payment_id,
                            "razorpaySubscriptionId": subscription_id or None,
                            "razorpayInvoiceId": (
                                str(payment_entity["invoice_id"])
                                if payment_entity.get("invoice_id")
                                else None
                            ),
                            "status": "paid",
                            "invoiceNumber": invoice_number,
                            "invoicePath": invoice_key,
                            "createdAt": created_at,
                            "updatedAt": created_at,
                        }
                    )
                    apply_entitlement(
                        user,
                        plan,
                        period_end,
                        (sub or {}).get("subscriptionId"),
                    )

    if evt == "payment.failed" and isinstance(payment_entity, dict):
        rz_payment_id = str(payment_entity.get("id") or "")
        subscription_id = (
            str(payment_entity["subscription_id"])
            if payment_entity.get("subscription_id")
            else None
        )
        if rz_payment_id:
            existing = find_payment_by_razorpay_payment_id(rz_payment_id)
            if not existing:
                sub = (
                    find_sub_by_razorpay_id(subscription_id) if subscription_id else None
                )
                if sub:
                    created_at = now_iso()
                    put_payment(
                        {
                            "paymentId": rz_payment_id,
                            "userId": sub["userId"],
                            "plan": sub["tier"],
                            "amountPaise": _as_int(payment_entity.get("amount")),
                            "currency": str(payment_entity.get("currency") or "INR"),
                            "type": "subscription",
                            "razorpayPaymentId": rz_payment_id,
                            "razorpaySubscriptionId": subscription_id,
                            "status": "failed",
                            "createdAt": created_at,
                            "updatedAt": created_at,
                        }
                    )
            elif existing.get("status") != "paid":
                existing["status"] = "failed"
                existing["updatedAt"] = now_iso()
                put_payment(existing)

    return ok(event, {"received": True, "event": evt})


def extract_invoice_payment_id(path: str) -> Optional[str]:
    marker = "/billing/invoices/"
    if marker not in path:
        return None
    return path.split(marker, 1)[1].strip("/") or None


def with_auth(
    event: Dict[str, Any], handler
) -> Dict[str, Any]:
    auth = require_auth(event)
    if not auth:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    user_id = auth.get("sub") or ""
    if not user_id:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    return handler(event, user_id)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    if http_method(event) == "OPTIONS":
        return ok(event, {})

    method = http_method(event)
    path = path_of(event)

    # Webhook needs raw body — handle before JSON parse failures matter
    if path.endswith("/billing/webhooks/razorpay") and method == "POST":
        return handle_webhook(event)
    if (event.get("action") or "").strip() == "webhook":
        return handle_webhook(event)

    try:
        body = parse_body(event)
    except Exception:
        return err(event, "Invalid JSON body", 400, "VALIDATION_ERROR")

    action = (body.get("action") or "").strip()

    # Console / action routing
    if action == "seedPlans":
        plans = seed_plan_configs()
        return ok(
            event,
            {
                "seeded": [
                    {
                        "tier": p.get("tier"),
                        "name": p.get("name"),
                        "amountPaise": _as_int(p.get("amountPaise")),
                        "active": p.get("active", True),
                    }
                    for p in plans
                ]
            },
            "Plan configs seeded",
        )
    if action == "createOrder":
        return with_auth(event, lambda e, uid: create_order(e, uid, body))
    if action == "verify":
        return with_auth(event, lambda e, uid: verify_payment(e, uid, body))
    if action == "subscribe":
        return with_auth(event, lambda e, uid: create_subscription(e, uid, body))
    if action == "verifySubscription":
        return with_auth(event, lambda e, uid: verify_subscription(e, uid, body))
    if action == "cancel":
        return with_auth(event, lambda e, uid: cancel_subscription(e, uid, body))
    if action == "me":
        return with_auth(event, billing_me)
    if action == "invoice":
        pid = body.get("paymentId") or ""
        return with_auth(event, lambda e, uid: get_invoice(e, uid, pid))

    # REST routing
    if path.endswith("/billing/create-order") and method == "POST":
        return with_auth(event, lambda e, uid: create_order(e, uid, body))
    if path.endswith("/billing/verify") and method == "POST":
        return with_auth(event, lambda e, uid: verify_payment(e, uid, body))
    if path.endswith("/billing/subscribe") and method == "POST":
        return with_auth(event, lambda e, uid: create_subscription(e, uid, body))
    if path.endswith("/billing/verify-subscription") and method == "POST":
        return with_auth(event, lambda e, uid: verify_subscription(e, uid, body))
    if path.endswith("/billing/cancel") and method == "POST":
        return with_auth(event, lambda e, uid: cancel_subscription(e, uid, body))
    if path.endswith("/billing/me") and method == "GET":
        return with_auth(event, billing_me)

    invoice_id = extract_invoice_payment_id(path)
    if invoice_id and method == "GET":
        return with_auth(event, lambda e, uid: get_invoice(e, uid, invoice_id))

    return err(event, f"Unknown route: {method} {path}", 404, "NOT_FOUND")
