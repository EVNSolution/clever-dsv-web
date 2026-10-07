# DSV 관제 웹 검증 기록

검증일: 2026-10-07, 한국시간.
웹 base: `4f261b67cfb22669cb26a093eb1f3f59ab9c7606`.
웹 검증 소스: `5895e11a6d5e77a7ae99c9e447d2580163fa5514`와 이 기록의 전용 spec 제외 수정.
서버 source 검사 기준: `af9b4b43b40a5c6c5cba7bc83587217b2bbe25ab`.
실제 PostgreSQL runtime 기준: `2d28b39bfb5956b23b26e6d112860d0f6e80ed04`.
격리 브랜치: `codex/dsv-operations-web`.

## 검증 경계

1. 단위 검사와 계약 모킹은 합성 DTO와 HTTP 응답을 사용한다.
2. 소스 HTTP 통합은 고정 서버의 실제 Fastify route, 실행 DTO, map/select, 보고 처리, 알림 resolver/ack 서비스를 사용한다. 핵심 소스 9개 파일의 SHA256을 확인한다.
3. 소스 HTTP 통합의 Prisma 저장소, SQL 잠금, transaction 직렬화, 일부 DB 기본값과 기존 세션 bootstrap은 합성 구현이다. 실제 서명 쿠키 검증과 CSRF 경계는 서버 소스를 사용한다.
4. 별도 localhost runtime은 독립 PostgreSQL과 실제 Prisma 저장소를 사용한다. 운영 서버, 운영 DB, 실제 GPS, 실기기와 FCM은 이번 증거에 포함하지 않는다. 서버 PR483의 미병합·미배포 상태를 유지한다.

## 실행 명령

```sh
npm ci --no-audit --no-fund
npm run check
npm run lint
npm run typecheck
VITE_DSV_API_MODE=remote VITE_DSV_OPERATIONS_ENABLED=false npm run build
DSV_OPERATIONS_SCREENSHOT_DIR=/tmp/dsv-operations-web-evidence npm run test:operations
DSV_OPERATIONS_SERVER_SOURCE=/tmp/dsv-operations-server-source npm run test:operations:source
DSV_OPERATIONS_SERVER_SOURCE=/tmp/dsv-operations-server-source DSV_OPERATIONS_SCREENSHOT_DIR=/tmp/dsv-operations-web-evidence npm run test:e2e:operations:source
DSV_OPERATIONS_POSTGRES_RUNTIME_URL=http://127.0.0.1:4908 DSV_OPERATIONS_POSTGRES_SERVER_SHA=<health의 정확한 서버 runtime identity> DSV_OPERATIONS_POSTGRES_SCREENSHOT_DIR=/tmp/dsv-operations-postgres-browser npm run test:e2e:operations:postgres
```

`check`는 단위, 정적 구조, 기존 mock 화면, 구형 remote API, 격리 신규 operations 브라우저 순서다. 구형 remote 검사에는 기본 OFF 검사가 포함된다. 신규 기능의 ON 브라우저 검사는 별도 설정을 사용한다. 일반 브라우저 설정에서 ON 검사와 소스 통합 검사를 제외한다.

소스 HTTP 검사는 `DSV_OPERATIONS_SERVER_SOURCE`가 필요하다. 이 변수가 없으면 HTTP 테스트는 skip되며 통과 증거로 계산하지 않는다. 소스 브라우저 설정은 변수가 없으면 실패한다.

실제 PostgreSQL 브라우저 검사는 별도 localhost runtime이 필요하다. `DSV_OPERATIONS_POSTGRES_RUNTIME_URL`이 없거나 localhost HTTP URL이 아니면 설정 단계에서 실패한다. 서버 runtime identity도 필수이며 health 응답과 정확히 일치해야 한다. 커밋되지 않은 격리 harness를 포함하면 기준 SHA 뒤에 명시적 working-tree 접미사를 붙인다. runtime은 실제 Prisma와 독립 PostgreSQL을 사용한다. `__fixture` endpoint는 loopback에서만 열리는 테스트 bootstrap이다. 해당 endpoint는 브라우저 세션, Driver API 행동과 검증 상태만 준비한다. 제품 API나 운영 기능으로 계산하지 않는다.

소스 준비는 다른 저장소를 변경하지 않는 읽기 작업이다. 별도 빈 임시 디렉토리에 서버 commit을 `git archive`로 내보낸다. `.dsv-operations-source-commit`에 전체 서버 SHA와 줄바꿈을 기록한다. `apps/delivery-api/node_modules`에는 이미 존재하는 서버 의존성 경로를 연결한다. 웹 저장소 검사로 서버의 설치, DB migration, 정책이나 배포를 실행하지 않는다.

