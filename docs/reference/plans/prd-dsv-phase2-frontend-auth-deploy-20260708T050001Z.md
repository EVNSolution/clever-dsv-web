# PRD — DSV Phase 2 Frontend, Customer Auth, and Deploy Plan

## Status
RALPLAN draft pending Architect/Critic review. Planning artifact only.

## Requirements Summary
1. Convert DSV demo intent into real product screens inside the existing CLEVER Route platform.
2. Add DSV admin/ops pages for customer companies, customer users/invites, and customer/order viewer links.
3. Add customer web viewer with `/customer/login` and `/customer/{customerId}`.
4. Customer viewer must show only that customer company's orders/items/vehicles/stops.
5. Support one customer-facing order split across multiple vehicles.
6. Customer-facing destination numbering is `1..N`, never internal stop sequence.
7. Show ETA, expected dwell/stop window, completed-at when completed, route, vehicles, and item list.
8. Keep route engine internal via clever-route-server OSRM/VROOM; no public OSRM production fallback.
9. Prepare `dsv.cleversystem.ai` Caddy/DNS/deploy, but execute production changes only after explicit approval.

## RALPLAN-DR Summary

### Principles
1. **One platform first**: reuse `delivery-api`, `route-ops-web`, static image/deploy workflow, and OSRM/VROOM services.
2. **Auth before UI truth**: server session/company scope enforces customer isolation.
3. **Canonical logistics reuse**: reuse `Order`, `OrderItem`, `DeliveryStop`, `RoutePlanStop`, `Vehicle`, `Driver`, `DriverProofMedia`.
4. **MVP grouping over premature schema**: represent customer-facing Orders by grouped canonical orders first.
5. **Reversible deploy**: Caddy/DNS changes must be small, rollbackable, and smoke-tested.
6. **Customer shell is a separate trust boundary**: customer pages may share the static bundle, but must not share admin bootstrap DTOs, admin nav, admin CSRF, or admin session cookies.

### Decision Drivers
1. Fastest path from demo + Phase 1 backend to usable MVP.
2. Correct customer data isolation and login/session behavior.
3. Lowest deployment and operational risk on existing AWS/SSM/Caddy lane.

### Viable Options

#### Option A — Extend existing `route-ops-web` and `delivery-api` (Recommended)
- Pros: least infra churn; reuses MapLibre/map helpers; one static artifact; same CI/deploy path.
- Cons: frontend routing must support admin and customer contexts despite current Vite base `/admin/ui/app/`; this is acceptable only if the customer shell has its own route table, bootstrap DTO, API client prefix, and session cookie boundary.

#### Option B — New `apps/dsv-web` static app in same repo/compose
- Pros: cleaner UI boundary.
- Cons: new package/build/deploy plumbing; more CI/Caddy/compose changes; only justified if Option A is blocked.

#### Option C — External GitHub Pages customer/demo UI
- Pros: no platform frontend edits.
- Cons: weak auth story, CORS/origin complexity, public asset/API coupling. Rejected for real MVP.

## ADR

### Decision
Use **Option A**: extend existing Route Ops web app and delivery-api static/API surface. Add DSV customer login/viewer and DSV admin pages inside the current monorepo/deploy workflow. Add `dsv.cleversystem.ai` as a Caddy host alias to `delivery-api:3000` only after code verification.

### Why chosen
It maximizes reuse, keeps OSRM/VROOM internal, avoids public CORS/auth complexity, and minimizes production deployment changes.

### Consequences
- Need clean frontend route context separation (`admin` vs `customer`).
- Need minimal customer-session implementation in delivery-api.
- Need strong tests for customer data isolation and grouped order rendering.
- Need a fallback trigger: if a customer-safe shell cannot be isolated inside the existing bundle without admin leakage or ad hoc branching, switch to Option B (`apps/dsv-web`) before implementation grows.

## Implementation Plan

### Phase 0 — Stabilize prerequisite branch
- Commit/merge current Phase 1 DSV backend foundation before Phase 2.
- Re-run Phase 1 validation: Prisma validate/generate, lint, typecheck, targeted DSV route tests.

### Phase 1 — Customer session and API contract
- Replace locked customer auth stub in `dsv-customer-viewer.dependencies.ts:25-28`.
- Add `GET/POST /customer/login`, `POST /customer/logout`, `GET /customer/me`.
- Phase 2 auth decision: `/customer/login` is password login for already-created `DsvCustomerUser`; invite acceptance only creates/activates that user and is a separate admin-issued link flow. No public signup.
- Customer/admin cookie isolation contract:
  - customer cookie name: `clever_dsv_customer_session`;
  - customer cookie path: `/customer`;
  - customer cookie domain: omit `Domain` so the browser uses the exact host that set it;
  - flags: `HttpOnly`, `Secure` in production, `SameSite=Lax`;
  - admin session cookie names/paths are never accepted by customer auth;
  - customer session cookies are never accepted by admin auth;
  - customer and admin sessions may coexist in one browser because name/path are distinct.
- Treat `/customer/{customerId}` as the DSV customer company id for MVP. The server must verify it equals the authenticated session's company id before returning data. A public slug/opaque id can be added later without changing the session rule.
- Extend `/customer/:customerId/orders`; add `/customer/:customerId/orders/:orderKey`.
- Always constrain queries by authenticated `dsvCustomerCompanyId` and verify URL customer id.
- MVP order grouping is a read model/presentation aggregate, not a core logistics schema mutation: customer-facing order = canonical `Order` rows grouped by deterministic DSV order key. Grouping key priority: `sourceOrderNumber`, then `sourceOrderId`, then explicit DSV key from `rawPayload`; if none exists, the row is not grouped across stops and is flagged for review. Keep `DeliveryStop` and `RoutePlanStop` one-stop invariants intact. Each child order owns one destination/stop, items, and route assignment.

