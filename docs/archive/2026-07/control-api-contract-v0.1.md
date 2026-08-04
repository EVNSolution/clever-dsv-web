# Control API contract: temperature and destination context

> Archived 2026-08-04. 구현되지 않은 초기 Draft다. 현재 API 경계나 운영 데이터 계약으로 사용하지 않는다.

Status: Draft v0.1

Target frontend: `clever-dsv-web`

Target backend: `clever-route-server/apps/delivery-api`

## 1. Decisions fixed by this contract

1. Temperature hardware and its native protocol are not fixed until a terminal is installed and inspected.
2. The admin frontend consumes a normalized temperature model and never parses device-specific payloads.
3. Remote mode never substitutes simulated temperatures for missing telemetry.
4. The note panel contains two different data sources:
   - delivery items for the selected delivery stop;
   - reusable tips or warnings accumulated for the physical destination from completed delivery records.
5. A route's `deliveryStopId` identifies one delivery occurrence. A `destinationId` identifies the recurring physical destination.
6. Tips belong to `destinationId`, not to a vehicle, route, or one-time order.

## 2. Existing backend facts that shape the contract

The current CLEVER Route server already has:

- `DeliveryStop`: one order's delivery occurrence, including address, status, instructions, route assignment, proof, and driver events;
- `DeliveryCustomerProfile`: a recurring address/customer profile using an address fingerprint and normalized address;
- `OrderItem`: the items for the current order;
- `DriverEvent.NOTE_ADDED`: an immutable event payload tied to a route/stop;
- `AdminNotification`: a tenant-scoped read/unread admin alert.

The existing fields are not sufficient by themselves:

- `DeliveryStop.instructions` is occurrence-specific and must not become the reusable destination-tip store.
- `DeliveryCustomerProfile.adminMemo` is one unstructured string and cannot represent multiple tips, severity, source record, archive state, or audit history.
- `DriverEvent.payload` is suitable for low-volume operational events, not high-frequency temperature samples.

The backend should add structured temperature and destination-tip storage without destructively renaming or removing these existing fields.

## 3. Common HTTP contract

### 3.1 Base path and response envelope

All paths below are relative to the existing frontend base URL `/api/dsv`.

Success:

```json
{
  "data": {},
  "error": null
}
```

Failure:

```json
{
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {}
  }
}
```

`details` is optional. Error messages are safe for the UI and must not contain secrets, SQL, device credentials, or another tenant's identifiers.

### 3.2 Authentication and tenant scope

- Admin reads and writes require the authenticated admin session.
- The backend derives the tenant/shop scope from the session. The browser does not submit a trusted `shopId` or tenant ID.
- Every vehicle, route, delivery stop, destination, tip, and temperature lookup is constrained by that tenant.
- A missing resource and a foreign-tenant resource both return `404 NOT_FOUND`.
- Control responses use `Cache-Control: private, no-store`.

### 3.3 IDs, time, units, and nullability

- IDs are opaque strings. The frontend must not infer a type or tenant from an ID.
- Wire timestamps are ISO 8601 UTC strings such as `2026-07-16T01:25:30.000Z`.
- Temperature values are JSON numbers in degrees Celsius.
- Unavailable values are `null`; they are never `0`, `-`, or a demo fallback in the API payload.
- Arrays are empty when no records exist.
- Samples are ordered oldest to newest. Events and tips are ordered newest to oldest unless stated otherwise.

## 4. Vehicle temperature read contract

### 4.1 Endpoint

```http
GET /control/vehicles/{vehicleId}/temperature
  ?from=2026-07-16T00:00:00.000Z
  &to=2026-07-16T01:00:00.000Z
  &intervalSeconds=30
```

Query rules:

- `from` and `to` default to the most recent 60 minutes.
- `to` must be later than `from`.
- The initial control API supports a maximum requested range of 24 hours.
- `intervalSeconds` is a requested display bucket. The server may return a larger effective interval to stay within the response limit.
- A response contains at most 2,000 samples across all channels.

### 4.2 Response

```json
{
  "data": {
    "vehicleId": "vehicle-id",
    "generatedAt": "2026-07-16T01:00:02.000Z",
    "window": {
      "from": "2026-07-16T00:00:00.000Z",
      "to": "2026-07-16T01:00:00.000Z",
      "intervalSeconds": 30
    },
    "channels": [
      {
        "channelId": "channel-id",
        "label": "냉장 적재함",
        "isPrimary": true,
        "connectionState": "online",
        "condition": "normal",
        "threshold": {
          "minCelsius": null,
          "maxCelsius": 8.0
        },
        "latest": {
          "celsius": 4.8,
          "measuredAt": "2026-07-16T00:59:45.000Z",
          "receivedAt": "2026-07-16T00:59:47.000Z"
        },
        "summary": {
          "sampleCount": 117,
          "minCelsius": 4.4,
          "maxCelsius": 5.2,
          "averageCelsius": 4.8,
          "breachSeconds": 0
        },
        "samples": [
          {
            "celsius": 4.7,
            "measuredAt": "2026-07-16T00:00:00.000Z"
          }
        ],
        "events": [
          {
            "eventId": "event-id",
            "type": "threshold_recovered",
            "condition": "normal",
            "startedAt": "2026-07-16T00:31:00.000Z",
            "endedAt": "2026-07-16T00:34:00.000Z",
            "peakCelsius": 8.6,
            "thresholdCelsius": 8.0
          }
        ]
      }
    ]
  },
  "error": null
}
```

