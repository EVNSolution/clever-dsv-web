# Backend API connection

- Status: Active
- Last refreshed: 2026-08-04
- Frontend owner: `clever-dsv-web/src/api` and `clever-dsv-web/src/services`
- Backend owner: `clever-route-server/apps/delivery-api`

이 문서는 현재 프런트엔드가 실제로 호출하는 API 경계를 기록한다. 서버의 전체 API 명세가 아니며, 화면 service에 연결되지 않은 미래 endpoint를 정본으로 선언하지 않는다.

## 실행 모드

```env
VITE_DSV_API_MODE=remote
VITE_DSV_API_BASE_URL=/api/dsv
VITE_DSV_SHOP_DOMAIN=dsv-demo.local
```

- `mock`은 명시적인 로컬 개발 모드다.
- `remote`는 같은 origin의 `/api/dsv`와 `/api/dsv/v1`을 사용한다.
- remote 요청이 실패하면 `src/demo`나 localStorage로 fallback하지 않는다.
- `src/demo`는 frontend demo projection이며 백엔드 모델이나 API DTO가 아니다.

## 인증과 권한

로그인 bootstrap은 legacy endpoint를 사용한다.

```http
POST /api/dsv/auth/login
Content-Type: application/json

{"id":"operator","password":"...","shopDomain":"dsv-demo.local"}
```

세션 복원은 `GET /api/dsv/v1/session`으로 수행한다. 브라우저는 HTTP-only cookie를 포함하며, 호환용 access token이 있으면 Authorization header도 사용할 수 있다. 변경 명령은 CSRF token을 전송하고 `403 Invalid CSRF token`에서 세션 endpoint를 한 번 갱신한 뒤 재시도한다.

역할과 화면 권한은 다음과 같다.

| 역할 | 화면 | 필수 scope |
| --- | --- | --- |
| `DSV_ADMIN` | 관제 | `dsv:control:read` |
| `DSV_ADMIN` | 배차 | `dsv:dispatches:read` |
| `DSV_ADMIN` | 이력 | `dsv:records:read` |
| `DSV_ADMIN` | 관리 | resources, customers, destinations, conditions read |
| `DSV_ADMIN` | 설정 | `dsv:settings:read` |
| `CUSTOMER_USER` | 고객 배송조회 | `dsv:customer-deliveries:read` |

고객 배송조회 권한은 인증된 customer principal에서 결정한다. query parameter의 customer ID는 고객 권한의 근거가 아니다. 관리자 전용 고객 조회만 `customers/deliveries?customerId=...`를 사용한다.

## v1 reads

현재 allowlist에 포함된 읽기 endpoint다.

```http
GET /api/dsv/v1/session
GET /api/dsv/v1/map/profile
GET /api/dsv/v1/control
GET /api/dsv/v1/control/routes?serviceDate=YYYY-MM-DD
GET /api/dsv/v1/dispatches?serviceDate=YYYY-MM-DD&limit=100
GET /api/dsv/v1/records
GET /api/dsv/v1/drivers
GET /api/dsv/v1/vehicles
GET /api/dsv/v1/customers
GET /api/dsv/v1/destinations
GET /api/dsv/v1/conditions
GET /api/dsv/v1/customer/deliveries
GET /api/dsv/v1/customers/deliveries
```

배차 목록은 `orderNumber`, `destinationName`, `cursor`를 지원한다. 관리 목록, 배차 목록과 고객 배송조회는 `hasMore`와 `nextCursor`로 모든 페이지를 순차 조회한다.

v1 read success responses use the strict envelope below.

```json
{
  "data": {},
  "meta": { "apiVersion": "dsv.v1" },
  "requestId": "req_..."
}
```

v1 errors use the strict v1 floor below.

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request",
    "requestId": "req_..."
  }
}
```

허용되지 않은 필드나 envelope는 프런트 adapter가 거부한다. API 변화는 server DTO, service adapter와 계약 테스트를 함께 수정해야 한다.

## v1 commands

배차 명령은 v1 경로를 사용하지만 assignment 계열 일부는 현재 legacy형 command envelope를 유지한다.

```http
POST /api/dsv/v1/seller-order-assignments/reassign
POST /api/dsv/v1/seller-order-assignments/unassign
POST /api/dsv/v1/seller-order-deletions
POST /api/dsv/v1/seller-orders/{sellerOrderId}/assignment/reassign
POST /api/dsv/v1/seller-orders/{sellerOrderId}/assignment/unassign
POST /api/dsv/v1/seller-orders/{sellerOrderId}/time-constraint/confirm
POST /api/dsv/v1/seller-orders/{sellerOrderId}/time-constraint/clear
```

- 모든 변경 명령은 `commandId`를 사용한다.
- 배정과 삭제는 `expectedVersion`으로 오래된 화면 상태를 거부한다.
- 배송 삭제는 한 요청에 최대 100건이다.
- 시간 제약 변경은 `deliveryStopId`와 현재 route version을 요구한다.

## Bounded legacy commands

bounded legacy calls use the legacy `{ "data": ..., "error": ... }` envelope. 이 경계는 현재 UI에 연결된 endpoint만 허용하며 범용 client로 확장하지 않는다.

| 영역 | endpoint |
| --- | --- |
| 인증 | `auth/login`, `auth/logout`, `auth/session` |
| 배차 업로드 | `dispatch-imports/preview`, `dispatch-imports`, `dispatch-imports/{id}/apply` |
| 운송조건 | `conditions`, `conditions/{id}` |
| 운영 설정 | `settings/operations`, `settings/operations/geocode` |
| 수동 이메일 | `manual-email` |
| 배송원 | `drivers`, `drivers/{id}` |
| 차량 | `vehicles`, `vehicles/{id}` |
| 기본 배정 | `vehicles/{vehicleId}/drivers`, `vehicles/{vehicleId}/drivers/{assignmentId}` |
| 관제 상세 | `control/delivery-stops/{deliveryStopId}/context` |

관리 읽기는 v1 목록을 사용하고 배송원, 차량, 운송조건과 기본 배정의 쓰기만 legacy endpoint를 사용한다. 고객사와 배송처 쓰기는 현재 프런트 allowlist에 없다.

## 화면별 소유권

| 화면 | service | 주요 API |
| --- | --- | --- |
| 로그인 | `services/auth.ts` | legacy login, v1 session |
| 관제 | `services/control.ts`, `control-routes.ts`, `dispatch.ts` | control, routes, dispatches |
| 배차 | `services/dispatch.ts`, `dispatch-imports.ts` | dispatches, assignment, deletion, import |
| 이력 | `services/records.ts` | records |
| 관리 | `services/management.ts` | v1 lists, legacy mutations |
| 설정 | `services/settings.ts`, `manual-email.ts` | operations, geocode, manual email |
| 고객 배송조회 | `services/customer-deliveries.ts` | customer deliveries |

배차 파일의 상세 규칙은 [배차 계약](./contracts/dispatch.md)을 따른다. 배포 절차는 [운영 배포 Runbook](./runbooks/dsv-production-deploy.md)을 따른다.
