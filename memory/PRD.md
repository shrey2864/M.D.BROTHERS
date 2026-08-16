# M.D. Brothers — PRD

## Original Problem Statement
"Im a diamond manufacturer and want to build a website where all people can access through my diamonds and want to build my website similar to Hari krishna exports pvt ltd"

## Brand
- Company: M.D.Brothers (real name provided by user, replaces placeholder "Shree Diamond Exports")
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

### 2026-08-15 (round 2 — addresses, real figures, story images, stock feed)
- Addresses updated: Head Office — Bharat Diamond Bourse, BKC, Mumbai; Manufacturing Unit — Mahidharpura, Surat (Footer + Contact page)
- Real figures everywhere: manufactures 0.18–10 ct, 1,500+ stones in stock (hero copy, stats strip, catalog carat slider now 0.18–10)
- Our Story rewritten: Ch01 "Sourced From Antwerp & Dubai", Ch02 "The Scaife & The Hand" (Mahidharpura unit, workers on polishing disc — new workshop craftsman photo), Ch04 references Bharat Diamond Bourse HQ + craftsman-with-loupe photo
- Stock Feed API sync (admin /admin): save feed URL + optional API key, "Sync Now" pulls JSON or CSV feed, flexible field mapping (sku/stock_id, carat/weight, price/total, lab/cert…), upserts by SKU, reports added/updated/skipped. Endpoints: GET/POST /api/stock-feed, POST /api/stock-feed/sync (admin-only)
- Sample inventory reseeded: 36 stones, SKU prefix MDB-*, carats 0.18–10

### 2026-08-15 (round 3 — private collection + KYC approval)
- Craftsman/worker photos removed from Our Story per user feedback (back to diamond imagery)
- Collection is now MEMBERS ONLY: /api/diamonds + /api/diamonds/{id} require approved login (401 anonymous, 403 pending); Catalog, DiamondDetail and Home featured section show gate/pending panels for non-approved visitors
- Registration now requires: full name, company, KYC/legal name, mobile, email, password → account created as "pending"; success screen explains manual approval
- Admin buyer approvals: GET /api/admin/users, POST /api/admin/users/{id}/status (approved/rejected/pending); /admin page has "Buyer approvals" table with KYC details and Approve/Reject buttons
- Approval email: approving a buyer automatically emails them a branded "account approved" message with a sign-in button (verified: email_sent true via test inbox)

### 2026-08-15 (round 4 — downloads + story wording)
- Our Story rewritten without place names (customer-friendly): "Handpicked At Origin", "The Scaife & The Hand" (0.18 ct to 10 ct+ range mentioned), "Certified, Without Exception", "A Quiet Global Trust"
- Per-diamond downloads: certificate PDF link, 360° video link, image download — shown on diamond detail page; certificate_url/video_url fields in DiamondBody, admin form, and stock-feed mapping (video/video_url, cert_url/report_url etc.)

### 2026-08-16
- Favicon from logo: cropped transparent logo mark → favicon.png (64px) + apple-touch-icon.png (180px), linked in index.html, theme-color #07131F
- Fonts: site-wide Inter (body) + Inter Tight (display headings) with Segoe UI fallback, replaces Cormorant Garamond/Manrope
- Admin login changed to owner's: shreydoshi16@gmail.com / Sd246810 (shrey@mdbrothers.in was briefly set then reverted per user); old test admin deleted
- Match Pair search at /match-pair (nav: Match Pair, members-only): shape picker, carat from/to, color/clarity/lab filters → GET /api/match-pairs pairs stones with same shape+color+clarity and carat within max(0.03ct, 2%); pair cards show both stones, total carat, combined price, WhatsApp enquiry; seed generates 4 guaranteed twin pairs (MDB-2000/2002/2004/2006)

### 2026-08-15 (round 8 — bugfix + polish)
- FIXED Collection crash ("Cannot read properties of undefined (reading 'includes')") — filters state was missing polish/symmetry keys; added to state init + params loop
- Collection link removed from nav (still reachable via Search results)
- Hero image replaced with sharp 1600px single-diamond-on-glass photo (/app/frontend/public/hero-diamond.jpg); story ch04 now uses the old brown macro (no duplicate images)
- Search page: proper faceted shape icons (outer + inner table lines), Colour | Fancy Colour split label

### 2026-08-15 (round 7 — hero image + exact HK filter spec)
- Hero image replaced with user-picked diamond photo (/app/frontend/public/hero-diamond.jpg, from user's Google share link)
- Search page: custom carat From/To inputs + Apply; colors D–N + O-Z + Fancy row (FANCY, PURPLISH, YELLOW, ORANGE, BLUE, PINK, BROWN, GRAY, GREEN — exact HK order); clarity FL, IF, VVS1, VVS2, VS1, VS2, SI1, SI2, SI3, I1, I2, I3; quick toggles 3EX / 2EX / 3VG+ / NO BGM in sticky bottom bar
- Search link hidden from public nav (members only, gated page)
- Backend: polish/symmetry filter params; color filter handles "O-Z" (regex ^[O-Z]) and "Fancy" (regex ^Fancy); seed reseeded with D–N + fancy colors + full clarity scale
- Catalog sidebar groups extended to match (colors incl. O-Z + fancy, polish, symmetry)

### 2026-08-15 (round 6 — logo + Midnight Sapphire theme)
- Official M.D.Brothers logo integrated (white background removed → transparent PNG at /app/frontend/public/logo.png) in header + footer
- Full retheme to "Midnight Sapphire" matching the logo: bg #07131F, surfaces #0C1E30/#0A1A2B, accent ice blue #5DA9E4 / sapphire #2E7CB8 (tailwind `gold` tokens remapped to blue), approval email button now sapphire
- Customer Dashboard at /dashboard: tiles (New Goods 7d, Total Stones, Featured, My Enquiries), featured stones strip, "Just Uploaded" latest grid, "Your M.D.Brothers Desk" contact card (WhatsApp + email); login now lands on /dashboard; GET /api/dashboard (approved-only)

### 2026-08-15 (round 5 — KYC PDF upload, business type, HK-style search page)
- Registration: added "Registering as" selector (Owner / Sales Representative / Trader / Manufacturer) + mandatory KYC PDF upload (max 10 MB, object storage via Emergent objstore, path mdbrothers/kyc/{user_id}/{uuid}.pdf)
- Admin buyers table: new Type column + KYC Doc PDF download button (GET /api/users/kyc-document/{user_id}, admin-only)
- New /search page (HK-style selection screen): shape icon grid (9 shapes, inline SVG), carat presets (30s Down … 5 ct+), pill groups for Color/Clarity/Fluorescence/Lab/Cut/Polish/Symmetry, sticky action bar with filter count + Reset + Search → routes to /collection with URL params
- Login now lands on /search; header has Search link
- Catalog reads URL params (shape/color/clarity/cut/fluorescence/lab/min_carat/max_carat); sidebar extended with Fluorescence + Lab groups; backend list_diamonds supports fluorescence + lab filters
- Demo buyer (demo@buyer.com) auto-marked approved by seed

## Backlog
- P0: User to share real WhatsApp number; user to paste their real stock feed API link in /admin (or send CSV/photos for bulk import)
- P1: Photo upload for diamonds (object storage) instead of URL paste; admin UI to view enquiries; logo upload
- P2: Password reset flow; wishlist; diamond comparison; multi-currency; certificate PDF links
