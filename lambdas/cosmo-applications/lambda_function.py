"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-applications
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoApplications  PK=userId  SK=eventId
    GSI AppIdIndex (applicationId)
    GSI ExternalJobIndex (userId, platformExternalJobId)
    GSI UserCreatedIndex (userId, createdAt)
"""

import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

import boto3
from boto3.dynamodb.conditions import Key

APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "CosmoApplications")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

BUCKETS = {"all", "matched", "applied", "skipped", "company_site"}
SOURCES = {"all", "manual", "auto_scan", "auto_apply"}
PLATFORMS = {
    "naukri",
    "linkedin",
    "foundit",
    "indeed",
    "wellfound",
    "internshala",
    "unknown",
}
TRACKER_COLUMNS = {
    "matched",
    "applied",
    "interview",
    "offer",
    "rejected",
    "skipped",
}

dynamodb = boto3.resource("dynamodb")
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
    raw = event.get("queryStringParameters") or {}
    if not isinstance(raw, dict):
        return {}
    return {k: str(v) for k, v in raw.items() if v is not None}


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


def query_user_applications(user_id: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    kwargs: Dict[str, Any] = {
        "IndexName": "UserCreatedIndex",
        "KeyConditionExpression": Key("userId").eq(user_id),
        "ScanIndexForward": False,
    }
    while True:
        res = apps_tbl.query(**kwargs)
        items.extend(res.get("Items") or [])
        if not res.get("LastEvaluatedKey"):
            break
        kwargs["ExclusiveStartKey"] = res["LastEvaluatedKey"]
    return items


def get_by_application_id(application_id: str) -> Optional[Dict[str, Any]]:
    res = apps_tbl.query(
        IndexName="AppIdIndex",
        KeyConditionExpression=Key("applicationId").eq(application_id),
        Limit=1,
    )
    items = res.get("Items") or []
    return items[0] if items else None


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def item_created_at(item: Dict[str, Any]) -> Optional[datetime]:
    return parse_iso(item.get("createdAt") if isinstance(item.get("createdAt"), str) else None)


def matches_bucket(item: Dict[str, Any], bucket: str) -> bool:
    if bucket == "all":
        return True
    metadata = item.get("metadata") or {}
    status = item.get("status") or "detected"
    skipped = bool(metadata.get("skipped"))
    company_site = bool(metadata.get("companySiteApply"))
    source = metadata.get("source")
    skip_reason = str(metadata.get("skipReason") or "")
    company_site_reason = bool(
        re.search(r"company site|external", skip_reason, re.IGNORECASE)
    )

    if bucket == "applied":
        return (
            (status == "applied" or source == "auto_apply")
            and not skipped
        )
    if bucket == "company_site":
        return (
            (company_site or (skipped and company_site_reason))
            and status != "applied"
            and source != "auto_apply"
        )
    if bucket == "skipped":
        return (
            skipped
            and not company_site
            and not company_site_reason
        )
    if bucket == "matched":
        return (
            status in ("detected", "viewed", "saved")
            and not skipped
            and not company_site
        )
    return True


def matches_search(item: Dict[str, Any], q: str) -> bool:
    if not q:
        return True
    needle = q.lower()
    fields: List[str] = []
    for key in (
        "title",
        "company",
        "location",
        "description",
        "experience",
        "salary",
    ):
        val = item.get(key)
        if isinstance(val, str):
            fields.append(val.lower())
    skills = item.get("skills")
    if isinstance(skills, list):
        fields.extend(str(s).lower() for s in skills)
    return any(needle in f for f in fields)


def matches_filters(
    item: Dict[str, Any],
    *,
    bucket: str = "all",
    platform: str = "all",
    source: str = "all",
    q: str = "",
    from_iso: Optional[str] = None,
    to_iso: Optional[str] = None,
) -> bool:
    if not matches_bucket(item, bucket):
        return False
    if platform != "all" and item.get("platform") != platform:
        return False
    if source != "all":
        metadata = item.get("metadata") or {}
        if metadata.get("source") != source:
            return False
    if not matches_search(item, q):
        return False

    created = item_created_at(item)
    from_dt = parse_iso(from_iso)
    to_dt = parse_iso(to_iso)
    if from_dt and (not created or created < from_dt):
        return False
    if to_dt and (not created or created >= to_dt):
        return False
    return True


def list_applications(
    user_id: str,
    *,
    page: int = 1,
    limit: int = 12,
    q: str = "",
    bucket: str = "all",
    platform: str = "all",
    source: str = "all",
    from_iso: Optional[str] = None,
    to_iso: Optional[str] = None,
) -> Dict[str, Any]:
    page = max(1, page)
    limit = min(200, max(1, limit))
    items = query_user_applications(user_id)
    filtered = [
        item
        for item in items
        if matches_filters(
            item,
            bucket=bucket,
            platform=platform,
            source=source,
            q=q.strip(),
            from_iso=from_iso,
            to_iso=to_iso,
        )
    ]
    total = len(filtered)
    start = (page - 1) * limit
    page_items = filtered[start : start + limit]
    total_pages = max(1, (total + limit - 1) // limit) if total else 1
    return {
        "items": [to_application(i) for i in page_items],
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
    }


def count_filtered(
    items: List[Dict[str, Any]],
    *,
    bucket: str = "all",
    source: str = "all",
    from_iso: Optional[str] = None,
    to_iso: Optional[str] = None,
) -> int:
    return sum(
        1
        for item in items
        if matches_filters(
            item,
            bucket=bucket,
            source=source,
            from_iso=from_iso,
            to_iso=to_iso,
        )
    )


def get_application_stats(
    user_id: str, from_iso: Optional[str] = None, to_iso: Optional[str] = None
) -> Dict[str, Any]:
    items = query_user_applications(user_id)
    period: Dict[str, Any] = {
        "all": count_filtered(items, from_iso=from_iso, to_iso=to_iso),
        "matched": count_filtered(
            items, bucket="matched", from_iso=from_iso, to_iso=to_iso
        ),
        "applied": count_filtered(
            items, bucket="applied", from_iso=from_iso, to_iso=to_iso
        ),
        "skipped": count_filtered(
            items, bucket="skipped", from_iso=from_iso, to_iso=to_iso
        ),
        "company_site": count_filtered(
            items, bucket="company_site", from_iso=from_iso, to_iso=to_iso
        ),
        "auto_apply": count_filtered(
            items, source="auto_apply", from_iso=from_iso, to_iso=to_iso
        ),
    }
    if from_iso:
        period["from"] = from_iso
    if to_iso:
        period["to"] = to_iso
    return {
        "period": period,
        "lifetime": {
            "all": count_filtered(items),
            "applied": count_filtered(items, bucket="applied"),
        },
    }


def normalize_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        u = urlparse(url)
        if not u.scheme or not u.netloc:
            return url.split("?")[0].rstrip("/") or None
        return f"{u.scheme}://{u.netloc}{u.path}".rstrip("/")
    except Exception:
        return url.split("?")[0].rstrip("/") or None


def is_applied_item(item: Dict[str, Any]) -> bool:
    metadata = item.get("metadata") or {}
    if metadata.get("skipped"):
        return False
    return item.get("status") == "applied" or metadata.get("source") == "auto_apply"


def lookup_applied_jobs(
    user_id: str, external_job_ids: List[str], urls: List[str]
) -> Dict[str, List[str]]:
    external_job_ids = list(
        dict.fromkeys(i.strip() for i in external_job_ids if isinstance(i, str) and i.strip())
    )[:200]
    norm_urls = list(
        dict.fromkeys(
            u
            for u in (normalize_url(x) for x in urls if isinstance(x, str))
            if u
        )
    )[:200]

    if not external_job_ids and not norm_urls:
        return {"externalJobIds": [], "urls": []}

    items = query_user_applications(user_id)
    applied_ids: Set[str] = set()
    applied_urls: Set[str] = set()

    path_hints = []
    for u in norm_urls:
        try:
            path = urlparse(u).path.rstrip("/")
            if path:
                path_hints.append(path)
        except Exception:
            pass

    id_set = set(external_job_ids)
    url_set = set(norm_urls)

    for item in items:
        if not is_applied_item(item):
            continue
        ext = item.get("externalJobId")
        item_url = item.get("url")
        norm = normalize_url(item_url) if isinstance(item_url, str) else None

        matched = False
        if ext and ext in id_set:
            matched = True
        if norm and norm in url_set:
            matched = True
        if not matched and path_hints and isinstance(item_url, str):
            for path in path_hints:
                if path and path in item_url:
                    matched = True
                    break

        if matched:
            if ext:
                applied_ids.add(ext)
            if norm:
                applied_urls.add(norm)

    return {
        "externalJobIds": list(applied_ids),
        "urls": list(applied_urls),
    }


def move_application_column(
    user_id: str, application_id: str, column: str
) -> Optional[Dict[str, Any]]:
    item = get_by_application_id(application_id)
    if not item or item.get("userId") != user_id:
        return None

    metadata = dict(item.get("metadata") or {})

    def clear_skip() -> None:
        metadata["skipped"] = False
        metadata.pop("skipReason", None)
        metadata["companySiteApply"] = False

    if column == "applied":
        item["status"] = "applied"
        if not item.get("appliedAt"):
            item["appliedAt"] = now_iso()
        clear_skip()
        if metadata.get("source") not in ("auto_apply", "manual"):
            metadata["source"] = metadata.get("source") or "manual"
    elif column == "matched":
        item["status"] = "detected"
        clear_skip()
        if metadata.get("source") == "auto_apply":
            metadata["source"] = "auto_scan"
    elif column == "interview":
        item["status"] = "interview"
        clear_skip()
    elif column == "offer":
        item["status"] = "offer"
        clear_skip()
    elif column == "rejected":
        item["status"] = "rejected"
        clear_skip()
    else:
        if item.get("status") == "applied":
            item["status"] = "detected"
        metadata["skipped"] = True
        if not isinstance(metadata.get("skipReason"), str) or not metadata.get("skipReason"):
            metadata["skipReason"] = "Moved to Skipped"
        metadata["companySiteApply"] = False

    item["metadata"] = metadata
    item["updatedAt"] = now_iso()

    # Omit empty GSI attrs — never write blank platformExternalJobId
    if not item.get("externalJobId"):
        item.pop("platformExternalJobId", None)
    elif item.get("platform") and item.get("externalJobId"):
        item["platformExternalJobId"] = f"{item['platform']}#{item['externalJobId']}"

    apps_tbl.put_item(Item=item)
    return to_application(item)


def move_applications_bulk(
    user_id: str, ids: List[str], column: str
) -> Dict[str, Any]:
    unique = list(dict.fromkeys(i.strip() for i in ids if isinstance(i, str) and i.strip()))[
        :50
    ]
    items: List[Dict[str, Any]] = []
    missing: List[str] = []
    for app_id in unique:
        updated = move_application_column(user_id, app_id, column)
        if updated:
            items.append(updated)
        else:
            missing.append(app_id)
    return {"items": items, "moved": len(items), "missing": missing}


def extract_tracker_id(path: str) -> Optional[str]:
    # .../applications/<id>/tracker
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 3 and parts[-1] == "tracker" and parts[-2] != "bulk":
        return parts[-2]
    return None


def handle_list(event: Dict[str, Any], user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    qs = query_params(event)
    # Prefer query string; fall back to body for console/action testing
    page = int(qs.get("page") or body.get("page") or 1)
    limit = int(qs.get("limit") or body.get("limit") or 12)
    q = qs.get("q") or body.get("q") or ""
    bucket_raw = qs.get("bucket") or body.get("bucket") or "all"
    bucket = bucket_raw if bucket_raw in BUCKETS else "all"
    platform_raw = qs.get("platform") or body.get("platform") or "all"
    platform = (
        "all"
        if platform_raw == "all"
        else (platform_raw if platform_raw in PLATFORMS else "all")
    )
    source_raw = qs.get("source") or body.get("source") or "all"
    source = source_raw if source_raw in SOURCES else "all"
    from_iso = (qs.get("from") or body.get("from") or "").strip() or None
    to_iso = (qs.get("to") or body.get("to") or "").strip() or None
    result = list_applications(
        user_id,
        page=page,
        limit=limit,
        q=q if isinstance(q, str) else "",
        bucket=bucket,
        platform=platform,
        source=source,
        from_iso=from_iso,
        to_iso=to_iso,
    )
    return ok(event, result)


def handle_stats(event: Dict[str, Any], user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    qs = query_params(event)
    from_iso = (qs.get("from") or body.get("from") or "").strip() or None
    to_iso = (qs.get("to") or body.get("to") or "").strip() or None
    return ok(event, get_application_stats(user_id, from_iso, to_iso))


def handle_lookup(event: Dict[str, Any], user_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    external = body.get("externalJobIds") or []
    urls = body.get("urls") or []
    if not isinstance(external, list):
        external = []
    if not isinstance(urls, list):
        urls = []
    return ok(
        event,
        lookup_applied_jobs(
            user_id,
            [x for x in external if isinstance(x, str)],
            [x for x in urls if isinstance(x, str)],
        ),
    )


def handle_tracker(
    event: Dict[str, Any], user_id: str, application_id: str, body: Dict[str, Any]
) -> Dict[str, Any]:
    column = body.get("column")
    if not application_id or column not in TRACKER_COLUMNS:
        return err(event, "Invalid application id or column", 400, "VALIDATION_ERROR")
    updated = move_application_column(user_id, application_id, column)
    if not updated:
        return err(event, "Application not found", 404, "NOT_FOUND")
    return ok(event, updated)


def handle_tracker_bulk(
    event: Dict[str, Any], user_id: str, body: Dict[str, Any]
) -> Dict[str, Any]:
    column = body.get("column")
    ids = body.get("ids") or []
    if column not in TRACKER_COLUMNS:
        return err(event, "Invalid column", 400, "VALIDATION_ERROR")
    if not isinstance(ids, list) or not any(isinstance(i, str) and i.strip() for i in ids):
        return err(event, "Provide at least one application id", 400, "VALIDATION_ERROR")
    return ok(
        event,
        move_applications_bulk(
            user_id, [i for i in ids if isinstance(i, str)], column
        ),
    )


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

    # Console / action routing
    if action == "listApplications":
        return handle_list(event, user_id, body)
    if action in ("getStats", "applicationStats"):
        return handle_stats(event, user_id, body)
    if action in ("lookupApplied", "lookup"):
        return handle_lookup(event, user_id, body)
    if action in ("moveTrackerBulk", "trackerBulk"):
        return handle_tracker_bulk(event, user_id, body)
    if action in ("moveTracker", "tracker"):
        app_id = body.get("id") or body.get("applicationId") or ""
        return handle_tracker(event, user_id, str(app_id), body)

    # REST routing
    if method == "GET" and path.endswith("/applications/stats"):
        return handle_stats(event, user_id, body)
    if method == "POST" and path.endswith("/applications/lookup"):
        return handle_lookup(event, user_id, body)
    if method == "PATCH" and path.endswith("/applications/tracker/bulk"):
        return handle_tracker_bulk(event, user_id, body)
    if method == "PATCH" and path.endswith("/tracker"):
        app_id = (
            (event.get("pathParameters") or {}).get("id")
            or extract_tracker_id(path)
            or ""
        )
        return handle_tracker(event, user_id, app_id, body)
    if method == "GET" and (
        path.endswith("/applications") or path.endswith("/api/v1/applications")
    ):
        return handle_list(event, user_id, body)

    return err(event, f"Unknown route: {method} {path}", 404, "NOT_FOUND")
