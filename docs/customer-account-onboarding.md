# 고객 계정 초대 계약

## 목적

운송 고객 계정은 공개 회원가입이 아니라 DSV 관리자가 고객사 상세 화면에서 일회용 링크를 만들어 고객 담당자에게 직접 전달하는 방식으로 발급한다. 서버는 초대와 비밀번호 재설정 메일을 보내지 않는다. 활성화된 고객 계정은 서버 세션의 고객사 범위로만 `/customer/delivery-inquiry`를 조회한다.

## 관리자 흐름

1. 관리 > 고객사에서 고객사를 선택한다.
2. 고객 계정 패널의 계정 발급 버튼으로 모달을 열고 임시 링크 생성을 누른다. 서버는 가입 전 계정과 가입 링크를 만든다.
3. 모달에 표시된 가입 링크를 복사해 고객 담당자에게 안전한 경로로 직접 전달한다. 모달을 닫으면 링크를 다시 볼 수 없다.
4. 계정 목록은 `INVITED`, `ACTIVE`, `DISABLED`, `EXPIRED` 상태와 초대/만료/최근 인증 시각을 표시한다.
5. 가입 전 계정(`INVITED`, `EXPIRED`, 로그인 아이디 없음)은 재초대와 폐기를 실행할 수 있다. 재초대는 새 가입 링크를 만들고 이전 가입 링크를 무효화한다. 폐기는 확인 후 계정과 미사용 링크를 삭제한다.
6. 가입을 마친 계정은 재설정, 비활성화, 활성화를 실행할 수 있다. 재설정은 새 비밀번호 재설정 링크를 모달에 표시하고 이전 재설정 링크를 무효화한다.
7. 비활성화하면 세션과 미사용 재설정 링크가 무효화된다.
8. 프런트는 발급 직후 모달에서만 링크를 표시한다. 링크, 원문 토큰, 비밀번호를 저장하지 않는다.

## 고객 흐름

1. 고객이 전달받은 링크는 `/customer/account/setup#token=...` 형식이다.
2. 설정 화면은 URL fragment의 `token`만 읽고 즉시 fragment를 visible history에서 제거한다.
3. `SIGNUP` 토큰은 고객사와 만료 시각을 표시하고 고객은 이름, 로그인 아이디, 비밀번호를 설정한다.
4. `PASSWORD_RESET` 토큰은 서버가 검증한 `loginId`를 읽기 전용으로 표시하고 새 비밀번호만 받는다.
5. 완료 요청이 성공하면 서버가 세션/CSRF를 발급하고 프런트는 `/customer/delivery-inquiry`로 이동한다.
6. `/customer/login`은 기존 활성 고객 계정의 로그인 전용 화면이다. 공개 가입 경로는 없다.

## API 계약

관리 API는 `/api/dsv` 아래 기존 envelope를 사용한다.

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `customers/:customerId/accounts` | 고객사 계정 목록 |
| POST | `customers/:customerId/accounts/invitations` | 가입 전 계정과 가입 링크 생성 |
| POST | `customer-accounts/:accountId/reinvite` | 가입 전 계정의 새 가입 링크 생성 |
| POST | `customer-accounts/:accountId/password-reset` | 가입한 계정의 비밀번호 재설정 링크 생성 |
| PATCH | `customer-accounts/:accountId/status` | `ACTIVE` 또는 `DISABLED` 전환 |
| DELETE | `customer-accounts/:accountId` | 가입 전 계정 폐기, 가입한 계정은 400 |

공개 고객 인증 API도 `/api/dsv/customer/auth` 아래 기존 envelope를 사용한다.

| Method | Path | 용도 |
| --- | --- | --- |
| POST | `invitations/validate` | `{ token, shopDomain }` 검증 |
| POST | `complete` | `{ token, shopDomain, password, displayName?, loginId? }` 완료 및 로그인 |
| POST | `login` | `{ id, password, shopDomain }` 로그인 |

계정 발급 요청 본문은 `{}`다. 발급, 재초대, 비밀번호 재설정 응답은 `{ account, invitation: { expiresAt, setupUrl } }`이고 폐기 응답은 `{ accountId }`다.

`SIGNUP` 완료 요청은 `displayName`과 `loginId`를 필수로 보낸다. `PASSWORD_RESET` 완료 요청은 두 값을 보내지 않고, 화면은 validate 응답의 `loginId`를 읽기 전용으로 표시한다.

## 세션 규칙

- `/customer/login`과 `/customer/account/setup`은 앱 세션 게이트를 우회한다.
- 만료된 `CUSTOMER_USER` 세션은 `/customer/login`으로 보낸다.
- 관리자 세션 만료는 기존처럼 `/login`으로 보낸다.
- 고객 배송조회 권한은 서버 세션과 `dsv:customer-deliveries:read` scope로만 판단한다.

## 보안 규칙

- 초대와 비밀번호 재설정 링크는 48시간 동안 한 번만 사용할 수 있다.
- 서버는 원문 토큰을 저장하지 않고 SHA-256 해시만 저장한다.
- 로그인 아이디는 3~64자의 영문 소문자, 숫자, `.`, `_`, `-`만 허용한다.
- 비밀번호는 12~256자로 제한하고 서버에서 `scrypt`로 해시한다.
- 고객 계정 세션 쿠키는 `HttpOnly`, `Secure`, `SameSite=Lax`를 사용한다.
- 초대 완료와 고객 로그인 API에는 서버 rate limit을 적용한다.
- 고객 계정은 `CLEVER_DSV` 발급 계정만 조회하고 변경한다.
- 초대, 활성화, 재초대, 비밀번호 재설정, 비활성화, 활성화, 폐기 이력은 감사 로그에 남긴다. 토큰과 비밀번호는 감사 로그에 기록하지 않는다.

## 운영 설정

- `CLEVER_DSV_WEB_PUBLIC_URL`에는 고객이 실제로 접속할 DSV 웹 origin을 명시한다. 서버는 요청의 Host 헤더로 링크 URL을 추정하지 않는다.
- 공개 URL이 없으면 링크 생성은 `INVITATION_LINK_NOT_CONFIGURED`로 실패하고 계정 상태를 바꾸지 않는다.
