# CLEVER DSV Web

`dsv.cleversystem.ai`에서 사용하는 DSV 배송 운영 웹 프런트엔드입니다.

## 책임 범위

- 이 저장소는 DSV 관리자 화면과 고객 배송조회 화면의 정본입니다.
- `clever-route-server`는 인증, DSV API, 데이터베이스, 지오코딩, OSRM/VROOM과 운영 프록시를 소유합니다.
- Shopify, WooCommerce와 공통 Route Ops 화면은 이 저장소의 범위가 아닙니다.
- `src/demo`는 로컬 mock 화면을 위한 frontend demo projection이며 백엔드 모델이나 API DTO가 아닙니다.

## 화면

| 경로 | 메뉴 | 역할 |
| --- | --- | --- |
| `/control` | 관제 | 차량, 경로, 배송지 상태 확인 |
| `/dispatch` | 배차 | 주문 업로드, 검색, 지도 배정, 삭제와 시간 제약 확인 |
| `/records` | 이력 | 배송 결과, 이벤트와 증빙 확인 |
| `/master-data` | 관리 | 배송원, 차량, 고객사, 배송처와 운송조건 관리 |
| `/settings` | 설정 | 운영 시간, 출발지, 알림과 수동 이메일 설정 |
| `/customer/delivery-inquiry` | 고객 배송조회 | 로그인한 고객사 범위의 배송 조회 |
| `/customer/delivery-inquiry/admin` | 고객 배송조회 | DSV 관리자의 고객사별 조회 |

## 기술 구성

- React 19, TypeScript 6, Vite 7
- MapLibre GL, OpenFreeMap 정적 스타일, 서버 제공 지도 프로필
- Pretendard Variable
- 일반 CSS와 명시적 cascade layer
- Playwright E2E
- CSV 및 XLSX 배차 파일 파서

## 로컬 실행

mock 모드는 브라우저 로컬 데이터로 화면을 확인합니다.

```bash
npm ci
npm run dev
```

백엔드 연결 모드는 로컬 프록시 대상이 필요합니다.

```bash
npm run dev:remote
```

환경변수 기준은 [`.env.example`](./.env.example)을 따릅니다. API 모드는 `mock` 또는 `remote` 중 하나를 명시해야 하며, remote 요청 실패를 mock 데이터로 대체하지 않습니다.

## 검증

```bash
npm run build
npm run test:e2e
npm run test:e2e:remote
```

전체 검증은 다음 명령으로 실행합니다.

```bash
npm run check
```

## 문서

- [문서 인덱스](./docs/README.md)
- [디자인 정본](./DESIGN.md)
- [백엔드 API 연결](./docs/backend-api.md)
- [배차 계약](./docs/contracts/dispatch.md)
- [운영 배포 Runbook](./docs/runbooks/dsv-production-deploy.md)
- [아카이브](./docs/archive/README.md)

과거 HTML 데모, 초기 계획, 초안 계약과 외부 매뉴얼은 현재 구현 기준이 아니며 `docs/archive`에 보존합니다.
