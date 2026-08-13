from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
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
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
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
    return {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "role": user.get("role", "buyer"), "company": user.get("company")}


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


class RegisterBody(BaseModel):
    name: str
    email: EmailStr
    password: str
    company: Optional[str] = None


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
        "company": body.company,
        "password_hash": hash_password(body.password),
        "role": "buyer",
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
COLORS = ["D", "E", "F", "G", "H", "I", "J"]
CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1"]
DIAMOND_IMAGES = [
    "https://images.unsplash.com/photo-1702149001693-67ca09997ecc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHw0fHxkaWFtb25kJTIwZ2Vtc3RvbmUlMjBjbG9zZSUyMHVwfGVufDB8fHx8MTc4NjYzODA0MXww&ixlib=rb-4.1.0&q=85&w=900",
    "https://images.unsplash.com/photo-1638517747421-a1eb8b4c9828?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHw0fHxkaWFtb25kJTIwY3V0dGluZyUyMHBvbGlzaGluZ3xlbnwwfHx8fDE3ODY2MzgwNDF8MA&ixlib=rb-4.1.0&q=85&w=900",
    "https://images.unsplash.com/photo-1592136184798-ca0d8e17643a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwyfHxkaWFtb25kJTIwY3V0dGluZyUyMHBvbGlzaGluZ3xlbnwwfHx8fDE3ODY2MzgwNDF8MA&ixlib=rb-4.1.0&q=85&w=900",
    "https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwxfHxkaWFtb25kJTIwZ2Vtc3RvbmUlMjBjbG9zZSUyMHVwfGVufDB8fHx8MTc4NjYzODA0MXww&ixlib=rb-4.1.0&q=85&w=900",
]


def build_seed_diamonds() -> List[dict]:
    rng = random.Random(42)
    color_f = {"D": 1.6, "E": 1.45, "F": 1.3, "G": 1.15, "H": 1.0, "I": 0.88, "J": 0.78}
    clarity_f = {"FL": 1.5, "IF": 1.4, "VVS1": 1.3, "VVS2": 1.2, "VS1": 1.1, "VS2": 1.0, "SI1": 0.85}
    cut_f = {"Excellent": 1.2, "Very Good": 1.05, "Good": 0.9}
    diamonds = []
    for i in range(36):
        shape = SHAPES[i % len(SHAPES)]
        carat = round(rng.uniform(0.30, 5.0), 2)
        cut = rng.choice(CUTS)
        color = rng.choice(COLORS)
        clarity = rng.choice(CLARITIES)
        price = int(round(carat * 3800 * color_f[color] * clarity_f[clarity] * cut_f[cut] * (1 + carat * 0.35), -1))
        diamonds.append({
            "diamond_id": str(uuid.uuid4()),
            "sku": f"SDE-{1000 + i}",
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
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
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
    q: Optional[str] = None,
    sort: str = "featured",
    limit: int = Query(default=60, le=200),
):
    query = {}
    if shape:
        query["shape"] = {"$in": shape.split(",")}
    if cut:
        query["cut"] = {"$in": cut.split(",")}
    if color:
        query["color"] = {"$in": color.split(",")}
    if clarity:
        query["clarity"] = {"$in": clarity.split(",")}
    if min_carat is not None or max_carat is not None:
        query["carat"] = {}
        if min_carat is not None:
            query["carat"]["$gte"] = min_carat
        if max_carat is not None:
            query["carat"]["$lte"] = max_carat
    if q:
        query["sku"] = {"$regex": re.escape(q), "$options": "i"}

    sort_map = {
        "price_asc": [("price", 1)],
        "price_desc": [("price", -1)],
        "carat_desc": [("carat", -1)],
        "carat_asc": [("carat", 1)],
        "featured": [("featured", -1), ("carat", -1)],
    }
    cursor = db.diamonds.find(query, {"_id": 0}).sort(sort_map.get(sort, sort_map["featured"])).limit(limit)
    items = await cursor.to_list(limit)
    total = await db.diamonds.count_documents(query)

    user = await get_optional_user(request)
    if not user:
        for d in items:
            d.pop("price", None)
    return {"items": items, "total": total}


@api_router.get("/diamonds/{diamond_id}")
async def get_diamond(diamond_id: str, request: Request):
    d = await db.diamonds.find_one({"diamond_id": diamond_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Diamond not found")
    user = await get_optional_user(request)
    if not user:
        d.pop("price", None)
    return d


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
async def list_enquiries(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
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
    if not await db.users.find_one({"email": email}):
        await db.users.insert_one({
            "user_id": str(uuid.uuid4()),
            "email": email,
            "password_hash": hash_password("Demo@1234"),
            "name": "Demo Buyer",
            "company": "Demo Jewels BV",
            "role": "buyer",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.diamonds.create_index("diamond_id", unique=True)
    await seed_admin()
    await seed_demo_buyer()
    if await db.diamonds.count_documents({}) == 0:
        await db.diamonds.insert_many(build_seed_diamonds())
        logger.info("Seeded 36 diamonds")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o for o in [os.environ.get("FRONTEND_URL"), "http://localhost:3000"] if o],
    allow_methods=["*"],
    allow_headers=["*"],
)
