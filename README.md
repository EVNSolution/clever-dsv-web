# CLEVER - DSV Web

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

1. 현재 화면 경로는 `/control`, `/dispatch`, `/records`, `/master-data`, `/settings`, `/customer/delivery-inquiry`입니다.
2. 운영자 메뉴 표기는 `관제`, `배차`, `이력`, `관리`, `설정`입니다.
3. `src/demo`는 프론트엔드 데모 투영과 화면 fixture의 정본입니다. 이 타입은 백엔드 모델이나 API DTO 계약이 아닙니다.
4. API 연결은 `docs/backend-api.md`와 확정된 계약 문서를 기준으로 진행합니다.
