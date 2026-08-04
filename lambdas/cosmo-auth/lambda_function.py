"""
Paste into AWS Lambda → Code → lambda_function.py for: cosmo-auth
Handler: lambda_function.lambda_handler
Runtime: Python 3.14 (python3.14)

Tables:
  CosmoUsers  PK=email  GSI UserIdIndex (userId), GoogleIdIndex (googleId)
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import boto3
from boto3.dynamodb.conditions import Key

USERS_TABLE = os.environ.get("USERS_TABLE", "CosmoUsers")
JWT_ACCESS_SECRET = os.environ.get("JWT_ACCESS_SECRET", "dev-access-secret-change-me")
JWT_REFRESH_SECRET = os.environ.get("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me")
JWT_ACCESS_EXPIRES = int(os.environ.get("JWT_ACCESS_EXPIRES_IN", "900"))
JWT_REFRESH_EXPIRES = int(os.environ.get("JWT_REFRESH_EXPIRES_IN", "604800"))
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
}
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
CORS_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.environ.get("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

dynamodb = boto3.resource("dynamodb")
users_tbl = dynamodb.Table(USERS_TABLE)

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


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


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
    expected = b64url_encode(
        hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(expected, s):
        raise ValueError("bad signature")
    payload = json.loads(b64url_decode(p))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("expired")
    return payload


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"pbkdf2:{salt}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored:
        return False
    if stored.startswith("pbkdf2:"):
        _, salt, hexdigest = stored.split(":", 2)
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), 120_000
        )
        return hmac.compare_digest(digest.hex(), hexdigest)
    # Migrated Mongo bcrypt hashes ($2a$ / $2b$)
    if stored.startswith("$2a$") or stored.startswith("$2b$") or stored.startswith("$2y$"):
        try:
            import bcrypt  # bundled in Lambda zip

            return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def is_admin_email(email: str) -> bool:
    return email.lower() in ADMIN_EMAILS


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    res = users_tbl.get_item(Key={"email": email.lower()})
    return res.get("Item")


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    res = users_tbl.query(
        IndexName="UserIdIndex",
        KeyConditionExpression=Key("userId").eq(user_id),
        Limit=1,
    )
    items = res.get("Items") or []
    return items[0] if items else None


def get_user_by_google_id(google_id: str) -> Optional[Dict[str, Any]]:
    res = users_tbl.query(
        IndexName="GoogleIdIndex",
        KeyConditionExpression=Key("googleId").eq(google_id),
        Limit=1,
    )
    items = res.get("Items") or []
    return items[0] if items else None


def public_user(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": item.get("userId"),
        "email": item.get("email"),
        "name": item.get("name"),
        "role": item.get("role") or "user",
        "status": item.get("status") or "active",
        "plan": item.get("plan") or "free",
        "planExpiresAt": item.get("planExpiresAt"),
        "createdAt": item.get("createdAt"),
        "extensionConnectedAt": item.get("extensionConnectedAt"),
    }


def ensure_admin_role(item: Dict[str, Any]) -> str:
    email = (item.get("email") or "").lower()
    role = item.get("role") or "user"
    if is_admin_email(email) and role != "admin":
        users_tbl.update_item(
            Key={"email": email},
            UpdateExpression="SET #r = :r",
            ExpressionAttributeNames={"#r": "role"},
            ExpressionAttributeValues={":r": "admin"},
        )
        return "admin"
    return role


def issue_tokens(event: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
    if (item.get("status") or "active") == "suspended":
        return err(event, "Account suspended", 403, "ACCOUNT_SUSPENDED")

    role = ensure_admin_role(item)
    payload = {"sub": item["userId"], "email": item["email"], "role": role}
    access = sign_jwt(payload, JWT_ACCESS_SECRET, JWT_ACCESS_EXPIRES)
    refresh = sign_jwt(payload, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES)
    users_tbl.update_item(
        Key={"email": item["email"]},
        UpdateExpression="SET refreshTokenHash = :h, #r = :r, updatedAt = :u",
        ExpressionAttributeNames={"#r": "role"},
        ExpressionAttributeValues={
            ":h": hash_token(refresh),
            ":r": role,
            ":u": now_iso(),
        },
    )
    user = public_user({**item, "role": role})
    return ok(
        event,
        {"accessToken": access, "refreshToken": refresh, "user": user},
        "Authenticated",
    )


def bearer_payload(event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    headers = event.get("headers") or {}
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    try:
        return verify_jwt(auth[7:], JWT_ACCESS_SECRET)
    except Exception:
        return None


def register(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip() or (email.split("@")[0] if email else "")
    if not email or not password or not name:
        return err(event, "email, password, and name are required", 400, "VALIDATION_ERROR")
    if not is_admin_email(email):
        return err(
            event,
            "Account creation is via Google sign-in",
            403,
            "USE_GOOGLE_SIGN_IN",
        )
    if get_user_by_email(email):
        return err(event, "Email already registered", 409, "EMAIL_EXISTS")

    item = {
        "email": email,
        "userId": str(uuid.uuid4()),
        "name": name,
        "passwordHash": hash_password(password),
        "role": "admin",
        "status": "active",
        "plan": "free",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    users_tbl.put_item(Item=item)
    return issue_tokens(event, item)


def login(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    item = get_user_by_email(email)
    if not item:
        return err(event, "Invalid credentials", 401, "INVALID_CREDENTIALS")
    if not item.get("passwordHash"):
        return err(
            event,
            "This account uses Google sign-in. Continue with Google instead.",
            401,
            "USE_GOOGLE_SIGN_IN",
        )
    if not verify_password(password, item["passwordHash"]):
        return err(event, "Invalid credentials", 401, "INVALID_CREDENTIALS")
    if (item.get("status") or "active") == "suspended":
        return err(event, "Account suspended", 403, "ACCOUNT_SUSPENDED")
    return issue_tokens(event, item)


def _google_exchange_code(code: str) -> Dict[str, Any]:
    data = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": "postmessage",
            "grant_type": "authorization_code",
        }
    ).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def _google_verify_id_token(id_token: str) -> Dict[str, Any]:
    url = (
        "https://oauth2.googleapis.com/tokeninfo?"
        + urllib.parse.urlencode({"id_token": id_token})
    )
    with urllib.request.urlopen(url, timeout=15) as resp:
        payload = json.loads(resp.read().decode())
    if payload.get("aud") != GOOGLE_CLIENT_ID:
        raise ValueError("aud mismatch")
    return payload


def login_with_google(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return err(event, "Google sign-in is not configured", 503, "GOOGLE_NOT_CONFIGURED")
    code = body.get("code") or ""
    if not code:
        return err(event, "code is required", 400, "VALIDATION_ERROR")
    try:
        tokens = _google_exchange_code(code)
        id_token = tokens.get("id_token")
        if not id_token:
            return err(event, "Google sign-in failed", 401, "GOOGLE_AUTH_FAILED")
        payload = _google_verify_id_token(id_token)
    except (urllib.error.URLError, ValueError, json.JSONDecodeError):
        return err(event, "Google sign-in failed", 401, "GOOGLE_AUTH_FAILED")

    google_id = payload.get("sub")
    email = (payload.get("email") or "").lower()
    email_verified = str(payload.get("email_verified")).lower() in ("true", "1")
    name = (
        (payload.get("name") or "").strip()
        or " ".join(
            filter(None, [payload.get("given_name"), payload.get("family_name")])
        ).strip()
        or (email.split("@")[0] if email else "Google user")
    )
    if not google_id or not email or not email_verified:
        return err(event, "Google account email is not verified", 401, "GOOGLE_AUTH_FAILED")
    if is_admin_email(email):
        return err(
            event,
            "Admin accounts must sign in with email and password at /admin/login",
            403,
            "USE_PASSWORD_SIGN_IN",
        )

    item = get_user_by_google_id(google_id) or get_user_by_email(email)
    if item and (item.get("role") or "user") == "admin":
        return err(
            event,
            "Admin accounts must sign in with email and password at /admin/login",
            403,
            "USE_PASSWORD_SIGN_IN",
        )

    if item:
        if item.get("googleId") and item["googleId"] != google_id:
            return err(event, "Email already registered", 409, "EMAIL_EXISTS")
        if not item.get("googleId"):
            users_tbl.update_item(
                Key={"email": item["email"]},
                UpdateExpression="SET googleId = :g, updatedAt = :u",
                ExpressionAttributeValues={":g": google_id, ":u": now_iso()},
            )
            item["googleId"] = google_id
    else:
        item = {
            "email": email,
            "userId": str(uuid.uuid4()),
            "googleId": google_id,
            "name": name,
            "role": "user",
            "status": "active",
            "plan": "free",
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        users_tbl.put_item(Item=item)

    return issue_tokens(event, item)


def refresh(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    token = body.get("refreshToken") or ""
    if not token:
        return err(event, "refreshToken is required", 400, "VALIDATION_ERROR")
    try:
        payload = verify_jwt(token, JWT_REFRESH_SECRET)
    except Exception:
        return err(event, "Invalid refresh token", 401, "TOKEN_INVALID")
    item = get_user_by_id(payload.get("sub", ""))
    if not item or not item.get("refreshTokenHash"):
        return err(event, "Invalid refresh token", 401, "TOKEN_INVALID")
    if not hmac.compare_digest(item["refreshTokenHash"], hash_token(token)):
        return err(event, "Invalid refresh token", 401, "TOKEN_INVALID")
    return issue_tokens(event, item)


def logout(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    payload = bearer_payload(event)
    if payload:
        item = get_user_by_id(payload.get("sub", ""))
        if item:
            users_tbl.update_item(
                Key={"email": item["email"]},
                UpdateExpression="REMOVE refreshTokenHash SET updatedAt = :u",
                ExpressionAttributeValues={":u": now_iso()},
            )
        return ok(event, {}, "Logged out")

    token = body.get("refreshToken") or ""
    if token:
        try:
            payload = verify_jwt(token, JWT_REFRESH_SECRET)
            item = get_user_by_id(payload.get("sub", ""))
            if item and item.get("refreshTokenHash"):
                if hmac.compare_digest(item["refreshTokenHash"], hash_token(token)):
                    users_tbl.update_item(
                        Key={"email": item["email"]},
                        UpdateExpression="REMOVE refreshTokenHash SET updatedAt = :u",
                        ExpressionAttributeValues={":u": now_iso()},
                    )
        except Exception:
            pass
    return ok(event, {}, "Logged out")


def me(event: Dict[str, Any]) -> Dict[str, Any]:
    payload = bearer_payload(event)
    if not payload:
        return err(event, "Unauthorized", 401, "UNAUTHORIZED")
    item = get_user_by_id(payload.get("sub", ""))
    if not item:
        return err(event, "User not found", 404, "NOT_FOUND")
    role = ensure_admin_role(item)
    return ok(event, public_user({**item, "role": role}))


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
    if action == "register":
        return register(event, body)
    if action == "login":
        return login(event, body)
    if action == "google":
        return login_with_google(event, body)
    if action == "refresh":
        return refresh(event, body)
    if action == "logout":
        return logout(event, body)
    if action == "me":
        return me(event)

    # REST routing
    if path.endswith("/auth/register") and method == "POST":
        return register(event, body)
    if path.endswith("/auth/login") and method == "POST":
        return login(event, body)
    if path.endswith("/auth/google") and method == "POST":
        return login_with_google(event, body)
    if path.endswith("/auth/refresh") and method == "POST":
        return refresh(event, body)
    if path.endswith("/auth/logout") and method == "POST":
        return logout(event, body)
    if path.endswith("/auth/me") and method == "GET":
        return me(event)

    return err(event, f"Unknown route: {method} {path}", 404, "NOT_FOUND")
