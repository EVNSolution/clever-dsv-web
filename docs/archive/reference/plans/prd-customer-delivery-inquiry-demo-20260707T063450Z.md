# PRD — Customer Delivery Inquiry Demo

Status: Revised for ralplan consensus re-review
Timestamp: 2026-07-07T06:34:50Z
Revision: 2026-07-07T06:55:00Z
Owner workflow: ralplan

## Requirements Summary
Build a customer-facing delivery inquiry demo surface in the existing static `dsv-demo/index.html` app. The customer is already authenticated / already entered an order number before arriving, so this is not a search page. It is a simple, tabless delivery tracking page that demonstrates “my order is on this vehicle, this is where it is, this is the ETA, this is what is being delivered.”

## Non-goals
- Do not implement login, authentication, authorization, or real order lookup.
- Do not add order-number input, sample-order selection, or search filters.
- Do not expose admin fleet list, admin side tabs, temperature panels, notification risk panels, or other customer stops in customer mode.
- Do not create a backend.

## RALPLAN-DR Summary

### Principles
1. **Customer projection, not admin clone**: customer mode filters the existing demo state into only the customer-relevant vehicle, destination, route context, ETA, and cargo.
2. **No accidental data exposure**: no other customer stops, full fleet, or admin operational panels should appear in customer mode, including map sources/layers.
3. **Demo controls remain explicit**: keep 2D/3D, Start Simulation/Reset, and speed control because this is a demo scenario.
4. **Reuse existing simulation engine**: avoid duplicate timing, route, ETA, and cargo logic where existing functions already provide credible behavior.
5. **Static deployment safe**: route via same HTML and client state so GitHub Pages and localhost stay simple.

### Decision Drivers
1. **Clarity for customer demo**: one-page “where is my delivery?” must be immediately understandable.
2. **Low regression risk**: existing admin demo has many map layers and simulation behaviors; customer mode should isolate behavior without destabilizing admin mode.
3. **Privacy semantics**: customer mode must visibly and testably prove filtered access, not just hide panels while still populating all stops.

### Viable Options

#### Option A — Same `index.html` with exact query-based customer mode (recommended)
Approach: Add exact mode `index.html?demo=delivery-inquiry`. Settings link opens that mode in the same static file. Reuse shared map initialization and simulation state, but render a customer-specific shell and filtered map data.

Pros:
- Reuses current MapLibre, OSRM, simulation, ETA, cargo, and tests.
- GitHub Pages-friendly: no routing/server config.
- Less duplicated code and easier to keep customer ETA consistent with admin ETA.

Cons:
- Requires strict mode guards so admin controls/sidebar/data sources do not leak into customer mode.
- Existing global state is single-file and large; mode branching needs discipline.

#### Option B — Separate `delivery-inquiry.html`
Approach: Create a second static page that imports or duplicates enough logic to render customer mode.

Pros:
- Hard separation makes customer UI less likely to show admin panels accidentally.
- Easier mental model for URL and standalone screenshots.

Cons:
- Duplicates map/simulation/route logic unless the app is refactored into shared modules.
- Higher risk of inconsistent ETA/simulation behavior.
- More file surface and tests for a demo that currently lives in one HTML file.

#### Option C — Customer tab inside current app
Approach: Add another left-side tab or Settings subpage for customer view.

Pros:
- Smallest immediate UI addition.
- Easy to navigate during admin demo.

Cons:
- Violates the request for a no-tabs customer page.
- Makes customer mode look like an admin feature rather than an external customer-facing screen.
- Weaker privacy story.

### Recommended Decision
Use Option A: same `index.html` exact query mode `?demo=delivery-inquiry`, reached from Settings by a shortcut link/button. Treat the customer page as a separate rendering mode that hides admin chrome and, more importantly, emits only customer-filtered map/source data.

## Product Shape

### Access point
- In Settings page, add a compact card/row or button: `배송조회 Demo로 이동`.
- Link target must be exactly `index.html?demo=delivery-inquiry` relative to the static file.
- Optional reciprocal escape: customer page may include a small `관제 Demo로 돌아가기` link only if it does not clutter the demo; not required for first implementation.

### Customer page layout
- Full-screen map background, consistent with current demo style.
- Top title/control card:
  - Title: `Clever - 배송 조회 Demo`
  - Controls: `2D | 3D`, `Start Simulation`, `Reset`
  - Speed slider below the first control row, same semantics as current main demo
