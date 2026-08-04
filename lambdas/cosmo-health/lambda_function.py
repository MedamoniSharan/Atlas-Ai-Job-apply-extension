"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-health
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoUsers  (optional ping via describe_table)
"""

import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict

import boto3

USERS_TABLE = os.environ.get("USERS_TABLE", "CosmoUsers")
dynamodb = boto3.client("dynamodb")

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


def response(status: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status,
        "headers": CORS,
        "body": json.dumps(body, default=_json_default),
    }


def ok(data: Any, message: str = "Operation completed") -> Dict[str, Any]:
    return response(200, {"success": True, "message": message, "data": data, "error": None})


def err(msg: str, status: int = 400, code: str = "ERROR") -> Dict[str, Any]:
    return response(
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


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    if http_method(event) == "OPTIONS":
        return ok({})

    path = path_of(event)
    if http_method(event) != "GET":
        return err("Method not allowed", 405, "METHOD_NOT_ALLOWED")

    if path in ("/health", "/api/v1/health", "/api/v1/health/"):
        db_ok = False
        try:
            dynamodb.describe_table(TableName=USERS_TABLE)
            db_ok = True
        except Exception:
            db_ok = False

        return ok(
            {
                "status": "ok" if db_ok else "degraded",
                "dynamodb": db_ok,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "Server is healthy" if db_ok else "API up; DynamoDB unreachable",
        )

    action = (event.get("action") or "").strip()
    if action == "health":
        return ok({"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()})

    return err(f"Unknown path: {path}", 404, "NOT_FOUND")
