# Backend slice map

Status date: 2026-07-23

이 문서는 현재 화면을 유지하면서 프런트 데모 데이터를 서버 소유 데이터로 옮기는 순서와 경계를 기록한다. 화면별 API를 한 번에 만들지 않고, 정합성을 검증할 수 있는 단위로 전환한다.

## 용어 경계

현재 저장소에는 `FFB`라는 별도 계층이 없다.

- `BFF`를 의미한다면 `/api/dsv`가 이미 DSV 웹에 맞춘 서버 진입점이다. 별도 배포 BFF는 추가하지 않는다.
- 프런트 fallback을 의미한다면 `mock`은 명시적인 로컬 개발 모드다. `remote`에서 API가 실패할 때 데모 데이터로 조용히 전환하지 않는다.
- 공통 API 클라이언트와 화면별 service가 프런트 경계다. 범용 저장소나 동기화 계층은 실제 중복 요구가 생기기 전까지 만들지 않는다.

## 소유권 현황

| 영역 | DB | BE | FE | 상태와 다음 경계 |
| --- | --- | --- | --- | --- |
| DSV 세션 | `Shop`, `CustomerAccount`, 서버 환경 설정 | v1 세션 조회와 로그아웃, legacy 로그인 bootstrap, CSRF | 원격 모드 접근 차단 | G005 read/session 완료. 계정 발급과 운영 로그인 정책은 별도 |
| 배송원 | `Driver`, `DsvDriverProfile` | v1 목록 조회, legacy 등록/수정/삭제 | 관리 화면 v1 목록, legacy 쓰기 | G006 전환 중. WMS 배송원 고유코드는 미확정 |
| 차량 | `Vehicle`, `DsvVehicleProfile` | v1 목록 조회, legacy 등록/수정/삭제 | 관리 화면 v1 목록, legacy 쓰기 | G006 전환 중. WMS 차량 고유코드는 미확정 |
| 기본 배정 | `DsvVehicleDriverAssignment` | legacy 배정/해제 | legacy mutation 후 v1 차량 목록 재조회 | G006 활성 계약: v1 차량 row의 `driverAssignments[]`는 `assignmentId`, `driverId`만 노출 |
| 운송조건 | `DsvTransportCondition` | v1 목록 조회, legacy 등록 | 관리 화면 v1 목록, 업로드 후보 legacy 등록 | 수정 API와 삭제 정책은 미확정 |
| 배차 업로드 | `DsvDispatchImport`, `DsvDispatchImportRow` | legacy 사전 검사, 스테이징 확정, 상세 조회 | CSV 업로드 legacy 연결 | bounded legacy 유지. 정식 주문과 경로 적용은 아직 금지 |
| 배차 운영 화면 | `Order`, `DeliveryStop`, `RoutePlanStop` 후보 | v1 배차 summary/list 조회 | 원격 read adapter 전환 중 | rich timeline, cargo, proof detail은 v1에 없으면 unavailable |
| 관제 차량과 경로 | 기존 `RoutePlan` 계열 후보 | v1 관제 summary, 명시 상세 열람 시 legacy stop context | 원격 read adapter 전환 중 | fake fleet, route, cargo, proof fallback 금지 |
| 배송지 팁 | `DestinationTip`, revision과 audit | legacy stop context의 redacted tip summary | 선택 배송지 상세에서 제한 사용 | 별도 tip endpoint 확장 금지. 기록 상세과 관리 화면 연결 범위는 미확정 |
| 배송 이력과 증빙 | 기존 배송 이벤트와 proof 모델 후보 | v1 records summary 조회 | 원격 read adapter 전환 중 | proof URL, event detail, timeline은 unavailable |
| 고객사와 배송처 | `Customer`, `DeliveryCustomerProfile` | v1 목록 조회 | 관리 화면 v1 목록 | 쓰기, 원본 식별자, 주소 중복판정 계약이 선행 |
| 고객사 배송조회 | `CustomerAccount`, `Order`, `Customer`, `DeliveryCustomerProfile` | v1 session-scoped `customer/deliveries` 조회 | 고객 세션 범위만 표시 | customer query parameter는 권한이 아님 |
| 알림 | 서버 공통 모델 후보 | DSV API 없음 | 알림과 읽음 상태 localStorage | 읽음 상태는 UI acknowledgement. 생성 규칙과 수신 역할 확정 후 연결 |
| 운영 설정 | `Shop.routeOpsUiSettings` JSON | legacy 상차와 출발 시간 조회, 수정 | 설정과 배차 ETA legacy 연결 | bounded legacy 유지. remote mode에서 localStorage 정본 금지 |
| OSRM | 영속 DB 없음 | 기존 경로 계획 기능 후보 | public OSRM 직접 호출, 브라우저 캐시 | 정식 경로 생성 시 서버 계산 결과를 소유 |

## 구현 순서

1. G005 v1 read/session floor: 구현 완료.
2. G006 frontend remote cutover: v1 read client, bounded legacy client, no demo/local fallback 검증.
3. 관리 화면 전환: v1 목록 조회와 legacy resource CRUD/default assignment 쓰기 분리.
4. 원격 unavailable 상태 정리: v1에 없는 rich timeline, cargo, proof URL, event detail은 표시 불가 상태로 렌더링.
5. 배차 스테이징 적용 계약: 고객사, 배송처, 주소 확정, 중복 방지, 승인과 롤백을 먼저 결정.
6. 알림과 남은 운영 설정.

## 현재 차단 조건

- WMS 배송원과 차량의 장기 고유코드가 없다. 현재 이름과 차량 번호는 데모 계약이다.
- 배차 스테이징을 정식 주문과 경로로 바꾸는 승인, 수정, 재업로드, 롤백 규칙이 없다.
- 고객사와 배송처의 원본 식별자 및 주소 중복판정 책임이 확정되지 않았다.
- 고객사 계정 발급, 로그인 교환, 운영 인증 정책은 G005/G006 범위 밖이다. customer 조회 범위는 authenticated customer session만 결정한다.
- 원격 모드에서 `src/demo`와 localStorage는 mock-only다. API 실패 뒤 demo/local state로 조용히 전환하지 않는다.
- 서버의 기존 migration 디렉터리는 완전한 빈 DB 기준선이 아니다. 이번 migration SQL은 이전 스키마에서 현재 Prisma 스키마로의 일치 여부를 검증했지만, 운영 `migrate deploy` 전에 기존 migration 기준선을 정리해야 한다.
