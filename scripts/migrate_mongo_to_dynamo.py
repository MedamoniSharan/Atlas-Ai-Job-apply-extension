#!/usr/bin/env python3
"""
Migrate Cosmo MongoDB → DynamoDB (ap-south-2).

Usage:
  set -a && source .env && set +a
  python3 scripts/migrate_mongo_to_dynamo.py --dry-run
  python3 scripts/migrate_mongo_to_dynamo.py --full
  python3 scripts/migrate_mongo_to_dynamo.py --verify
  python3 scripts/migrate_mongo_to_dynamo.py --invoices-only
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from pymongo import MongoClient

REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-2"
INVOICES_BUCKET = os.environ.get("INVOICES_BUCKET", "cosmo-invoices-290917471042")
IST = ZoneInfo("Asia/Kolkata")
REPO_ROOT = Path(__file__).resolve().parents[1]
LOCAL_INVOICE_DIR = REPO_ROOT / "server" / "storage" / "invoices"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
serializer = TypeSerializer()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, str) and value.strip():
        return value
    return None


def oid(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(value)


def clean(item: Dict[str, Any]) -> Dict[str, Any]:
    """Drop Nones; convert floats to Decimal for DynamoDB."""
    out: Dict[str, Any] = {}
    for k, v in item.items():
        if v is None or v == "":
            continue
        if isinstance(v, float):
            out[k] = Decimal(str(v))
        elif isinstance(v, dict):
            nested = clean(v)
            if nested:
                out[k] = nested
        elif isinstance(v, list):
            out[k] = v
        else:
            out[k] = v
    return out


def batch_write(table_name: str, items: List[Dict[str, Any]], dry_run: bool) -> int:
    if dry_run or not items:
        return len(items)
    table = dynamodb.Table(table_name)
    written = 0
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=clean(item))
            written += 1
    return written


def migrate_users(db, dry_run: bool) -> int:
    items = []
    for doc in db.users.find():
        user_id = oid(doc["_id"])
        email = (doc.get("email") or "").strip().lower()
        if not email or not user_id:
            continue
        item = {
            "email": email,
            "userId": user_id,
            "name": doc.get("name") or email.split("@")[0],
            "role": doc.get("role") or "user",
            "status": doc.get("status") or "active",
            "plan": doc.get("plan") or "free",
            "planExpiresAt": to_iso(doc.get("planExpiresAt")),
            "passwordHash": doc.get("passwordHash"),
            "googleId": doc.get("googleId"),
            "refreshTokenHash": doc.get("refreshTokenHash"),
            "extensionConnectedAt": to_iso(doc.get("extensionConnectedAt")),
            "preferences": doc.get("preferences"),
            "preferencesCompletedAt": to_iso(doc.get("preferencesCompletedAt")),
            "razorpayCustomerId": doc.get("razorpayCustomerId"),
            "activeSubscriptionId": oid(doc.get("activeSubscriptionId")),
            "createdAt": to_iso(doc.get("createdAt")) or now_iso(),
            "updatedAt": to_iso(doc.get("updatedAt")) or now_iso(),
            "migratedFrom": "mongo",
        }
        items.append(item)
    n = batch_write("CosmoUsers", items, dry_run)
    print(f"  CosmoUsers: {n}")
    return n


def migrate_applications(db, dry_run: bool) -> int:
    items = []
    for doc in db.applications.find():
        user_id = oid(doc.get("userId"))
        event_id = doc.get("eventId")
        if not user_id or not event_id:
            continue
        platform = doc.get("platform") or "unknown"
        external = doc.get("externalJobId")
        item = {
            "userId": user_id,
            "eventId": event_id,
            "applicationId": oid(doc["_id"]),
            "platform": platform,
            "externalJobId": external,
            "platformExternalJobId": f"{platform}#{external}" if external else None,
            "title": doc.get("title") or "",
            "company": doc.get("company") or "",
            "location": doc.get("location"),
            "url": doc.get("url"),
            "companyLogo": doc.get("companyLogo"),
            "description": doc.get("description"),
            "experience": doc.get("experience"),
            "salary": doc.get("salary"),
            "skills": doc.get("skills"),
            "rating": doc.get("rating"),
            "reviews": doc.get("reviews"),
            "postedAt": doc.get("postedAt"),
            "openings": doc.get("openings"),
            "applicants": doc.get("applicants"),
            "highlights": doc.get("highlights"),
            "role": doc.get("role"),
            "industry": doc.get("industry"),
            "department": doc.get("department"),
            "employmentType": doc.get("employmentType"),
            "roleCategory": doc.get("roleCategory"),
            "education": doc.get("education"),
            "aboutCompany": doc.get("aboutCompany"),
            "status": doc.get("status") or "detected",
            "appliedAt": to_iso(doc.get("appliedAt")),
            "metadata": doc.get("metadata") or {},
            "createdAt": to_iso(doc.get("createdAt")) or now_iso(),
            "updatedAt": to_iso(doc.get("updatedAt")) or now_iso(),
            "migratedFrom": "mongo",
        }
        # DynamoDB 400KB item limit — truncate huge descriptions
        desc = item.get("description")
        if isinstance(desc, str) and len(desc) > 50_000:
            item["description"] = desc[:50_000] + "…"
        items.append(item)
    n = batch_write("CosmoApplications", items, dry_run)
    print(f"  CosmoApplications: {n}")
    return n


def migrate_activities(db, dry_run: bool) -> int:
    items = []
    skipped = 0
    for doc in db.activities.find():
        user_id = oid(doc.get("userId"))
        event_id = doc.get("eventId")
        if not user_id or not event_id:
            continue
        payload = doc.get("payload")
        # stringify oversized payloads
        payload_out: Any = payload
        try:
            raw = json.dumps(payload, default=str)
            if len(raw) > 80_000:
                payload_out = {"_truncated": True, "preview": raw[:2000]}
                skipped += 1
        except Exception:
            payload_out = {"_unserializable": True}
        item = {
            "userId": user_id,
            "eventId": event_id,
            "type": doc.get("type"),
            "payload": payload_out,
            "syncStatus": doc.get("syncStatus") or "synced",
            "createdAt": to_iso(doc.get("createdAt")) or now_iso(),
            "updatedAt": to_iso(doc.get("updatedAt")) or now_iso(),
            "migratedFrom": "mongo",
        }
        items.append(item)
    n = batch_write("CosmoActivities", items, dry_run)
    print(f"  CosmoActivities: {n} (truncated_payloads≈{skipped})")
    return n


def migrate_scan_sessions(db, dry_run: bool) -> int:
    items = []
    for doc in db.scansessions.find():
        user_id = oid(doc.get("userId"))
        session_id = doc.get("sessionId")
        if not user_id or not session_id:
            continue
        item = {
            "userId": user_id,
            "sessionId": session_id,
            "id": oid(doc["_id"]),
            "platform": doc.get("platform"),
            "keyword": doc.get("keyword"),
            "status": doc.get("status"),
            "scanned": int(doc.get("scanned") or 0),
            "matched": int(doc.get("matched") or 0),
            "applied": int(doc.get("applied") or 0),
            "skipped": int(doc.get("skipped") or 0),
            "pagesScanned": int(doc.get("pagesScanned") or 0),
            "startedAt": to_iso(doc.get("startedAt")) or now_iso(),
            "endedAt": to_iso(doc.get("endedAt")),
            "migratedFrom": "mongo",
        }
        items.append(item)
    n = batch_write("CosmoScanSessions", items, dry_run)
    print(f"  CosmoScanSessions: {n}")
    return n


def migrate_payments(db, dry_run: bool) -> int:
    items = []
    for doc in db.payments.find():
        payment_id = oid(doc["_id"])
        user_id = oid(doc.get("userId"))
        if not payment_id or not user_id:
            continue
        invoice_path = doc.get("invoicePath")
        invoice_s3_key = None
        if invoice_path:
            invoice_s3_key = f"invoices/{Path(invoice_path).name}"
        item = {
            "paymentId": payment_id,
            "userId": user_id,
            "plan": doc.get("plan"),
            "amountPaise": int(doc.get("amountPaise") or 0),
            "currency": doc.get("currency") or "INR",
            "type": doc.get("type") or "order",
            "razorpayOrderId": doc.get("razorpayOrderId"),
            "razorpayPaymentId": doc.get("razorpayPaymentId"),
            "razorpaySignature": doc.get("razorpaySignature"),
            "razorpaySubscriptionId": doc.get("razorpaySubscriptionId"),
            "razorpayInvoiceId": doc.get("razorpayInvoiceId"),
            "status": doc.get("status") or "created",
            "invoiceNumber": doc.get("invoiceNumber"),
            "invoicePath": invoice_path,
            "invoiceS3Key": invoice_s3_key,
            "createdAt": to_iso(doc.get("createdAt")) or now_iso(),
            "updatedAt": to_iso(doc.get("updatedAt")) or now_iso(),
            "migratedFrom": "mongo",
        }
        items.append(item)
    n = batch_write("CosmoPayments", items, dry_run)
    print(f"  CosmoPayments: {n}")
    return n


def migrate_subscriptions(db, dry_run: bool) -> int:
    items = []
    for doc in db.subscriptions.find():
        sub_id = oid(doc["_id"])
        user_id = oid(doc.get("userId"))
        if not sub_id or not user_id:
            continue
        item = {
            "subscriptionId": sub_id,
            "userId": user_id,
            "tier": doc.get("tier"),
            "status": doc.get("status") or "created",
            "razorpaySubscriptionId": doc.get("razorpaySubscriptionId"),
            "razorpayPlanId": doc.get("razorpayPlanId"),
            "currentPeriodStart": to_iso(doc.get("currentPeriodStart")),
            "currentPeriodEnd": to_iso(doc.get("currentPeriodEnd")),
            "cancelAtPeriodEnd": bool(doc.get("cancelAtPeriodEnd")),
            "cancelledAt": to_iso(doc.get("cancelledAt")),
            "source": doc.get("source") or "razorpay",
            "createdAt": to_iso(doc.get("createdAt")) or now_iso(),
            "updatedAt": to_iso(doc.get("updatedAt")) or now_iso(),
            "migratedFrom": "mongo",
        }
        items.append(item)
    n = batch_write("CosmoSubscriptions", items, dry_run)
    print(f"  CosmoSubscriptions: {n}")
    return n


def migrate_plan_configs(db, dry_run: bool) -> int:
    items = []
    for doc in db.planconfigs.find():
        tier = doc.get("tier")
        if not tier:
            continue
        limits = doc.get("limits") or {}
        item = {
            "tier": tier,
            "name": doc.get("name"),
            "description": doc.get("description"),
            "amountPaise": int(doc.get("amountPaise") or 0),
            "limits": {
                "monthlyApplies": int(limits.get("monthlyApplies") or 0),
                "monthlyScans": int(limits.get("monthlyScans") or 0),
                "appliesPerHour": int(limits.get("appliesPerHour") or 0),
                "appliesPerDay": int(limits.get("appliesPerDay") or 0),
            },
            "razorpayPlanId": doc.get("razorpayPlanId"),
            "active": bool(doc.get("active", True)),
            "createdAt": to_iso(doc.get("createdAt")) or now_iso(),
            "updatedAt": to_iso(doc.get("updatedAt")) or now_iso(),
            "migratedFrom": "mongo",
        }
        items.append(item)
    n = batch_write("CosmoPlanConfigs", items, dry_run)
    print(f"  CosmoPlanConfigs: {n}")
    return n


def migrate_audit(db, dry_run: bool) -> int:
    items = []
    for doc in db.adminauditlogs.find():
        audit_id = oid(doc["_id"])
        created = to_iso(doc.get("createdAt")) or now_iso()
        item = {
            "auditId": audit_id,
            "entityType": "admin",  # matches CreatedAtIndex usage
            "adminId": oid(doc.get("adminId")),
            "action": doc.get("action"),
            "targetType": doc.get("targetType"),
            "targetId": oid(doc.get("targetId")) if doc.get("targetId") else doc.get("targetId"),
            "before": doc.get("before"),
            "after": doc.get("after"),
            "ip": doc.get("ip"),
            "createdAt": created,
            "migratedFrom": "mongo",
        }
        items.append(item)
    n = batch_write("CosmoAdminAudit", items, dry_run)
    print(f"  CosmoAdminAudit: {n}")
    return n


def is_applied(doc: Dict[str, Any]) -> bool:
    meta = doc.get("metadata") or {}
    if meta.get("skipped") is True:
        return False
    return doc.get("status") == "applied" or meta.get("source") == "auto_apply"


def rebuild_apply_counters(db, dry_run: bool) -> int:
    """Rebuild CosmoApplyCounters from applied applications (IST day/month/hour)."""
    counters: Dict[tuple, int] = {}
    for doc in db.applications.find():
        if not is_applied(doc):
            continue
        user_id = oid(doc.get("userId"))
        if not user_id:
            continue
        ts = doc.get("appliedAt") or doc.get("createdAt")
        if not isinstance(ts, datetime):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        local = ts.astimezone(IST)
        day_key = f"day#{local.strftime('%Y-%m-%d')}"
        month_key = f"month#{local.strftime('%Y-%m')}"
        hour_key = f"hour#{local.strftime('%Y-%m-%d')}T{local.strftime('%H')}"
        for pk in (day_key, month_key, hour_key):
            counters[(user_id, pk)] = counters.get((user_id, pk), 0) + 1

    items = [
        {
            "userId": uid,
            "periodKey": pk,
            "count": Decimal(count),
            "updatedAt": now_iso(),
            "migratedFrom": "mongo",
        }
        for (uid, pk), count in counters.items()
    ]
    n = batch_write("CosmoApplyCounters", items, dry_run)
    print(f"  CosmoApplyCounters: {n}")
    return n


def migrate_invoices(db, dry_run: bool) -> int:
    uploaded = 0
    missing = 0
    for doc in db.payments.find({"invoicePath": {"$exists": True, "$ne": None}}):
        path = doc.get("invoicePath")
        if not path:
            continue
        name = Path(path).name
        key = f"invoices/{name}"
        local = Path(path)
        if not local.is_file():
            # try repo-relative storage
            local = LOCAL_INVOICE_DIR / name
        if not local.is_file():
            missing += 1
            continue
        if dry_run:
            uploaded += 1
            continue
        s3.upload_file(
            str(local),
            INVOICES_BUCKET,
            key,
            ExtraArgs={"ContentType": "application/pdf"},
        )
        uploaded += 1
    print(f"  invoices S3: uploaded={uploaded} missing={missing} bucket={INVOICES_BUCKET}")
    return uploaded


def ddb_count(table_name: str) -> int:
    table = dynamodb.Table(table_name)
    total = 0
    scan_kwargs: Dict[str, Any] = {"Select": "COUNT"}
    while True:
        res = table.scan(**scan_kwargs)
        total += int(res.get("Count") or 0)
        if not res.get("LastEvaluatedKey"):
            break
        scan_kwargs["ExclusiveStartKey"] = res["LastEvaluatedKey"]
    return total


def verify(db) -> None:
    mapping = [
        ("users", "CosmoUsers"),
        ("applications", "CosmoApplications"),
        ("activities", "CosmoActivities"),
        ("scansessions", "CosmoScanSessions"),
        ("payments", "CosmoPayments"),
        ("subscriptions", "CosmoSubscriptions"),
        ("planconfigs", "CosmoPlanConfigs"),
        ("adminauditlogs", "CosmoAdminAudit"),
    ]
    print("Verify Mongo vs DynamoDB counts:")
    for mongo_name, table in mapping:
        m = db[mongo_name].estimated_document_count()
        d = ddb_count(table)
        flag = "OK" if m == d else "DIFF"
        print(f"  {flag} {mongo_name}: mongo={m} dynamo={d}")
    print(f"  CosmoApplyCounters: dynamo={ddb_count('CosmoApplyCounters')}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--invoices-only", action="store_true")
    args = parser.parse_args()

    if not any([args.dry_run, args.full, args.verify, args.invoices_only]):
        parser.print_help()
        return 2

    mongo_uri = os.environ.get("MONGO_URI")
    if not mongo_uri:
        print("MONGO_URI is required", file=sys.stderr)
        return 1

    print(f"Region={REGION} bucket={INVOICES_BUCKET} dry_run={args.dry_run}")
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=15000)
    db = client.get_default_database()
    print(f"Mongo db={db.name}")

    if args.verify:
        verify(db)
        return 0

    if args.invoices_only:
        migrate_invoices(db, args.dry_run)
        return 0

    # dry-run or full
    print("Migrating collections...")
    migrate_users(db, args.dry_run)
    migrate_applications(db, args.dry_run)
    migrate_activities(db, args.dry_run)
    migrate_scan_sessions(db, args.dry_run)
    migrate_payments(db, args.dry_run)
    migrate_subscriptions(db, args.dry_run)
    migrate_plan_configs(db, args.dry_run)
    migrate_audit(db, args.dry_run)
    rebuild_apply_counters(db, args.dry_run)
    migrate_invoices(db, args.dry_run)

    if args.full and not args.dry_run:
        print("\nPost-migrate verify:")
        verify(db)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
