# DSV Web 문서 인덱스

- Status: Active
- Last refreshed: 2026-08-04

## 현재 정본

| 문서 | 역할 |
| --- | --- |
| [`../README.md`](../README.md) | 저장소 책임, 화면, 기술 구성과 실행 방법 |
| [`../DESIGN.md`](../DESIGN.md) | 정보 구조, 시각 규칙, 반응형과 접근성 정본 |
| [`backend-api.md`](./backend-api.md) | 프런트 API client와 service가 실제 사용하는 경계 |
| [`driver-app-onboarding.md`](./driver-app-onboarding.md) | CLEVER Driver 설치 안내와 직접 회원가입 운영 계약 |
| [`contracts/dispatch.md`](./contracts/dispatch.md) | 배차 파일, 배정, 삭제와 시간 제약 계약 |
| [`runbooks/dsv-production-deploy.md`](./runbooks/dsv-production-deploy.md) | 운영 배포 정본 |
| [`archive/README.md`](./archive/README.md) | 과거 자료 분류와 대체 문서 |

## 문서 상태 규칙

- `Active`: 현재 코드와 운영 절차의 정본이다.
- `Draft`: 구현 전 제안이며 현재 API나 UI의 근거로 사용할 수 없다.
- `Archived`: 역사 자료다. 현재 구현과 충돌하면 Active 문서와 코드를 우선한다.

새 문서는 기존 Active 문서로 설명할 수 없는 지속적인 계약이 있을 때만 추가한다. 조사 메모, 일회성 배포 결과와 생성 산출물은 정본 문서에 섞지 않는다.

## 갱신 책임

- 화면 경로, 기술 스택 또는 실행 명령이 바뀌면 root `README.md`를 갱신한다.
- CSS 소유권과 상호작용 규칙이 바뀌면 `DESIGN.md`를 갱신한다.
- API allowlist나 envelope가 바뀌면 `backend-api.md`와 관련 자동 테스트를 갱신한다.
- Driver 배포 경로나 회원가입 연결 조건이 바뀌면 `driver-app-onboarding.md`, `/driver-app` 화면과 관련 자동 테스트를 함께 갱신한다.
- 배차 import, assignment, deletion 또는 time constraint가 바뀌면 `contracts/dispatch.md`를 갱신한다.
- 배포 토폴로지가 바뀌면 Runbook 버전을 올린다.
