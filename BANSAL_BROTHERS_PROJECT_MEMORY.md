# Bansal Brothers Website — Long-Term Project Memory
> Canonical project continuity document. Update this file whenever a durable project decision, implementation result, blocker, or next step changes.
> Last updated: 2026-11-13
> Status: Planning finalized; Stage 0 not yet executed.

## 0. MEMORY / CONTINUITY PROTOCOL (IMPORTANT)
- Treat this document as the durable GitHub project memory and source of truth for project decisions, stage status, and technical details.
- At the beginning of a future project session, read this file before proposing work. Confirm current stage, completed items, open decisions, and next action.
- Whenever a durable new decision, requirement, architecture change, completed task, test result, blocker, or progress update occurs:
  1. Update this GitHub memory file with the new information, including date and status.
  2. Also update ChatGPT's user memory/Memory summary with a concise durable note where memory controls are available.
  3. If ChatGPT memory cannot be updated directly in the current environment, explicitly tell the user that GitHub memory was updated (if it was) but ChatGPT's internal memory could not be written; retain the detail in the active conversation and this file. Never claim both were updated unless both actions actually succeeded.
- Keep both memory stores aligned. GitHub is the detailed, version-controlled record; ChatGPT memory is a concise pointer/summary and continuity reminder.
- Never overwrite useful history silently. Maintain a dated Change Log and stage progress checklist. Mark outdated decisions as superseded, not erased.
- Do not store passwords, API keys, access tokens, secret values, private customer data, or credentials in this file, GitHub, prompts, commits, or ChatGPT memory. Store only secret names/placeholders; actual values belong in local environment variables or provider secret settings.
- Do not invent completed work. Mark items Planned, In progress, Verified, Blocked, or Not started based on evidence.

## 1. PROJECT IDENTITY AND GOAL
Project: Bansal Brothers — Tea Factory Spare Parts website and business management system.
Business location shown on existing site: Makum Road, Tinsukia, Assam, India (business claims/content have not been independently verified).
Primary goal: turn the existing Claude-generated website into a fully working, secure, maintainable, database-connected business application while preserving its current premium design and visual identity.
The website must ultimately support real customers and day-to-day owner/staff operations: product discovery, order submission, owner/staff approval, stock reservation, order fulfillment, customer records, inventory management, reports, and notifications.

## 2. NON-NEGOTIABLE DESIGN / DEVELOPMENT RULES
1. **Preserve existing website design.** Existing Claude-made frontend is already visually good. Do not redesign, replace the brand identity, remove sections, or simplify animations without explicit user approval.
2. First inspect and understand the actual source. Migrate/refactor carefully; compare before/after appearance and behavior.
3. Work incrementally by stages. No giant “build everything” prompt and no skipping milestones.
4. Before each stage: state scope, files/areas expected to change, risks, and acceptance criteria. After each stage: run available tests, summarize changes, record results and update memory.
5. Avoid unnecessary paid services. The user strongly prefers **everything free**, including development and eventual public website where feasible. Never silently add paid dependencies. Clearly disclose unavoidable costs, quotas, restrictions, or free-tier caveats before choosing a service.
6. Do not claim a feature works until it is implemented and tested. No fake/demo success states in production.
7. Keep secrets out of source control. Use .env.local for local secrets and provider environment settings for deployed secrets; commit only .env.example with placeholder names.
8. Use Git commits/branches/backups for safe rollback. Never overwrite or delete the original site without a backup and explicit approval.
9. Maintain accessible, responsive behavior (mobile-first checks), useful errors, loading/empty states, and secure server-side validation.
10. User prefers practical step-by-step guidance and wants to execute one stage at a time, with explanations before actions.

