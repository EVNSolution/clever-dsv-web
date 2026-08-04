# 문서 아카이브

- Status: Archived index
- Archived on: 2026-08-04

이 디렉터리는 과거 데모, 초기 계획, 초안 계약과 외부 참고자료를 보존한다. 현재 구현의 정본으로 사용하지 않는다.

| 경로 | 이전 역할 | 아카이브 이유 | 현재 대체 문서 |
| --- | --- | --- | --- |
| `2026-07/backend-slice-map.md` | mock에서 backend로 전환하는 단계 계획 | G005/G006 단계와 차단 조건이 이미 지난 상태 | [`../backend-api.md`](../backend-api.md) |
| `2026-07/control-api-contract-v0.1.md` | 온도와 배송지 팁의 초기 Draft | endpoint와 저장 모델이 구현 계약으로 확정되지 않음 | 실제 client 경계는 [`../backend-api.md`](../backend-api.md), 제품 규칙은 [`../../DESIGN.md`](../../DESIGN.md) |
| `2026-07/dispatch-api-contract.md` | 초기 배차 업로드와 배정 계약 | vehicle 필수, staging 제한 등 현재 코드와 충돌 | [`../contracts/dispatch.md`](../contracts/dispatch.md) |
| `reference/demo-reference` | 원본 HTML 데모와 소개자료 | React 운영 화면 이전의 시각 자료 | [`../../DESIGN.md`](../../DESIGN.md) |
| `reference/original-reference` | 초기 디자인과 대화 정리 | 현재 정보 구조와 컴포넌트 규칙 이전 자료 | [`../../DESIGN.md`](../../DESIGN.md) |
| `reference/plans` | 초기 PRD, test spec과 handoff | 완료되거나 대체된 계획 | 현재 코드와 Active 문서 |
| `external-manuals` | 타 시스템 사용자 매뉴얼 | DSV Web 자체 문서가 아닌 외부 참고자료 | 없음 |

아카이브 내부 문서의 상태 문구, 링크와 명령은 당시 시점을 보존한다. 현재 경로로 고쳐 쓰거나 신규 구현 근거로 인용하지 않는다.