- No left sidebar tabs.
- No admin right-side vehicle/destination cards.
- One customer order status card floating over map:
  - Order number, delivery destination name/address
  - Current status: moving / previous stop unloading / arriving soon / delivered
  - Arrival ETA as clock time
  - Stop/dwell window: e.g. `하차 예상 14:25–14:30`
  - Cargo list: concise medical items and counts
  - Hint: `차량을 클릭하면 현재 위치에서 배송지까지 경로를 표시합니다.`

## Exact Customer Fixture
Add a single customer demo fixture near scenario data:

```js
const CUSTOMER_DELIVERY_DEMO = {
  orderNo: "DSV-20260707-0042",
  recipient: "삼성서울병원 약제팀",
  vehicleId: "to10",
  vehiclePlate: "23바 6303",
  stopNo: 12,
  destinationName: "삼성서울병원",
  destinationAddress: "서울 강남구 일원로 81",
  cargo: [
    { name: "임상시험 검체", qty: "4박스" },
    { name: "냉장 항생제", qty: "6EA" },
    { name: "온도기록계 동봉", qty: "1개" },
    { name: "검체 운송 튜브", qty: "12EA" }
  ]
};
```

Use existing vehicle/stop coordinates from `vehicleId: "to10"`, route `songpa`, stop 12 (`삼성서울병원`) for movement and ETA. Use the explicit cargo fixture for customer presentation so the page is stable and does not expose unrelated route cargo.

## Customer ETA / Route Semantics
- ETA should be computed from existing route timing helpers and may include hidden prior scheduled stops plus configured 5-minute dwell time.
- Customer-visible ETA text should be an arrival clock time and a stop/dwell window, not a raw countdown only.
- Customer-visible map route after vehicle click must be privacy-safe:
  - show only current vehicle position to customer destination;
  - do not label intermediate stops;
  - do not render full 12-stop delivery sequence;
  - do not expose other customer names/coordinates in customer-visible sources.

## Source Filtering Contract
Customer mode must not rely on CSS hiding alone. Implement a customer projection function, for example `customerMapData()`, that returns only:
- one assigned vehicle feature (`vehicleId: "to10"`);
- one customer destination/dropoff feature (`stopNo: 12`);
- zero or one privacy-safe route feature from current vehicle position to destination;
- origin only if needed for camera context, but not as a full admin route timeline.

Do not populate customer mode map sources with:
- all vehicles;
- all stops;
- all dropoffs;
- full route features for every vehicle;
- labels for hidden prior/future stops.

Add a required test/debug hook, for example `window.dsvDemo.customerSnapshot()`, returning a stable summary:
```js
{
  mode: "delivery-inquiry",
  urlMode: "demo=delivery-inquiry",
  orderNo: "DSV-20260707-0042",
  vehicleIds: ["to10"],
  destination: { stopNo: 12, name: "삼성서울병원" },
  sourceCounts: { vehicles: 1, destinations: 1, routes: 0 | 1, adminStops: 0 },
  adminChromeVisible: false
}
```
This hook is required for Playwright verification and should summarize filtered projection state without exposing full admin fixture contents.

## Startup / Interaction Contract
- On startup, parse `new URLSearchParams(location.search).get("demo") === "delivery-inquiry"` before normal admin page rendering.
- If customer mode is active:
  - render customer shell instead of normal admin `setTab("control")` / `renderSide()` flow;
  - guard admin DOM bindings by element existence and mode;
  - do not create/show `.rail`, `.side`, `#pageContent`, fleet list, delivery list, notification island, floating driver card, or temperature panel.
- Vehicle marker click in customer mode:
  - toggles or opens customer route-to-destination presentation;
  - keeps cargo/ETA card visible;
  - must not open admin driver card;
  - must not set admin tracking/spotlight state in a way that exposes admin route/stops.

## Implementation Steps
1. **Add customer mode detection and shell routing**
   - In `index.html`, parse exact query flag `demo=delivery-inquiry`.
   - Add state flag or helper `isCustomerDeliveryDemo()`.
   - On startup, render customer mode before normal admin tab initialization.

