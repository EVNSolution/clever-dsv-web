# Test Spec — DSV Phase 2 Frontend/Auth/Deploy

## Unit Tests
1. Customer access helper accepts same customer/company, rejects mismatched URL customer id, and filters out other-customer rows.
2. Customer session helper creates signed httpOnly secure cookies, rejects expired/tampered cookies, clears on logout.
3. Order grouping helper groups canonical `Order` rows by DSV order key, creates stable customer-facing `1..N` destination sequence, and supports multiple vehicle assignments.
4. API serializers omit other-customer/private fields and expose only customer-safe route, vehicle, item, ETA, dwell, and completed-at fields.
5. Customer bootstrap serializer omits admin nav, admin CSRF, admin app URLs, admin notification stream config, and store/session-picker fields.
6. Grouping key fallback is deterministic: `sourceOrderNumber`, then `sourceOrderId`, then explicit DSV raw key; rows with no key are flagged instead of silently merged.
7. Customer session cookie is exactly `clever_dsv_customer_session`, path `/customer`, host-only, `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
8. Customer bootstrap DTO is an allowlist: `user`, `customerCompany`, `mapConfig`, `routes`, and optional customer-only `csrfToken`; adding any admin-only field fails the test.

## Integration Tests
1. `POST /customer/login` redirects valid DSV customer user to `/customer/{customerId}`.
2. `GET /customer/:customerId/orders` returns 401 unauthenticated.
3. Authenticated customer A cannot access customer B URL or data.
4. Grouped order detail returns order header, vehicle list, destinations numbered `1..N`, item list, and selected customer route geometry only.
5. Admin DSV customer APIs require admin session and CSRF.
6. Admin invite creation requires name/email/phone and creates no public signup path.
7. Admin session cookie cannot authenticate `/customer/*`; customer session cookie cannot authenticate `/admin/*`.
8. `/customer/{customerId}` rejects a valid customer session when URL company id differs from session company id.
9. Admin and customer sessions can coexist in one browser without either auth helper reading the other's cookie.

## Frontend Tests
1. Customer viewer renders only current customer orders.
2. Multi-vehicle order selection shows vehicle list first, then remaining time/ETA, destination list, and item list.
3. Destination numbering is customer-facing `1..N`.
4. Color rules: pending/next blue, active/current green, completed/history gray.
5. Other customer fixture text never appears in DOM.

## E2E / Smoke
1. Open `/customer/login`, login with seeded customer user, redirect to `/customer/{customerId}`, order list and map render.
2. Select a sample grouped order; vehicle list shows at least two vehicles; selecting each vehicle updates destination list and route fit bounds.
3. Reload order detail URL preserves customer context; removing cookie rejects access.
4. `/admin/ui/app/dsv/customers` loads under admin session; viewer links point to `/customer/{customerId}`.
5. Host-header smoke covers `dsv.cleversystem.ai` and `clever-route.cleversystem.ai` separately, including cookie isolation.

## Deploy Verification
1. Run route-ops web lint/typecheck/test/build.
2. Run delivery-api Prisma validate/generate, lint, typecheck, and targeted DSV API tests.
3. Validate compose config after Caddy/compose changes.
4. Run `route-ops-simple-deploy` with `dry_run=true`.
5. After user-approved deploy, smoke `https://dsv.cleversystem.ai/customer/login`, customer viewer, admin DSV route, and same-origin route requests.
6. Confirm browser network for customer viewer uses customer API paths only, not `/admin/ui/app/api/*`.

## Deferred
- Native mobile app tests.
- Full telemetry ingestion load tests.
- Separate EC2/DB isolation tests.