## 브라우저 수용 범위

실제 Chromium을 사용한다. 계약 모킹 검사와 source HTTP proxy 검사를 분리한다. source 브라우저는 operations API를 가로채지 않는다.

실제 PostgreSQL 브라우저 검사는 source HTTP 합성 저장소 검사와 분리한다. 매 사례가 새 fixture를 만들며 operations API를 가로채지 않는다. Driver API가 만든 N07의 정확한 보고 이동, 읽음, 확인, 처리 완료와 주문·배송 결과 분리를 검증한다. 시작 전 OPEN 경고가 서버 시작 승인 후 30초 poll에서 RESOLVED로 바뀌는지도 검증한다.

- 회차 상세에서 GPS 근거, 시작 승인, 출발 관측, N01~N06과 작업 시도를 구분한다.
- N07은 resolver의 보고 ID, 회차 ID와 대상 배송지 ID를 검증한다.
- 알림 읽음·열람은 보고 상태를 바꾸지 않는다. 보고 확인·처리 완료는 주문과 배송 상태를 바꾸지 않는다.
- 조회/변경 권한, CSRF, 사업장 변경과 권한 상실을 검사한다.
- 직접 URL, 새로고침, 로그인 복구, 취소·재배정·만료 안내를 검사한다.
- commandId와 고정 입력으로 map/select를 재시도한다. 중복 입력, 응답 유실, 새로고침 복구, 충돌과 확정되지 않은 결과를 검사한다.
- 정확히 조회한 회차의 상태가 알 수 없으면 새 `SAME_EXECUTION`과 차량 선택을 차단한다. 대소문자가 다른 동일 UUID도 같은 대상으로 판정한다. 차단된 두 경로에서 POST가 0건인지 검사한다.
- 같은 알 수 없는 상태에서도 `NEW_EXECUTION`은 전송한다. 이미 보낸 `SAME_EXECUTION`의 응답이 유실된 뒤 상태가 알 수 없게 바뀌어도 동일 commandId와 고정 입력으로 재시도한다. 미조회 ID와 최종 업무 권한은 서버가 검증한다.
- 30초 갱신, 늦은 응답, 페이지 cursor, 한도, 생략, 알 수 없는 상태와 입력 보존을 검사한다.
- 1440×900, 1024×768, 768×1024, 390×844, 375×812에서 실제 컨트롤의 경계를 검사한다. 모바일 영역 선택과 보고 이동도 검사한다.

초기 모바일 캡처는 오른쪽이 잘렸다. document 전체 너비만 확인하는 검사는 부모의 숨김 overflow를 잡지 못했다. 단일 열 grid에 `minmax(0, 1fr)`을 사용하고 패널의 최소 너비를 제한했다. 실제 컨트롤 위치를 검증하도록 브라우저 검사를 강화했다. 초기 캡처는 수용 증거로 사용하지 않는다.

초기 정적 구조 검사는 기존 메뉴만 기대했다. 회차 메뉴를 추가한 현재 명칭으로 기대값을 갱신했다. 신규 API의 기존 v1 parser 거절 조건은 유지했다.

실제 PostgreSQL 전용 spec가 일반 mock Playwright 설정에 포함되면 mock HTML을 fixture JSON으로 읽는다. 일반 설정의 `testIgnore`에 전용 spec를 추가했다. 실제 DB 검사는 전용 설정에서만 실행한다.

## 남은 차단

- 실제 배포 서버 API는 미검증이다. 별도 서버 검사는 PostgreSQL 잠금·동시성·DB 기본값을 담당한다. 웹 브라우저 검사는 그 runtime의 조회와 보고 처리 흐름만 검증한다.
- 서버 PR483은 미병합·미배포다. 이번 웹 PR도 병합하거나 배포하지 않는다.
- Driver PR64 소스 검토와 앱 보안, 실기기, FCM 수신 검증은 별도다.
- D01/D02/D04/D05/D07, 운영 사유 목록과 최종 보고 처리 흐름은 미승인이다. 반복 최대 6회도 확정하지 않는다.
- 실제 운영 활성화와 실발송은 기본 OFF 경계 밖이며 이번 작업에서 수행하지 않는다.

## 최종 검사 결과