### Phase 2 — Route Ops frontend integration
- Add admin routes under `/admin/ui/app/dsv/*`.
- Add customer shell routes for `/customer/:customerId` and `/customer/:customerId/orders/:orderKey`.
- Implement customer shell as a first-class context:
  - customer-safe bootstrap endpoint, separate from admin `BootstrapPayload`;
  - customer bootstrap DTO whitelist: `{ user: { id, name, email, phone }, customerCompany: { id, name }, mapConfig: customer-safe map settings, routes: customer route/API paths, csrfToken?: customer-only mutation token if future customer mutations are added }`;
  - customer-only API client prefix under `/customer/api` or `/customer/:customerId/api`;
  - no admin nav, admin CSRF token, store/session picker, notification stream, or admin app URLs in customer DTOs;
  - hard response rule: customer APIs must whitelist fields and must not serialize admin DTOs by omission/filtering alone;
  - shared visual/map components are allowed only through explicit props with customer-safe data.
- Reuse existing MapLibre helpers where feasible; do not copy large demo simulation code into production.
- If Vite base blocks customer shell assets, first try delivery-api shell asset prefix reuse; if that requires admin-shaped branching or leaks admin bootstrap/session assumptions, switch to Option B before coding further.

### Phase 3 — DSV admin screens
- Customer company list/detail.
- User/invite creation with minimal required fields: name, email, phone, invite/token.
- Viewer link buttons for customer and order pages.
- Use existing admin session/CSRF/API style.

### Phase 4 — Data model gap checkpoint
- Try grouped canonical Orders first.
- Add `DsvCustomerOrder` parent only if grouping is insufficient for ingestion/header semantics.
- Do not add shipment item tables unless item allocation to vehicle/stop cannot be inferred.

### Phase 5 — Domain, Caddy, deploy prep
- Add `dsv.cleversystem.ai` Caddy block mirroring `clever-route.cleversystem.ai`.
- Verify DNS target.
- Run existing deploy workflow dry-run first, then user-approved real deploy.
- Smoke `/healthz`, `/customer/login`, `/customer/{customerId}`, `/admin/ui/app/dsv/*`.

## Acceptance Criteria
1. Customer login sets an httpOnly cookie and redirects to `/customer/{customerId}`.
2. Unauthenticated and cross-customer requests are rejected server-side.
3. Customer order list includes only current customer's grouped orders.
4. Multi-vehicle grouped order fixture is supported.
5. Destination numbering is customer-facing `1..N`.
6. Completed destinations show completed-at; active/future destinations show ETA and dwell estimate.
7. Admin can create/list customer companies and initiate invites; no public signup.
8. Static build works through existing delivery-api shell/static serving.
9. No GitHub Pages dependency remains for MVP.
10. Domain/Caddy deploy is dry-run and smoke-tested before public use.
11. Customer bootstrap contains no admin nav, admin CSRF token, admin app URLs, store session fields, or admin notification stream config.
12. Admin cookie does not authenticate customer routes; customer cookie does not authenticate admin routes.
13. Host-header smoke verifies both `dsv.cleversystem.ai` and `clever-route.cleversystem.ai` behavior after Caddy changes.
14. Customer session cookie is named `clever_dsv_customer_session`, scoped to `/customer`, host-only, `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
15. Customer bootstrap conforms to the explicit whitelist and fails tests if any admin-only field is added.

## Risks and Mitigations
- Vite base conflict: attempt same static manifest/shell first; only then introduce minimal second shell/build target.
- Customer order semantic mismatch: group canonical Orders by DSV key for MVP; add parent model only if needed.
- Data leak risk: every API query constrained by session customer company; tests include other-customer fixtures.
- Deploy blast radius: dry-run, small Caddy block, smoke, rollback artifact.
- OSRM contention: smoke and monitor; separate engine only after measured contention.
- Mixed admin/customer bundle risk: customer shell must have separate bootstrap/API/session contracts; if not clean, use `apps/dsv-web` rather than ad hoc branching.

## Follow-up Staffing Guidance
- Default execution: `$ultragoal`.
- Use `$team` under Ultragoal for parallel lanes:
  - `executor`: backend auth/API.
  - `executor` or `designer`: frontend pages/components.
  - `test-engineer`: unit/integration/e2e fixtures.
  - `verifier`/`git-master`: deploy dry-run and release evidence.
- `$ralph` only as explicit single-owner fallback.

## Goal-Mode Suggestions
- Recommended: `$ultragoal`.
- Parallelizable: `$team` + `$ultragoal`.
- `$performance-goal` only if map/OSRM speed becomes primary.
- `$autoresearch-goal` not needed.

## Changelog
- Initial RALPLAN draft created from repo inspection and prior DSV Phase 1 evidence.
- Architect ITERATE feedback applied: explicit customer trust boundary, customer-safe bootstrap/API/session, deterministic grouped-order read model, cookie/host isolation smoke, and Option B fallback trigger.
- Second Architect ITERATE feedback applied: explicit customer cookie name/path/domain/flags/coexistence rules and formal customer bootstrap DTO whitelist.
