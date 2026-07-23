# Backend API connection

The frontend defaults to the existing demo through `VITE_DSV_API_MODE=mock`.

Current frontend routes are `/control`, `/dispatch`, `/records`, `/master-data`, `/settings`, and `/customer/delivery-inquiry`. Current operator labels are `관제`, `배차`, `이력`, `관리`, and `설정`.

`src/demo` and localStorage-backed demo storage are mock-only projections for the current screens. Those TypeScript types and fixtures are not backend domain models, API DTO contracts, or remote-mode fallback data.

To connect authentication and remote reads to a backend:

```env
VITE_DSV_API_MODE=remote
VITE_DSV_API_BASE_URL=/api/dsv
```

Login bootstrap remains a bounded legacy command:

```http
POST /api/dsv/auth/login
Content-Type: application/json

{"id":"operator","password":"...","shopDomain":"dsv-demo.local"}
```

Successful responses may use an HTTP-only session cookie. An optional `{ "accessToken": "..." }` response is retained only as transport compatibility state. API requests send same-origin cookies with `credentials: include`.

Errors should return JSON such as `{ "message": "로그인 정보가 올바르지 않습니다." }`. The bounded legacy client surfaces that message and otherwise falls back to an HTTP-status message.

## v1 reads

G005 completed the strict `/api/dsv/v1` read/session floor:

```http
GET  /api/dsv/v1/session
POST /api/dsv/v1/session/logout
GET  /api/dsv/v1/dispatches
GET  /api/dsv/v1/control
GET  /api/dsv/v1/records
GET  /api/dsv/v1/drivers
GET  /api/dsv/v1/vehicles
GET  /api/dsv/v1/customers
GET  /api/dsv/v1/destinations
GET  /api/dsv/v1/conditions
GET  /api/dsv/v1/customer/deliveries
```

There is no v1 `/api/dsv/v1/resources` endpoint. Driver and vehicle lists are separate v1 reads.

v1 read success responses use the G005/G006 envelope:

```json
{
  "data": {},
  "meta": { "apiVersion": "dsv.v1" },
  "requestId": "req_..."
}
```

v1 errors use the strict v1 floor:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request",
    "requestId": "req_..."
  }
}
```

`details` may be present on errors when the contract allows it.

Client ownership is explicit: `requestV1ReadJson` owns strict v1 reads; `requestV1AssignmentCommandJson` owns only the two legacy-envelope v1 aliases, `POST /seller-orders/{sellerOrderId}/assignment/unassign` and `POST /seller-orders/{sellerOrderId}/assignment/reassign`; and `requestLegacyJson` owns allowlisted bounded `/api/dsv` calls using `{ "data": ..., "error": ... }`.

Remote mode verifies `GET /api/dsv/v1/session` before rendering DSV pages. If the session is missing or expired, the shell closes to login or blocked state instead of exposing local demo data.

Customer delivery inquiry is session-principal scoped. It does not trust `?customer=`, `customerId`, `accountId`, or any other query/body/path value as authority. The customer scope comes only from the authenticated customer session.

## Bounded legacy commands

The following remote operations remain bounded legacy `/api/dsv` calls and retain the legacy `{ "data": ..., "error": ... }` envelope:

```http
GET /api/dsv/settings/operations
PATCH /api/dsv/settings/operations
X-CSRF-Token: ...

{
  "loadingStartTime": "07:40",
  "plannedDepartureTime": "08:20"
}
```

The backend may return either value as `HH:mm` or `null`. Active G006 does not infer or mock a remote value from `null`; an unset remote operational time remains blocked or unavailable until the server returns an explicit `HH:mm` value.

Dispatch CSV upload uses `POST /api/dsv/dispatch-imports/preview` for validation and `POST /api/dsv/dispatch-imports` for the CSRF-protected commit. Transport condition reads use v1 `/conditions`; condition creation remains bounded legacy `POST /api/dsv/conditions`. The commit stores DSV staging rows; it does not yet create canonical orders or routes.

Resource mutations and default driver assignment writes also remain bounded legacy:

```http
POST   /api/dsv/drivers
PATCH  /api/dsv/drivers/{driverId}
DELETE /api/dsv/drivers/{driverId}
POST   /api/dsv/vehicles
PATCH  /api/dsv/vehicles/{vehicleId}
DELETE /api/dsv/vehicles/{vehicleId}
POST   /api/dsv/vehicles/{vehicleId}/drivers
DELETE /api/dsv/vehicles/{vehicleId}/drivers/{assignmentId}
```

Management reads use the v1 list endpoints for drivers, vehicles, customers, destinations, and conditions. Resource CRUD and default driver assignment writes stay on the bounded legacy endpoints above.

Active G006 contract: after a resource mutation and refetch, v1 vehicle rows expose canonical default-assignment state through a minimal additive `driverAssignments` array containing `assignmentId` and `driverId`. This is the G006 integration contract, not a deployed-production claim.

Settings and dispatch import remain bounded legacy in G006. Rich details that v1 does not provide, such as proof URLs, cargo details, event details, and full timelines, render unavailable instead of being rebuilt from demo data.

Remote mode never falls back silently to demo or local data after an API request fails. The page keeps or restores the last visible state and surfaces the API error.

The first agreed control-domain contract is documented in [`control-api-contract.md`](./control-api-contract.md).
The SellerOrder assignment and Condition boundaries are documented in [`dispatch-api-contract.md`](./dispatch-api-contract.md).
The current DB, backend, frontend, and fallback boundaries are tracked in [`backend-slice-map.md`](./backend-slice-map.md).
