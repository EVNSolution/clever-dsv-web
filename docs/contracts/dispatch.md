# 배차 계약

- Status: Active
- Last refreshed: 2026-08-04
- Code owners: `src/services/dispatch.ts`, `src/services/dispatch-imports.ts`

## 기본 단위

- 한 업로드 행과 한 `SellerOrder`가 배정, 해제와 삭제의 최소 단위다.
- 배정 해제는 운영 배정만 제거하며 주문 삭제와 다르다.
- 배송원이 바뀌면 해당 주문의 차량과 경로 관계도 하나의 명령으로 변경한다.
- 중복 배송은 허용하지 않으며 서버가 `expectedVersion`과 route membership으로 동시 수정을 거부한다.
- 실제 route sequence, geometry와 ETA 계산은 서버가 소유한다.

## 파일 업로드

지원 형식은 CSV와 XLSX이며 첫 번째 시트를 읽는다. 한 파일은 최대 500행이다.

필수 열:

```text
배송처, condition, shippedbox, 주소, customer, SellerOrderKey
```

선택 열:

```text
driver, vehicle, 특이사항, latitude, longitude, 배차일, 배차일자, 배송일, 배송일자
```

- `driver`와 `vehicle`은 둘 다 비어 있으면 미배정 주문으로 허용한다.
- 둘 중 하나만 있으면 미배정으로 취급하며 관리자가 배차 화면에서 명시적으로 배정한다.
- 두 값이 모두 있으면 등록된 배송원과 차량을 정확히 찾아야 한다.
- 한 파일에서 배송원과 차량은 서로 충돌하는 다대다 조합을 만들 수 없다.
- `shippedbox`는 1 이상의 정수다.
- 같은 파일 안의 `SellerOrderKey` 중복은 오류다.
- 미등록 `condition`은 관리자가 이름과 설명을 입력해 등록하기 전까지 확정을 차단한다.
- 위도와 경도는 함께 제공해야 한다. 둘 다 없으면 서버 지오코딩과 관리자 확인 대상으로 남는다.

배차일은 날짜 열을 우선하고, 없으면 파일명의 8자리 또는 6자리 날짜를 사용한다. 한 파일의 날짜 열에 여러 날짜가 섞이면 오류다.

## 업로드 상태 전이

```text
파일 선택 → 로컬 파싱 → 서버 preview → 오류 또는 후보 수정 → staging 생성 → apply → 배차 지도
```

- preview 오류가 있어도 엑셀 형태의 원본 셀을 표시한다.
- 셀 수정은 preview를 다시 수행하며 변경이 없으면 지오코딩을 다시 요청하지 않는다.
- commit 응답의 `sourceHash`를 apply의 `expectedSourceHash`로 전달한다.
- apply는 `Idempotency-Key`와 동일한 `commandId`를 사용한다.
- 성공하면 업로드 overlay를 닫고 선택한 배차일의 지도 상태를 다시 조회한다.

## 배정

배정과 해제는 단건 및 batch 명령을 지원한다.

- `reassign`은 배송원, 차량과 선택적 route plan을 함께 전달한다.
- `unassign`은 주문을 삭제하지 않고 배정만 제거한다.
- 먼저 성공한 acquisition이 우선한다. 충돌한 요청은 서버 오류 코드로 사용자에게 알린다.
- 출발한 route는 재배정할 수 없다. 단순히 예정 출발 시각이 지났다는 사실만으로 route가 출발 상태가 되지는 않는다.

## 삭제

- 삭제는 배정 해제와 별개다.
- 프런트는 한 요청에 최대 100건을 보낸다.
- `commandId`, 각 주문의 `sellerOrderId`와 `expectedVersion`을 전달한다.
- 이미 삭제된 주문의 재요청은 서버 idempotency 계약을 따라야 하며 다른 날짜의 같은 주문번호를 임의로 삭제하지 않는다.

## 시간 제약

- 원문 `특이사항`과 관리자가 확인한 시간 제약을 분리한다.
- 확인 전 상태는 `UNCONFIRMED`, 확인된 시간창은 `CONFIRMED`, 제거된 제약은 `CLEARED`다.
- 시간 제약 명령은 `sellerOrderId`, `deliveryStopId`, `expectedVersion`, `commandId`를 사용한다.
- 확정 및 해제 후 route constraint 재계산은 서버의 백그라운드 작업이며 프런트 화면 로딩을 장시간 점유하지 않는다.

## 조회

배차 목록은 배차일을 필수 기준으로 사용하며 주문번호와 배송처 이름의 부분 검색을 지원한다. 응답은 cursor로 끝까지 조회한다.

주요 표시 필드는 다음과 같다.

- 주문번호, 고객사, 배송지 이름과 주소
- 박스 수량과 운송조건
- 배정 상태, 배송원과 차량
- route sequence, ETA 상태, 예상 도착과 실제 완료
- 특이사항 원문, 검토 상태와 확인된 시간창

## 제외 범위

- 모바일 배송원 앱 UI
- WMS 원본 파일의 장기 고유 배송원 코드 결정
- 단말기 원본 프로토콜과 텔레메트리 저장 주기
- 프런트에서의 경로 최적화