기존 checkout을 보존하고 별도 관리 worktree에서 검사했다. 최종 소스 리뷰에서 차단 결함을 찾지 못했다.

| 검사 | 결과 | 증거 |
|---|---|---|
| `npm run check` | 종료 코드 0 | `/tmp/dsv-web-final-check.log` |
| 단위 검사 | 13 통과, 0 실패 | `/tmp/dsv-web-final-check.log` |
| 정적 구조 | 25 통과 | `/tmp/dsv-web-final-check.log` |
| 기존 mock 브라우저 | 55 통과, remote 전용 33 제외 | `/tmp/dsv-web-final-check.log` |
| 기존 remote API와 기본 OFF 브라우저 | 181 통과 | `/tmp/dsv-web-final-check.log` |
| 신규 operations 계약 모킹 Chromium | 49 통과 | `/tmp/dsv-web-final-check.log` |
| 최종 화면 캡처 검사 | 8 통과 | `final-captures.log` |
| 고정 서버 소스 HTTP 통합 | 9 통과, 0 skip | `source-http.log` |
| 고정 서버 소스 HTTP Chromium | 1 통과 | `source-browser.log` |
| 독립 PostgreSQL runtime Chromium | 2 통과, 1 worker | `/tmp/dsv-web-final-postgres-browser.log` |
| `npm run lint` | 종료 코드 0 | `/tmp/dsv-web-final-lint.log` |
| TypeScript 검사 | lint와 mock/remote build에서 통과 | 위 최종 lint/check/build 로그 |
| remote, 기능 OFF의 `npm run build` | 종료 코드 0 | `/tmp/dsv-web-final-default-off-build.log` |

이전 source 검사 로그는 `/tmp/dsv-operations-web-evidence/`에 있다. 최종 웹 로그는 위 표의 경로에 있다. 화면 캡처 재실행은 최종 PostgreSQL runtime의 보고 완료 표시를 확인했다. Vite의 500 kB 초과 chunk 경고는 남아 있다. 빌드와 정적 서버 계약 검증은 통과했다.

## 최종 화면 증거

캡처는 위 로그와 같은 임시 디렉토리에 있다. 실제 Chromium 캡처를 눈으로 확인했다. 회차 컨트롤은 375 px 화면 안에 있다. 보고 완료 캡처는 상세의 `RESOLVED`와 갱신 종료를 확인한 뒤 저장했다.

| 캡처 | 확인 대상 | SHA256 |
|---|---|---|
| `execution-evidence-desktop.png` | 회차, GPS 근거, 시작 경고, 알림 시도 구분 | `361dff7ece1dbd2456659eeffa170348bea5c8053cc417b5cb94365bb84bf812` |
| `execution-375x812.png` | 모바일 영역 선택, 상세와 관리자 입력 | `9c99c952d0c1ed2a99d4eba8294ba5ee25dd038ff255241f6ea493ccfed0e2b7` |
| `n07-report-resolved.png` | 계약 모킹 N07의 정확한 보고 처리 완료 | `57257def2cb01d89c9486ea2c94f3d71dd58eae856f47797fc08f8ad94536f3e` |
| `source-http-report-resolved.png` | 실제 고정 소스 route와 DTO를 통한 보고 처리 완료 | `e7616de4a502dc3e71f34da58f09f696da5d475d3582dfef4c1eee5d64234813` |
| `postgres-n07-resolved-1440x900.png` | 최종 서버 SHA와 독립 PostgreSQL의 N07 처리 완료 | `2b1e1d6f638e578ffb4a54487318cf3cd1b1ec18b39b43f00e96c971456ea07c` |
| `postgres-n07-resolved-375x812.png` | 같은 실제 DB 보고의 375 px 배치와 가로 넘침 없음 | `fe6245f8ad9398a24a7a10d2fe21772a9188d757f62aaf7fc04c618f59e8e77e` |
| `notification-error-403.png` | 권한 오류와 상세 비노출 | `083123e0b20231682a9b63dd3f47036eb2f14fad89329a0dbbef1d9647b80751` |

추가 캡처는 `execution-1440x900.png`, `execution-1024x768.png`, `execution-768x1024.png`, `execution-390x844.png`와 `notification-error-404.png`, `notification-error-409.png`, `notification-error-503.png`다. 이 파일들은 최종 캡처 검사로 갱신했다. Safari 수용 검사는 완료하지 않았다. Chromium 증거를 다른 브라우저의 검증으로 해석하지 않는다.
