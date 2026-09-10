# CLEVER Driver 비밀번호 초기화

## 서버 계약

이 웹 변경은 `clever-route-server`의 `codex/driver-password-reset` 커밋
`1fef948f5772b097364ddd4703ba08a3e52f1e1a`에 구현된 계약을 사용합니다.
2026-09-10 확인 당시 해당 커밋은 서버 `origin/main`에 미병합 상태였습니다.
출시 전에 서버 병합, migration, 초기화 API 배포와 `CLEVER_DSV_WEB_PUBLIC_URL` 설정을
확인해야 합니다. 이 웹 작업은 운영 배포나 실제 계정 초기화를 수행하지 않습니다.

- 기존 v1 배송원 목록에서 선택한 `driverId`를 사용합니다. 서버가 같은 사업장의 활성
  배송원과 연결된 활성 DriverAccount를 확인합니다. 별도 계정 조회 API를 추정하지 않습니다.
- 관리자 발급: `POST /api/dsv/drivers/:driverId/password-reset-link`, body `{}`.
  DSV 관리자 및 `dsv:accounts:write`, `dsv:resources:read` 권한과 CSRF가 필요합니다.
  기존 관리 화면의 조회 권한 게이트도 유지됩니다. 현재 서버의 일반 관리자에는
  필요한 조회 권한 전체가 부여되며 운영자 계정에는 `accounts:write`가 없습니다.
- 성공: legacy envelope의 `data.passwordReset`에 `method: ADMIN_LINK`,
  `expiresAt`, `setupUrl`이 있습니다. URL은 현재 웹 origin의
  `/driver/password-reset#token=...`만 허용합니다.
- 공개 검증: `POST /api/dsv/driver/auth/password-reset/validate`, body `{token}`.
- 본인 완료: `POST /api/dsv/driver/auth/password-reset/complete`, body `{token,password}`.
- SMS는 서버 계약이 없어 제공하지 않습니다. CustomerAccount 초기화와 분리되어 있습니다.

## 화면과 민감정보

기준정보 → 운송자원에서 배송원을 선택하고 **비밀번호 초기화**를 누릅니다.
이름·연락처·배송원 ID 및 연결 계정 확인 후 링크를 발급합니다. 관리자용 비밀번호
입력란은 없습니다. 앱 계정 연결이나 차량 배정 변경 API도 호출하지 않습니다.

발급한 링크는 현재 확인창 메모리에서만 표시합니다. 복사 시도, 닫기, 화면 이탈,
탭 비활성화, 만료 시 표시를 지웁니다. 복사 성공 후 브라우저 클립보드에 있는 링크는
사용자가 배송원에게 전달할 수 있습니다. 복사 실패 시에도 다시 표시하지 않습니다.
새 발급은 명시적인 확인을 다시 거치며 서버가 이전 미사용 링크를 폐기합니다.

본인용 페이지는 fragment를 읽은 직후 주소에서 제거하고, 공개 요청에 관리자 인증정보를
첨부하지 않습니다. 브라우저 저장소·URL query·로그에 토큰이나 비밀번호를 기록하지 않습니다.
서버 오류 본문을 사용자 메시지나 로그에 전달하지 않습니다.

링크는 서버 기준 30분이며 한 번 소비됩니다. 유효하지 않음·만료·사용됨·폐기는 동일한
안내로 처리합니다. 페이지에서 표시할 수 있는 만료는 응답 시각 기준이며 다른 기기의
소비 여부는 서버 검증/완료 요청으로 판정합니다.

## 검증

- `npm run lint`: TypeScript의 unused-local/parameter 검사. 별도 lint 의존성 없음.
- `npm run typecheck`
- `npm run test:static`
- `npm run test:e2e`
- `npm run test:e2e:remote`
- `npm run build`

원격 API 테스트는 가상의 계정과 토큰으로 권한, 발급 확인, 중복 요청, 오류 본문 차단,
복사/만료/닫기/늦은 응답, 공개 초기화, URL·저장소·console 비기록을 검증합니다.
실제 서버의 토큰 원자적 소비, DB·운영 로그, 앱 세션 폐기는 서버 검증 범위이며
이 웹의 mocked API 테스트 통과만으로 운영 검증 완료를 주장하지 않습니다.
