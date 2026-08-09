"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-companies
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Cross-user Companies catalog: Scan CosmoApplications, dedupe by company / job.
Never returns userId. Response contract matches Express /api/v1/companies.

Tables:
  CosmoApplications  PK=userId  SK=eventId

API Gateway (HTTP API) routes to add:
  ANY /api/v1/companies
  ANY /api/v1/companies/{proxy+}

Scale note: full-table Scan is fine for early volume; add a CompanyJobs table / GSI later.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import boto3

APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "CosmoApplications")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

dynamodb = boto3.resource("dynamodb")
apps_tbl = dynamodb.Table(APPLICATIONS_TABLE)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
    "Content-Type": "application/json",
}

PROJECTION = (
    "platform, externalJobId, title, company, #loc, #u, companyLogo, description, "
    "experience, salary, postedAt, #role, department, industry, employmentType, aboutCompany"
)
EXPR_NAMES = {"#loc": "location", "#u": "url", "#role": "role"}


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


def normalize_company(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def encode_company_key(name: str) -> str:
    normalized = normalize_company(name)
    return base64.urlsafe_b64encode(normalized.encode("utf-8")).decode("ascii").rstrip("=")


def decode_company_key(key: str) -> str:
    pad = "=" * (-len(key) % 4)
    return base64.urlsafe_b64decode(key + pad).decode("utf-8")


def job_identity(item: Dict[str, Any]) -> str:
    platform = str(item.get("platform") or "unknown").lower()
    ext = (item.get("externalJobId") or "").strip()
    if ext:
        return f"{platform}|id:{ext}"
    url = (item.get("url") or "").strip()
    if url:
        try:
            parsed = urlparse(url)
            path = (parsed.path or "").rstrip("/")
            return f"{platform}|url:{parsed.scheme}://{parsed.netloc}{path}"
        except Exception:
            return f"{platform}|url:{url}"
    title = (item.get("title") or "").strip().lower()
    company = normalize_company(str(item.get("company") or ""))
    return f"{platform}|title:{title}@{company}"


def pick_richer(a: Optional[str], b: Optional[str]) -> Optional[str]:
    left = (a or "").strip()
    right = (b or "").strip()
    if not left:
        return right or None
    if not right:
        return left or None
    return right if len(right) > len(left) else left


_ABOUT_CUT_RE = re.compile(
    r"\b(?:Life of a|Company Info(?:\s*Link)?|Address\b|Careers at|"
    r"Open Source Technologies|Cloud\s*&\s*DevOps(?:\s+Practice)?|"
    r"Learn more\b|Website\b)",
    re.I,
)


def repair_mojibake(text: str) -> str:
    return (
        text.replace("â€™", "'")
        .replace("€™", "'")
        .replace("Ã¢â‚¬â„¢", "'")
        .replace("â€˜", "'")
        .replace("€˜", "'")
        .replace("â€œ", '"')
        .replace("€œ", '"')
        .replace("â€", '"')
        .replace("€", '"')
        .replace("â€”", "—")
        .replace("€”", "—")
        .replace("â€“", "–")
        .replace("€“", "–")
        .replace("â€¦", "…")
        .replace("€¦", "…")
    )


def sanitize_about_company(
    raw: Optional[str], max_len: int = 1200, max_sentences: int = 8
) -> Optional[str]:
    if not raw or not str(raw).strip():
        return None
    text = repair_mojibake(str(raw)).replace("\u00a0", " ")
    text = re.sub(r"^(?:about\s+(?:the\s+)?company[:\s-]*)+", "", text, flags=re.I).strip()
    # "About Accenture Accenture is…" → "Accenture is…"
    text = re.sub(r"^about\s+(.+?)\s+\1\b", r"\1", text, flags=re.I).strip()
    text = re.sub(r"^about\s+[A-Za-z0-9&.\-]{2,40}\s+(?=[A-Z])", "", text, flags=re.I).strip()
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = re.sub(r"([A-Za-z])(\d)", r"\1 \2", text)
    text = re.sub(r"(\d)([A-Za-z])", r"\1 \2", text)
    text = re.sub(r"([.!?])([A-Z])", r"\1 \2", text)
    text = re.sub(r"(https?://\S+?)([A-Z])", r"\1 \2", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^about\s+(.+?)\s+\1\b", r"\1", text, flags=re.I).strip()
    text = re.sub(r"^about\s+[A-Za-z0-9&.\-]{2,40}\s+(?=[A-Z])", "", text, flags=re.I).strip()

    overview = re.search(r"\bOverview\b", text, re.I)
    if overview:
        after = re.sub(r"^\s*Overview\b[:\s]*", "", text[overview.start() :], flags=re.I).strip()
        if len(after) > 60:
            text = after

    cut = _ABOUT_CUT_RE.search(text)
    if cut and cut.start() > 80:
        text = text[: cut.start()].strip()

    text = re.sub(r"https?://\S+", " ", text, flags=re.I)
    text = re.sub(
        r"^(?:[\d.]+\s+)?(?:[\d,.]+[kKmM]?\+?\s+)?(?:employee\s+)?reviews?\b",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\b(?:IT Services(?:\s*&\s*Consulting)?|Foreign MNC|Indian MNC|Startup|"
        r"Corporate|Following|[\d,.]+[kKmM]?\+?\s+followers?)\b",
        " ",
        text,
        flags=re.I,
    )
    text = re.sub(r"\s+", " ", text).strip()

    sentences = []
    for part in re.split(r"(?<=[.!?])\s+", text):
        s = part.strip()
        if len(s) < 40:
            continue
        if re.match(
            r"^(?:Life of|Lead |Delivery Manager|Design Engineer|Data Solution|Company Info)",
            s,
            re.I,
        ):
            continue
        if (
            re.search(r"\b(?:Newtown|Pennsylvania|followers|employee reviews)\b", s, re.I)
            and len(s) < 90
        ):
            continue
        if not re.search(r"[a-z]{3,}", s):
            continue
        sentences.append(s)
    if sentences:
        text = " ".join(sentences[: max(1, max_sentences)])

    if len(text) < 40:
        return None
    if len(text) > max_len:
        hard = text[:max_len]
        last_sentence = max(hard.rfind(". "), hard.rfind("! "), hard.rfind("? "))
        if last_sentence > max_len * 0.45:
            return hard[: last_sentence + 1].strip()
        clipped = re.sub(r"\s+\S*$", "", hard).strip()
        return (clipped or hard.strip()) + "…"
    return text


def pick_better_about(a: Optional[str], b: Optional[str]) -> Optional[str]:
    left = sanitize_about_company(a, max_len=4000, max_sentences=16)
    right = sanitize_about_company(b, max_len=4000, max_sentences=16)
    if not left:
        return right
    if not right:
        return left
    return right if len(right) > len(left) else left


def is_usable_company_logo(url: Optional[str]) -> bool:
    raw = (url or "").strip()
    if not raw:
        return False
    if not re.match(r"^https?://", raw, re.I):
        return False
    u = raw.lower()
    bad = (
        r"/logo\.png(?:\?|$)",
        r"naukri[-_]?logo",
        r"/static/(?:images/)?(?:logo|naukri)",
        r"placeholder|default[_-]?logo|no[_-]?logo|blank\.(?:gif|png|svg)",
        r"/ni-gnb|profile/photo|/avatar|/user/|/np/",
        r"img\.naukimg\.com/logo(?:\.png)?(?:\?|$)",
        # Naukri UI chrome / awards / Next static assets mistaken for logos
        r"/_next/static/media/",
        r"award[-_]?(?:left|right)[-_]?wing",
        r"award[-_]?wing|laurel|badge[-_]?icon",
        r"static\.naukimg\.com/s/9/",
        r"naukri[-_]identity|naukri[_-]gnb|gnb[_-]logo",
        r"static\.naukimg\.com/s/0/0/",
    )
    return not any(re.search(p, u) for p in bad)


def logo_quality_score(url: str) -> int:
    u = url.lower()
    score = 1
    if "logo_images/groups" in u:
        score += 6
    if "/logo/get/" in u or "company_logo" in u:
        score += 5
    if "comp-logo" in u or "complogo" in u:
        score += 2
    if "naukimg.com" in u:
        score += 1
    if re.search(r"\.(?:png|jpg|jpeg|webp|svg)(?:\?|$)", u):
        score += 1
    if re.search(r"\.gif(?:\?|$)", u) and "logo_images" in u:
        score += 1
    return score


def pick_best_company_logo(*urls: Optional[str]) -> Optional[str]:
    best: Optional[str] = None
    best_score = -1
    for url in urls:
        trimmed = (url or "").strip()
        if not trimmed or not is_usable_company_logo(trimmed):
            continue
        score = logo_quality_score(trimmed)
        if score > best_score:
            best = trimmed
            best_score = score
    return best


def with_company_logos(
    jobs: List[Dict[str, Any]], company_logo: Optional[str]
) -> List[Dict[str, Any]]:
    fallback = pick_best_company_logo(company_logo)
    out: List[Dict[str, Any]] = []
    for job in jobs:
        logo = pick_best_company_logo(job.get("companyLogo"), fallback)
        next_job = dict(job)
        if logo:
            next_job["companyLogo"] = logo
        else:
            next_job.pop("companyLogo", None)
        out.append(next_job)
    return out


def richness(item: Dict[str, Any]) -> int:
    score = 0
    if pick_best_company_logo(item.get("companyLogo")):
        score += 2
    about = item.get("aboutCompany") or ""
    if about:
        score += min(4, len(about) // 80)
    desc = item.get("description") or ""
    if desc:
        score += min(3, len(desc) // 120)
    if item.get("salary"):
        score += 1
    if item.get("location"):
        score += 1
    if item.get("experience"):
        score += 1
    return score


def snippet_of(item: Dict[str, Any]) -> Optional[str]:
    text = (item.get("description") or item.get("aboutCompany") or "").strip()
    if not text:
        return None
    if len(text) > 220:
        return text[:217].rstrip() + "…"
    return text


def to_company_job(item: Dict[str, Any]) -> Dict[str, Any]:
    description = (item.get("description") or "").strip() or None
    out: Dict[str, Any] = {
        "id": job_identity(item),
        "platform": item.get("platform") or "unknown",
        "title": item.get("title") or "Untitled",
        "company": item.get("company") or "Unknown",
    }
    for key in (
        "externalJobId",
        "location",
        "url",
        "experience",
        "salary",
        "postedAt",
        "role",
        "department",
        "industry",
        "employmentType",
    ):
        if item.get(key) is not None:
            out[key] = item[key]
    logo = pick_best_company_logo(item.get("companyLogo"))
    if logo:
        out["companyLogo"] = logo
    if description:
        out["description"] = description
    snip = snippet_of(item)
    if snip:
        out["snippet"] = snip
    return out


def display_company_name(items: List[Dict[str, Any]]) -> str:
    counts: Dict[str, int] = {}
    for item in items:
        name = (item.get("company") or "").strip()
        if not name:
            continue
        counts[name] = counts.get(name, 0) + 1
    best = ""
    best_count = 0
    for name, count in counts.items():
        if count > best_count or (count == best_count and len(name) > len(best)):
            best = name
            best_count = count
    return best or "Unknown"


def scan_all_applications() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    kwargs: Dict[str, Any] = {
        "ProjectionExpression": PROJECTION,
        "ExpressionAttributeNames": EXPR_NAMES,
    }
    while True:
        res = apps_tbl.scan(**kwargs)
        for item in res.get("Items") or []:
            company = (item.get("company") or "").strip()
            if not company:
                continue
            items.append(item)
        last = res.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


def build_buckets(q: Optional[str] = None) -> List[Dict[str, Any]]:
    q_norm = (q or "").strip().lower()
    by_norm: Dict[str, Dict[str, Any]] = {}
    for item in scan_all_applications():
        company = item.get("company") or ""
        if q_norm and q_norm not in company.lower():
            continue
        normalized = normalize_company(str(company))
        if not normalized:
            continue
        bucket = by_norm.get(normalized)
        if not bucket:
            bucket = {"normalized": normalized, "docs": [], "logo": None, "about": None}
            by_norm[normalized] = bucket
        bucket["docs"].append(item)
        bucket["logo"] = pick_best_company_logo(bucket.get("logo"), item.get("companyLogo"))
        bucket["about"] = pick_better_about(bucket.get("about"), item.get("aboutCompany"))

    buckets: List[Dict[str, Any]] = []
    for normalized, bucket in by_norm.items():
        best_jobs: Dict[str, Tuple[Dict[str, Any], int]] = {}
        for doc in bucket["docs"]:
            job = to_company_job(doc)
            score = richness(doc)
            prev = best_jobs.get(job["id"])
            if not prev or score > prev[1]:
                best_jobs[job["id"]] = (job, score)
        jobs = [pair[0] for pair in best_jobs.values()]
        jobs.sort(key=lambda j: j.get("title") or "")
        if not jobs:
            continue
        company_logo = pick_best_company_logo(
            bucket.get("logo"), *(j.get("companyLogo") for j in jobs)
        )
        jobs = with_company_logos(jobs, company_logo)
        about = bucket.get("about")
        buckets.append(
            {
                "normalized": normalized,
                "name": display_company_name(bucket["docs"]),
                "companyLogo": company_logo,
                "aboutCompany": about,
                "jobs": jobs,
            }
        )

    buckets.sort(
        key=lambda b: (
            0 if b.get("companyLogo") else 1,
            -len(b["jobs"]),
            b["name"].lower(),
        )
    )
    return buckets


def to_summary(bucket: Dict[str, Any]) -> Dict[str, Any]:
    about = sanitize_about_company(bucket.get("aboutCompany"), max_len=220)
    out: Dict[str, Any] = {
        "key": encode_company_key(bucket["normalized"]),
        "name": bucket["name"],
        "opportunityCount": len(bucket["jobs"]),
    }
    if bucket.get("companyLogo"):
        out["companyLogo"] = bucket["companyLogo"]
    if about:
        out["aboutCompany"] = about
    return out


def to_detail(bucket: Dict[str, Any]) -> Dict[str, Any]:
    about = sanitize_about_company(
        bucket.get("aboutCompany"), max_len=4000, max_sentences=16
    )
    out: Dict[str, Any] = {
        "key": encode_company_key(bucket["normalized"]),
        "name": bucket["name"],
        "opportunityCount": len(bucket["jobs"]),
    }
    if bucket.get("companyLogo"):
        out["companyLogo"] = bucket["companyLogo"]
    if about:
        out["aboutCompany"] = about
    return out


def paginate(items: List[Any], page: int, limit: int) -> Dict[str, Any]:
    total = len(items)
    total_pages = 0 if total == 0 else (total + limit - 1) // limit
    start = (page - 1) * limit
    return {
        "items": items[start : start + limit],
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
    }


def list_companies(q: Optional[str], page: int, limit: int) -> Dict[str, Any]:
    buckets = build_buckets(q)
    page_data = paginate([to_summary(b) for b in buckets], page, limit)
    return page_data


def find_bucket(key: str) -> Optional[Dict[str, Any]]:
    try:
        normalized = normalize_company(decode_company_key(key))
    except Exception:
        return None
    if not normalized:
        return None
    for bucket in build_buckets():
        if bucket["normalized"] == normalized:
            return bucket
    return None


def list_company_jobs(
    key: str, q: Optional[str], page: int, limit: int
) -> Optional[Dict[str, Any]]:
    bucket = find_bucket(key)
    if not bucket:
        return None
    jobs = bucket["jobs"]
    q_norm = (q or "").strip().lower()
    if q_norm:
        filtered = []
        for job in jobs:
            hay = " ".join(
                str(job.get(k) or "")
                for k in (
                    "title",
                    "location",
                    "salary",
                    "snippet",
                    "description",
                    "role",
                    "department",
                )
            ).lower()
            if q_norm in hay:
                filtered.append(job)
        jobs = filtered
    page_data = paginate(jobs, page, limit)
    return {
        "company": to_detail(bucket),
        **page_data,
    }


def lambda_handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    if http_method(event) == "OPTIONS":
        return response(event, 200, {"success": True, "message": "ok", "data": {}, "error": None})

    method = http_method(event)
    path = path_of(event)
    qs = query_params(event)

    if method != "GET":
        return err(event, "Method not allowed", 405, "METHOD_NOT_ALLOWED")

    # Public list — /api/v1/companies
    if path.endswith("/companies") or path == "/companies":
        page = max(1, int(qs.get("page") or 1))
        limit = min(60, max(1, int(qs.get("limit") or 24)))
        q = qs.get("q")
        return ok(event, list_companies(q, page, limit))

    if not require_auth(event):
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")

    # /api/v1/companies/{key}/jobs
    m_jobs = re.search(r"/companies/([^/]+)/jobs$", path)
    if m_jobs:
        key = m_jobs.group(1)
        page = max(1, int(qs.get("page") or 1))
        limit = min(60, max(1, int(qs.get("limit") or 24)))
        result = list_company_jobs(key, qs.get("q"), page, limit)
        if not result:
            return err(event, "Company not found", 404, "NOT_FOUND")
        return ok(event, result)

    # /api/v1/companies/{key}
    m_co = re.search(r"/companies/([^/]+)$", path)
    if m_co:
        bucket = find_bucket(m_co.group(1))
        if not bucket:
            return err(event, "Company not found", 404, "NOT_FOUND")
        return ok(event, to_detail(bucket))

    return err(event, "Not found", 404, "NOT_FOUND")
