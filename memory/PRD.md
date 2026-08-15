# M.D. Brothers — PRD

## Original Problem Statement
"Im a diamond manufacturer and want to build a website where all people can access through my diamonds and want to build my website similar to Hari krishna exports pvt ltd"

## Brand
- Company: M.D. Brothers (real name provided by user, replaces placeholder "Shree Diamond Exports")
- Owner email (enquiry notifications): shreydoshi16@gmail.com — LIVE
- WhatsApp number: PLACEHOLDER (910000000000) in /app/frontend/src/lib/config.js — user to provide real number

## Architecture
- Frontend: React 19 + Tailwind + shadcn/ui, framer-motion (masked reveals, parallax), lenis (smooth scroll), react-fast-marquee
- Backend: FastAPI + MongoDB (motor), JWT auth (httpOnly cookies, bcrypt), Emergent managed Resend email proxy
- Design: dark luxury (obsidian + gold #CBA153, Cormorant Garamond / Manrope / JetBrains Mono), film grain, kinetic masked hero, sticky manifesto chapters

## User Personas
- Anonymous visitor: browses story + catalog, prices hidden, can WhatsApp/enquire
- Registered trade buyer: logs in, sees prices, sends enquiries
- Admin (owner): manages inventory (add/edit/delete diamonds), views enquiries via API

## Implemented
### 2026-08-13 (initial build)
- Kinetic hero, editorial marquee, manifesto chapters, stats, CTA
- Catalog: 36 seeded sample diamonds, filters (shape/color/clarity/cut/carat slider/SKU search), sorting
- Server-side price gating (hidden until login)
- Diamond detail: 50/50 sticky image + specs + per-stone enquiry form
- Auth: register/login/logout/me/refresh + brute-force lockout
- Enquiry form (contact + detail): stores in DB + emails owner

### 2026-08-15
- Rebranded entire site to "M.D. Brothers"
- Enquiry emails now deliver to shreydoshi16@gmail.com (verified email_sent: true)
- WhatsApp tap-to-chat button on every diamond (detail page + catalog cards), pre-filled message with SKU/specs
- Admin Inventory Manager at /admin: add/edit/delete diamonds, feature-on-homepage toggle, admin-only API (POST/PUT/DELETE /api/diamonds)

## Backlog
- P0: User to share real WhatsApp number (replace placeholder in config.js); user to send real inventory (CSV/photos) for bulk import, or add via /admin
- P1: Photo upload for diamonds (object storage) instead of URL paste; admin UI to view enquiries; logo upload
- P2: Password reset flow; wishlist; diamond comparison; multi-currency; certificate PDF links
