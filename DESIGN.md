# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-20
- Primary product surfaces: 관제, 배차, 이력, 관리, 설정, 고객 배송조회
- Evidence reviewed: 현재 React 화면, 기존 HTML 기반 레이아웃, Playwright 스크린샷과 사용자 피드백

## Brand
- Personality: 차분하고 정확한 운영 도구, 현장 정보가 빠르게 읽히는 제품
- Trust signals: 명확한 상태, 예측 가능한 선택 결과, 실제 시간과 증빙의 가시성
- Avoid: 금속성 그라데이션, 광택, 중첩 카드, 장식용 아이콘, hover 시 레이아웃 이동

## Product goals
- Goals: 운송 운영 기준과 배송 진행 상태를 빠르게 파악하고 조작한다.
- Non-goals: 시뮬레이션 대시보드처럼 보이는 장식이나 과도한 시각 효과
- Success signals: 표 비교가 쉽고 현재 선택과 다음 행동이 즉시 보인다.

## Personas and jobs
- Primary personas: 배차 담당자, 관제 운영자, 배송 기록 확인 담당자
- User jobs: 배정 확인, 배송 진행 추적, 도착 시간 조정, 증빙 확인
- Key contexts of use: 데스크톱 중심의 장시간 운영 화면

## Information architecture
- Primary navigation: 관제 / 배차 / 이력 / 관리 / 설정
- Core routes/screens: `/control`, `/dispatch`, `/records`, `/master-data`, `/settings`, `/customer/delivery-inquiry`
- Content hierarchy: 페이지 제목 → 섹션 제목 → 표/타임라인 → 선택 상세

## Design principles
- 비교 데이터는 카드보다 표를 우선한다.
- 표 내부 상태는 색상 pill보다 일반 텍스트를 우선한다.
- 색상은 상태와 선택에만 사용하고 장식에는 사용하지 않는다.
- 제목은 별도 카드나 구분선 없이 크고 선명한 타이포와 여백으로 계층을 만든다.
- 스크롤바는 콘텐츠 폭을 바꾸지 않고 스크롤 영역 위에 표시한다.

## Visual language
- Color: 흰 표면과 검정 텍스트, 파랑은 선택/행동, 초록은 진행 상태
- Typography: Pretendard Variable 단일 사용
- Spacing/layout rhythm: 4px 기반, 섹션 간 10~16px
- Shape/radius/elevation: 외곽 패널에만 큰 반경, 내부 제목과 표에는 최소 반경과 그림자 없음
- Motion: 상태 전달에 필요한 짧은 전환만 사용
- Imagery/iconography: 자산이 없는 장식 아이콘 금지

## Components
- Existing components to reuse: AdminShell, section heading, data table, status chip, timeline
- New/changed components: 제목은 Quiet Editorial 변형, 표는 flat data-grid 변형
- Variants and states: default, hover, selected, focus, disabled
- Token/component ownership: `src/styles/20-admin-pages.css`
- Demo data ownership: `src/demo` contains the frontend demo projection only; it is not a backend model or API DTO source.

## Accessibility
- Target standard: 키보드 선택과 명확한 focus-visible 유지
- Keyboard/focus behavior: 표 행과 버튼은 Enter/Space로 작동
- Contrast/readability: 상태색 없이도 텍스트로 상태 전달
- Screen-reader semantics: 실제 table 구조와 label 유지
- Reduced motion and sensory considerations: reduced-motion 미디어쿼리 유지

## Responsive behavior
- Supported breakpoints/devices: 데스크톱 우선, 1120px/920px 적응
- Layout adaptations: 좁은 화면에서는 열을 세로로 쌓는다.
- Touch/hover differences: 핵심 정보는 hover 없이도 보인다.

## Interaction states
- Loading: 기존 영역 크기를 유지한다.
- Empty: 다음 행동을 설명한다.
- Error: 해당 작업 영역 안에서 메시지를 표시한다.
- Success: 상태 chip과 데이터 갱신으로 전달한다.
- Disabled: 명도와 cursor로 구분한다.
- Offline/slow network: 마지막 캐시를 우선 표시한다.

## Content voice
- Tone: 짧고 직접적인 운영 문구
- Terminology: 배송원, 차량, 배송지, 주문 품목, 증빙 자료로 통일
- Microcopy rules: Demo/Simulation 표현 금지, 다음 행동을 동사로 안내

## Implementation constraints
- Framework/styling system: React, TypeScript, plain CSS
- Design-token constraints: 기존 CSS 변수 우선, 신규 의존성 금지
- Performance constraints: 지도 번들 지연 로드 유지
- Compatibility constraints: macOS/Windows에서 Pretendard와 레이아웃 폭 유지
- Test/screenshot expectations: E2E와 1440px 화면 확인 후 완료

## Open questions
- [ ] 실제 브랜드 컬러 가이드가 제공되면 상태색 토큰을 재검토한다.
