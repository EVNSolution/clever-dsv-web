# DSV 회차 관제

## 기준과 범위

- 웹 기준: `4f261b67cfb22669cb26a093eb1f3f59ab9c7606`.
- 서버: [PR483](https://github.com/EVNSolution/clever-route-server/pull/483), `af9b4b43b40a5c6c5cba7bc83587217b2bbe25ab`.
- 정본: [서버 계약](https://github.com/EVNSolution/clever-route-server/blob/af9b4b43b40a5c6c5cba7bc83587217b2bbe25ab/docs/contracts/dsv-operational-server-v1.md), 실제 `dsv-execution.routes.ts`, `dsv-execution-api.service.ts`, 명령 서비스와 알림 서비스.
- 웹 작업: [issue84](https://github.com/EVNSolution/clever-dsv-web/issues/84), [change-control313](https://github.com/EVNSolution/clever-change-control/issues/313).
- 서버 change-control310은 서버 기술 계약의 선행 근거다. 웹 작업의 운영 정책 승인으로 해석하지 않는다.

## 격리 환경

`VITE_DSV_OPERATIONS_ENABLED`는 기본 `false`다. `true`와 `VITE_DSV_API_MODE=remote`가 함께 있어야 회차 기능이 열린다. 빌드 시점의 플래그다. 운영 활성화 권한이나 발송 정책을 변경하지 않는다.

회차 경로는 `/executions`다. `serviceDate`는 업무일이다. `execution`, `notification`, `report`는 서버 UUID를 사용한다. 알림 목적지는 매번 현재 세션으로 resolver를 호출한 후 정확한 보고와 회차의 현재 상태를 조회한다. N07은 서버가 허용한 과거 보고도 열 수 있다. 취소·재배정된 회차의 보고는 현재 배정과 구분해 안내한다. 만료된 알림이나 접근 제한은 상세를 표시하지 않는다. 로그인 복구는 같은 출처의 회차 경로만 복구한다. 저장된 목적지는 조회 권한을 대신하지 않는다.

조회는 `dsv:control:read`가 필요하다. 보고 확인, 보고 처리와 알림 읽음·열람 기록에는 `dsv:dispatches:write`도 필요하다. 회차 map/select는 서버의 dispatch-write 규칙을 따른다. 화면 진입에는 control-read도 필요하다. 사업장이나 권한을 입력으로 덮어쓰지 않는다. 서버 세션 쿠키와 기존 CSRF 토큰 갱신을 사용한다.

## 상태 해석

| 표시 | 의미 |
|---|---|
| GPS 도착 근거 | 원본 관측으로 서버가 확정한 지오펜스 전이. 업무 시작 승인이 아니다. |
| 출발 관측 | 출발을 확정한 관측 시각. 경고 기준 시각이다. |
| 시작 승인 | 서버의 `startedAt`. GPS로 자동 승인하지 않는다. |
| 알림 생성 | N01~N06 intent 생성. 기기 수신을 증명하지 않는다. |
| 발송 처리 | 시도 레코드 상태와 최종 처리 시각. 기기 수신을 증명하지 않는다. |
| workerAttemptCount | worker claim/retry 예산 사용. 전달된 알림 횟수가 아니다. |
| 알림 읽음·열람 | 알림 acknowledgement. 보고 확인·처리와 별도다. |
| 보고 확인·처리 완료 | 별도 미배송 보고 상태. 주문 FAILED나 배송 완료를 만들지 않는다. |

회차 DTO는 기사 이름과 차량 번호를 제공하지 않는다. 화면은 서버가 제공한 식별자를 표시한다. 회차 알림 상세 DTO는 기사 READ/OPENED 기록을 제공하지 않는다. N07 목록의 `ackedAt`은 읽음과 열람 종류를 구분하지 않는 확인 시각이다. 기기 수신과 제공되지 않은 열람 근거는 확인되지 않았다고 표시한다.

회차 목록은 `limit=100`이다. 목록 자체에는 `truncated`나 다음 cursor가 없다. 한도에 도달하면 전체 목록이라고 단정하지 않는다. 요약의 `operationalSummaryTruncated`, 상세별 `limit/truncated`, `attemptsTruncated`를 표시한다. 알림과 보고 목록은 서버 cursor를 사용한다. 알 수 없는 상태는 원문을 표시하고 새로운 변경 행동을 허용하지 않는다.

## 명시적 명령

`SAME_EXECUTION`은 지정 회차에 연결한다. `NEW_EXECUTION`은 새 회차를 만든다. 단순 배차 수정은 이 명령을 대신하지 않는다. 차량 선택은 지정한 회차와 유효 시간 구간을 사용한다. 서버가 미래의 map 시각을 허용하지 않는다.

응답이 유실되면 같은 commandId와 같은 입력으로 다시 요청한다. 확정되지 않은 명령의 입력을 변경하지 않는다. 현재 관리자와 사업장의 sessionStorage에 고정 입력을 보존한다. 새로고침이나 로그인 후에도 자동 재전송하지 않는다. 409 충돌이면 최신 상태를 확인하고 기존 명령을 임의 변경하여 덮어쓰지 않는다.

## 운영 승인과 차단

- 서버 PR483은 미병합·미배포다. 현재 운영 서버에서 신규 API의 존재나 실제 DB 통합을 보장하지 않는다.
- Driver PR64 `d5094bf80936799bbeaf6d3a0cb614a2acea6f46`의 소스 검토와 앱 보안·기기·FCM 검증은 별도다.
- D01 반복 상한·예산·만료, D02 감시 시간·야간 기준, D04 GPS 수용 기준, D05 사유 목록·처리 흐름, D07 보관·삭제·열람 감사는 미승인이다.
- 합성 사유와 보고 흐름은 기술 검증에만 사용한다. 운영 승인으로 기록하지 않는다. 반복 최대 6회도 확정하지 않는다.
- OFF/SHADOW/LIVE, 감시 시간과 근거의 정책 버전은 서버 값을 표시한다. 정책 설정 API와 실발송 활성화 버튼은 없다.
- 다른 저장소 구현, PR 병합, 배포, 운영 DB 변경과 실발송 활성화는 이번 작업에서 제외한다.

## 검증

검증 결과와 브라우저 캡처는 [검증 기록](dsv-operations-web-verification-20261007.md)에 작성한다. 계약 모킹, 실제 소스 HTTP 통합, 배포 서버·DB·기기 검증을 구분한다. 로컬 로그와 캡처는 `/tmp/dsv-operations-web-evidence/`에 둔다.