## 3. CURRENT EXISTING WEBSITE (SOURCE AUDIT SUMMARY)
A file previously uploaded and analyzed: Bansal Brothers – Tea Factory Spare Parts (1).html.
Observed frontend:
- Single HTML page with embedded CSS and JavaScript; visual palette forest green + gold.
- Animated intro/hero, navigation, home/catalog/story/contact/list/part/done hash-route views.
- Responsive/mobile layout; floating WhatsApp action; mobile bottom navigation.
- Dark mode; Hindi/English/Assamese language support; business opening-hours indicator.
- Catalog includes 9 hardcoded sample products:
  - Bearings: 6204 (20×47×14 mm; stock 48), 6205 (25×52×15; stock 32), 6306 (30×72×19; stock 4).
  - Oil seals: 25×47×7 (stock 60), 35×62×8 (stock 26), 50×72×10 (stock 0).
  - Nuts/bolts: M10×50 (stock 200), M12×60 (stock 120), M16×80 (stock 15).
- Existing features include cart/quantity, search, filters, product details, stock badges, localStorage persistence.
- Existing form validates name and 10-digit phone, makes local BB-style order ID, reduces browser-local stock, navigates to confirmation page. **It does not persist or send the order to a real backend/business.** Browser localStorage and JS are not secure or shared.
- WhatsApp links/message prefill exist for inquiries/contact; existing checkout submission is not a real order transmission.
- No live database, secure admin dashboard, server-side order handling, payment gateway, or authoritative inventory.
- Product catalog and business claims are sample/front-end content; do not treat stock or “years in business” claims as verified facts.
- Current prior assessment: visual prototype is strong (~8.2/10 overall as frontend prototype; not production-ready). Frontend design should be preserved.
- Source contains embedded/base64 images and may depend on external Google Fonts.
- Need inspect current GitHub source before deciding how to migrate; uploaded HTML and GitHub repo contents may differ.

## 4. TECHNOLOGY / COST POLICY
Current proposed stack (not yet implemented/verified):
- GitHub: source control, private repository preferred, branches, commits, project documentation.
- Next.js: application frontend and server-side routes/API logic.
- Supabase: PostgreSQL relational database, authentication, storage, APIs, row-level security.
- Hosting: choose later after checking current free plan terms and commercial eligibility. Vercel Hobby is personal/non-commercial; do not assume it is appropriate for an actual commercial Bansal Brothers site. Explore free hosting that explicitly permits commercial use before public launch.
- Local OpenCode/Claude: coding, running app, tests, and local environment. ChatGPT + connected GitHub: repository inspection, documentation, file changes, code review, and planning. GitHub connector alone cannot execute code on user's local computer.
- User specifically asked whether MongoDB is better/larger. Current comparison discussed: Supabase Free PostgreSQL DB quota 500 MB vs MongoDB Atlas M0 free storage 512 MB; MongoDB is only slightly larger on raw storage. Exact quotas/pricing can change; verify current official plan limits before implementation. Supabase was recommended due to relational data, transactional order/stock operations, and RLS—not because it has more storage.
- Supabase Free may pause inactive projects and has quota/backup limitations. Need verify current plan, retention, storage, and recovery before production.
- Zero-cost target is a preference/goal, not a promise. Domain registration, WhatsApp official business messages, commercial hosting, backups, or other services may incur cost. Notify user before any paid or commercial restriction.
- Never store actual Supabase service-role key, DB password, WhatsApp token, or any credentials in GitHub or this memory.

