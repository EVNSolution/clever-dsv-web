# Test Spec — Customer Delivery Inquiry Demo

Status: Revised for ralplan consensus re-review
Timestamp: 2026-07-07T06:34:50Z
Revision: 2026-07-07T06:55:00Z

## Test Scope
Validate the new customer-facing delivery inquiry demo mode and ensure current admin demo behavior does not regress. The core risk is accidental admin data exposure, so source-level customer projection tests are mandatory.

## Automated Tests

### 1. Settings shortcut
- Open default app.
- Navigate to Settings.
- Assert `배송조회 Demo로 이동` is visible.
- Assert link/button target resolves to exact query mode `index.html?demo=delivery-inquiry`.
- Click it and assert URL contains `demo=delivery-inquiry`.

### 2. Customer page shell
- Open customer demo URL directly: `/?demo=delivery-inquiry` or `/index.html?demo=delivery-inquiry` depending test server base.
- Assert title text is `Clever - 배송 조회 Demo`.
- Assert controls exist: 2D, 3D, Start Simulation, Reset, speed slider.
- Assert absent: order-number input, sample-order selector, admin left rail, fleet list, destination list, temperature panel, notification island, floating admin driver card.

### 3. Customer order card
- Assert order card shows:
  - order number `DSV-20260707-0042`
  - recipient `삼성서울병원 약제팀`
  - destination `삼성서울병원`
  - address `서울 강남구 일원로 81`
  - status text
  - arrival ETA as a clock time
  - stop/dwell window text
  - cargo list
- Assert cargo list includes at least these explicit customer-safe labels: `임상시험 검체`, `냉장 항생제`, `온도기록계 동봉`, `검체 운송 튜브`.

### 4. Mandatory customer projection/source filtering
- After map load, run `window.dsvDemo.customerSnapshot()`.
- Assert snapshot shape includes:
  - `mode === "delivery-inquiry"`
  - `urlMode === "demo=delivery-inquiry"`
  - `vehicleIds` exactly `['to10']`
  - `destination.stopNo === 12`
  - `destination.name === '삼성서울병원'`
  - `sourceCounts.vehicles === 1`
  - `sourceCounts.destinations === 1`
  - `sourceCounts.adminStops === 0`
  - `adminChromeVisible === false`
- Additionally inspect public MapLibre source data through the test hook or direct source getter and assert customer-visible sources do not contain all 13 vehicles or all 12 route stops.
- This test must not be conditional on “if accessible”; implementation must provide the hook or a stable equivalent.

### 5. Vehicle click behavior
- In customer mode, click the assigned vehicle marker or a test-facing vehicle UI target.
- Assert route-to-customer highlight becomes visible.
- Assert route context remains customer-scoped: no intermediate stop labels, no full delivery list.
- Assert no admin driver card/fleet panel opens.
- Assert admin tracking/spotlight state is not enabled in a way that exposes admin route/stops; if a customer-specific selection state exists, snapshot should mark it separately from admin tracking.

### 6. Simulation updates
- Start simulation.
- Wait for at least one update interval.
- Assert ETA/status text changes or remains valid and no console errors are emitted.
- Assert `customerSnapshot()` still reports only `to10` and one destination after simulation updates.
- Adjust speed slider; assert control updates do not break customer page or change visible source counts.

### 7. Admin regression
- Existing dynamic page tests still pass.
- Default `/` still shows `Clever - DSV Demo`, admin tabs, map, and side panel.
- Settings page remains usable after adding shortcut.
- Default admin `window.dsvDemo.selection()` and existing map helpers continue to work.

## Manual Smoke Checks
- Localhost customer URL: confirm customer page visually has no tabs and no admin side cards.
- Click vehicle: confirm line shown from vehicle to 삼성서울병원, not all other customers’ stops.
- Zoom out/in: customer destination remains understandable and does not reveal admin destinations.
- GitHub Pages URL with query string: confirm static routing works.
- Browser console: `window.dsvDemo.customerSnapshot()` returns only customer-scoped data.

## Acceptance Evidence
- `npm run check` passes.
- `npm test` passes.
- Optional screenshots:
  - settings shortcut
  - customer page initial state
  - customer page after vehicle click

## Known Test Gaps
- Real auth/customer authorization is out of scope.
- Real order lookup API is out of scope.
- Exact customer privacy cannot be fully proven without backend; this demo can prove UI/source filtering in static fixture mode.
