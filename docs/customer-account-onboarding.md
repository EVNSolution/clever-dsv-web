# 고객 계정 초대 계약

## 목적

운송 고객 계정은 공개 회원가입이 아니라 DSV 관리자가 고객사 상세 화면에서 이메일로 초대하는 방식으로 발급한다. 활성화된 고객 계정은 서버 세션의 고객사 범위로만 `/customer/delivery-inquiry`를 조회한다.

## 관리자 흐름

1. 관리 > 고객사에서 고객사를 선택한다.
2. 고객 계정 패널에서 수신자 이메일과 선택 표시 이름을 입력해 초대한다.
3. 계정 목록은 `INVITED`, `ACTIVE`, `DISABLED`, `EXPIRED` 상태와 초대/만료/최근 인증 시각을 표시한다.
4. 관리자는 계정별로 재초대, 비밀번호 재설정 이메일 발송, 비활성화, 활성화를 실행한다.
5. 프런트는 초대 링크, 원문 토큰, 임시 비밀번호, 생성 비밀번호를 표시하거나 저장하지 않는다.

## 고객 흐름

1. 이메일 링크는 `/customer/account/setup#token=...` 형식이다.
2. 설정 화면은 URL fragment의 `token`만 읽고 즉시 fragment를 visible history에서 제거한다.
3. `SIGNUP` 토큰은 고객사, 이메일, 만료 시각을 표시하고 고객이 로그인 아이디와 비밀번호를 설정한다.
4. `PASSWORD_RESET` 토큰은 서버가 검증한 `loginId`를 읽기 전용으로 표시하고 새 비밀번호만 받는다.
5. 완료 요청이 성공하면 서버가 세션/CSRF를 발급하고 프런트는 `/customer/delivery-inquiry`로 이동한다.
6. `/customer/login`은 기존 활성 고객 계정의 로그인 전용 화면이다. 공개 가입 경로는 없다.

## API 계약

관리 API는 `/api/dsv` 아래 기존 envelope를 사용한다.

| Method | Path | 용도 |
| --- | --- | --- |
| GET | `customers/:customerId/accounts` | 고객사 계정 목록 |
| POST | `customers/:customerId/accounts/invitations` | 고객 계정 초대 이메일 발송 |
| POST | `customer-accounts/:accountId/reinvite` | 재초대 이메일 발송 |
| POST | `customer-accounts/:accountId/password-reset` | 비밀번호 재설정 이메일 발송 |
| PATCH | `customer-accounts/:accountId/status` | `ACTIVE` 또는 `DISABLED` 전환 |

공개 고객 인증 API도 `/api/dsv/customer/auth` 아래 기존 envelope를 사용한다.

| Method | Path | 용도 |
| --- | --- | --- |
| POST | `invitations/validate` | `{ token, shopDomain }` 검증 |
| POST | `complete` | `{ token, shopDomain, loginId?, password }` 완료 및 로그인 |
| POST | `login` | `{ id, password, shopDomain }` 로그인 |

`complete`의 `loginId`는 `SIGNUP`에만 필요하다. `PASSWORD_RESET`에서는 validate 응답의 `loginId`를 화면에 읽기 전용으로 표시한다.

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
- 초대, 활성화, 재초대, 비밀번호 재설정, 비활성화, 활성화 이력은 감사 로그에 남긴다. 토큰과 비밀번호는 감사 로그에 기록하지 않는다.

## 운영 설정

- `CLEVER_DSV_WEB_PUBLIC_URL`에는 고객이 실제로 접속할 DSV 웹 origin을 명시한다. 서버는 요청의 Host 헤더로 초대 URL을 추정하지 않는다.
- `BREVO_API_KEY`는 서버 환경에만 저장한다.
- 발신자 이름과 이메일은 DSV 설정 화면의 고객 이메일 설정에서 관리한다.
- 공개 URL, Brevo API 키, 발신자 설정 중 하나라도 없으면 초대 이메일 발송은 실패하고 계정 상태를 임의로 활성화하지 않는다.