### 4.3 Enumerations

`connectionState`:

- `unconfigured`: no terminal/channel is registered for the vehicle;
- `online`: valid telemetry is arriving within the configured freshness window;
- `stale`: a previous sample exists but is older than the freshness window;
- `offline`: a configured device is explicitly disconnected;
- `error`: the backend cannot validate or decode the channel data.

`condition`:

- `unknown`: no valid current measurement or threshold is available;
- `normal`: the current measurement is within the configured threshold;
- `warning`: the warning threshold or warning duration is met;
- `critical`: the critical threshold or duration is met.

Temperature event `type`:

- `threshold_exceeded`;
- `threshold_recovered`;
- `device_offline`;
- `device_online`.

### 4.4 No-device and no-data behavior

A valid vehicle without installed hardware returns `200`, not `404`:

```json
{
  "data": {
    "vehicleId": "vehicle-id",
    "generatedAt": "2026-07-16T01:00:02.000Z",
    "window": {
      "from": "2026-07-16T00:00:00.000Z",
      "to": "2026-07-16T01:00:00.000Z",
      "intervalSeconds": 30
    },
    "channels": []
  },
  "error": null
}
```

The frontend presents this as `단말기 미설치` or `온도 데이터 없음`. It must not display `4.8℃` or any other fallback value.

### 4.5 Evaluation ownership

- Threshold and stale/offline evaluation occurs on the server.
- Each returned channel includes the threshold used for its summary and events.
- Admin settings may supply a tenant default, but a device/channel-specific threshold may override it.
- The frontend colors and labels the server-provided `condition`; it does not independently decide whether a sample is risky.
- An open temperature event may create or update an `AdminNotification` using a stable dedupe key such as `temperature:{channelId}:{eventId}`.

### 4.6 Device ingestion boundary

The terminal ingestion endpoint is intentionally not frozen in v0.1. It is finalized after installation reveals the transport, authentication, channel count, sample interval, clock behavior, and retry model.

Any device adapter must still satisfy these conditions before writing normalized samples:

- authenticate the terminal independently from browser/admin sessions;
- retain both device `measuredAt` and server `receivedAt`;
- support idempotent retry using a device event ID, sequence, or equivalent dedupe key;
- reject or quarantine invalid numbers, impossible temperatures, malformed timestamps, and excessive clock skew;
- map one or more device-native channels to stable backend `channelId` values;
- never expose device credentials or raw vendor payloads to the frontend;
- emit normalized samples and state changes consumed by the read contract above.

High-frequency samples require dedicated telemetry storage. They must not be appended as `DriverEvent` rows.

## 5. Selected delivery-stop context contract

### 5.1 Endpoint

```http
GET /control/delivery-stops/{deliveryStopId}/context
```

This is the single read used when the operator selects a destination row or destination marker and opens the note panel.

### 5.2 Response

```json
{
  "data": {
    "deliveryStopId": "delivery-stop-id",
    "destination": {
      "destinationId": "destination-id",
      "name": "강남세브란스병원",
      "address": "서울특별시 강남구 언주로 211"
    },
    "items": [
      {
        "orderItemId": "order-item-id",
        "name": "진단키트 냉장 검체",
        "sku": "COLD-KIT-01",
        "quantity": 2,
        "temperatureBand": "cold"
      }
    ],
    "tips": [
      {
        "tipId": "tip-id",
        "destinationId": "destination-id",
        "category": "access",
        "severity": "warning",
        "title": "후문 하역장 이용",
        "body": "도착 10분 전 약제팀에 연락하고 지하 1층 하역장으로 진입합니다.",
        "source": {
          "kind": "delivery_record",
          "deliveryStopId": "past-delivery-stop-id",
          "recordedAt": "2026-07-10T07:40:00.000Z"
        },
        "revision": 3,
        "createdAt": "2026-07-10T07:42:00.000Z",
        "updatedAt": "2026-07-15T02:10:00.000Z"
      }
    ]
  },
  "error": null
}
```

### 5.3 Field rules

- `items` always represents the selected stop's current order items. Items are not copied into destination tips.
- `temperatureBand` is nullable until a canonical item temperature classification exists on the backend.
- `destinationId` is stable across repeated orders to the same normalized destination.
- The initial backend may map `destinationId` to `DeliveryCustomerProfile.id` because that model already owns an address fingerprint and normalized address.
- A destination merge must preserve existing tip references or redirect them to the surviving destination.
- Only active tips appear in the control context response.

Tip `category`:

