# PRD — Clever DSV Demo Page Tabs

## Goal
Turn the left tab structure from passive labels into real demo pages while preserving the map-first logistics control experience.

## Non-goals
- No backend implementation.
- No new routing framework or build step.
- No deep CRUD forms.
- No separate files unless needed.

## Page IA

### 1. 관제
Purpose: primary live delivery command view.
Content:
- 차량 리스트 card.
- 배송지 리스트 card.
- 배송 물품 card.
- Existing map markers/routes/simulation remain active.
- No “지도” child tab.

### 2. 업무
Purpose: 주문/증빙/배정 workflow in one page.
Subsections, as cards:
- 주문: active route order summary, 고객/온도조건/배송상태.
- 증빙: POD/인수증/거래명세서 placeholders tied to selected destination.
- 배정: selected vehicle, courier, route policy, pickup/dropoff summary.
Behavior:
- Selecting vehicle/destination updates contextual text.
- Does not replace map; floats over map like current side panel.

### 3. 이슈
Purpose: vehicle/courier issue hub.
Subsections, as cards:
- 긴급 알림: temperature warning, delayed ETA, route anomaly.
- 차량 상태: selected vehicle temperature, GPS freshness, battery/fleet state.
- 배송원 대응: call/task/escalation style rows; demo-only hardcoded.
Behavior:
- Temperature risk should reflect existing `vehicle.risk`.
- Error button/20s warning should visibly affect issue page.

### 4. 설정
Purpose: credible but not-final operations settings page.
Subsections, as cards:
- 알림 기준: temperature threshold 8℃, ETA delay threshold, GPS stale threshold.
- 고객 권한: customer only sees own orders/ETA/POD.
- 지도/경로: OSRM server, OpenFreeMap style, 2D/3D default.
Behavior:
- Read-only demo settings; no persistent form.
- Label “미정” only where needed, not the entire page.

## UX rules
- Keep left tabs simple top-level buttons.
- Active tab black.
- Right panel content changes by selected tab.
- No empty shadow panels.
- Use current Apple-ish rounded card style.
- Keep map visible behind panels.

## Acceptance criteria
- Clicking each left tab changes right panel content to a distinct, credible page.
- 관제 retains current fleet/destination/cargo functionality.
- 업무 includes 주문/증빙/배정 sections with selected stop/vehicle context.
- 이슈 reflects existing risk state and shows issue/courier handling cards.
- 설정 shows real-looking readonly thresholds and policies.
- No stale “지도” subtab remains.
- HTML and JS syntax checks pass.

## RALPLAN Revision 1 — Render Boundary
Decision: keep the map, top controls, and `aside.side` shell static. Add a single stable inner root `#sideContent`; tab switches replace only that root's contents.

Implementation constraints:
- `state.activeTab` is the single selected page state.
- `setTab(tab)` updates `state.activeTab`, active button class, then calls `renderSide()`.
- `renderSide()` dispatches to `renderControlPage`, `renderWorkPage`, `renderIssuePage`, or `renderSettingsPage`.
- `renderControlPage()` writes the existing three card shells with `fleetList`, `destinationList`, and `cargoList`, then reuses `renderFleet()`, `renderStops()`, and `renderCargo()`.
- Non-control pages must not create duplicate IDs used by control renderers.
- `selectVehicle`, `selectDestination`, and `setRisk` continue to call `renderSide()` so the current tab stays live.
- Tab switches must not reset map layers, simulation timers, selected vehicle, selected stop, or risk state.

## RALPLAN-DR Summary

### Principles
1. Map-first: the map, routes, vehicle movement, and simulation remain the demo's visual anchor.
2. Stable shell: tab changes must not rebuild or reset map/top controls/aside shell.
3. Real pages over labels: every top-level tab must show page-specific cards with selected route context.
4. Reuse before rewrite: 관제 keeps existing fleet/destination/cargo renderers.
5. Demo clarity: screen content is product-facing; developer logs stay off-screen.

### Decision drivers
1. Preserve existing simulation and map stability.
2. Give each top-level tab credible demo content quickly.
3. Keep a single-file, no-dependency implementation that is easy to adjust live.

### Viable options
- Option A — Stable `aside` + swapped `#sideContent` root.
  - Pros: small diff, keeps map/simulation intact, enables real pages.
  - Cons: page-local UI state is rerendered and event handlers must be rebound.
- Option B — Fully static cards for all pages hidden/shown by CSS.
  - Pros: fewer rebinds, preserves local DOM state.
  - Cons: bloats HTML, risks hidden duplicate IDs, harder to keep selected context fresh.
- Option C — Component/router-style abstraction.
  - Pros: scalable if this becomes a real app.
  - Cons: overbuilt for a static demo, larger rewrite, violates no-new-framework spirit.

### Decision
Choose Option A. It is the smallest architecture that still creates real pages. Option B is rejected because duplicate/hidden page DOM will make ID/event/state mistakes likely in this single HTML. Option C is rejected because this is a demo, not an app framework migration.

### Consequences
- `renderSide()` becomes the single page renderer.
- `renderControlPage()` must recreate the 관제 card shell, call existing renderers, and bind the collapse button after each render.
- 이슈 page must inspect `vehicles.some(v => v.risk)` and `vehicles.filter(v => v.risk)` so fleet-level risk is visible even when the selected vehicle is not the risk vehicle.
