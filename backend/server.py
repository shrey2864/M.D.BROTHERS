from dotenv import load_dotenv
from pathlib import Path
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi.responses import StreamingResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import csv
import io
import time
import uuid
import random
import logging
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import bcrypt
import jwt
import httpx
import requests
import asyncio
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"

# ---------------- Object storage (KYC documents) - Cloudinary ----------------
import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)
APP_NAME = "mdbrothers"


def put_object(path: str, data: bytes, content_type: str) -> dict:
    result = cloudinary.uploader.upload(
        data,
        public_id=path,
        resource_type="raw",
        overwrite=True,
    )
    return {"path": result["secure_url"]}

def get_object(path: str):
    resp = requests.get(path, timeout=60)
    resp.raise_for_status()
    return resp.content, "application/octet-stream"
# ---------------- Email (Resend) ----------------
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "M.D. Brothers")
EMAIL_FROM_ADDRESS = os.environ.get("EMAIL_FROM_ADDRESS", "onboarding@resend.dev")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
OWNER_EMAIL = os.environ.get("OWNER_EMAIL")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []
        


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: Optional[str] = None) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {
        "from": f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDRESS}>",
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to or EMAIL_REPLY_TO:
        payload["reply_to"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client_http:
            resp = await client_http.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


# ---------------- Auth ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_reset_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(minutes=30), "type": "reset"}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user_id: str, email: str):
    response.set_cookie("access_token", create_access_token(user_id, email), httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user_id), httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "role": user.get("role", "buyer"),
        "company": user.get("company"),
        "kyc_name": user.get("kyc_name"),
        "mobile": user.get("mobile"),
        "business_type": user.get("business_type"),
        "kyc_doc_name": user.get("kyc_doc_name"),
        "has_kyc_doc": bool(user.get("kyc_doc_path")),
        "status": user.get("status", "approved" if user.get("role") == "admin" else "pending"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_approved(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") == "admin" or user.get("status") == "approved":
        return user
    raise HTTPException(status_code=403, detail="Account pending approval")


class RegisterBody(BaseModel):
    name: str
    email: EmailStr
    password: str
    company: str
    kyc_name: str
    mobile: str
    business_type: str = "owner"


class LoginBody(BaseModel):
    email: EmailStr
    password: str


@api_router.post("/auth/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "user_id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "email": email,
        "company": body.company.strip(),
        "kyc_name": body.kyc_name.strip(),
        "mobile": body.mobile.strip(),
        "business_type": body.business_type,
        "password_hash": hash_password(body.password),
        "role": "buyer",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    set_auth_cookies(response, user["user_id"], email)
    return public_user(user)


@api_router.post("/auth/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower()
    identifier = f"{request.client.host if request.client else 'unknown'}:{email}"
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5 and time.time() - attempts.get("ts", 0) < 900:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"ts": time.time()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    if user.get("role") == "portal_pending":
            raise HTTPException(status_code=403, detail="Your access request is waiting for admin approval")
    set_auth_cookies(response, user["user_id"], email)
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"status": "logged_out"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    response.set_cookie("access_token", create_access_token(user["user_id"], user["email"]), httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"status": "refreshed"}

class ForgotPasswordBody(BaseModel):
    email: EmailStr


@api_router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user and RESEND_API_KEY:
        reset_token = create_reset_token(user["user_id"])
        reset_url = f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/reset-password?token={reset_token}"
        subject = f"Reset your {EMAIL_FROM_NAME} password"
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111">'
            '<h2 style="margin:0 0 16px">Reset your password</h2>'
            f'<p>Dear {escape(user["name"])},</p>'
            '<p>We received a request to reset your password. This link expires in 30 minutes. '
            'If you did not request this, you can safely ignore this email.</p>'
            f'<p><a href="{escape(reset_url)}" style="display:inline-block;background:#2E7CB8;color:#fff;'
            'padding:12px 28px;text-decoration:none;font-size:13px;letter-spacing:2px">RESET PASSWORD</a></p>'
            f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME)}. '
            'We never ask for your password or card details by email.</p>'
            '</td></tr></table>'
        )
        try:
            await send_email(to=user["email"], subject=subject, html=html)
        except HTTPException:
            logger.error(f"Password reset email failed for {email}")
    return {"status": "sent"}


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str


@api_router.post("/auth/reset-password")
async def reset_password(body: ResetPasswordBody):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        payload = jwt.decode(body.token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "reset":
            raise HTTPException(status_code=400, detail="Invalid reset link")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Reset link has expired, please request a new one")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid reset link")
    result = await db.users.update_one(
        {"user_id": payload["sub"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "reset"}


# ---------------- Diamonds ----------------
SHAPES = ["Round", "Princess", "Oval", "Cushion", "Emerald", "Pear", "Marquise", "Radiant"]
CUTS = ["Excellent", "Very Good", "Good"]
COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N",
          "Fancy Yellow", "Fancy Pink", "Fancy Blue", "Fancy Green", "Fancy Orange", "Fancy Purplish"]
CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"]
DIAMOND_IMAGES = [
    "https://images.unsplash.com/photo-1702149001693-67ca09997ecc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHw0fHxkaWFtb25kJTIwZ2Vtc3RvbmUlMjBjbG9zZSUyMHVwfGVufDB8fHx8MTc4NjYzODA0MXww&ixlib=rb-4.1.0&q=85&w=900",
    "https://images.unsplash.com/photo-1638517747421-a1eb8b4c9828?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHw0fHxkaWFtb25kJTIwY3V0dGluZyUyMHBvbGlzaGluZ3xlbnwwfHx8fDE3ODY2MzgwNDF8MA&ixlib=rb-4.1.0&q=85&w=900",
    "https://images.unsplash.com/photo-1592136184798-ca0d8e17643a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwyfHxkaWFtb25kJTIwY3V0dGluZyUyMHBvbGlzaGluZ3xlbnwwfHx8fDE3ODY2MzgwNDF8MA&ixlib=rb-4.1.0&q=85&w=900",
    "https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwxfHxkaWFtb25kJTIwZ2Vtc3RvbmUlMjBjbG9zZSUyMHVwfGVufDB8fHx8MTc4NjYzODA0MXww&ixlib=rb-4.1.0&q=85&w=900",
]


def build_seed_diamonds() -> List[dict]:
    rng = random.Random(42)
    color_f = {"D": 1.6, "E": 1.45, "F": 1.3, "G": 1.15, "H": 1.0, "I": 0.88, "J": 0.78,
               "K": 0.7, "L": 0.62, "M": 0.55, "N": 0.5,
               "Fancy Yellow": 2.2, "Fancy Pink": 3.2, "Fancy Blue": 3.6, "Fancy Green": 2.8,
               "Fancy Orange": 2.6, "Fancy Purplish": 3.0}
    clarity_f = {"FL": 1.5, "IF": 1.4, "VVS1": 1.3, "VVS2": 1.2, "VS1": 1.1, "VS2": 1.0, "SI1": 0.85,
                 "SI2": 0.75, "SI3": 0.65, "I1": 0.5, "I2": 0.4, "I3": 0.32}
    cut_f = {"Excellent": 1.2, "Very Good": 1.05, "Good": 0.9}
    diamonds = []
    for i in range(36):
        shape = SHAPES[i % len(SHAPES)]
        carat = round(rng.uniform(0.18, 10.0), 2)
        cut = rng.choice(CUTS)
        color = rng.choice(COLORS)
        clarity = rng.choice(CLARITIES)
        price = int(round(carat * 3800 * color_f[color] * clarity_f[clarity] * cut_f[cut] * (1 + carat * 0.35), -1))
        diamonds.append({
            "diamond_id": str(uuid.uuid4()),
            "sku": f"MDB-{1000 + i}",
            "shape": shape,
            "carat": carat,
            "cut": cut,
            "color": color,
            "clarity": clarity,
            "polish": rng.choice(["Excellent", "Very Good"]),
            "symmetry": rng.choice(["Excellent", "Very Good"]),
            "fluorescence": rng.choice(["None", "Faint", "Medium"]),
            "certification": rng.choice(["GIA", "IGI", "HRD"]),
            "price": max(price, 450),
            "image": DIAMOND_IMAGES[i % len(DIAMOND_IMAGES)],
            "featured": i < 4,
            "source": "sample",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    for k in range(0, 8, 2):
        twin = dict(diamonds[k])
        twin["diamond_id"] = str(uuid.uuid4())
        twin["sku"] = f"MDB-{2000 + k}"
        twin["carat"] = round(diamonds[k]["carat"] + 0.01, 2)
        twin["price"] = diamonds[k]["price"] + 120
        twin["featured"] = False
        diamonds.append(twin)
    return diamonds


@api_router.get("/diamonds")
async def list_diamonds(
    request: Request,
    shape: Optional[str] = None,
    cut: Optional[str] = None,
    color: Optional[str] = None,
    clarity: Optional[str] = None,
    min_carat: Optional[float] = None,
    max_carat: Optional[float] = None,
    carat_ranges: Optional[str] = None,
    fluorescence: Optional[str] = None,
    lab: Optional[str] = None,
    polish: Optional[str] = None,
    symmetry: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = "featured",
    limit: int = Query(default=60, le=200),
):
    user = await get_optional_user(request)
    can_see_price = bool(user) and (user.get("role") == "admin" or user.get("status") == "approved")

    query = {}
    if shape:
        query["shape"] = {"$in": shape.split(",")}
    if cut:
        query["cut"] = {"$in": cut.split(",")}
    if color:
        vals = color.split(",")
        conds = []
        plain = [v for v in vals if v not in ("O-Z", "Fancy")]
        if plain:
            conds.append({"color": {"$in": plain}})
        if "O-Z" in vals:
            conds.append({"color": {"$regex": "^[O-Z]"}})
        if "Fancy" in vals:
            conds.append({"color": {"$regex": "^Fancy"}})
        if len(conds) == 1:
            query["color"] = conds[0]["color"]
        elif conds:
            query["$or"] = conds
    if clarity:
        query["clarity"] = {"$in": clarity.split(",")}
    if fluorescence:
        query["fluorescence"] = {"$in": fluorescence.split(",")}
    if polish:
        query["polish"] = {"$in": polish.split(",")}
    if symmetry:
        query["symmetry"] = {"$in": symmetry.split(",")}
    if lab:
        query["certification"] = {"$in": lab.split(",")}
    if carat_ranges:
        or_conds = []
        for part in carat_ranges.split(","):
            try:
                lo, hi = part.split("-")
                or_conds.append({"carat": {"$gte": float(lo), "$lte": float(hi)}})
            except (ValueError, AttributeError):
                continue
        if or_conds:
            query.setdefault("$and", []).append({"$or": or_conds})
    elif min_carat is not None or max_carat is not None:
        query["carat"] = {}
        if min_carat is not None:
            query["carat"]["$gte"] = min_carat
        if max_carat is not None:
            query["carat"]["$lte"] = max_carat
    if q:
        query["$or"] = [
            {"sku": {"$regex": re.escape(q), "$options": "i"}},
            {"certificate_number": {"$regex": re.escape(q), "$options": "i"}},
        ]
    sort_map = {
        "price_asc": [("price", 1)],
        "price_desc": [("price", -1)],
        "carat_desc": [("carat", -1)],
        "carat_asc": [("carat", 1)],
        "newest": [("created_at", -1)],
        "featured": [("featured", -1), ("carat", -1)],
    }
    cursor = db.diamonds.find(query, {"_id": 0}).sort(sort_map.get(sort, sort_map["featured"])).limit(limit)
    items = await cursor.to_list(limit)
    total = await db.diamonds.count_documents(query)

    if not can_see_price:
        for d in items:
            d.pop("price", None)

    return {"items": items, "total": total, "prices_visible": can_see_price}


@api_router.get("/diamonds/{diamond_id}")
async def get_diamond(diamond_id: str, request: Request):
    d = await db.diamonds.find_one({"diamond_id": diamond_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Diamond not found")
    user = await get_optional_user(request)
    can_see_price = bool(user) and (user.get("role") == "admin" or user.get("status") == "approved")
    if not can_see_price:
        d.pop("price", None)
    return d
@api_router.get("/match-pairs")
async def match_pairs(
    shape: Optional[str] = None,
    min_carat: Optional[float] = None,
    max_carat: Optional[float] = None,
    color: Optional[str] = None,
    clarity: Optional[str] = None,
    lab: Optional[str] = None,
    limit: int = Query(default=200, le=500),
    user: dict = Depends(require_approved),
):
    query = {}
    if shape:
        query["shape"] = shape
    if color:
        if color == "Fancy":
            query["color"] = {"$regex": "^Fancy"}
        elif color == "O-Z":
            query["color"] = {"$regex": "^[O-Z]"}
        else:
            query["color"] = color
    if clarity:
        query["clarity"] = clarity
    if lab:
        query["certification"] = lab
    if min_carat is not None or max_carat is not None:
        query["carat"] = {}
        if min_carat is not None:
            query["carat"]["$gte"] = min_carat
        if max_carat is not None:
            query["carat"]["$lte"] = max_carat

    stones = await db.diamonds.find(query, {"_id": 0}).sort("carat", 1).limit(limit).to_list(limit)
    groups = {}
    for d in stones:
        groups.setdefault((d["shape"], d["color"], d["clarity"]), []).append(d)

    pairs = []
    for stones_group in groups.values():
        stones_group.sort(key=lambda x: x["carat"])
        used = set()
        for i in range(len(stones_group)):
            if i in used:
                continue
            for j in range(i + 1, len(stones_group)):
                if j in used:
                    continue
                diff = abs(stones_group[i]["carat"] - stones_group[j]["carat"])
                if diff <= max(0.03, 0.02 * stones_group[j]["carat"]):
                    pairs.append({
                        "a": stones_group[i],
                        "b": stones_group[j],
                        "total_carat": round(stones_group[i]["carat"] + stones_group[j]["carat"], 2),
                        "carat_diff": round(diff, 2),
                        "total_price": stones_group[i].get("price", 0) + stones_group[j].get("price", 0),
                    })
                    used.add(i)
                    used.add(j)
                    break
    pairs.sort(key=lambda p: p["total_carat"], reverse=True)
    return {"pairs": pairs[:24], "total": len(pairs)}


@api_router.get("/diamonds/{diamond_id}")
async def get_diamond(diamond_id: str, user: dict = Depends(require_approved)):
    d = await db.diamonds.find_one({"diamond_id": diamond_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Diamond not found")
    return d


@api_router.get("/dashboard")
async def get_dashboard(user: dict = Depends(require_approved)):
    total = await db.diamonds.count_documents({})
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_goods = await db.diamonds.count_documents({"created_at": {"$gte": week_ago}})
    featured = await db.diamonds.find({"featured": True}, {"_id": 0}).sort("carat", -1).limit(3).to_list(3)
    latest = await db.diamonds.find({}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6)
    my_enquiries = await db.enquiries.count_documents({"email": user["email"]})
    return {
        "total_stones": total,
        "new_goods": new_goods,
        "featured_count": await db.diamonds.count_documents({"featured": True}),
        "my_enquiries": my_enquiries,
        "featured": featured,
        "latest": latest,
    }


# ---------------- Admin inventory ----------------
class DiamondBody(BaseModel):
    sku: str
    shape: str
    carat: float
    cut: str
    color: str
    clarity: str
    price: float
    polish: str = "Excellent"
    symmetry: str = "Excellent"
    fluorescence: str = "None"
    certification: str = "GIA"
    image: Optional[str] = None
    video_url: Optional[str] = None
    certificate_url: Optional[str] = None
    featured: bool = False


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


class UserStatusBody(BaseModel):
    status: str


@api_router.get("/admin/users")
async def admin_list_users(user: dict = Depends(require_admin)):
    users = await db.users.find({"role": "buyer"}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return {"items": users, "total": len(users)}


@api_router.post("/users/kyc-document")
async def upload_kyc_document(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if file.content_type != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File must be under 10 MB")
    path = f"{APP_NAME}/kyc/{user['user_id']}/{uuid.uuid4()}.pdf"
    try:
        result = await asyncio.to_thread(put_object, path, data, "application/pdf")
    except Exception as e:
        logger.error(f"KYC upload failed: {e}")
        raise HTTPException(status_code=502, detail="File storage unavailable, try again")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"kyc_doc_path": result["path"], "kyc_doc_name": file.filename}},
    )
    return {"status": "uploaded", "filename": file.filename}


@api_router.get("/users/kyc-document/{user_id}")
async def download_kyc_document(user_id: str, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target or not target.get("kyc_doc_path"):
        raise HTTPException(status_code=404, detail="No KYC document uploaded")
    try:
        data, content_type = await asyncio.to_thread(get_object, target["kyc_doc_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="KYC-{target.get("kyc_name") or target["name"]}.pdf"'},
    )


@api_router.post("/admin/users/{user_id}/status")
async def admin_set_user_status(user_id: str, body: UserStatusBody, user: dict = Depends(require_admin)):
    if body.status not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"status": body.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    email_sent = False
    if body.status == "approved":
        buyer = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if buyer and RESEND_API_KEY:
            login_url = f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/login"
            subject = f"Your {EMAIL_FROM_NAME} trade account is approved"
            html = (
                '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111">'
                f'<h2 style="margin:0 0 16px">Welcome to {escape(EMAIL_FROM_NAME)}</h2>'
                f'<p>Dear {escape(buyer["name"])},</p>'
                f'<p>Your trade account for <strong>{escape(buyer.get("company") or "your company")}</strong> has been '
                'verified and approved by our team.</p>'
                '<p>You can now sign in to explore our full live inventory, view trade pricing, '
                'and send enquiries directly from any stone.</p>'
                f'<p><a href="{escape(login_url)}" style="display:inline-block;background:#2E7CB8;color:#fff;'
                'padding:12px 28px;text-decoration:none;font-size:13px;letter-spacing:2px">SIGN IN TO YOUR ACCOUNT</a></p>'
                f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME)}. '
                'We never ask for your password or card details by email.</p>'
                '</td></tr></table>'
            )
            try:
                await send_email(to=buyer["email"], subject=subject, html=html)
                email_sent = True
            except HTTPException:
                logger.error(f"Approval email failed for {buyer['email']}")
    return {"status": body.status, "email_sent": email_sent}


@api_router.post("/diamonds")
async def create_diamond(body: DiamondBody, user: dict = Depends(require_admin)):
    if await db.diamonds.find_one({"sku": body.sku}):
        raise HTTPException(status_code=400, detail="SKU already exists")
    doc = body.model_dump()
    doc["diamond_id"] = str(uuid.uuid4())
    doc["image"] = doc["image"] or DIAMOND_IMAGES[0]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.diamonds.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/diamonds/{diamond_id}")
async def update_diamond(diamond_id: str, body: DiamondBody, user: dict = Depends(require_admin)):
    doc = body.model_dump()
    if not doc.get("image"):
        doc["image"] = DIAMOND_IMAGES[0]
    result = await db.diamonds.update_one({"diamond_id": diamond_id}, {"$set": doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Diamond not found")
    return await db.diamonds.find_one({"diamond_id": diamond_id}, {"_id": 0})


@api_router.delete("/diamonds/{diamond_id}")
async def delete_diamond(diamond_id: str, user: dict = Depends(require_admin)):
    result = await db.diamonds.delete_one({"diamond_id": diamond_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Diamond not found")
    return {"status": "deleted"}


# ---------------- Stock feed sync ----------------
class StockFeedBody(BaseModel):
    url: str
    api_key: Optional[str] = None


@api_router.get("/stock-feed")
async def get_stock_feed(user: dict = Depends(require_admin)):
    s = await db.settings.find_one({"key": "stock_feed"}, {"_id": 0, "api_key": 0})
    return s or {"url": None, "last_sync": None}


@api_router.post("/stock-feed")
async def save_stock_feed(body: StockFeedBody, user: dict = Depends(require_admin)):
    await db.settings.update_one(
        {"key": "stock_feed"},
        {"$set": {"key": "stock_feed", "url": body.url, "api_key": body.api_key}},
        upsert=True,
    )
    return {"status": "saved"}


def _pick(rec: dict, *keys):
    norm = {str(k).lower().replace(" ", "_").replace("-", "_"): v for k, v in rec.items()}
    for k in keys:
        v = norm.get(k)
        if v not in (None, "", "-"):
            return v
    return None

SHAPE_MAP = {
    "RD": "Round", "RND": "Round", "ROUND": "Round",
    "PR": "Princess", "PRN": "Princess",
    "OV": "Oval",
    "CU": "Cushion", "CUS": "Cushion",
    "EM": "Emerald",
    "PE": "Pear", "PER": "Pear",
    "MQ": "Marquise", "MAR": "Marquise",
    "RAD": "Radiant",
    "HT": "Heart",
    "AS": "Asscher",
    "CB": "Cushion Brilliant",
}
GRADE_MAP = {
    "EX": "Excellent", "EXCELLENT": "Excellent", "EXC": "Excellent",
    "VG": "Very Good", "VERY GOOD": "Very Good",
    "GD": "Good", "GOOD": "Good",
    "FR": "Fair", "FAIR": "Fair",
    "PR": "Poor", "POOR": "Poor",
}
FLUORESCENCE_MAP = {
    "NON": "None", "NONE": "None", "N": "None",
    "FNT": "Faint", "FAINT": "Faint", "F": "Faint",
    "SLT": "Faint",
    "MED": "Medium", "MEDIUM": "Medium", "M": "Medium",
    "STG": "Strong", "STRONG": "Strong", "S": "Strong",
    "VST": "Very Strong",
}
def _build_cert_url(lab: str, report_no) -> Optional[str]:
    if not report_no:
        return None
    num = re.sub(r"[^0-9]", "", str(report_no))
    if not num:
        return None
    if lab == "GIA":
        return f"https://www.gia.edu/report-check?reportno={num}"
    if lab == "IGI":
        return f"https://www.igi.org/verify-your-report/?r={num}"
    if lab == "HRD":
        return f"https://my.hrdantwerp.com/en/verify-report?number={num}"
    return None
def _to_float(v):
    try:
        return float(str(v).replace(",", "").replace("$", "").strip())
    except (ValueError, TypeError, AttributeError):
        return None


def map_feed_record(rec: dict) -> Optional[dict]:
    sku = _pick(rec, "sku", "stock_id", "stock_no", "stock_number", "stock", "id", "ref", "reference", "packet_no", "stone_id")
    shape = _pick(rec, "shape", "shape_name")
    carat = _to_float(_pick(rec, "carat", "carats", "weight", "cts", "size", "carat_weight"))
    if not sku or not shape or carat is None:
        return None
    doc = {
        "sku": str(sku).strip(),
        "shape": SHAPE_MAP.get(str(shape).strip().upper(), str(shape).strip().capitalize()),
        "carat": round(carat, 2),
        "cut": GRADE_MAP.get(str(_pick(rec, "cut", "cut_grade") or "Excellent").strip().upper(), "Excellent"),
        "color": str(_pick(rec, "color", "colour", "col") or "G").strip().upper(),
        "clarity": str(_pick(rec, "clarity", "clar", "purity") or "VS1").strip().upper(),
        "polish": GRADE_MAP.get(str(_pick(rec, "polish", "pol") or "Excellent").strip().upper(), "Excellent"),
        "symmetry": GRADE_MAP.get(str(_pick(rec, "symmetry", "sym", "symm") or "Excellent").strip().upper(), "Excellent"),
        "fluorescence": FLUORESCENCE_MAP.get(str(_pick(rec, "fluorescence", "fluor", "fluo", "fls") or "None").strip().upper(), "None"),
        "certification": str(_pick(rec, "certification", "certificate", "lab", "cert") or "GIA").strip().upper(),
        "certificate_number": str(_pick(rec, "certificate_number", "cert_no", "cert_number", "report_no", "inscription", "certno") or "").strip(),
        "image": _pick(rec, "image", "image_url", "photo", "picture", "img", "image_link") or DIAMOND_IMAGES[0],
        "video_url": _pick(rec, "video", "video_url", "video_link"),
        "certificate_url": _build_cert_url(
            str(_pick(rec, "certification", "certificate", "lab", "cert") or "GIA").strip().upper(),
            _pick(rec, "report_no", "certificate_number", "cert_no", "cert_number", "inscription", "certno"),
        ),
        "source": "feed",
    }
    price = _to_float(_pick(rec, "price", "price_usd", "total_price", "amount", "value", "total", "rate", "net_value"))
    if price is not None:
        doc["price"] = price
    disc_per = _to_float(_pick(rec, "disc_per", "discount", "disc", "discount_percent"))
    if disc_per is not None:
        doc["DISC_PER"] = disc_per
    return doc

@api_router.post("/stock-feed/sync")
async def sync_stock_feed(user: dict = Depends(require_admin)):
    s = await db.settings.find_one({"key": "stock_feed"}, {"_id": 0})
    if not s or not s.get("url"):
        raise HTTPException(status_code=400, detail="Save a feed URL first")
    headers = {"Authorization": f"Bearer {s['api_key']}"} if s.get("api_key") else {}
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
            resp = await c.get(s["url"], headers=headers)
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch feed: {e}")

    records = []
    text = resp.text.strip()
    if "json" in resp.headers.get("content-type", "") or text.startswith(("[", "{")):
            data = resp.json()
    if isinstance(data, dict):
        if isinstance(data.get("GetStockResult"), dict) and isinstance(data["GetStockResult"].get("Data"), list):
            data = data["GetStockResult"]["Data"]
        else:
            for k in ("items", "data", "diamonds", "results", "stock"):
                if isinstance(data.get(k), list):
                    data = data[k]
                    break
    if isinstance(data, list):
        records = data
    else:
        records = list(csv.DictReader(io.StringIO(text)))
    if not records:
        raise HTTPException(status_code=400, detail="Feed returned no recognizable records (expected a JSON array or CSV)")

    added = updated = skipped = 0
    for rec in records:
        doc = map_feed_record(rec)
        if not doc:
            skipped += 1
            continue
        existing = await db.diamonds.find_one({"sku": doc["sku"]}, {"_id": 1})
        if existing:
            await db.diamonds.update_one({"_id": existing["_id"]}, {"$set": doc})
            updated += 1
        else:
            doc["diamond_id"] = str(uuid.uuid4())
            doc["featured"] = False
            doc["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.diamonds.insert_one(doc)
            added += 1
    summary = {"added": added, "updated": updated, "skipped": skipped, "at": datetime.now(timezone.utc).isoformat()}
    await db.settings.update_one({"key": "stock_feed"}, {"$set": {"last_sync": summary}})
    return summary


# ---------------- Enquiries ----------------
class EnquiryBody(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    message: str
    diamond_sku: Optional[str] = None


@api_router.post("/enquiries")
async def create_enquiry(body: EnquiryBody):
    doc = {
        "enquiry_id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "email": body.email.lower(),
        "phone": body.phone,
        "message": body.message,
        "diamond_sku": body.diamond_sku,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.enquiries.insert_one(doc)

    email_sent = False
    if OWNER_EMAIL and RESEND_API_KEY:
        subject = f"New enquiry — {EMAIL_FROM_NAME}"
        diamond_line = f'<p><strong>Diamond SKU:</strong> {escape(body.diamond_sku)}</p>' if body.diamond_sku else ""
        html = (
            '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111">'
            f'<h2 style="margin:0 0 16px">New Enquiry</h2>'
            f'<p><strong>Name:</strong> {escape(doc["name"])}</p>'
            f'<p><strong>Email:</strong> {escape(doc["email"])}</p>'
            f'<p><strong>Phone:</strong> {escape(doc["phone"] or "—")}</p>'
            f'{diamond_line}'
            f'<p><strong>Message:</strong></p><p>{escape(doc["message"])}</p>'
            f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME)} website enquiry form. '
            'We never ask for your password or card details by email.</p>'
            '</td></tr></table>'
        )
        try:
            await send_email(to=OWNER_EMAIL, subject=subject, html=html, reply_to=doc["email"])
            email_sent = True
        except HTTPException:
            logger.error("Enquiry email failed to send; enquiry stored in DB.")
    return {"status": "received", "enquiry_id": doc["enquiry_id"], "email_sent": email_sent}


@api_router.get("/enquiries")
async def list_enquiries(user: dict = Depends(require_admin)):
    items = await db.enquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items, "total": len(items)}


@api_router.get("/")
async def root():
    return {"message": "Shree Diamond Exports API"}


# ---------------- Startup seeding ----------------
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "user_id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


async def seed_demo_buyer():
    email = "demo@buyer.com"
    existing = await db.users.find_one({"email": email})
    if existing:
        if existing.get("status") != "approved":
            await db.users.update_one({"email": email}, {"$set": {"status": "approved"}})
    else:
        await db.users.insert_one({
            "user_id": str(uuid.uuid4()),
            "email": email,
            "password_hash": hash_password("Demo@1234"),
            "name": "Demo Buyer",
            "company": "Demo Jewels BV",
            "kyc_name": "Demo Jewels BV",
            "mobile": "+91 90000 00000",
            "role": "buyer",
            "status": "approved",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.diamonds.create_index("diamond_id", unique=True)
    await db.diamonds.create_index([("shape", 1), ("color", 1), ("clarity", 1), ("carat", 1)])
    await db.quote_stones.create_index("quote_stone_id", unique=True)
    await db.quote_stones.create_index([("packet_no", 1), ("plan_no", 1)])
    await db.rapaport_rates.create_index([("shape", 1), ("color", 1), ("clarity", 1)])
    await db.jewellery.create_index("item_id", unique=True)
    await seed_admin()
    await seed_demo_buyer()
    if await db.diamonds.count_documents({}) == 0:
        await db.diamonds.insert_many(build_seed_diamonds())
        logger.info("Seeded 36 diamonds")
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# =====================================================================
# PRICING CALCULATOR ADDITION
# =====================================================================

from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from fastapi.responses import StreamingResponse

# ---------------- Roles & permissions ----------------
PRICING_MANAGER_DEFAULT_PERMISSIONS = {
    "set_discount": True,
    "view_pricing": True,
    "export_excel": True,
}


def user_has_pricing_access(user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    if user.get("role") == "pricing_manager":
        return bool(user.get("permissions", {}).get("view_pricing"))
    return False


def user_can_set_discount(user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    if user.get("role") == "pricing_manager":
        return bool(user.get("permissions", {}).get("set_discount"))
    return False


def user_can_export_excel(user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    if user.get("role") == "pricing_manager":
        return bool(user.get("permissions", {}).get("export_excel"))
    return False


async def require_pricing_access(user: dict = Depends(get_current_user)) -> dict:
    if not user_has_pricing_access(user):
        raise HTTPException(status_code=403, detail="Pricing access only")
    return user


async def require_staff_or_pricing(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("staff", "pricing_manager", "admin"):
        raise HTTPException(status_code=403, detail="Staff access only")
    return user


class StaffUserBody(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    permissions: Optional[dict] = None


@api_router.post("/admin/staff-users")
async def admin_create_staff_user(body: StaffUserBody, user: dict = Depends(require_admin)):
    if body.role not in ("staff", "pricing_manager"):
        raise HTTPException(status_code=400, detail="role must be 'staff' or 'pricing_manager'")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    perms = None
    if body.role == "pricing_manager":
        perms = {**PRICING_MANAGER_DEFAULT_PERMISSIONS, **(body.permissions or {})}
    doc = {
        "user_id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "status": "approved",
        "permissions": perms,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return public_user(doc)


@api_router.get("/admin/staff-users")
async def admin_list_staff_users(user: dict = Depends(require_admin)):
    items = await db.users.find(
        {"role": {"$in": ["staff", "pricing_manager"]}}, {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(200)
    return {"items": items, "total": len(items)}


class StaffPermissionsBody(BaseModel):
    permissions: dict


@api_router.put("/admin/staff-users/{user_id}/permissions")
async def admin_update_staff_permissions(user_id: str, body: StaffPermissionsBody, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id})
    if not target or target.get("role") != "pricing_manager":
        raise HTTPException(status_code=404, detail="Pricing-manager user not found")
    merged = {**target.get("permissions", {}), **body.permissions}
    await db.users.update_one({"user_id": user_id}, {"$set": {"permissions": merged}})
    return {"status": "updated", "permissions": merged}


@api_router.delete("/admin/staff-users/{user_id}")
async def admin_delete_staff_user(user_id: str, user: dict = Depends(require_admin)):
    result = await db.users.delete_one({"user_id": user_id, "role": {"$in": ["staff", "pricing_manager"]}})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Staff user not found")
    return {"status": "deleted"}


@api_router.post("/admin/rapaport-rates/upload")
async def upload_rapaport_rates(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.reader(io.StringIO(raw))
    now = datetime.now(timezone.utc).isoformat()
    by_shape = {}
    skipped = 0
    for row in reader:
        if not row or len(row) < 6:
            continue
        shape, clarity, color, cmin, cmax, rate = [c.strip() for c in row[:6]]
        try:
            cmin_f, cmax_f, rate_f = float(cmin), float(cmax), float(rate)
        except ValueError:
            skipped += 1      # the header line, or a line that is not a rate
            continue
        by_shape.setdefault(shape.upper(), []).append({
            "shape": shape.upper(),
            "clarity": clarity.upper(),
            "color": color.upper(),
            "carat_min": cmin_f,
            "carat_max": cmax_f,
            "rate": rate_f,
            "updated_at": now,
        })
    if not by_shape:
        raise HTTPException(status_code=400, detail="No valid rows found in the file")

    summary = {}
    for shape, shape_rows in by_shape.items():
        before = await db.rapaport_rates.count_documents({"shape": shape})
        await db.rapaport_rates.delete_many({"shape": shape})
        await db.rapaport_rates.insert_many(shape_rows)
        summary[shape] = {"before": before, "after": len(shape_rows)}
    return {
        "status": "uploaded",
        "shapes": summary,
        "rows": sum(v["after"] for v in summary.values()),
        "skipped": skipped,
        "updated_at": now,
    }


@api_router.get("/admin/rapaport-rates/export")
async def export_rapaport_rates(shape: Optional[str] = None, user: dict = Depends(require_admin)):
    # The current rates as a CSV file: edit it and upload it again.
    query = {"shape": shape.upper()} if shape else {}
    rows = await db.rapaport_rates.find(query, {"_id": 0}).sort(
        [("shape", 1), ("clarity", 1), ("color", 1), ("carat_min", 1)]
    ).to_list(100000)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["shape", "clarity", "color", "carat_min", "carat_max", "rate"])
    for r in rows:
        writer.writerow([r["shape"], r["clarity"], r["color"], r["carat_min"], r["carat_max"], r["rate"]])
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="rapaport-rates{"-" + shape.upper() if shape else ""}.csv"'},
    )


@api_router.post("/admin/rapaport-rates/apply-to-stones")
async def apply_rapaport_to_stones(include_priced: bool = False, user: dict = Depends(require_admin)):
    # Stones keep the Rapaport rate they had when they were entered. After new rates are
    # uploaded, this gives the stones already entered the new rate (Gross and Net follow).
    # By default stones that are already priced are left alone.
    query = {} if include_priced else {"status": {"$ne": "priced"}}
    stones = await db.quote_stones.find(
        query,
        {"_id": 0, "quote_stone_id": 1, "shape": 1, "pol_cts": 1, "color": 1, "clarity": 1, "rapaport_rate": 1},
    ).to_list(50000)
    changed = missing = 0
    for st in stones:
        new_rate = await lookup_rapaport_rate(st["shape"], st["pol_cts"], st["color"], st["clarity"])
        if new_rate is None:
            missing += 1
            continue
        if new_rate != st.get("rapaport_rate"):
            await db.quote_stones.update_one(
                {"quote_stone_id": st["quote_stone_id"]}, {"$set": {"rapaport_rate": new_rate}}
            )
            changed += 1
    return {"checked": len(stones), "changed": changed, "no_rate_found": missing}


@api_router.get("/admin/rapaport-rates/summary")
async def rapaport_rates_summary(user: dict = Depends(require_admin)):
    pipeline = [
        {"$group": {"_id": "$shape", "rows": {"$sum": 1}, "updated_at": {"$max": "$updated_at"}}},
        {"$sort": {"_id": 1}},
    ]
    items = await db.rapaport_rates.aggregate(pipeline).to_list(100)
    return {"items": [{"shape": i["_id"], "rows": i["rows"], "updated_at": i["updated_at"]} for i in items]}


async def lookup_rapaport_rate(shape: str, carat: float, color: str, clarity: str) -> Optional[float]:
    row = await db.rapaport_rates.find_one({
        "shape": shape.upper(),
        "color": color.upper(),
        "clarity": clarity.upper().rstrip("+-"),
        "carat_min": {"$lte": carat},
        "carat_max": {"$gte": carat},
    }, {"_id": 0, "rate": 1})
    return row["rate"] if row else None


async def lookup_labour(shape: str, carat: float) -> float:
    row = await db.labour_rates.find_one({
        "shape": shape.upper(),
        "carat_min": {"$lte": carat},
        "carat_max": {"$gte": carat},
    }, {"_id": 0, "labour": 1})
    return row["labour"] if row else 0.0

from itertools import groupby
from openpyxl.styles import Font, PatternFill

# ---------------- Helpers: colour ranges & plan groups ----------------
RANGE_RE = re.compile(r"^\s*([A-Za-z])\s*-\s*([A-Za-z])\s*$")


def split_colour(color: str) -> List[str]:
    """'D-E' -> ['D', 'E'];  'F' -> ['F']"""
    m = RANGE_RE.match(color or "")
    if m:
        return [m.group(1).upper(), m.group(2).upper()]
    return [(color or "").strip().upper()]


def plan_group_of(plan_no: str) -> str:
    """'Plan 1', '1', '1A', 'Plan 1A' -> '1'   |   'Plan 2' -> '2'"""
    m = re.search(r"\d+", plan_no or "")
    return str(int(m.group())) if m else (plan_no or "").strip().upper()


def plan_group_sort_key(stone: dict):
    g = plan_group_of(stone.get("plan_no", ""))
    return (0, int(g), "") if g.isdigit() else (1, 0, g)


class QuoteStoneBody(BaseModel):
    packet_no: str
    plan_no: str
    shape: str
    pol_cts: float
    color: str            # single colour ("F") or range ("F-G")
    clarity: str
    cut: Optional[str] = None
    polish: Optional[str] = None
    symmetry: Optional[str] = None
    fluorescence: Optional[str] = None
    black_no_black: Optional[str] = None
    lab: Optional[str] = None
    table_pct: Optional[float] = None
    girdle_pct: Optional[float] = None
    td: Optional[float] = None
    ratio: Optional[float] = None
    remarks: Optional[str] = None
    rough_name: Optional[str] = None
    planner_name: Optional[str] = None
    rough_weight: Optional[float] = None
    shape_name: Optional[str] = None

from openpyxl.styles import Alignment, Border, Side, Font, PatternFill
from openpyxl.worksheet.properties import PageSetupProperties


def shape_display_of(stone: dict) -> str:
    """The shape name to show people: Marquise, Oval, Heart, Round ..."""
    if stone.get("shape_name"):
        return stone["shape_name"]
    # older stones: the name was saved at the end of Remarks, like "[Marquise]"
    m = re.search(r"\[([^\]]+)\]\s*$", stone.get("remarks") or "")
    if m:
        return m.group(1)
    return {"BR": "Round", "PS": "Fancy shape"}.get(stone.get("shape"), stone.get("shape"))
    

def staff_view(stone: dict) -> dict:
    hidden = {"rapaport_rate", "discount_percent", "gross_value", "labour", "net_value",
              "priced_by", "priced_at", "is_final"}
    out = {k: v for k, v in stone.items() if k not in hidden}
    out["shape_display"] = shape_display_of(stone)
    if out.get("shape") == "PS":
        out["cut"] = None
    return out


def with_computed_pricing(stone: dict) -> dict:
    out = dict(stone)
    out["shape_display"] = shape_display_of(out)
    out["final_flag"] = "FINAL" if out.get("is_final") else None
    if out.get("shape") == "PS":
        out["cut"] = None
    rate = out.get("rapaport_rate")
    disc = out.get("discount_percent")
    labour = out.get("labour") or 0.0
    if rate is not None and disc is not None:
        price_per_ct = rate * (1 - disc / 100)
        gross = price_per_ct * out["pol_cts"]
        out["gross_value"] = round(gross, 2)
        out["net_value"] = round(gross - labour, 2)
    else:
        out["gross_value"] = None
        out["net_value"] = None
    return out


def compose_packet_no(rough_name: str, main_no: str) -> str:
    """('CS-1', '100') -> 'CS-1-100'.  Never doubles the prefix."""
    rough = (rough_name or "").strip()
    main = (main_no or "").strip()
    if rough and main and not main.upper().startswith(rough.upper() + "-"):
        return f"{rough}-{main}"
    return main


async def build_stone_docs(body: QuoteStoneBody, created_by: str, created_at: str) -> list:
    """Turns the entry form into the stone rows to save (a colour range D-E = two rows)."""
    colours = split_colour(body.color)
    range_label = "-".join(colours) if len(colours) > 1 else None
    range_id = str(uuid.uuid4()) if range_label else None
    labour = await lookup_labour(body.shape, body.pol_cts)

    rough = (body.rough_name or "").strip()
    main_no = body.packet_no.strip()
    full_packet = compose_packet_no(rough, main_no)   # e.g. CS-1-100

    docs = []
    for idx, col in enumerate(colours):
        doc = body.model_dump()
        doc.update({
            "packet_no": full_packet,
            "packet_main_no": main_no,
            "rough_name": rough or None,
            "planner_name": (body.planner_name or "").strip() or None,
            "cut": None if body.shape == "PS" else body.cut,   # fancy shapes have no cut
            "color": col,
            "color_range": range_label,
            "range_id": range_id,
            "range_index": idx,
            "plan_group": plan_group_of(body.plan_no),
            "quote_stone_id": str(uuid.uuid4()),
            "status": "pending",
            "rapaport_rate": await lookup_rapaport_rate(body.shape, body.pol_cts, col, body.clarity),
            "labour": labour,
            "discount_percent": None,
            "created_by": created_by,
            "created_at": created_at,
        })
        docs.append(doc)
    return docs


@api_router.post("/pricing/quote-stones")
async def create_quote_stone(body: QuoteStoneBody, user: dict = Depends(require_staff_or_pricing)):
    now = datetime.now(timezone.utc).isoformat()
    created = []
    for doc in await build_stone_docs(body, user["user_id"], now):
        await db.quote_stones.insert_one(doc)
        doc.pop("_id", None)
        created.append(doc if user_has_pricing_access(user) else staff_view(doc))
    return {"items": created}


@api_router.put("/pricing/quote-stones/{quote_stone_id}")
async def update_quote_stone(quote_stone_id: str, body: QuoteStoneBody, user: dict = Depends(require_staff_or_pricing)):
    # Edit a stone. Staff can edit only their own stones that are not priced yet;
    # admin and pricing managers can edit any stone.
    scope = delete_scope(user)
    old = await db.quote_stones.find_one({"quote_stone_id": quote_stone_id, **scope}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail=NOT_ALLOWED_MSG)
    if old.get("range_id"):
        if scope and await db.quote_stones.count_documents({"range_id": old["range_id"], "status": "priced"}):
            raise HTTPException(status_code=403, detail="This stone is already priced")
        old_query = {"range_id": old["range_id"]}
    else:
        old_query = {"quote_stone_id": quote_stone_id}

    # build the new rows first, so nothing is lost if something is wrong
    docs = await build_stone_docs(body, old.get("created_by") or user["user_id"],
                                  old.get("created_at") or datetime.now(timezone.utc).isoformat())
    await db.quote_stones.delete_many(old_query)
    out = []
    for doc in docs:
        if old.get("is_final"):
            doc["is_final"] = True          # keep the final-plan mark
        await db.quote_stones.insert_one(doc)
        doc.pop("_id", None)
        out.append(doc if user_has_pricing_access(user) else staff_view(doc))
    return {"items": out}


def _natural_key(s) -> list:
    # 'CS-1-100' -> ['CS-', 1, '-', 100]  so 2 sorts before 10
    return [int(t) if t.isdigit() else t.upper() for t in re.split(r"(\d+)", str(s or ""))]


@api_router.get("/pricing/quote-stones/packets")
async def list_quote_stone_packets(user: dict = Depends(require_pricing_access)):
    pipeline = [
        {"$group": {
            "_id": "$packet_no",
            "rough_name": {"$max": "$rough_name"},
            "plan_count": {"$addToSet": "$plan_no"},
            "stone_count": {"$sum": 1},
            "priced_count": {"$sum": {"$cond": [{"$eq": ["$status", "priced"]}, 1, 0]}},
            "latest": {"$max": "$created_at"},
        }},
    ]
    rows = await db.quote_stones.aggregate(pipeline).to_list(500)
    items = [
        {
            "packet_no": r["_id"],
            "rough_name": r.get("rough_name"),
            "plan_count": len({plan_group_of(p) for p in r["plan_count"]}),
            "stone_count": r["stone_count"],
            "priced_count": r["priced_count"],
            "pending_count": r["stone_count"] - r["priced_count"],
        }
        for r in rows
    ]
    items.sort(key=lambda i: (_natural_key(i["rough_name"] or "~"), _natural_key(i["packet_no"])))
    return {"items": items, "total": len(items)}


@api_router.get("/pricing/quote-stones")
async def list_quote_stones(
    packet_no: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(require_staff_or_pricing),
):
    query = {}
    if packet_no:
        query["packet_no"] = packet_no
    if status:
        query["status"] = status
    items = await db.quote_stones.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    if user_has_pricing_access(user):
        # pricing view: grouped by plan group (1, 1A together, then 2, ...)
        items.sort(key=lambda s: (
            plan_group_sort_key(s),
            str(s.get("plan_no", "")).upper(),
            s.get("created_at", ""),
            s.get("range_index") or 0,
        ))
        items = [with_computed_pricing(i) for i in items]
        await attach_user_names(items)
        return {"items": items, "total": len(items)}
    return {"items": [staff_view(i) for i in items], "total": len(items)}


class SetDiscountBody(BaseModel):
    discount_percent: float


@api_router.post("/pricing/quote-stones/{quote_stone_id}/discount")
async def set_quote_stone_discount(quote_stone_id: str, body: SetDiscountBody, user: dict = Depends(get_current_user)):
    if not user_can_set_discount(user):
        raise HTTPException(status_code=403, detail="Not permitted to set discount")
    result = await db.quote_stones.update_one(
        {"quote_stone_id": quote_stone_id},
        {"$set": {
            "discount_percent": body.discount_percent,
            "status": "priced",
            "priced_by": user["user_id"],
            "priced_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote stone not found")
    stone = await db.quote_stones.find_one({"quote_stone_id": quote_stone_id}, {"_id": 0})
    return with_computed_pricing(stone)


# ---------------- Final plan (one per packet) ----------------
class FinalPlanBody(BaseModel):
    packet_no: str
    plan_no: str          # any plan name in the group, e.g. "1" or "1A"
    final: bool = True    # False = remove the final mark


@api_router.post("/pricing/final-plan")
async def set_final_plan(body: FinalPlanBody, user: dict = Depends(get_current_user)):
    if not user_can_set_discount(user):
        raise HTTPException(status_code=403, detail="Not permitted to mark the final plan")
    stones = await db.quote_stones.find(
        {"packet_no": body.packet_no}, {"_id": 0, "quote_stone_id": 1, "plan_no": 1}
    ).to_list(5000)
    group = plan_group_of(body.plan_no)
    ids = [s["quote_stone_id"] for s in stones if plan_group_of(s.get("plan_no", "")) == group]
    if not ids:
        raise HTTPException(status_code=404, detail="Plan not found in this packet")
    # only one final plan per packet: clear the packet, then mark this group
    await db.quote_stones.update_many({"packet_no": body.packet_no}, {"$set": {"is_final": False}})
    if body.final:
        await db.quote_stones.update_many({"quote_stone_id": {"$in": ids}}, {"$set": {"is_final": True}})
    return {"status": "updated", "final": body.final, "plan_group": group}


def delete_scope(user: dict) -> dict:
    """Extra filter applied to deletes. Empty for admin / pricing managers."""
    if user_has_pricing_access(user):
        return {}
    return {"created_by": user["user_id"], "status": "pending"}


NOT_ALLOWED_MSG = "Not found, or you can only delete your own stones that are not priced yet"


@api_router.delete("/pricing/quote-stones/{quote_stone_id}")
async def delete_quote_stone(quote_stone_id: str, user: dict = Depends(require_staff_or_pricing)):
    scope = delete_scope(user)
    stone = await db.quote_stones.find_one({"quote_stone_id": quote_stone_id, **scope}, {"_id": 0})
    if not stone:
        raise HTTPException(status_code=404, detail=NOT_ALLOWED_MSG)

    # A colour range (e.g. D-E) is one stone with two rows, so both go together.
    if stone.get("range_id"):
        if scope and await db.quote_stones.count_documents({"range_id": stone["range_id"], "status": "priced"}):
            raise HTTPException(status_code=403, detail="This stone is already priced")
        result = await db.quote_stones.delete_many({"range_id": stone["range_id"], **scope})
    else:
        result = await db.quote_stones.delete_one({"quote_stone_id": quote_stone_id, **scope})
    return {"status": "deleted", "deleted": result.deleted_count}


@api_router.delete("/pricing/plans")
async def delete_plan(packet_no: str, plan_no: str, user: dict = Depends(require_staff_or_pricing)):
    # Deletes the stones of ONE plan (exact plan name, e.g. "1A") in a packet.
    result = await db.quote_stones.delete_many(
        {"packet_no": packet_no, "plan_no": plan_no, **delete_scope(user)}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=NOT_ALLOWED_MSG)
    return {"status": "deleted", "deleted": result.deleted_count}


@api_router.delete("/pricing/packets")
async def delete_packet(packet_no: str, user: dict = Depends(require_pricing_access)):
    # Whole packet: only admin / pricing managers.
    result = await db.quote_stones.delete_many({"packet_no": packet_no})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Packet not found")
    return {"status": "deleted", "deleted": result.deleted_count}


class PortalSignupBody(BaseModel):
    name: str
    email: EmailStr
    password: str
    access_code: Optional[str] = None


@api_router.post("/portal/request-access")
async def portal_request_access(body: PortalSignupBody):
    # Optional: set PORTAL_SIGNUP_CODE in Render to require a code at signup.
    required = os.environ.get("PORTAL_SIGNUP_CODE")
    if required and (body.access_code or "").strip() != required:
        raise HTTPException(status_code=403, detail="Wrong access code")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    await db.users.insert_one({
        "user_id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "role": "portal_pending",   # can't do anything until admin gives access
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "requested"}


PORTAL_ROLES = ("portal_pending", "staff", "pricing_manager")


@api_router.get("/admin/portal-users")
async def admin_list_portal_users(user: dict = Depends(require_admin)):
    items = await db.users.find(
        {"role": {"$in": list(PORTAL_ROLES)}}, {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(500)
    return {"items": items, "total": len(items)}


class PortalRoleBody(BaseModel):
    role: str  # "staff" | "pricing_manager" | "portal_pending" (= remove access)


@api_router.post("/admin/portal-users/{user_id}/role")
async def admin_set_portal_role(user_id: str, body: PortalRoleBody, user: dict = Depends(require_admin)):
    if body.role not in PORTAL_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    target = await db.users.find_one({"user_id": user_id})
    if not target or target.get("role") not in PORTAL_ROLES:
        raise HTTPException(status_code=404, detail="Portal user not found")
    update = {
        "role": body.role,
        "status": "pending" if body.role == "portal_pending" else "approved",
        "permissions": None,
    }
    if body.role == "pricing_manager":
        update["permissions"] = {**PRICING_MANAGER_DEFAULT_PERMISSIONS, **(target.get("permissions") or {})}
    await db.users.update_one({"user_id": user_id}, {"$set": update})
    return {"status": "updated", "role": body.role}


@api_router.delete("/admin/portal-users/{user_id}")
async def admin_delete_portal_user(user_id: str, user: dict = Depends(require_admin)):
    result = await db.users.delete_one({"user_id": user_id, "role": {"$in": list(PORTAL_ROLES)}})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Portal user not found")
    return {"status": "deleted"}


GT7_COLUMNS = [
    ("packet_no", "PacketNo"), ("rough_name", "RoughName"), ("plan_no", "PlanNo"),
    ("added_on", "Added"),
    ("shape_display", "Shape"),
    ("pol_cts", "PolCts"), ("color", "RefColor"), ("color_range", "ColourRange"),
    ("clarity", "RefPurity"),
    ("cps", "C/P/S"), ("fluorescence", "Fls"),
    ("black_no_black", "BlackNoBlack"), ("lab", "Lab"), ("rapaport_rate", "Rapaport"),
    ("discount_percent", "RefDisc%"), ("gross_value", "GrossValue"),
    ("labour", "Labour"), ("net_value", "NetValue"),
    ("table_pct", "Table%"), ("girdle_pct", "Girdle%"), ("td", "TD"),
    ("ratio", "Ratio"), ("remarks", "Remarks"),
    ("entered_by", "EnteredBy"), ("priced_by_name", "PricedBy"),
    ("final_flag", "Final"), ("planner_name", "Planner"),
]


async def attach_user_names(items: list) -> list:
    ids = {i.get("created_by") for i in items} | {i.get("priced_by") for i in items}
    ids.discard(None)
    users = await db.users.find({"user_id": {"$in": list(ids)}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(500)
    names = {u["user_id"]: u["name"] for u in users}
    for i in items:
        cb, pb = i.get("created_by"), i.get("priced_by")
        i["entered_by"] = names.get(cb, "(deleted user)") if cb else None
        i["priced_by_name"] = names.get(pb, "(deleted user)") if pb else None
    return items


LOCAL_TZ = timezone(timedelta(hours=5, minutes=30))   # India time


def _added_date(iso):
    """The day a stone was entered (India time), as a date; None if unknown."""
    try:
        return datetime.fromisoformat(iso).astimezone(LOCAL_TZ).date()
    except Exception:
        return None


def _cps_text(stone: dict, fields=("cut", "polish", "symmetry")) -> str:
    """Cut / Polish / Symmetry in one text, e.g. "EX EX VG". A fancy shape has no cut: it stays blank."""
    parts = []
    for f in fields:
        v = stone.get(f)
        if f == "cut" and not v:
            continue
        parts.append(str(v or "—"))
    return " ".join(parts)


def _clean_remarks(text) -> str:
    """Older stones had the shape name added at the end of the remarks, like "[Marquise]"."""
    return re.sub(r"\s*\[[^\]]*\]\s*$", "", text or "").strip()


# Short shape names for the print slip (change or add any you like)
SLIP_SHAPE_CODE = {
    "Round": "RD", "Pear": "PE", "Marquise": "MQ", "Oval": "OV", "Radiant": "RAD",
    "Cushion BR": "CB", "Cushion Brilliant": "CB", "CMB": "CMB", "Cushion Modified Brilliant": "CMB",
    "Heart": "HT", "Old Mine": "OM", "Baguette": "BG", "Emerald": "EM", "Fancy shape": "FNC",
}


def _slip_shape(name) -> str:
    name = name or ""
    return SLIP_SHAPE_CODE.get(name, name[:4].upper())


def option_index(stone: dict) -> int:
    """-1 for a single-colour stone; 0 / 1 for the first / second colour row of a range stone."""
    return (stone.get("range_index") or 0) if stone.get("color_range") else -1


def stone_sort_key(stone: dict):
    # packet, plan group (1 + 1A together), then colour option, then plan name
    return (
        str(stone.get("packet_no", "")),
        plan_group_sort_key(stone),
        option_index(stone),
        str(stone.get("plan_no", "")).upper(),
        stone.get("created_at", ""),
    )


def plan_sections(block: list) -> list:
    """Split one plan group into sections; a section with total_of set ends in a TOTAL row.
    No colour range -> one section: all rows, one total.
    With ranges     -> single-colour rows first (no total of their own), then one
                       section per colour option: its rows, then a total made of the
                       single-colour stones plus that option's rows."""
    singles = [s for s in block if not s.get("color_range")]
    ranges = [s for s in block if s.get("color_range")]
    if not ranges:
        return [{"rows": block, "total_of": block, "label": ""}]
    sections = []
    if singles:
        sections.append({"rows": singles, "total_of": None, "label": ""})
    max_idx = max((s.get("range_index") or 0) for s in ranges)
    for k in range(max_idx + 1):
        chosen = [s for s in ranges if (s.get("range_index") or 0) == k]
        if not chosen:
            continue
        colours = sorted({s.get("color") for s in chosen if s.get("color")})
        sections.append({"rows": chosen, "total_of": singles + chosen, "label": " / ".join(colours)})
    return sections


def highest_total(pkt_items: list):
    """(plan group, colour label) of the plan option with the HIGHEST total value in a
    packet - only counted when every stone in that total is priced, and only when there
    are at least two options to compare."""
    best, best_net, candidates = None, None, 0
    for grp, block in groupby(pkt_items, key=lambda s: plan_group_of(s.get("plan_no", ""))):
        for sec in plan_sections(list(block)):
            if sec["total_of"] is None:
                continue
            vals = [s.get("net_value") for s in sec["total_of"]]
            if any(v is None for v in vals):
                continue
            candidates += 1
            net = sum(vals)
            if best_net is None or net > best_net:
                best, best_net = (grp, sec["label"]), net
    return best if candidates >= 2 else None


def packet_rough_weight(stones: list):
    """The rough weight is the same for the whole packet: take the first one entered."""
    for s in stones:
        if s.get("rough_weight") is not None:
            return s["rough_weight"]
    return None


def _row_ranges(letter: str, rows: list) -> str:
    """[2,3,4,7] -> 'D2:D4,D7'  (keeps the SUM formula short)"""
    parts, start, prev = [], None, None
    for r in rows:
        if start is None:
            start = prev = r
        elif r == prev + 1:
            prev = r
        else:
            parts.append(f"{letter}{start}:{letter}{prev}" if prev > start else f"{letter}{start}")
            start = prev = r
    if start is not None:
        parts.append(f"{letter}{start}:{letter}{prev}" if prev > start else f"{letter}{start}")
    return ",".join(parts)


def _sheet_title(wb, ws, pkt: str) -> str:
    title = re.sub(r"[\[\]:*?/\\]", "-", pkt)[:31] or "Packet"
    base, n = title, 2
    while title in wb.sheetnames and wb[title] is not ws:
        title = f"{base[:28]}-{n}"
        n += 1
    return title


MONEY_KEYS = ("gross_value", "labour", "net_value")


def _text_len(key: str, v) -> int:
    """How many characters a value takes in the Excel (used to size the columns)."""
    if v is None:
        return 0
    if key in MONEY_KEYS:
        return len(f"{v:,.2f}") + 3          # totals can be bigger than a single stone
    if key == "rapaport_rate":
        return len(f"{v:,.0f}")
    if isinstance(v, float):
        return len(f"{v:g}")
    return len(str(v))


@api_router.get("/pricing/quote-stones/export")
async def export_quote_stones_excel(packet_no: Optional[str] = None, user: dict = Depends(get_current_user)):
    if not user_can_export_excel(user):
        raise HTTPException(status_code=403, detail="Not permitted to export")
    query = {"packet_no": packet_no} if packet_no else {}
    items = await db.quote_stones.find(query, {"_id": 0}).to_list(5000)
    items = [with_computed_pricing(i) for i in items]
    for i in items:   # Cut / Polish / Symmetry share one column, e.g. "EX EX VG"
        i["cps"] = _cps_text(i)
        i["added_on"] = _added_date(i.get("created_at"))
        i["remarks"] = _clean_remarks(i.get("remarks"))
    await attach_user_names(items)
    items.sort(key=stone_sort_key)

    bold = Font(bold=True)
    total_fill = PatternFill("solid", fgColor="FFF2CC")
    input_fill = PatternFill("solid", fgColor="E2EFDA")  # light green = edit me
    final_fill = PatternFill("solid", fgColor="C6E0B4")  # green = final plan
    money = "#,##0.00"

    # column letters, looked up by field name
    L = {key: get_column_letter(i) for i, (key, _) in enumerate(GT7_COLUMNS, start=1)}
    CTS, RATE, DISC = L["pol_cts"], L["rapaport_rate"], L["discount_percent"]
    GROSS, LAB, NET = L["gross_value"], L["labour"], L["net_value"]

    def write_stone_row(ws, stone: dict) -> int:
        ws.append([stone.get(key) for key, _ in GT7_COLUMNS])
        r = ws.max_row
        if stone.get("is_final"):
            for cell in ws[r]:
                cell.fill = final_fill
        # Gross = Rapaport x (1 - Disc/100) x Carats   (blank until a discount is entered)
        ws[f"{GROSS}{r}"] = (
            f'=IF(AND(ISNUMBER({RATE}{r}),ISNUMBER({DISC}{r})),'
            f'ROUND({RATE}{r}*(1-{DISC}{r}/100)*{CTS}{r},2),"")'
        )
        # Net = Gross - Labour
        ws[f"{NET}{r}"] = f'=IF(ISNUMBER({GROSS}{r}),ROUND({GROSS}{r}-{LAB}{r},2),"")'
        ws[f"{GROSS}{r}"].number_format = money
        ws[f"{NET}{r}"].number_format = money
        ws[f"{DISC}{r}"].fill = input_fill
        ws[f"{L['added_on']}{r}"].number_format = "dd-mmm-yy"
        return r

    wb = Workbook()
    first = True
    # one sheet per packet
    for pkt, pkt_items in groupby(items, key=lambda s: str(s.get("packet_no", ""))):
        pkt_items = list(pkt_items)
        ws = wb.active if first else wb.create_sheet()
        first = False
        ws.title = _sheet_title(wb, ws, pkt)

        # top line: ESTIMATE, packet number and rough weight (same for the whole packet)
        rough = packet_rough_weight(pkt_items)
        banner = f"ESTIMATE      Packet No: {pkt}"
        if rough is not None:
            banner += f"      Rough Weight: {rough}"
        days = sorted({st["added_on"] for st in pkt_items if st.get("added_on")})
        if days:
            first_day, last_day = days[0].strftime("%d-%b-%Y"), days[-1].strftime("%d-%b-%Y")
            banner += f"      Date: {first_day}" + ("" if first_day == last_day else f" to {last_day}")
        ws["A1"] = banner
        ws["A1"].font = Font(size=14, bold=True)
        ws.append([])                                   # row 2 stays empty
        ws.append([header for _, header in GT7_COLUMNS])  # row 3 = column headings
        for cell in ws[3]:
            cell.font = bold
        ws.freeze_panes = "A4"

        best = highest_total(pkt_items)   # amber = highest total value in this packet
        best_fill = PatternFill("solid", fgColor="FFC000")

        # one block per plan group (Plan 1 + Plan 1A together)
        for grp, block in groupby(pkt_items, key=lambda s: plan_group_of(s.get("plan_no", ""))):
            block = list(block)
            plans = sorted({str(s.get("plan_no", "")) for s in block}, key=lambda p: p.upper())
            row_of = {}
            for sec in plan_sections(block):
                for stone in sec["rows"]:
                    row_of[stone["quote_stone_id"]] = write_stone_row(ws, stone)
                if sec["total_of"] is None:
                    continue
                # the colour's total sits directly under that colour's rows
                counted_rows = sorted(row_of[s["quote_stone_id"]] for s in sec["total_of"])
                name = f"TOTAL {'+'.join(plans)}"
                if sec["label"]:
                    name += f" · {sec['label']}"
                is_best = best == (grp, sec["label"])
                if is_best:
                    name += "  ▲ HIGHEST"
                total_values = [None] * len(GT7_COLUMNS)
                total_values[0] = pkt
                total_values[1] = name
                ws.append(total_values)
                tr = ws.max_row
                for letter in (CTS, GROSS, LAB, NET):
                    ws[f"{letter}{tr}"] = f"=SUM({_row_ranges(letter, counted_rows)})"
                for letter in (GROSS, LAB, NET):
                    ws[f"{letter}{tr}"].number_format = money
                for cell in ws[tr]:
                    cell.font = bold
                    cell.fill = best_fill if is_best else total_fill
                # the label spreads over the empty cells in front of PolCts
                pol_idx = [k for k, _h in GT7_COLUMNS].index("pol_cts") + 1
                if pol_idx - 1 >= 3:
                    ws.merge_cells(start_row=tr, start_column=2, end_row=tr, end_column=pol_idx - 1)
            ws.append([])  # blank spacer row between plans

        # each column is only as wide as its words (a little extra), so the sheet is compact
        for col_idx, (key, header) in enumerate(GT7_COLUMNS, start=1):
            longest = len(header) * 1.05
            for stone in pkt_items:
                longest = max(longest, _text_len(key, stone.get(key)))
            if key in MONEY_KEYS:
                longest = max(longest, 10)
            ws.column_dimensions[get_column_letter(col_idx)].width = min(max(longest + 1.5, 5), 36)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"quote-{packet_no or 'all'}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


from openpyxl.worksheet.pagebreak import Break


# ---------------- Print slip: you choose what is printed ----------------
# Every stone is ONE line. Cut / Polish / Symmetry share one column (C/P/S).
# The rough weight is printed in the title at the top (not as a column).
SLIP_ORDER = ["shape", "carat", "color", "clarity", "fluorescence", "cps", "lab", "table", "td", "ratio",
              "rapaport", "discount", "gross", "net", "remarks"]
SLIP_REMARKS_W = 14     # remarks longer than this wrap onto a second line
# key: (heading, stone field(s), Excel number format)
SLIP_COLS = {
    "shape": ("Shape", ["shape_display"], None),
    "color": ("Col", ["color"], None),
    "clarity": ("Clar", ["clarity"], None),
    "fluorescence": ("Fls", ["fluorescence"], None),
    "cps": ("C/P/S", ["cut", "polish", "symmetry"], None),
    "lab": ("Lab", ["lab"], None),
    "rapaport": ("Rap", ["rapaport_rate"], "#,##0"),
    "discount": ("Disc%", ["discount_percent"], "0.0"),
    "carat": ("Ct", ["pol_cts"], "0.00"),
    "gross": ("Gross", ["gross_value"], "#,##0.00"),
    "net": ("Total", ["net_value"], "#,##0.00"),
    "table": ("Tbl%", ["table_pct"], "0.0"),
    "td": ("TD", ["td"], "0.0"),
    "ratio": ("Ratio", ["ratio"], "0.00"),
    "remarks": ("Remarks", ["remarks"], None),
}
SLIP_TOTAL_KEYS = ("carat", "gross", "net")   # columns that get a total per plan
# used when the website does not say what to print
SLIP_DEFAULT = ["carat", "rough_weight", "color", "clarity", "fluorescence",
                "cut", "polish", "symmetry", "discount", "net"]

# The slip always prints big text with small margins, so it is easy to read and
# looks the same on a thermal label (4 x 6) and on a normal page.
SLIP_FONT = 12          # text size (points)
SLIP_TITLE = 14         # title size (points)
SLIP_MARGIN = 0.12      # page margin (inches)
SLIP_ROW_H = 19         # row height (points)
SLIP_PAGE_SAFETY = 0.92  # use only this part of a page when planning page breaks (stays on the safe side)
# paper: (Excel paper code, width in inches, height in inches), the way the page is held:
# "4x6" = 4 inches WIDE x 6 inches TALL (portrait). None = 4 x 6 label: pick that paper in
# the print window.
SLIP_PAPER = {
    "a4": (9, 8.27, 11.69),
    "a5": (11, 5.83, 8.27),
    "a6": (70, 4.13, 5.83),
    "4x6": (None, 4.0, 6.0),   # roll printer paper: now printed SIDEWAYS (landscape) and as long as needed
}
SLIP_LANDSCAPE_PAPERS = ("4x6",)
# these columns change with the colour, so they are repeated side by side for each colour
SLIP_COLOUR_KEYS = ("color", "rapaport", "discount", "gross", "net")
 
def _slip_text(v, fmt) -> str:
    """The text a cell will show (used to give every column exactly the width it needs)."""
    if v is None:
        return "—"
    if isinstance(v, (int, float)) and fmt:
        if fmt == "#,##0.00":
            return f"{v:,.2f}"
        if fmt == "#,##0":
            return f"{v:,.0f}"
        if fmt == "0.00":
            return f"{v:.2f}"
        if fmt == "0.000":
            return f"{v:.3f}"
        if fmt == "0.0":
            return f"{v:.1f}"
    return str(v)


def _slip_units(n_chars: int) -> float:
    """Column width (Excel units) needed for n_chars of 12 pt text, plus a little extra."""
    return max(n_chars * 1.35 + 1.5, 4.5)


def _slip_value(st: dict, key: str, flds: list):
    if key == "shape":
        return _slip_shape(st.get("shape_display"))
    if key == "cps":
        return _cps_text(st, flds)
    if key == "remarks":
        return _clean_remarks(st.get("remarks"))
    return st.get(flds[0])


def _plan_options(block: list) -> list:
    """The colour options of one plan group, each with its own total.
    No colour range -> one option. With ranges -> one option per colour row
    (D rows, E rows ...), each including the single-colour stones."""
    singles = [s for s in block if not s.get("color_range")]
    ranges = [s for s in block if s.get("color_range")]

    def make(idx, rows, label):
        nets = [s.get("net_value") for s in rows]
        grosses = [s.get("gross_value") for s in rows]
        pending = any(v is None for v in nets) or any(v is None for v in grosses)
        return {
            "idx": idx,
            "label": label,
            "carat": round(sum(s.get("pol_cts") or 0 for s in rows), 3),
            "gross": None if pending else round(sum(grosses), 2),
            "net": None if pending else round(sum(nets), 2),
        }

    if not ranges:
        return [make(0, singles, "")]
    out = []
    for k in sorted({(s.get("range_index") or 0) for s in ranges}):
        chosen = [s for s in ranges if (s.get("range_index") or 0) == k]
        label = "/".join(sorted({s.get("color") for s in chosen if s.get("color")}))
        out.append(make(k, singles + chosen, label))
    return out


def _plan_lines(block: list) -> list:
    """One printed line per stone. The two colour rows of a range stone (D-E)
    become ONE line that holds both colours."""
    lines, by_range = [], {}
    ordered = sorted(
        block,
        key=lambda s: (str(s.get("plan_no", "")).upper(), s.get("created_at", ""), s.get("range_index") or 0),
    )
    for st in ordered:
        if st.get("color_range"):
            rid = st.get("range_id") or st.get("quote_stone_id")
            idx = st.get("range_index") or 0
            if rid in by_range:
                by_range[rid]["by_idx"][idx] = st
                continue
            line = {"stone": st, "by_idx": {idx: st}}
            by_range[rid] = line
        else:
            line = {"stone": st, "by_idx": None}
        lines.append(line)
    return lines


def _write_slip_sheet(ws, pkt, stones, base_cols, rough, only_final, colour_note,
                      paper_key, paper_code, page_w, page_h):
    # ---- colour options side by side ----
    idx_list = sorted({(s.get("range_index") or 0) for s in stones if s.get("color_range")}) or [0]
    ngroups = len(idx_list)
    pos_of = {idx: p for p, idx in enumerate(idx_list)}

    # layout entry: (key, heading, stone fields, number format, colour group or None)
    if ngroups == 1:
        layout = [(k, h, f, fm, 0 if k in SLIP_COLOUR_KEYS else None) for k, h, f, fm in base_cols]
    else:
        static = [c for c in base_cols if c[0] not in SLIP_COLOUR_KEYS and c[0] != "remarks"]
        colour = [c for c in base_cols if c[0] in SLIP_COLOUR_KEYS]
        remarks = [c for c in base_cols if c[0] == "remarks"]
        layout = [(k, h, f, fm, None) for k, h, f, fm in static]
        for g in range(ngroups):
            layout += [(k, h, f, fm, g) for k, h, f, fm in colour]
        layout += [(k, h, f, fm, None) for k, h, f, fm in remarks]

    # the first column of every colour group after the first gets a thick left line
    group_starts = set()
    prev_g = None
    for i, c in enumerate(layout, start=2):
        if c[4] is not None and c[4] != prev_g and c[4] > 0:
            group_starts.add(i)
        prev_g = c[4]

    thin = Side(style="thin", color="000000")
    thick = Side(style="medium", color="000000")
    center = Alignment(horizontal="center", vertical="center", shrink_to_fit=True)
    final_fill = PatternFill("solid", fgColor="C6E0B4")   # green = final plan
    total_fill = PatternFill("solid", fgColor="262626")   # dark = plan total
    best_fill = PatternFill("solid", fgColor="FFC000")    # amber = highest total
    font = Font(name="Arial", size=SLIP_FONT, bold=False)
    bold_font = Font(name="Arial", size=SLIP_FONT, bold=True)
    total_font = Font(name="Arial", size=SLIP_FONT, bold=True, color="FFFFFF")
    best_font = Font(name="Arial", size=SLIP_FONT, bold=True, color="000000")

    def border_for(i):
        return Border(left=thick if i in group_starts else thin, right=thin, top=thin, bottom=thin)

    ncols = 1 + len(layout)
    last_col = get_column_letter(ncols)
    first_total = next((i for i, c in enumerate(layout, start=2) if c[0] in SLIP_TOTAL_KEYS), None)
    label_merged = bool(first_total and first_total > 2)
    remarks_col = next((i for i, c in enumerate(layout, start=2) if c[0] == "remarks"), None)

    longest = [len("Plan")] + [len(c[1]) for c in layout]

    def seen(col_idx, text):
        longest[col_idx - 1] = max(longest[col_idx - 1], len(str(text)))

    # ---- title ----
    heading = f"ESTIMATE   ·   Packet {pkt}"
    if rough is not None:
        heading += f"   ·   Rough {rough}"
    if only_final:
        heading += "   ·   FINAL PLAN"
        if colour_note:
            shown = sorted({st.get("color") for st in stones if st.get("color_range") and st.get("color")})
            if shown:
                heading += f"   ·   colour {'/'.join(shown)}"
    r = 1
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=ncols)
    tc = ws.cell(row=r, column=1, value=heading)
    tc.font = Font(name="Arial", size=SLIP_TITLE, bold=True)
    tc.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = SLIP_ROW_H * 1.4
    r += 1
    ws.row_dimensions[r].height = 4
    r += 1
    for i, head in enumerate(["Plan"] + [c[1] for c in layout], start=1):
        c = ws.cell(row=r, column=i, value=head)
        c.font = bold_font
        c.border = border_for(i)
        c.alignment = center
    ws.row_dimensions[r].height = SLIP_ROW_H
    ws.print_title_rows = f"{r}:{r}"   # heading repeats if the roll is cut into pages

    # ---- plans: highest total first, lowest last ----
    blocks = []
    for grp, block in groupby(stones, key=lambda s: plan_group_of(s.get("plan_no", ""))):
        block = list(block)
        opts = _plan_options(block)
        nets = [o["net"] for o in opts if o["net"] is not None]
        blocks.append({
            "grp": grp,
            "block": block,
            "opts": opts,
            "score": max(nets) if nets else -1,   # plans not fully priced go last
            "is_final": any(s.get("is_final") for s in block),
        })
    blocks.sort(key=lambda b: (-b["score"], plan_group_sort_key(b["block"][0])))

    # the plan option with the HIGHEST total value (needs two or more priced options)
    cands = [(o["net"], b["grp"], o["idx"]) for b in blocks for o in b["opts"] if o["net"] is not None]
    best = max(cands, key=lambda c: c[0])[1:] if len(cands) >= 2 else None

    for b in blocks:
        for line in _plan_lines(b["block"]):
            r += 1
            st = line["stone"]
            ws.cell(row=r, column=1, value=st.get("plan_no"))
            seen(1, st.get("plan_no", ""))
            nlines = 1
            for i, (key, _h, flds, fmt, g) in enumerate(layout, start=2):
                src = st
                if g is not None and line["by_idx"] is not None:
                    src = line["by_idx"].get(idx_list[g])       # colour columns: this colour's row
                v = None if src is None else _slip_value(src, key, flds)
                cell = ws.cell(row=r, column=i, value=v if v is not None else "—")
                if fmt and isinstance(v, (int, float)):
                    cell.number_format = fmt
                text = _slip_text(v, fmt)
                if key == "remarks":
                    nlines = max(nlines, min(3, -(-len(str(v or "")) // SLIP_REMARKS_W)))
                    text = text[:SLIP_REMARKS_W]
                seen(i, text)
            for i in range(1, ncols + 1):
                cell = ws.cell(row=r, column=i)
                cell.border = border_for(i)
                cell.alignment = center
                cell.font = font
                if b["is_final"]:
                    cell.fill = final_fill
            if remarks_col:
                ws.cell(row=r, column=remarks_col).alignment = Alignment(
                    horizontal="center", vertical="center", wrap_text=True)
            ws.row_dimensions[r].height = SLIP_ROW_H * nlines

        # ---- ONE dark total row per plan: every colour option side by side ----
        r += 1
        name = f"Total {b['grp']}"
        if b["is_final"]:
            name += " ★"
        if best and best[0] == b["grp"]:
            name += " ▲"
        ws.cell(row=r, column=1, value=name)
        if not label_merged:
            seen(1, name)
        opt_at = {pos_of.get(o["idx"], 0): o for o in b["opts"]}
        for i, (key, _h, flds, fmt, g) in enumerate(layout, start=2):
            if label_merged and i < first_total:
                continue                                  # covered by the merged label
            if key == "carat":
                o = b["opts"][0]
                val = o["carat"]
            elif g is not None and g in opt_at:
                o = opt_at[g]
                if key == "color":
                    val = o["label"] or None
                elif key == "gross":
                    val = o["gross"] if o["gross"] is not None else "Pending"
                elif key == "net":
                    val = o["net"] if o["net"] is not None else "Pending"
                else:
                    val = None
            else:
                val = None
            if val is None:
                continue
            cell = ws.cell(row=r, column=i, value=val)
            if fmt and isinstance(val, (int, float)):
                cell.number_format = fmt
            seen(i, _slip_text(val, fmt))
        for i in range(1, ncols + 1):
            cell = ws.cell(row=r, column=i)
            cell.border = border_for(i)
            cell.alignment = center
            cell.fill = total_fill
            cell.font = total_font
            c = layout[i - 2] if i >= 2 else None
            if c and c[4] is not None and best and best[0] == b["grp"] and c[4] in opt_at \
                    and opt_at[c[4]]["idx"] == best[1] and c[0] in ("color", "gross", "net"):
                cell.fill = best_fill                       # the highest option stays amber
                cell.font = best_font
        ws.row_dimensions[r].height = SLIP_ROW_H
        if label_merged:
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=first_total - 1)

    # ---- column widths ----
    widths = [_slip_units(n) for n in longest]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    content_px = sum(int(w * 7 + 5) for w in widths)
    content_in = content_px / 96

    # ---- print setup ----
    forced_land = paper_key in SLIP_LANDSCAPE_PAPERS
    landscape = forced_land or (paper_key != "4x6" and content_in > min(page_w, page_h) - 2 * SLIP_MARGIN)
    ws.print_area = f"A1:{last_col}{r}"
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    if paper_code:
        ws.page_setup.paperSize = paper_code
    else:
        try:  # custom roll size: pick the same size in the print window
            ws.page_setup.paperWidth = f"{page_w * 25.4:.1f}mm"
            ws.page_setup.paperHeight = f"{page_h * 25.4:.1f}mm"
        except Exception:
            pass
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0       # roll paper: as long as it needs to be
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = SLIP_MARGIN
    ws.page_margins.top = ws.page_margins.bottom = SLIP_MARGIN
    ws.page_margins.header = ws.page_margins.footer = 0


@api_router.get("/pricing/quote-stones/export-print")
async def export_print_slip(
    packet_no: Optional[str] = None,
    fields: Optional[str] = None,
    paper: str = "4x6",
    only_final: bool = False,
    final_colour: str = "both",   # final plan only: "both", "first", "second" or a colour letter like "D"
    big: bool = False,            # kept so old links still work
    user: dict = Depends(get_current_user),
):
    if not user_can_export_excel(user):
        raise HTTPException(status_code=403, detail="Not permitted to export")

    paper_key = paper.lower() if paper.lower() in SLIP_PAPER else "4x6"
    paper_code, page_w, page_h = SLIP_PAPER[paper_key]

    wanted = [f.strip() for f in (fields or "").split(",") if f.strip()] or SLIP_DEFAULT
    show_rough = "rough_weight" in wanted
    cps_fields = [f for f in ("cut", "polish", "symmetry") if f in wanted]

    # the columns to print: (key, heading, stone fields, number format)
    base_cols = []
    for key in SLIP_ORDER:
        heading, flds, fmt = SLIP_COLS[key]
        if key == "cps":
            if not cps_fields:
                continue
            flds = cps_fields
        elif key not in wanted:
            continue
        base_cols.append((key, heading, flds, fmt))
    if not base_cols:   # nothing valid ticked: print the default columns
        wanted = SLIP_DEFAULT
        base_cols = [(k, SLIP_COLS[k][0], ["cut", "polish", "symmetry"] if k == "cps" else SLIP_COLS[k][1],
                      SLIP_COLS[k][2]) for k in SLIP_ORDER if k == "cps" or k in wanted]

    query = {"packet_no": packet_no} if packet_no else {}
    items = await db.quote_stones.find(query, {"_id": 0}).to_list(5000)
    if not items:
        raise HTTPException(status_code=404, detail="No stones found")
    items = [with_computed_pricing(i) for i in items]
    rough_of = {}
    for st in items:
        pk = str(st.get("packet_no", ""))
        if pk not in rough_of and st.get("rough_weight") is not None:
            rough_of[pk] = st["rough_weight"]

    fc = (final_colour or "both").strip()
    colour_note = False
    if only_final:
        items = [st for st in items if st.get("is_final")]
        if not items:
            raise HTTPException(status_code=404, detail="No final plan is marked yet")
        if fc.lower() != "both":
            colour_note = True
            letters_of = {}
            for st in items:
                if st.get("color_range"):
                    letters_of.setdefault(st.get("range_id"), set()).add(str(st.get("color", "")).upper())

            def keep(st):
                if not st.get("color_range"):
                    return True
                idx = st.get("range_index") or 0
                if fc.lower() == "first":
                    return idx == 0
                if fc.lower() == "second":
                    return idx == 1
                if fc.upper() in letters_of.get(st.get("range_id"), set()):
                    return str(st.get("color", "")).upper() == fc.upper()
                return True
            items = [st for st in items if keep(st)]
    items.sort(key=stone_sort_key)

    # one sheet per packet (each packet gets the layout it needs)
    wb = Workbook()
    first = True
    for pkt, pkt_items in groupby(items, key=lambda s: str(s.get("packet_no", ""))):
        pkt_items = list(pkt_items)
        ws = wb.active if first else wb.create_sheet()
        first = False
        ws.title = _sheet_title(wb, ws, pkt)
        _write_slip_sheet(
            ws, pkt, pkt_items, base_cols,
            rough_of.get(pkt) if show_rough else None,
            only_final, colour_note, paper_key, paper_code, page_w, page_h,
        )

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"print-{packet_no or 'all'}{'-final' if only_final else ''}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
    
# =====================================================================
# JEWELLERY SECTION
# =====================================================================

JEWELLERY_COLOR_BANDS = {
    "DEF": ["D", "E", "F"],
    "GHI": ["G", "H", "I"],
}
JEWELLERY_CLARITY_BANDS = {
    "VVS-VS": ["VVS1", "VVS2", "VS1", "VS2"],
    "SI": ["SI1", "SI2"],
    "I1": ["I1"],
}
JEWELLERY_MIN_ITEMS_PER_GROUP = 3


def jewellery_color_band_of(color: str) -> Optional[str]:
    for band, members in JEWELLERY_COLOR_BANDS.items():
        if color.upper() in members:
            return band
    return None


def jewellery_clarity_band_of(clarity: str) -> Optional[str]:
    for band, members in JEWELLERY_CLARITY_BANDS.items():
        if clarity.upper() in members:
            return band
    return None


class JewelleryItemBody(BaseModel):
    name: str
    images: List[str] = []
    color: str
    clarity: str
    carat: float
    price: Optional[float] = None
    description: Optional[str] = ""
    is_published: bool = True


@api_router.get("/jewellery/bands")
async def jewellery_bands():
    items = await db.jewellery.find({"is_published": True}, {"_id": 0}).to_list(2000)
    counts = {}
    for item in items:
        cband = jewellery_color_band_of(item["color"])
        clband = jewellery_clarity_band_of(item["clarity"])
        if not cband or not clband:
            continue
        key = (cband, clband)
        counts[key] = counts.get(key, 0) + 1
    groups = [
        {"color_band": c, "clarity_band": cl, "count": n}
        for (c, cl), n in counts.items()
        if n >= JEWELLERY_MIN_ITEMS_PER_GROUP
    ]
    return {"groups": groups}


@api_router.get("/jewellery")
async def list_jewellery(
    color_band: Optional[str] = None,
    clarity_band: Optional[str] = None,
    min_carat: Optional[float] = None,
    max_carat: Optional[float] = None,
):
    query = {"is_published": True}
    if color_band:
        members = JEWELLERY_COLOR_BANDS.get(color_band.upper())
        if not members:
            raise HTTPException(status_code=400, detail="Invalid color_band")
        query["color"] = {"$in": members}
    if clarity_band:
        members = JEWELLERY_CLARITY_BANDS.get(clarity_band.upper())
        if not members:
            raise HTTPException(status_code=400, detail="Invalid clarity_band")
        query["clarity"] = {"$in": members}
    if min_carat is not None or max_carat is not None:
        carat_q = {}
        if min_carat is not None:
            carat_q["$gte"] = min_carat
        if max_carat is not None:
            carat_q["$lte"] = max_carat
        query["carat"] = carat_q

    items = await db.jewellery.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items, "total": len(items)}


@api_router.get("/jewellery/{item_id}")
async def get_jewellery_item(item_id: str):
    item = await db.jewellery.find_one({"item_id": item_id, "is_published": True}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@api_router.post("/admin/jewellery")
async def admin_create_jewellery(body: JewelleryItemBody, user: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["item_id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.jewellery.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/admin/jewellery")
async def admin_list_jewellery(user: dict = Depends(require_admin)):
    items = await db.jewellery.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": items, "total": len(items)}


@api_router.put("/admin/jewellery/{item_id}")
async def admin_update_jewellery(item_id: str, body: JewelleryItemBody, user: dict = Depends(require_admin)):
    result = await db.jewellery.update_one({"item_id": item_id}, {"$set": body.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await db.jewellery.find_one({"item_id": item_id}, {"_id": 0})


@api_router.delete("/admin/jewellery/{item_id}")
async def admin_delete_jewellery(item_id: str, user: dict = Depends(require_admin)):
    result = await db.jewellery.delete_one({"item_id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "deleted"}


app.include_router(api_router)

_cors_env = os.environ.get("CORS_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip() and o.strip() != "*"]
if os.environ.get("FRONTEND_URL"):
    _cors_origins.append(os.environ["FRONTEND_URL"].rstrip("/"))
_cors_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.(emergent\.host|emergentagent\.com)$",
    allow_methods=["*"],
    allow_headers=["*"],
)
