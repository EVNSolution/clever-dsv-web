# Clever - DSV Web

`dsv.cleversystem.ai` 전용 웹 프론트엔드입니다.

## 정본 기준

- 이 repo는 DSV 웹 프론트의 별도 정본입니다.
- `clever-route-server`는 API, Redis, OSRM/VROOM, Caddy 기준입니다.
- `route-ops-web`, Shopify, Woo/Sync 화면과 섞지 않습니다.
- 기존 HTML 데모는 `docs/reference/demo-reference/`에 골든뷰로 보존합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm run check
```

## 다음 구현 시작점

1. `docs/reference/demo-reference/index.html`의 고객사/배송조회 화면 구조 확인
2. `src/`에 고객사 로그인, 고객 배송조회, DSV 운영자 화면을 분리 구현
3. API는 same-origin 기준으로 `clever-route-server`의 `/customer/*`, `/api/dsv/*`와 연결
