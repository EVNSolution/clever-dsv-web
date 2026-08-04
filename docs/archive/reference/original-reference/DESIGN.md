# Design

## Source of truth
- Status: Active draft
- Last refreshed: 2026-07-03
- Primary product surfaces: local `demo/index.html` Clever - DSV Demo
- Evidence reviewed:
  - `npx getdesign@latest add apple` generated Apple-inspired baseline
  - `.omx/specs/deep-interview-demo-web.md`
  - `정제_대화_스크립트.md`
  - `delivery-control-design.html`

## Brand
- Personality: Apple-clean, clinical, calm, premium, operationally trustworthy.
- Trust signals: live movement, mock response timestamps, precise ETA, clear risk escalation, no visual clutter.
- Avoid: toy-like maps, heavy gradients, noisy dashboards, fake complexity, excessive screens.

## Product goals
- Goals:
  - Make three vehicle movements and 36 destination points feel live and credible.
  - Make route progress and next-stop ETA feel reliable on a real OpenFreeMap Seoul map using Seoul GPS coordinates and OSRM route geometry.
  - Make high-temperature recorder risk impossible to miss.
- Non-goals:
  - Real live GPS feed/database/login/POD/AI routing.
  - Full production admin system.
  - New dependencies or frontend framework.
- Success signals:
  - Viewer understands the demo in 30 seconds.
  - OpenFreeMap loads full-page; a thin left rail shows 3 expandable main tabs with child tabs on click; right-side floating panel has two views: 기본 for 3 vehicles/36 destinations/map status, 차량 for selected route/vehicle detail; MapLibre layers render vehicle/destination markers and OSRM routes; 2D/3D toggle changes map pitch; `Start Simulation` updates the Seoul GPS vehicle, route, ETA, alert, and response log.

## Personas and jobs
- Primary personas: customer decision maker, logistics/control operator, internal demo presenter.
- User jobs: see where the delivery vehicle is, what happens next, and whether temperature risk is being detected.
- Key contexts of use: customer presentation on a local machine; no network reliability assumed.

## Information architecture
- Primary navigation: one-page demo; tabs/chips only if they support the story.
- Core routes/screens:
  - Full-page map: OpenFreeMap basemap with compact expandable left tabs and right-side two-view panel: 기본 for active fleet/12 destinations per selected vehicle/map status, 차량 for ETA/temperature/route detail.
  - Optional compact customer-view card inside the same page.
- Content hierarchy:
  1. Full-page map and title/controls overlay
  2. Vehicle motion
  3. ETA and next route
  4. Temperature alert
  5. Runtime evidence kept off-screen in `demo/demo.log` / console

## Design principles
- Quiet shell, loud event: neutral Apple-like UI until a risk event fires.
- One accent for action, one accent for danger: blue for action/live response, red only for temperature risk.
- Local but believable: runtime logs and timestamps may be simulated off-screen, but the basemap is real OpenFreeMap and the route uses Seoul GPS coordinates.
- Tradeoffs: prefer a polished single screen over broad multi-screen coverage.

## Visual language
- Color:
  - Canvas: `#f5f5f7`
  - Surface: `#ffffff`
  - Ink: `#1d1d1f`
  - Muted: `#6e6e73`
  - Hairline: `#e5e5ea`
  - Action blue: `#0066cc`
  - Live green: `#1f8b4c`
  - Route future: `#d1d5db`
  - Risk red: `#d92d20`
  - Warning amber: `#f79009`
- Typography:
  - Use `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif`.
  - Hero: 40-56px, 600, tight tracking.
  - Body: 15-17px, 400.
  - Data labels: 12-13px, 600, uppercase only sparingly.
- Spacing/layout rhythm: 8px base; cards 16-24px padding; section gap 24px.
- Shape/radius/elevation:
  - Pills: 999px.
  - Cards: 20-28px radius.
  - Map panels: 28px radius.
  - Use soft shadow only for floating demo surfaces; do not stack many shadows.
- Motion:
  - Vehicle movement should be smooth and linear enough to read.
  - Alert should pulse briefly, then settle.
  - Respect reduced motion by lowering animation intensity if simple to do.
- Imagery/iconography: simple line icons, vehicle marker, route nodes; no stock photos.

## Components
- Existing components to reuse: none; demo may be standalone.
- New/changed components:
  - Hero/status bar
  - Full-page OpenFreeMap / MapLibre map
  - Vehicle and destination point layers, no DOM map markers
  - OSRM route line layers
  - Right panel view switch: 기본 / 차량
  - Active vehicle list
  - ETA card
  - Temperature risk alert
  - Left tab rail: main tabs 관제/운영/검수; clicked main tab reveals its child tabs only.
  - 2D/3D toggle and `Start Simulation` / `Reset` controls
- Variants and states:
  - Vehicle: idle, moving, selected, risk
  - Stop: done, next, future
  - Map view: 2D, 3D
  - Tabs: collapsed, expanded, active child
  - Alert: hidden, warning, critical
- Token/component ownership: tokens live in `demo/index.html` CSS variables for the demo.

## Accessibility
- Target standard: practical WCAG AA for contrast and readable text.
- Keyboard/focus behavior: buttons need visible focus; simulation controls are keyboard reachable.
- Contrast/readability: risk red must have text/icon label, not color alone.
- Screen-reader semantics: major regions and alert area should have labels.
- Reduced motion and sensory considerations: avoid endless aggressive flashing.

## Responsive behavior
- Supported breakpoints/devices: desktop-first demo; must remain usable on laptop width around 1280px.
- Layout adaptations: desktop uses full map with thin left rail and right floating panel; narrow screens stack panels below map.
- Touch/hover differences: controls must work by click/tap; no hover-only info.

## Interaction states
- Loading: OpenFreeMap/MapLibre load row with timestamp.
- Empty: not needed for first demo.
- Error: temperature recorder high alert is the primary error state.
- Success: API rows resolve to green/blue success chips.
- Disabled: disable `Start Simulation` while running.
- Offline/slow network: show map/script load failure without breaking the rest of the demo.

## Content voice
- Tone: calm, precise, operational.
- Terminology:
  - “특장 온도기록계” for the risk source.
  - “온도 상승 경고” for the visible alert.
  - “다음 배송 ETA” for arrival estimate.
- Microcopy rules:
  - Prefer concrete values: `9.8℃`, `기준 8℃ 초과`, `응답 128ms`.
  - Say “OpenFreeMap 서울 GPS” for the visible map route; avoid claiming live GPS feed.

## Implementation constraints
- Framework/styling system: plain HTML/CSS/JS.
- Design-token constraints: CSS variables in one file.
- Performance constraints: instant local load; no network dependency.
- Compatibility constraints: current Chrome/Safari/Edge.
- Test/screenshot expectations:
  - Open `demo/index.html` locally.
  - Wait for OpenFreeMap to load, then click `Start Simulation`.
  - Confirm title is `Clever - DSV Demo`, no extra hero description appears, OpenFreeMap fills the page, left main tabs expand child tabs on click, right panel switches 기본/차량, 2D/3D toggle changes pitch, developer logs are absent from the screen, vehicles/destinations are clickable MapLibre layers, selected vehicle moves on OSRM Seoul route geometry, ETA changes, alert appears, risky vehicle is labeled.

## Open questions
- [ ] None blocking for first demo.
