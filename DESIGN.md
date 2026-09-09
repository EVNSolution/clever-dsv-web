# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-09-09
- Primary product surfaces: 관제, 배차, 이력, 관리, 설정, 고객 배송조회, 배송원 앱 설치
- Evidence reviewed: 현재 React 컴포넌트, `src/styles` 구현, 자동화된 Playwright 계약, 운영 화면과 사용자 피드백
- 과거 HTML 데모는 시각적 역사 자료일 뿐 현재 디자인 정본이 아니다. 현재 화면과 이 문서가 충돌하면 구현을 확인하고 문서를 함께 갱신한다.

## Brand

- Personality: 차분하고 정확한 운영 도구
- Trust signals: 일관된 상태 표현, 예측 가능한 배치, 운영 데이터와 오류의 명시적 표시
- Avoid: 시뮬레이션 문구, 금속성 그라데이션, 광택, 중첩 카드, 장식용 아이콘, hover에 따른 레이아웃 이동

## Product goals

- Goals: 현재 상태, 선택 대상과 다음 행동을 빠르게 읽게 한다.
- Non-goals: 장식 중심의 대시보드, 실제 오류를 가리는 mock 대체, 백엔드 계약 전 예상 기능 구현
- Success signals: 주요 작업을 한 화면에서 찾을 수 있고 화면 폭이 변해도 핵심 행동과 정보 순서가 유지된다.

## Personas and jobs

- Primary personas: 배차 담당자, 관제 담당자, 운영 관리자, 배송 조회 고객
- User jobs: 주문 배차, 차량과 배송지 관제, 이력 확인, 운영 기준 관리, 배송 상태 조회
- Key contexts of use: 데스크톱 운영 화면과 좁은 반응형 웹 화면

## Information architecture

- Primary navigation: 관제, 배차, 이력, 관리, 설정
- Core routes/screens: 관리자 5개 화면과 고객 배송조회
- 개발 관리자에게는 기존 `dsv:accounts:read` 권한으로만 `/inquiries` 문의 메뉴를 추가 노출한다. 일반 운영자 메뉴와 직접 경로는 차단한다.
- 문의는 현재 사업장에 연결된 배송원의 목록 → 상세 조회만 제공한다. 작성자·접수일시는 서버 값을 사용하며 시간대는 한국시간으로 명시한다. 본문은 HTML이 아닌 일반 텍스트로 표시한다.
- 문의의 좁은 화면은 선택 전 목록, 선택 후 상세와 `목록으로` 버튼을 표시한다. 로딩·빈 상태·오류·재시도를 구분하고 답변·첨부·편집·삭제 기능은 두지 않는다.
- Content hierarchy: 페이지 제목 → 작업 섹션 → 표, 지도 또는 타임라인 → 선택 상세
- 공개 배송원 앱 설치 화면은 제목 → 동등한 Android/iPhone 설치 선택 → 공통 설치 후 안내 → PDF 가이드 순서를 사용한다.
- 메뉴와 제목에는 여러 업무 대상을 구분점이나 슬래시로 결합하지 않는다.

## Design principles

- Principle 1: 현재 상태와 다음 행동을 장식보다 먼저 보인다.
- Principle 2: 같은 개념은 화면과 폭이 달라도 같은 명칭과 상태 표현을 사용한다.
- Tradeoffs: 좁은 화면에서는 정보 밀도보다 작업 순서와 터치 가능 영역을 우선한다.

## Visual language

- Color: 흰색 표면과 검정 텍스트를 기본으로 하며 파랑은 선택과 주요 행동, 초록은 진행, 빨강은 오류에만 사용한다.
- Typography: Pretendard Variable을 전역 글꼴로 사용한다.
- Spacing/layout rhythm: 4px 단위를 기본으로 하고 동일 패딩을 중첩하지 않는다.
- Shape/radius/elevation: 큰 반경과 외곽선은 최상위 작업 패널에 집중하고 내부 제목과 표에 불필요한 카드와 그림자를 만들지 않는다.
- Motion: 상태 이해에 필요한 짧은 전환만 사용하고 reduced-motion 환경에서는 제거한다.
- Imagery/iconography: 장식용 아이콘을 두지 않고 아이콘은 행동 또는 상태 의미를 보조한다.

## Components

- Existing components to reuse: `AdminShell`, `AdminPageHeader`, `AdminSectionHeader`, 기존 버튼과 상태 pill
- New/changed components: 768px 이하 비관제 페이지의 공용 고정 헤더는 기존 `AdminShell` 내비게이션을 변형해 사용한다. 배차 행 작업 메뉴는 진행 전 배차에 `배차 전체 취소`를 제공한다. `/driver-app`은 동일한 플랫폼 카드 두 개를 설치 선택 영역으로 묶고 설명과 PDF 가이드를 그 아래에 둔다.
- Variants and states: 데스크톱 사이드 메뉴, 모바일 접힌 고정 헤더, 모바일 전체 화면 확장 메뉴, 관제 지도 오버레이
- Token/component ownership: 토큰은 `src/styles/foundation/tokens.css`, 공통 셸은 `src/styles/components`, 반응형 보정은 `src/styles/responsive`가 소유한다.