2. **Add Settings shortcut**
   - In `renderSettingsPage()` (`index.html:1863-1887`), add a real shortcut link/button labeled `배송조회 Demo로 이동`.
   - Link to `index.html?demo=delivery-inquiry`.
   - Keep it as an actual navigation action, not an admin tab.

3. **Create customer fixture and projection helpers**
   - Add `CUSTOMER_DELIVERY_DEMO` near scenario definitions (`index.html:631-665`).
   - Add helpers: customer vehicle, customer stop, customer ETA, customer dwell window, customer cargo, `customerSnapshot()`.
   - Use existing `stopEtaList()`, `etaText()`, `dwellRemainingMs()`, `cargoFor()` only where they do not leak non-customer data; use explicit cargo fixture for visible customer cargo.

4. **Render customer page UI**
   - Add CSS classes for a customer mode shell and a floating customer order card.
   - Render the title/control card with current demo controls minus destination display toggle and notification island.
   - Hide or omit admin shell in customer mode.

5. **Filter map data for customer mode**
   - Add `customerMapData()` or an explicit branch in `mapData()`.
   - Emit only customer vehicle, customer destination/dropoff, and customer route segment source(s).
   - Do not emit all-vehicle/all-stop `routes`, `stops`, `dropoffs` in customer mode.
   - Use a privacy-safe route from current vehicle coordinate to customer destination coordinate when route is requested/ready.

6. **Bind customer interactions and live patching**
   - Vehicle marker click in customer mode opens/highlights route-to-destination, not admin vehicle detail.
   - Simulation tick updates customer ETA/card and map sources without rerendering the whole page unnecessarily.
   - 2D/3D, Start Simulation/Reset, speed slider reuse existing handlers or equivalent customer-safe handlers.

7. **Regression tests**
   - Extend Playwright tests in `tests/e2e/dynamic-pages.spec.js` or a dedicated spec.
   - Verify Settings shortcut exists and points exactly to `index.html?demo=delivery-inquiry`.
   - Verify customer mode hides admin tabs/side panels and shows `Clever - 배송 조회 Demo`.
   - Verify no order input/sample selector exists.
   - Verify `window.dsvDemo.customerSnapshot()` and/or MapLibre sources prove one customer vehicle and one customer destination only.
   - Verify vehicle click sets customer route highlight without enabling admin tracking panels.

## Acceptance Criteria
- Settings page contains a visible shortcut labeled `배송조회 Demo로 이동`.
- The shortcut href/target is exactly `index.html?demo=delivery-inquiry` or resolves to that same query on the current static path.
- Opening the shortcut renders `Clever - 배송 조회 Demo` with no order input and no sample order selection.
- Customer mode shows 2D/3D, Start Simulation/Reset, and speed control.
- Customer mode hides left admin tabs, admin side panel, fleet list, delivery list, notification island, and temperature panel.
- `window.dsvDemo.customerSnapshot()` exists in customer mode and reports `vehicleIds: ["to10"]`, destination stop 12, one visible vehicle, one visible destination, and zero admin stops.
- Customer mode map sources/layers do not contain all vehicles, all stops, or all dropoffs.
- Vehicle click displays/highlights only the route from current vehicle location to 삼성서울병원.
- Customer card shows order number `DSV-20260707-0042`, destination `삼성서울병원`, current delivery status, arrival ETA, stop/dwell window, and explicit cargo list.
- Simulation updates ETA/status without rebuilding admin panels.
- Existing admin mode tests still pass.
- New Playwright tests pass locally with `npm test`.

## Risks and Mitigations
- Risk: customer mode accidentally renders all stops/routes. Mitigation: separate customer map projection plus required `customerSnapshot()`/MapLibre source tests for limited feature counts.
- Risk: admin click/spotlight handlers leak into customer mode. Mitigation: customer-mode click handler branch and acceptance test proving no admin driver card/tracking panel opens.
- Risk: global startup handlers assume admin DOM exists. Mitigation: parse customer mode before admin init and guard event bindings by element existence and mode.
- Risk: code duplication in single-file demo grows further. Mitigation: keep customer helpers small and reuse existing ETA/map primitives where safe.
- Risk: static URL handling breaks GitHub Pages. Mitigation: use exact query string on the same `index.html`, not client-side history routes requiring server rewrites.

