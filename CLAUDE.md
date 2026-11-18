# JZL CLOSET 구현 안내

PROJECT: JZL_CLOSET
REPOSITORY: johnlee79/jzl-closet
HANDOFF_POLICY: H1

[00_START_HERE.md](00_START_HERE.md) → 현재 지정된 업무/승인 → 해당 제품 참조 절 순서로 읽는다. 활성 업무가 UNKNOWN일 때 기존 파일 이름·가장 최근 보고를 근거로 새 NEXT를 생성하지 않는다.

승인된 범위만 구현한다. 기존 앱·상품·주문·회원·결제·DB·배포 동작은 별도 제품 작업 없이 변경하지 않는다. 작업에 따라 [setup](docs/handoff/active/setup.md), [catalogue](docs/handoff/active/catalogue.md), [orders/payments](docs/handoff/active/orders-payments.md)의 필요한 절을 읽는다. 모든 문서를 시작 때 로드하지 않는다.

정확한 변경/검증 근거와 미확인을 짧게 보고한다. 비밀·개인정보·결제정보를 출력하지 않는다. 상세 로그는 필요한 근거로 남기고 현재 상태에 누적하지 않는다. [H1](docs/handoff/LOCAL_POLICY.md)을 유지한다.
