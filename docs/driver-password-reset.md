# CLEVER Driver 비밀번호 초기화

## 서버 계약

이 웹 변경은 `clever-route-server`의 [PR #413](https://github.com/EVNSolution/clever-route-server/pull/413)에서
확정된 DriverAccount 계약을 사용합니다. 서버 PR은 2026-09-10 병합됐으며,
병합 SHA `9912e2c1f7e587bd5f0f1dcf7226e1adfc0db45c`와 운영 API 컨테이너의
`org.opencontainers.image.revision`이 같은 날 일치함을 확인했습니다.
웹은 별도 PR의 병합 SHA를 `docs/runbooks/dsv-production-deploy.md`에 따라 배포합니다.
출시 전 실제 운영 API와 `CLEVER_DSV_WEB_PUBLIC_URL`을 사용한 브라우저 초기화 흐름을
전용 검증 계정으로 확인하며, 실제 배송원 계정은 초기화하지 않습니다.

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
이 웹의 mocked API 테스트 통과만으로 운영 검증 완료를 주장하지 않습니다.
운영에서는 전용 검증 계정으로 관리자 발급·복사, 본인 비밀번호 설정, 기존 세션 폐기,
새 비밀번호 로그인과 만료·사용 완료·재발급 링크의 재사용 거절을 별도로 검증합니다.
공개 페이지와 API의 `Cache-Control: no-store`, URL fragment 제거, 브라우저 저장소·console·
운영 로그의 민감정보 비기록도 확인합니다. 검증 계정과 관련 데이터는 정리하며 배송원 연결,
차량, 배차와 배송 데이터의 불변성을 확인합니다. 실제 결과와 배포 SHA는 민감정보 없이
`docs/runbooks/.local/`의 실행 기록에 남깁니다.