## Verification Steps
- `npm run check`
- `npm test`
- Manual local smoke: open `http://localhost:4173?demo=delivery-inquiry` or equivalent, start simulation, click vehicle, confirm route/customer card behavior.
- Manual admin smoke: open default `/`, verify current 관제/배송원/업무/기록/설정 flows are unchanged.
- Manual privacy smoke: in browser console, run `window.dsvDemo.customerSnapshot()` and confirm only `to10` / 삼성서울병원 is present.

## ADR

### Decision
Implement customer delivery inquiry demo as exact query mode `index.html?demo=delivery-inquiry` inside the existing `index.html`, reached from Settings via `배송조회 Demo로 이동`.

### Drivers
- Customer page must be simple and separate from admin navigation.
- Existing simulation/ETA/OSRM machinery should be reused for credible demo behavior.
- Static GitHub Pages deployment should remain simple.
- Privacy semantics require source-level customer projection.

### Alternatives considered
- Separate `delivery-inquiry.html`: stronger separation but duplicates map/simulation logic.
- New admin tab: easy but violates customer-facing no-tabs page semantics.

### Why chosen
The query-based mode gives customer-facing separation without duplicating the single-file demo’s simulation and routing machinery. The added customer projection/test-hook contract mitigates the main same-file privacy risk.

### Consequences
- Requires careful mode guards around global DOM handlers.
- Customer map data must be filtered explicitly to avoid accidental exposure.
- Future refactor into modules may become desirable if more external pages are added.

### Follow-ups
- After customer page is accepted visually, consider a small fixture table for multiple customer orders.
- Later, if real auth/order lookup is needed, replace the static fixture with a customer-scoped API projection.

## Available-Agent-Types Roster
- `executor`: implement single-file HTML/CSS/JS changes.
- `test-engineer`: add and harden Playwright tests.
- `code-reviewer`: review source diff for leakage/regression risk.
- `verifier`: run final local/browser verification and evidence collection.
- `designer`: optional UI polish if visual feedback is needed.

## Follow-up Staffing Guidance
- Recommended default: `$ultragoal` single durable goal with one `executor` lane and one `test-engineer`/`verifier` validation lane.
- If using `$team`: 2 lanes are enough.
  - Lane 1 (`executor`, medium): customer mode UI + state/map projection in `index.html`.
  - Lane 2 (`test-engineer`, medium): Playwright regression tests and smoke evidence.
  - Optional final `code-reviewer`, high: privacy/filtering and mode-guard review.
- `$ralph` fallback: only if a single-owner persistent edit/test/fix loop is explicitly preferred.

## Goal-Mode Follow-up Suggestions
- `$ultragoal` — recommended default for implementation with durable checkpoints.
- `$team` + `$ultragoal` — useful if implementation and tests should run in parallel with checkpoint evidence.
- `$performance-goal` — not needed; this is not primarily an optimization project.
- `$autoresearch-goal` — not needed; reference evidence is already sufficient.

## Team Launch Hints
- `$team implement .omx/plans/prd-customer-delivery-inquiry-demo-20260707T063450Z.md`
- Or: `omx team start --task "Implement customer delivery inquiry demo from PRD" --plan .omx/plans/prd-customer-delivery-inquiry-demo-20260707T063450Z.md`

## Team Verification Path
Team should prove:
- new customer URL renders correctly
- Settings shortcut navigates correctly
- customer mode hides admin data/chrome
- customer map projection contains only the customer vehicle/destination/route context
- vehicle click reveals only customer route context

## Revision Changelog
- Pinned exact URL contract to `index.html?demo=delivery-inquiry`.
- Added exact fixture: `DSV-20260707-0042`, `to10`, `23바 6303`, stop 12, `삼성서울병원`.
- Strengthened privacy-safe route semantics and source-filtering contract.
- Made `window.dsvDemo.customerSnapshot()` mandatory for tests.
- Added startup/click contract to prevent admin tab/tracking/card behavior in customer mode.
- Corrected reference evidence path to `../reference/정제_대화_스크립트.md` in context.

## Final Consensus Notes
- Architect re-review approved the same-file query approach after the privacy/source-filtering additions.
- Final Critic approved the plan after verifying the five mandatory improvements.
- Execution caution: implement `customerSnapshot()` from actual projected MapLibre/source data or the same object passed into source updates, not from static fixture constants alone.