## 5. FINALIZED BUSINESS REQUIREMENTS
### Customer website
- Preserve current design, green/gold branding, animations, dark mode, multilingual options, responsive/mobile behavior.
- Real product catalog backed by DB; categories, images, specifications, SKU/part number, price, availability, stock visibility as appropriate.
- Search by product name, SKU/part number, category, and relevant specifications; category and availability filters.
- Product detail pages, cart, quantity controls, checkout, order confirmation with permanent order ID.
- Customer data: name, phone, delivery/contact address and relevant order details; collect only necessary data.
- Order tracking by secure mechanism (order ID plus verification or secure customer link; do not expose other people's orders by guessable IDs).
- WhatsApp contact/inquiry entry points.
- About/contact/business information; verify claims and contact details with owner before launch.

### Order workflow — DECIDED
- Customer submits order -> order stored in database with **Pending approval** status.
- Owner/staff receives notification (WhatsApp planned).
- Owner or authorized staff reviews and approves or rejects.
- **Stock is reserved/reduced at confirmation/approval**, not at initial customer submission and not only after delivery.
- Rejecting a pending order does not change stock.
- Confirmed order cancellation must release reserved stock exactly once, if policy permits.
- Use atomic/transactional server-side stock reservation; prevent race conditions and overselling.
- COD/offline payment is initial payment method. Payment status is separate from fulfillment status (e.g. unpaid/paid/refunded/waived as appropriate).
- Track status lifecycle such as Pending, Confirmed, Processing, Ready for Dispatch, Shipped, Delivered, Cancelled/Rejected. Define transitions and permissions explicitly.
- Customer receives order confirmation and meaningful status updates; do not call pending order “confirmed.”
- Unique durable order numbers; protect against duplicate submissions/idempotency.

### Dashboard and roles — DECIDED
- Full dashboard: Overview, Orders, Products, Categories, Inventory, Customers, Analytics, Reports, Staff, Settings, Notifications.
- Access: owner + authorized staff; owner full permissions, staff restricted by role/permissions. User selected “staff” access option (owner + authorized staff).
- Owner can add/edit/delete/publish products, manage prices/specifications/images, view/update orders, stock adjustments, customers, reports, settings, and staff access.
- Staff permissions must be role-based and enforced server-side/database-side, not merely by hiding UI.
- Analytics: order totals, sales/revenue, pending/completed orders, best-selling products, low-stock items, stock valuation. Profit reporting requires purchase costs and expense data; do not calculate profit from sales alone.
- Reports export (CSV at minimum) and customer order history.
- Audit/inventory movement log for stock changes and who made them.

### Notifications — DECIDED
- WhatsApp is selected as notification channel.
- Plan for official WhatsApp Business Platform or a compliant provider. Free message availability and costs depend on current provider/Meta rules; verify before implementation. Do not use unreliable browser automation or expose API credentials.
- Notification events: new order to owner/staff; approval/rejection/status updates to customer; operational logs, retries, and failure handling.
- Dashboard notification can be included as baseline. Email was not selected as primary channel.

## 6. DATABASE DESIGN DIRECTION (PROPOSED, NEEDS FINAL SCHEMA REVIEW)
Likely PostgreSQL tables:
- products (SKU, name, description, specifications, category_id, price, active/published, images, stock-related fields)
- categories
- orders (public order number, customer reference/contact snapshot, status, payment method/status, totals, timestamps, delivery information)
- order_items (order reference, product reference, product/SKU/name/price snapshots, quantity, subtotal)
- customers (contact/address and customer profile, with privacy controls)
- inventory_movements (product, delta/type, reason, actor, order link, timestamp)
- profiles/users (Supabase Auth identity, role/permissions)
- notifications (event, recipient, status, provider response metadata without secrets)
- settings (business configuration)
Potential additional stock reservations, suppliers/purchase orders, expenses, and audit tables later.
Important: schema, foreign keys, constraints, indexes, RLS, and transaction logic must be designed and reviewed before migrations. Keep price/spec snapshots on order items so historic orders don't change when products are edited. Do not trust client-supplied prices or quantities; validate server-side. Use secure RLS and service secrets only server-side.

## 7. DEVELOPMENT STAGES — MASTER ROADMAP
Stage 0 — Safety, repository, baseline
- Locate correct existing website repo; do not assume mine repo is the website.
- Backup original source and establish branch strategy.
- Record baseline screenshots/behavior and assets.
- Add project memory and stage checklist.
- No destructive edits.

Stage 1 — App conversion
- Create Next.js structure and migrate current HTML/CSS/JS without visual regression.
- Preserve assets, routing, animations, language/dark mode, responsive nav, and current catalog UX.
- Run local build and compare against baseline.
- Completion: existing site appearance and key behavior retained in app.

Stage 2 — Backend/database foundation
- Create Supabase project and migrations.
- Design schema and RLS; setup authentication and owner/staff roles.
- Secure environment variables; connect app server-side.
- Completion: secure DB read/write proof and auth tests.

Stage 3 — Product/catalog integration
- Move catalog/categories/images to DB/storage.
- Replace demo data and local stock authority.
- Implement actual DB search/filter/product detail.
- Completion: product updates reflect in customer site.

Stage 4 — Ordering
- Cart/checkout, customer form, COD, durable order creation, order number, pending approval, tracking.
- Server-side validation, idempotency, error states.
- Completion: test order appears in DB/dashboard and can be safely tracked.

Stage 5 — Owner/staff dashboard
- Authentication, role-based pages, order approvals, product CRUD, customer view, overview, analytics/report exports.
- Completion: owner/staff can manage core business without editing code.

Stage 6 — Inventory
- Atomic stock reservation on approval; cancellation release; stock adjustment and movement history; low-stock alerts; prevent overselling.
- Completion: concurrency and cancellation tests pass.

Stage 7 — WhatsApp
- Provider selection after cost/eligibility research; server-side notifications and retry/logging.
- Completion: verified test notification end-to-end.

Stage 8 — QA/security/recovery
- Responsive, accessibility, functional, permission, RLS, order/inventory concurrency, backup/restore, privacy and error tests.
- Completion: critical acceptance checklist passes.

Stage 9 — Deployment
- Choose free/commercial-eligible hosting, set environment secrets, deploy, domain decision, monitoring, backup and launch.
- Public launch is postponed until user explicitly decides; public/commercial deployment isn't current immediate task.

## 8. WORKING METHOD / AI DEVELOPER RULES
- One stage at a time; user approves moving to next stage.
- Use stage-specific prompts/specs and acceptance tests.
- AI developer (OpenCode/Claude) must inspect repo before changes and report its plan.
- No redesign, no unrelated refactors, no removing existing features without approval.
- Use feature branch, incremental commits, diffs, tests/build, and rollback.
- Ask before destructive or irreversible actions.
- Do not assume tools, integrations, deployment, or test success; verify and report.
- ChatGPT can use connected GitHub to inspect and make repository/document changes. Local execution, browser visual testing, local filesystem and running servers require user's local OpenCode/computer environment or other explicitly connected tools.
- Keep a concise stage status and exact next action at the top/near progress section.

## 9. CURRENT STATUS (AS OF 2026-11-13)
- [x] Existing website source previously analyzed (uploaded HTML).
- [x] High-level product requirements and full roadmap agreed.
- [x] Free-first constraint recorded.
- [x] Supabase preferred over MongoDB (relational/transaction rationale); final decision can be revisited only with reason.
- [x] Order approval workflow selected.
- [x] COD/offline payment selected.
- [x] Stock reservation at order approval selected.
- [x] Owner + authorized staff dashboard selected.
- [x] Full dashboard scope selected.
- [x] WhatsApp notifications selected.
- [x] Weekly development progress review automation requested/created (verify automation remains active if relevant).
- [ ] Identify actual website GitHub repository.
- [ ] Create memory file in correct dedicated/private website repo or move this file from temporary location.
- [ ] Stage 0 not started.
- [ ] Stage 1 not started.
- [ ] Supabase project not confirmed created.
- [ ] No real backend/database integration yet.
- [ ] No owner dashboard yet.
- [ ] No real order persistence/WhatsApp integration yet.
- [ ] Public launch deferred.

**Next action:** Identify the correct repository containing the Claude-generated Bansal Brothers website. Inspect its root and files. Put this memory document in that repository (prefer private visibility). Then complete Stage 0 backup/baseline and prepare Stage 1 prompt.

## 10. CHANGE LOG
### 2026-11-13 — Initial durable project plan
- Established preservation-first goal: keep Claude website design and make it fully functional.
- Set free-first development and service selection policy.
- Proposed GitHub + Next.js + Supabase + hosting chosen later.
- Recorded order, COD, inventory reservation, staff access, full dashboard, WhatsApp decisions.
- Defined ten-stage execution roadmap (Stages 0–9).
- Added dual-memory sync protocol: durable updates should go to GitHub project memory and ChatGPT memory where available; be honest when either is unavailable.