- `access`: building entrance, loading dock, elevator, security desk;
- `parking`: parking space, vehicle-height or stopping constraints;
- `handoff`: recipient contact and direct handoff procedure;
- `proof`: POD, receipt, signature, or document requirements;
- `temperature`: recorder or cold-chain handling caution;
- `safety`: physical or operational safety warning;
- `other`.

Tip `severity`:

- `info`;
- `warning`.

The first version does not expose `critical`; urgent incidents belong to the notification/event system rather than persistent destination tips.

## 6. Destination-tip write contract

### 6.1 List

```http
GET /destinations/{destinationId}/tips?status=active
```

`status` is `active` or `archived`. The default is `active`.

### 6.2 Create from a completed delivery record

```http
POST /destinations/{destinationId}/tips
Content-Type: application/json

{
  "category": "parking",
  "severity": "warning",
  "title": "차량 높이 제한",
  "body": "지하주차장 진입 높이는 2.3m입니다.",
  "sourceDeliveryStopId": "completed-delivery-stop-id"
}
```

Response: `201` with `{ "data": { "tip": ... }, "error": null }`.

Create rules:

- `title` is 1 to 80 trimmed characters.
- `body` is 1 to 1,000 trimmed characters.
- `sourceDeliveryStopId` is optional for a manually entered admin tip.
- When supplied, the source stop must belong to the same tenant and resolved destination.
- A record-derived tip may only reference a completed or delivered stop.
- `DriverEvent.NOTE_ADDED` does not automatically become an active reusable tip. An operator must review and create/promote it.
- The authenticated user is stored as the creator; client-supplied actor IDs are ignored.

### 6.3 Update or archive

```http
PATCH /destinations/{destinationId}/tips/{tipId}
Content-Type: application/json

{
  "revision": 3,
  "severity": "info",
  "body": "후문 하역장을 우선 이용합니다.",
  "status": "active"
}
```

- `revision` is required for optimistic concurrency.
- A stale revision returns `409 TIP_REVISION_CONFLICT` with the current revision in `error.details`.
- `status: "archived"` removes the tip from control views while retaining audit history.
- v0.1 provides no hard-delete endpoint.
- Updates retain creator, updater, timestamps, source record, and prior revisions in the audit log.

## 7. Control-page selection contract

- Selecting a vehicle establishes `vehicleId` for the temperature request.
- Selecting a delivery row or map destination marker establishes `deliveryStopId` for the context request.
- Map and list selection must share the same external `deliveryStopId`; map-only `stopNo` state is insufficient.
- Changing the selected vehicle clears a selected stop that does not belong to that vehicle's active route.
- Opening the note panel without a selected stop uses the vehicle's current/next delivery stop supplied by the control snapshot, not the first stop in the route array.
- A context response with `tips: []` still displays the current `items` and an explicit `등록된 배송지 팁 없음` state.

## 8. Error contract

| HTTP | Code | Condition |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid ID shape, timestamp, range, category, severity, or body |
| 401 | `UNAUTHORIZED` | Missing or expired admin session |
| 403 | `FORBIDDEN` | Authenticated user lacks tip write permission |
| 404 | `NOT_FOUND` | Resource is missing or outside tenant scope |
| 409 | `TIP_REVISION_CONFLICT` | Tip update used a stale revision |
| 422 | `TEMPERATURE_RANGE_UNSUPPORTED` | Requested time range or interval cannot be served |
| 503 | `TELEMETRY_UNAVAILABLE` | Temperature read storage is temporarily unavailable |

Telemetry storage failure is different from an uninstalled/offline terminal. Uninstalled or offline hardware returns `200` with the relevant `connectionState`; `503` is reserved for a backend read failure.

## 9. Backend persistence conditions

The API contract requires additive persistence equivalent to:

- temperature channel/device registration tied to `shopId` and `vehicleId`;
- append-only normalized temperature samples keyed for idempotency;
- derived threshold/state events tied to a channel and optionally route/stop context;
- destination tips tied to the stable destination/profile and optional source `DeliveryStop`;
- tip revision/audit history and soft archive state.

Implementation names may differ, but these relationships and tenant boundaries are contractual.

## 10. Minimum contract tests

Backend tests must prove:

1. a valid vehicle with no device returns `200` and `channels: []`;
2. no remote response fabricates temperature values;
3. samples are tenant-scoped, time-bounded, ordered, and capped;
4. server-evaluated condition and threshold are returned together;
5. another tenant's vehicle, stop, destination, or tip returns `404`;
6. selected stop context returns that stop's current items and its destination's active tips;
7. a tip cannot cite a source stop from another destination or an incomplete delivery;
8. stale tip revision returns `409 TIP_REVISION_CONFLICT`;
9. archived tips are absent from control context but remain in audit history;
10. map/list callers can address the same stop using `deliveryStopId`.

Frontend contract tests must prove:

1. vehicle changes request temperature for the new `vehicleId`;
2. no-device, stale, offline, error, and normal states render without a demo fallback;
3. destination row and marker selection request the same `deliveryStopId` context;
4. the note panel changes items and tips when the selected stop changes;
5. empty tips do not hide current delivery items;
6. envelope errors remain inside the affected panel without destroying the map or fleet list.
