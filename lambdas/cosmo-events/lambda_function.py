"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-events
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoUsers         PK=email  GSI UserIdIndex (userId)
  CosmoApplications  PK=userId  SK=eventId
                     GSI ExternalJobIndex (userId, platformExternalJobId)
  CosmoActivities    PK=userId  SK=eventId
  CosmoApplyCounters PK=userId  SK=periodKey
"""

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

USERS_TABLE = os.environ.get("USERS_TABLE", "CosmoUsers")
APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "CosmoApplications")
ACTIVITIES_TABLE = os.environ.get("ACTIVITIES_TABLE", "CosmoActivities")
APPLY_COUNTERS_TABLE = os.environ.get("APPLY_COUNTERS_TABLE", "CosmoApplyCounters")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

IST = ZoneInfo("Asia/Kolkata")

PLAN_LIMITS = {
    "free": {"appliesPerDay": 15, "monthlyApplies": 50},
    "pro": {"appliesPerDay": 40, "monthlyApplies": 300},
    "max": {"appliesPerDay": 60, "monthlyApplies": 1000},
}

EVENT_TYPES = {
    "ExtensionConnected",
    "LoginDetected",
    "JobDetected",
    "ApplicationRecorded",
    "SyncStarted",
    "SyncCompleted",
    "SyncFailed",
    "NotificationCreated",
}

PLATFORMS = {
    "naukri",
    "linkedin",
    "foundit",
    "indeed",
    "wellfound",
    "internshala",
    "unknown",
}

JOB_STATUSES = {"detected", "applied", "viewed", "saved"}

APPLY_CAP_CODES = {"APPLY_HOUR_CAP", "APPLY_DAY_CAP", "APPLY_PLAN_CAP"}

dynamodb = boto3.resource("dynamodb")
users_tbl = dynamodb.Table(USERS_TABLE)
apps_tbl = dynamodb.Table(APPLICATIONS_TABLE)
activities_tbl = dynamodb.Table(ACTIVITIES_TABLE)
counters_tbl = dynamodb.Table(APPLY_COUNTERS_TABLE)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
    "Content-Type": "application/json",
}


class CapError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


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


def b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def verify_jwt(token: str, secret: str) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("bad token")
    h, p, s = parts
    expected = (
        base64.urlsafe_b64encode(
            hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
        )
        .rstrip(b"=")
        .decode("ascii")
    )
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


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    res = users_tbl.query(
        IndexName="UserIdIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        Limit=1,
    )
    items = res.get("Items") or []
    return items[0] if items else None


def get_effective_plan(
    plan: Optional[str], plan_expires_at: Any, now: Optional[datetime] = None
) -> str:
    now = now or datetime.now(timezone.utc)
    tier = plan or "free"
    if tier == "free":
        return "free"
    if not plan_expires_at:
        return "free"
    try:
        if isinstance(plan_expires_at, datetime):
            expires = plan_expires_at
        else:
            expires = datetime.fromisoformat(str(plan_expires_at).replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
    except Exception:
        return "free"
    if expires.timestamp() <= now.timestamp():
        return "free"
    return tier if tier in PLAN_LIMITS else "free"


def plan_day_limit(plan: Optional[str], plan_expires_at: Any) -> int:
    return PLAN_LIMITS[get_effective_plan(plan, plan_expires_at)]["appliesPerDay"]


def plan_month_limit(plan: Optional[str], plan_expires_at: Any) -> int:
    return PLAN_LIMITS[get_effective_plan(plan, plan_expires_at)]["monthlyApplies"]


def ist_period_keys(now: Optional[datetime] = None) -> Tuple[str, str]:
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(IST)
    day_key = f"day#{local.strftime('%Y-%m-%d')}"
    month_key = f"month#{local.strftime('%Y-%m')}"
    return day_key, month_key


def try_consume_counter(user_id: str, period_key: str, limit: int) -> bool:
    """Atomically increment if under limit. Returns False if at/over cap."""
    try:
        counters_tbl.update_item(
            Key={"userId": user_id, "periodKey": period_key},
            UpdateExpression="ADD #c :one SET updatedAt = :u",
            ConditionExpression="attribute_not_exists(#c) OR #c < :limit",
            ExpressionAttributeNames={"#c": "count"},
            ExpressionAttributeValues={
                ":one": Decimal(1),
                ":limit": Decimal(limit),
                ":u": now_iso(),
            },
        )
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def assert_apply_caps(user_id: str, user: Optional[Dict[str, Any]]) -> None:
    if not user:
        return
    plan = user.get("plan")
    expires = user.get("planExpiresAt")
    effective = get_effective_plan(plan, expires)
    day_limit = plan_day_limit(plan, expires)
    month_limit = plan_month_limit(plan, expires)
    day_key, month_key = ist_period_keys()

    if not try_consume_counter(user_id, day_key, day_limit):
        raise CapError(
            "APPLY_DAY_CAP",
            f"Daily safety limit reached ({day_limit}/day on {effective})",
        )

    if not try_consume_counter(user_id, month_key, month_limit):
        # Roll back the day slot we just took so a retry can re-check cleanly.
        try:
            counters_tbl.update_item(
                Key={"userId": user_id, "periodKey": day_key},
                UpdateExpression="ADD #c :neg SET updatedAt = :u",
                ConditionExpression="#c >= :one",
                ExpressionAttributeNames={"#c": "count"},
                ExpressionAttributeValues={
                    ":neg": Decimal(-1),
                    ":one": Decimal(1),
                    ":u": now_iso(),
                },
            )
        except ClientError:
            pass
        raise CapError(
            "APPLY_PLAN_CAP",
            f"Monthly apply limit reached ({month_limit}/month on {effective})",
        )


def is_applied_record(
    status: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None
) -> bool:
    metadata = metadata or {}
    return status == "applied" or metadata.get("source") == "auto_apply"


def resolve_application_status(
    event_type: str, job_status: str, existing_is_applied: bool
) -> str:
    incoming = (
        "applied"
        if event_type == "ApplicationRecorded" and job_status == "detected"
        else job_status
    )
    return "applied" if existing_is_applied and incoming != "applied" else incoming


def merge_application_metadata(
    existing_metadata: Dict[str, Any],
    incoming_metadata: Optional[Dict[str, Any]],
    existing_is_applied: bool,
) -> Dict[str, Any]:
    merged = {**existing_metadata, **(incoming_metadata or {})}
    if existing_is_applied and existing_metadata.get("source") == "auto_apply":
        merged["source"] = "auto_apply"
        merged["skipped"] = False
    return merged


def validate_event(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    event_id = raw.get("eventId")
    event_type = raw.get("type")
    timestamp = raw.get("timestamp")
    payload = raw.get("payload")
    if not event_id or not isinstance(event_id, str):
        return None
    if event_type not in EVENT_TYPES:
        return None
    if not timestamp or not isinstance(timestamp, str):
        return None
    if not isinstance(payload, dict):
        return None
    return {
        "eventId": event_id,
        "type": event_type,
        "timestamp": timestamp,
        "payload": payload,
        "retryCount": int(raw.get("retryCount") or 0),
        "syncStatus": raw.get("syncStatus") or "pending",
    }


def parse_job_payload(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    title = (payload.get("title") or "").strip() if isinstance(payload.get("title"), str) else ""
    company = (
        (payload.get("company") or "").strip()
        if isinstance(payload.get("company"), str)
        else ""
    )
    platform = payload.get("platform")
    status = payload.get("status") or "detected"
    if not title or not company:
        return None
    if platform not in PLATFORMS:
        return None
    if status not in JOB_STATUSES:
        return None

    job: Dict[str, Any] = {
        "platform": platform,
        "title": title,
        "company": company,
        "status": status,
    }

    external = payload.get("externalJobId")
    if isinstance(external, str) and external.strip():
        job["externalJobId"] = external.strip()

    for key in (
        "location",
        "url",
        "companyLogo",
        "description",
        "experience",
        "salary",
        "rating",
        "reviews",
        "postedAt",
        "openings",
        "applicants",
        "role",
        "industry",
        "department",
        "employmentType",
        "roleCategory",
        "education",
        "aboutCompany",
        "appliedAt",
    ):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            if key == "url":
                try:
                    parsed = urlparse(val)
                    if parsed.scheme and parsed.netloc:
                        job[key] = val
                except Exception:
                    pass
            elif key == "description" and len(val) > 12000:
                job[key] = val[:12000]
            elif key == "aboutCompany" and len(val) > 4000:
                job[key] = val[:4000]
            else:
                job[key] = val

    skills = payload.get("skills")
    if isinstance(skills, list):
        cleaned = [s for s in skills if isinstance(s, str) and s.strip()][:60]
        if cleaned:
            job["skills"] = cleaned

    highlights = payload.get("highlights")
    if isinstance(highlights, list):
        cleaned = [s for s in highlights if isinstance(s, str) and s.strip()][:20]
        if cleaned:
            job["highlights"] = cleaned

    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        job["metadata"] = metadata

    return job


def counts_as_apply(event: Dict[str, Any], status: str, job: Dict[str, Any]) -> bool:
    if event["type"] != "ApplicationRecorded":
        return False
    metadata = job.get("metadata") or {}
    if metadata.get("skipped"):
        return False
    return status == "applied" or metadata.get("source") == "auto_apply"


def to_application(item: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "id": item.get("applicationId") or item.get("eventId"),
        "eventId": item.get("eventId"),
        "userId": item.get("userId"),
        "platform": item.get("platform"),
        "title": item.get("title"),
        "company": item.get("company"),
        "status": item.get("status") or "detected",
        "createdAt": item.get("createdAt"),
        "updatedAt": item.get("updatedAt"),
    }
    for key in (
        "externalJobId",
        "location",
        "url",
        "companyLogo",
        "description",
        "experience",
        "salary",
        "skills",
        "rating",
        "reviews",
        "postedAt",
        "openings",
        "applicants",
        "highlights",
        "role",
        "industry",
        "department",
        "employmentType",
        "roleCategory",
        "education",
        "aboutCompany",
        "appliedAt",
        "metadata",
    ):
        if key in item and item[key] is not None:
            out[key] = item[key]
    return out


def find_application(
    user_id: str, event_id: str, platform: str, external_job_id: Optional[str]
) -> Optional[Dict[str, Any]]:
    if external_job_id:
        gsi_sk = f"{platform}#{external_job_id}"
        res = apps_tbl.query(
            IndexName="ExternalJobIndex",
            KeyConditionExpression=Key("userId").eq(user_id)
            & Key("platformExternalJobId").eq(gsi_sk),
            Limit=1,
        )
        items = res.get("Items") or []
        if items:
            return items[0]

    res = apps_tbl.get_item(Key={"userId": user_id, "eventId": event_id})
    return res.get("Item")


def prefer_longer(next_val: Optional[str], prev: Optional[str]) -> Optional[str]:
    if not next_val:
        return None
    if not prev:
        return next_val
    return next_val if len(next_val) >= len(prev) else None


def prefer_list(
    next_val: Optional[List[str]], prev: Optional[List[str]]
) -> Optional[List[str]]:
    if not next_val:
        return None
    if not prev or len(next_val) >= len(prev):
        return next_val
    return None


def upsert_application_from_event(
    user_id: str, event: Dict[str, Any], user: Optional[Dict[str, Any]]
) -> Tuple[str, Optional[Dict[str, Any]]]:
    """
    Returns (kind, application) where kind is ignored|invalid|upserted.
    """
    if event["type"] not in ("ApplicationRecorded", "JobDetected"):
        return "ignored", None

    job = parse_job_payload(event["payload"])
    if not job:
        return "invalid", None

    external_job_id = job.get("externalJobId")
    existing = find_application(
        user_id, event["eventId"], job["platform"], external_job_id
    )

    existing_metadata = dict(existing.get("metadata") or {}) if existing else {}
    existing_is_applied = is_applied_record(
        existing.get("status") if existing else None, existing_metadata
    )
    status = resolve_application_status(event["type"], job["status"], existing_is_applied)

    if not existing_is_applied and counts_as_apply(event, status, job):
        assert_apply_caps(user_id, user)

    rich: Dict[str, Any] = {}
    logo = job.get("companyLogo") or (existing.get("companyLogo") if existing else None)
    if logo:
        rich["companyLogo"] = logo

    description = prefer_longer(
        job.get("description"), existing.get("description") if existing else None
    )
    if description:
        rich["description"] = description

    for key in (
        "experience",
        "salary",
        "rating",
        "reviews",
        "postedAt",
        "openings",
        "applicants",
        "role",
        "industry",
        "department",
        "employmentType",
        "roleCategory",
        "education",
        "location",
        "url",
    ):
        if job.get(key):
            rich[key] = job[key]

    skills = prefer_list(
        job.get("skills"), existing.get("skills") if existing else None
    )
    if skills:
        rich["skills"] = skills
    highlights = prefer_list(
        job.get("highlights"), existing.get("highlights") if existing else None
    )
    if highlights:
        rich["highlights"] = highlights

    about = prefer_longer(
        job.get("aboutCompany"), existing.get("aboutCompany") if existing else None
    )
    if about:
        rich["aboutCompany"] = about

    merged_metadata = merge_application_metadata(
        existing_metadata, job.get("metadata"), existing_is_applied
    )

    applied_at = None
    if job.get("appliedAt"):
        applied_at = job["appliedAt"]
    elif status == "applied" and not (existing and existing.get("appliedAt")):
        applied_at = event["timestamp"]

    now = now_iso()
    event_id_sk = existing["eventId"] if existing else event["eventId"]
    application_id = (
        existing.get("applicationId") if existing else None
    ) or str(uuid.uuid4())
    created_at = (existing.get("createdAt") if existing else None) or now

    item: Dict[str, Any] = {
        "userId": user_id,
        "eventId": event_id_sk,
        "applicationId": application_id,
        "platform": job["platform"],
        "title": job["title"],
        "company": job["company"],
        "status": status,
        "createdAt": created_at,
        "updatedAt": now,
        **rich,
    }
    if external_job_id:
        item["externalJobId"] = external_job_id
        item["platformExternalJobId"] = f"{job['platform']}#{external_job_id}"
    if applied_at:
        item["appliedAt"] = applied_at
    elif existing and existing.get("appliedAt"):
        item["appliedAt"] = existing["appliedAt"]
    if merged_metadata:
        item["metadata"] = merged_metadata

    apps_tbl.put_item(Item=item)
    return "upserted", to_application(item)


def handle_extension_connected(user_id: str, event: Dict[str, Any]) -> None:
    user = get_user_by_id(user_id)
    if not user:
        return
    connected_at = event["timestamp"]
    users_tbl.update_item(
        Key={"email": user["email"]},
        UpdateExpression="SET extensionConnectedAt = :c, updatedAt = :u",
        ExpressionAttributeValues={":c": connected_at, ":u": now_iso()},
    )


def record_activity(
    user_id: str, event: Dict[str, Any], sync_status: str
) -> None:
    now = now_iso()
    item = {
        "userId": user_id,
        "eventId": event["eventId"],
        "type": event["type"],
        "payload": event.get("payload") or {},
        "syncStatus": sync_status,
        "updatedAt": now,
        "createdAt": now,
    }
    # Preserve createdAt on re-sync of the same eventId
    existing = activities_tbl.get_item(
        Key={"userId": user_id, "eventId": event["eventId"]}
    ).get("Item")
    if existing and existing.get("createdAt"):
        item["createdAt"] = existing["createdAt"]
    activities_tbl.put_item(Item=item)


def sync_events(user_id: str, events: List[Any]) -> Dict[str, Any]:
    applications: List[Dict[str, Any]] = []
    synced_event_ids: List[str] = []
    failed_event_ids: List[str] = []
    invalid_event_ids: List[str] = []
    cap_error: Optional[Dict[str, str]] = None
    user = get_user_by_id(user_id)

    for raw in events:
        event = validate_event(raw)
        if not event:
            # Permanently unusable — no eventId to retry against.
            bad_id = (
                raw.get("eventId")
                if isinstance(raw, dict) and isinstance(raw.get("eventId"), str)
                else None
            )
            if bad_id:
                invalid_event_ids.append(bad_id)
            continue

        if cap_error and event["type"] == "ApplicationRecorded":
            failed_event_ids.append(event["eventId"])
            record_activity(user_id, event, "failed")
            continue

        try:
            if event["type"] == "ExtensionConnected":
                handle_extension_connected(user_id, event)

            kind, application = upsert_application_from_event(user_id, event, user)
            if kind == "upserted" and application:
                applications.append(application)
            elif kind == "invalid":
                invalid_event_ids.append(event["eventId"])

            synced_event_ids.append(event["eventId"])
            record_activity(user_id, event, "synced")
        except CapError as e:
            failed_event_ids.append(event["eventId"])
            record_activity(user_id, event, "failed")
            if e.code in APPLY_CAP_CODES:
                cap_error = {"code": e.code, "message": e.message}
            continue
        except ClientError:
            failed_event_ids.append(event["eventId"])
            record_activity(user_id, event, "failed")
        except Exception:
            failed_event_ids.append(event["eventId"])
            record_activity(user_id, event, "failed")

    return {
        "processed": len(synced_event_ids),
        "syncedEventIds": synced_event_ids,
        "failedEventIds": failed_event_ids,
        "invalidEventIds": invalid_event_ids,
        "capError": cap_error,
        "applications": applications,
    }


def handle_sync(event: Dict[str, Any], user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    events = body.get("events")
    if not isinstance(events, list) or not events:
        return err(event, "events array is required", 400, "VALIDATION_ERROR")
    if len(events) > 100:
        return err(event, "events array max is 100", 400, "VALIDATION_ERROR")
    result = sync_events(user_id, events)
    return ok(event, result, "Events synced")


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
    if not auth:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    user_id = auth.get("sub") or ""
    if not user_id:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")

    if action == "syncEvents" or (
        method == "POST" and path.endswith("/events/sync")
    ):
        return handle_sync(event, user_id, body)

    return err(event, f"Unknown route: {method} {path}", 404, "NOT_FOUND")
