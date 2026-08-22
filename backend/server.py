from dotenv import load_dotenv
from pathlib import Path

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
# ---------------- Email (Emergent managed Resend proxy) ----------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Shree Diamond Exports")
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
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client_http:
            resp = await client_http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
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
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60), "type": "access"}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user_id: str, email: str):
    response.set_cookie("access_token", create_access_token(user_id, email), httponly=True, secure=True, samesite="none", max_age=3600, path="/")
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
    response.set_cookie("access_token", create_access_token(user["user_id"], user["email"]), httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    return {"status": "refreshed"}


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

    # guarantee demo match-pairs: clone every other stone of the first 8 with near-identical specs
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
    # Browsing is public. Only approved/admin users get to see price.
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
        if buyer and EMAIL_KEY:
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
    if OWNER_EMAIL and EMAIL_KEY:
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
    await seed_admin()
    await seed_demo_buyer()
    if await db.diamonds.count_documents({}) == 0:
        await db.diamonds.insert_many(build_seed_diamonds())
        logger.info("Seeded 36 diamonds")
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


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
