# CLEVER Driver 설치와 회원가입 계약

- Status: Active
- Last verified: 2026-09-04
- Public entry: `https://dsv.cleversystem.ai/driver-app`

## 운영 흐름

1. 관리 화면의 `앱 설치 안내`는 공개 설치 페이지 주소를 열거나 전달한다. Web Share API를 지원하는 환경에서는 운영체제 공유 시트를 열고, 지원하지 않거나 공유가 취소·실패하면 주소를 클립보드에 복사한다.
2. 배송원은 공개 설치 페이지의 `PDF 가이드 다운로드`에서 최신 설치·현장 교육 가이드를 받을 수 있다.
3. Android 배송원은 고정 Google Drive 다운로드 주소에서 최신 정식 APK를 직접 내려받아 설치한다.
4. iPhone은 App Store Connect의 최신 제출본과 Unlisted 배포 승인 상태를 따른다. 공개 화면에는 내부 build 번호 대신 전용 App Store 설치 링크의 승인 여부만 안내하며, 승인 전에는 설치 링크를 제공하지 않는다.
5. 배송원은 앱 로그인 화면에서 이름, 휴대전화 번호, 로그인 아이디와 비밀번호로 직접 회원가입한다.
6. 서버는 이름과 정규화한 휴대전화 번호가 모두 정확히 같은 활성·미연결 DSV 배송원을 자동 연결한다. 일치 정보가 없으면 계정은 연결 대기 상태로 생성된다.

배송원용 일회용 초대 링크나 QR 코드를 생성하지 않는다. 설치 주소는 인증이나 배송 권한의 근거가 아니며, 계정과 배송 범위는 서버가 판정한다.

## 정본 경계

- 이 저장소의 `/driver-app` 화면과 이 문서는 DSV 웹에 표시할 현재 설치·회원가입 흐름의 정본이다.
- Android APK 파일명, 파일 ID, 설치 주소와 게시 상태는 `clever-driver-app/docs/android-drive-release.md`를 확인한다.
- iOS 배포 상태는 App Store Connect와 CLEVER Driver 릴리스 작업의 최신 증거를 확인한다.
- 설정의 `앱 설치 안내`는 이 저장소의 `/driver-app`을 직접 열며, 최신 Driver PDF는 해당 공개 페이지에서 다운로드한다.
- 관제 운영자 PDF는 `clever-route-server`가 제공하는 별도 운영 자산이며 전체 관제 절차를 위해 유지한다. PDF 안의 배송원 설치 절차가 이 문서와 충돌하면 `/driver-app`을 우선하고 서버 자산을 별도 개정한다.

## 제거 상태를 유지할 항목

- 배송원 설치 QR 생성기와 QR 전용 스타일
- Google Play 내부 테스트를 현재 공개 설치 경로로 표시하는 문구
- TestFlight를 현재 정식 설치 경로로 표시하는 문구
- 배송원 회원가입에 일회용 초대 토큰이 필요하다는 문구
