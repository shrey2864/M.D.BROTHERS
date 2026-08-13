# Shree Diamond Exports — PRD

## Original Problem Statement
"Im a diamond manufacturer and want to build a website where all people can access through my diamonds and want to build my website similar to Hari krishna exports pvt ltd"

## Architecture
- Frontend: React 19 + Tailwind + shadcn/ui, framer-motion (masked reveals, parallax), lenis (smooth scroll), react-fast-marquee
- Backend: FastAPI + MongoDB (motor), JWT auth (httpOnly cookies, bcrypt), Emergent managed Resend email proxy for enquiries
- Placeholder brand: "Shree Diamond Exports" (user will supply real name/logo)

## User Personas
- Anonymous visitor: browses story + catalog, prices hidden
- Registered trade buyer: logs in, sees prices, sends enquiries
- Admin: views all enquiries via API

## Implemented (2026-08-13)
- Dark luxury design (obsidian + gold #CBA153, Cormorant Garamond / Manrope / JetBrains Mono)
- Kinetic hero: masked line-by-line reveal, parallax diamond image, film grain overlay
- Editorial slow marquee; numbered manifesto chapters (01–04) with sticky stacking
- Catalog: 36 seeded diamonds, filters (shape/color/clarity/cut/carat slider/SKU search), sorting
- Price gating: prices stripped server-side for anonymous users; visible after login
- Diamond detail: 50/50 sticky image + specs + per-stone enquiry form
- Auth: register/login/logout/me/refresh, brute-force lockout (5 attempts / 15 min)
- Enquiry form (contact + detail page): stores in DB, emails owner via Resend proxy
  - NOTE: OWNER_EMAIL is placeholder (owner@shreediamondexports.com) — email send currently blocked as undeliverable; enquiry still stored. User to provide real email.
- Admin endpoint GET /api/enquiries

## Backlog
- P0: Set real OWNER_EMAIL for enquiry emails; replace brand name/logo with user's real company
- P1: Admin dashboard UI to view enquiries; replace sample diamond data with real inventory (bulk import)
- P2: Password reset flow; diamond comparison; wishlist; multi-currency pricing; WhatsApp enquiry button
