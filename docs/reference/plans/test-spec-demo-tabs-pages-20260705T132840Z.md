# Test Spec — Clever DSV Demo Page Tabs

## Static checks
- Parse `demo/index.html` with Python `HTMLParser`.
- Extract inline script and run `node --check`.
- Grep to ensure no old subtab CSS/HTML remains (`sub-tab`, `sub-tabs`, `data-main-tab`).

## Manual browser checks
1. Load `demo/index.html`.
2. Click 관제: fleet, destination list, cargo visible; map remains full background.
3. Click 업무: shows 주문/증빙/배정 cards; selected destination name appears.
4. Click 이슈: shows alert/vehicle/courier cards; no developer logs on screen.
5. Click 설정: shows alert/customer/map-route settings.
6. Click vehicle and destination markers/list rows; selected context updates in current page after render.
7. Start Simulation; after 20 seconds or pressing Error, issue/risk UI shows temperature alert.
8. 2D/3D toggle still works.

## Regression risks
- Removing old tab logic may break active tab styling.
- Re-rendering side panel can drop event handlers; bind after render.
- Issue page must not duplicate toast incorrectly.

## Added regression check after Architect review
- Confirm one stable `id="sideContent"` exists and no full `aside` replacement is performed in JS.
- Confirm switching tabs during Running does not stop the timer or reset risk state.
- Confirm control page IDs (`fleetList`, `destinationList`, `cargoList`) only exist while 관제 is rendered and handlers are rebound after each control render.

## Added checks after Critic review
- On 이슈 tab, trigger Error and confirm the page shows fleet-level risk even if selected vehicle is not the risk vehicle.
- Switch 업무/이슈/설정 → 관제, then click 배송지 리스트 접기/펼치기; it must still work after rerender.
- Confirm only one `destinationToggle` listener path exists and it is bound after control page render.
