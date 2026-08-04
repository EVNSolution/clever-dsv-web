# Dispatch API contract

> Archived 2026-08-04. 현재 배차 계약은 [`../../contracts/dispatch.md`](../../contracts/dispatch.md)를 따른다.

Status: Implemented foundation, external fields pending

## SellerOrder assignment

- One uploaded row and one backend order ID are the indivisible transfer unit.
- Release removes the operational assignment but never deletes the order.
- Acquire moves the whole order into the authenticated driver's current route.
- The target route's existing vehicle becomes the order's operational vehicle. The server never guesses a WMS vehicle.
- Route membership, sequence, geometry, and ETA-related data are recalculated through the existing RouteGrouping draft transaction before one atomic commit.
- Duplicate route membership is rejected by the route-group order partition invariant.
- Concurrent acquisition is first-writer-wins. The losing request receives `409 SELLER_ORDER_ALREADY_ACQUIRED`.
- A route that has started is no longer transferable. Merely passing the configured planned-departure clock time does not close transfer.

The mobile endpoints are implemented by `clever-route-server`:

```http
GET  /driver/orders/unassigned
POST /driver/orders/{orderId}/acquire
POST /driver/orders/{orderId}/release
```

The future mobile UI is not part of this web repository.

## Common operation times

`loadingStartTime` and `plannedDepartureTime` are shared DSV settings stored by the route server. They are guidance values and not actual route events. The web settings page reads and writes them in remote mode, and the dispatch page uses the planned departure value as the ETA base.

The exact loading-start default remains unconfigured because DSV has not selected it. The local planned-departure value preserves the pre-existing `08:30` demo behavior and is not a WMS contract.

## 배차 업로드

프런트와 route server가 다음 계약으로 연결되어 있다.

```http
POST /api/dsv/dispatch-imports/preview
POST /api/dsv/dispatch-imports
GET  /api/dsv/dispatch-imports/{importId}
GET  /api/dsv/conditions
POST /api/dsv/conditions
```

- 차량 번호는 차량 식별값이며 배송원 식별값이 아니다.
- 현재 데모는 DSV 배송원 프로필에 매장별로 유일하게 저장한 이름을 정확히 비교한다. 일반 배송원 데이터 전체를 이름으로 검색하지 않는다.
- 한 파일 안에서 배송원 하나는 차량 하나에, 차량 하나는 배송원 하나에 연결한다.
- SellerOrderKey 중복, 없는 배송원, 없는 차량, 잘못된 박스 수량은 확정을 차단한다.
- 확정 결과는 정식 주문과 경로가 아니라 검증된 배차 스테이징이다.
- CSV 헤더는 `driver`, `vehicle`, `배송처`, `condition`, `shippedbox`, `주소`, `customer`, `SellerOrderKey`가 필수다. `특이사항`, `latitude`, `longitude`는 선택이다.

다운로드 가능한 10건 예제는 `/examples/dsv-fixed-dispatch-10.csv`에 있다. XLSX 파싱은 새 의존성을 추가하지 않고, WMS 파일 계약이 확정된 뒤 서버 수신 경계에서 구현한다.

## Condition candidates

- Incoming Condition values are compared by exact, case-sensitive text.
- This does not declare `Cold` and `COLD` equivalent.
- Unknown values remain candidates until an administrator enters a name and description and clicks registration. 미등록 조건이 남아 있으면 업로드 확정을 차단한다.
- Temperature range, suitable vehicle, and proof requirement are optional.
- No candidate is registered merely because it appeared in an upload.

The upload panel parses CSV rows, calls the preview API, registers explicit candidates, and commits only a validated payload.

## Production visibility boundary

- DSV administrator pages require a valid `/api/dsv/auth/session` in remote mode.
- A customer query parameter is not an authorization boundary.
- Customer delivery data is hidden in remote mode until a customer-account API derives the customer identity from an authenticated session.

## External decisions still required

1. Stable WMS driver identifier. 이름 일치는 데모용이며 동명이인을 지원하지 않는다.
2. 차량 번호 외에 WMS가 안정적인 차량 코드를 제공하는지.
3. Whether product detail exists beyond box count.
4. 스테이징 행을 정식 Order, DeliveryStop, RoutePlan으로 적용하는 승인과 롤백 규칙.
5. Exact operation-time defaults.
6. DSV administrator override and assignment-audit retention policy.