## Accessibility

- Target standard: 실제 표 semantics, 접근 가능한 이름과 명확한 focus-visible을 유지한다.
- Keyboard/focus behavior: 선택, 취소, 메뉴 펼치기와 주요 명령을 키보드로 실행할 수 있어야 한다.
- Contrast/readability: 색상만으로 상태를 전달하지 않고 텍스트, 아이콘 또는 외곽선을 함께 사용한다.
- Screen-reader semantics: 모바일 고정 헤더의 시각적 페이지명은 중복 낭독하지 않고 기존 페이지 제목 semantics를 유지한다.
- Reduced motion and sensory considerations: reduced-motion 환경에서 불필요한 전환을 제거한다.

## Responsive behavior

- Supported breakpoints/devices: 1500px, 1120px, 920px, 768px 이하 구간을 지원한다.
- Layout adaptations: 중간 폭에서는 사이드 메뉴를 유지한다. 768px 이하 비관제 페이지는 72px 공용 고정 헤더에 `C` 메뉴 버튼과 현재 페이지명을 표시하고, 본문 페이지 제목은 시각적으로 반복하지 않는다.
- Touch/hover differences: 모바일 메뉴는 전체 화면으로 확장되고 충분한 터치 영역을 제공한다. 관제 화면은 지도 오버레이와 접힌 보조 카드 구조를 유지한다.
- 좁은 관리 화면은 선택 전 목록을, 선택 후 상세를 우선하되 각 영역의 최소 폭을 유지한다.
- `/driver-app`의 스토어 카드는 640px 초과에서 Google Play를 왼쪽, App Store를 오른쪽에 같은 크기로 배치하고 640px 이하에서는 같은 순서로 세로 적층한다.

## Interaction states

- Loading: 기존 레이아웃 크기를 유지하고 지도는 정적 프리뷰, 실제 지도, 운영 데이터 순서로 표시한다.
- Empty: 이유와 다음 행동을 작업 영역 안에서 설명한다.
- Error: remote 오류를 mock 데이터로 감추지 않는다.
- Success: 완료 상태와 후속 행동을 텍스트로 명시한다.
- Disabled: 비활성 이유를 상태와 문맥으로 이해할 수 있게 한다.
- 배송 완료: 확정된 종료 상태다. 완료 주문을 주문 후보로 되돌리지 않는다.
- 주문 취소: 주문 자체의 종료 상태다. 배차 전체 취소와 구분하며 취소 주문을 주문 후보로 되돌리지 않는다.
- 배차 전체 취소: 진행 전 배차에서만 실행하며 확인 문구에 후보로 돌아갈 전체 주문 수를 표시한다. 실행 시 같은 배차의 모든 주문을 기존 배정 해제로 처리한다.
- 배차 취소 중 새 주문: 검색 조건 없는 최신 목록으로 전체 배차를 확인하고, 배정 해제 후 같은 배차의 잔여 주문을 다시 조회한다. 새 주문이 붙었으면 최대 세 번까지 수렴 처리하며, 상태가 진행 중·완료·취소로 바뀌거나 잔여 주문이 계속 생기면 성공으로 표시하지 않는다.
- Offline/slow network: 기존 화면을 갑자기 대체하지 않고 실패 또는 지연 상태를 명시한다.

## Content voice

- Tone: 짧고 정확한 운영 문장
- Terminology: 하나의 명칭은 하나의 업무 개념만 나타낸다.
- Microcopy rules: 시뮬레이션 문구를 사용하지 않고 행동 버튼은 결과가 분명한 동사로 쓴다.

## Implementation constraints

- Framework/styling system: React와 기존 CSS layer 구조를 사용한다.
- Design-token constraints: 새 전역 값보다 기존 토큰과 컴포넌트 규칙을 우선한다.
- Performance constraints: 불필요한 UI 의존성이나 별도 상태 계층을 추가하지 않는다.
- Compatibility constraints: 운영 nginx와 PDF.js `.mjs` MIME 계약을 유지한다.
- Test/screenshot expectations: 코드 변경은 빌드와 관련 Playwright 테스트로 검증한다. 최종 화면의 시각적 판단은 사용자가 수행한다.

## Open questions

- [ ] 비관제 모바일 공용 헤더의 오른쪽 공통 액션이 실제로 필요해질 때 기능 계약과 함께 정의한다.
