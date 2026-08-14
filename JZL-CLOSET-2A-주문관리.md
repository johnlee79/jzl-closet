JZL CLOSET 2단계-A 작업이다.
범위: 주문 접수(무통장입금) · 주문 관리 · 텔레그램 알림.
회원가입/로그인, 문의, 리뷰, 포인트는 다음 단계이므로 이번에 만들지 마라.
PG 결제 연동도 이번 범위가 아니다. 단, 나중에 붙일 자리는 비워두어라.

질문하지 말고 끝까지 완성하고, npm run build가 통과할 때까지 스스로 고쳐라.

────────────────────────────────
\[0] 이번 단계의 핵심 개념
────────────────────────────────
지금은 장바구니에 담아도 주문이 저장되지 않는다. 이번에 이걸 만든다.

손님: 장바구니 → 주문서 작성 → 무통장입금 안내 → 주문번호 발급
사장님: 텔레그램 알림 → 관리자에서 입금확인 → 송장입력 → 배송완료

결제 없이도 계좌이체로 실제 판매가 가능한 상태를 만드는 것이 목표다.
나중에 PG를 붙이면 "입금대기" 자리에 카드결제가 들어간다.

────────────────────────────────
\[1] DB 스키마
────────────────────────────────
supabase/schema-2a.sql 파일을 만들어라. (내가 SQL Editor에서 직접 실행한다)

orders 테이블:
id                uuid primary key default gen\_random\_uuid()
order\_no          text unique not null      -- ORD-20260814-0001 형식
status            text not null default 'pending\_payment'
-- pending\_payment(입금대기) | paid(결제완료) | preparing(상품준비중)
-- | shipping(배송중) | delivered(배송완료) | confirmed(구매확정)
-- | cancelled(취소) | exchange(교환) | returned(반품) | failed(결제실패)
orderer\_name      text not null
orderer\_phone     text not null
orderer\_email     text
receiver\_name     text not null
receiver\_phone    text not null
postcode          text not null
address1          text not null
address2          text
delivery\_memo     text
depositor\_name    text                      -- 입금자명
payment\_method    text default 'bank\_transfer'
items\_total       integer not null          -- 상품 합계
shipping\_fee      integer not null default 0
extra\_shipping\_fee integer default 0        -- 도서산간
discount          integer default 0
total\_amount      integer not null          -- 최종 결제금액
courier           text                      -- 택배사
tracking\_no       text                      -- 송장번호
admin\_memo        text
created\_at        timestamptz default now()
updated\_at        timestamptz default now()

order\_items 테이블:
id             uuid primary key default gen\_random\_uuid()
order\_id       uuid not null references public.orders(id) on delete cascade
product\_id     uuid
product\_slug   text not null
product\_name   text not null      -- 주문 시점 이름을 그대로 저장
brand\_label    text
option\_key     text               -- "블랙/M"
unit\_price     integer not null   -- 주문 시점 가격 (추가금액 포함)
quantity       integer not null
line\_total     integer not null
thumbnail\_url  text
item\_status    text default 'normal'  -- normal | cancelled (부분취소)
created\_at     timestamptz default now()

★ 상품명·가격을 주문 시점 값으로 복사해 저장하는 것이 중요하다.
나중에 상품 가격이 바뀌어도 과거 주문 내역은 그대로여야 한다.

order\_status\_history 테이블:
id          uuid primary key default gen\_random\_uuid()
order\_id    uuid not null references public.orders(id) on delete cascade
from\_status text
to\_status   text not null
memo        text
created\_at  timestamptz default now()

인덱스: orders(status), orders(created\_at desc), orders(order\_no),
order\_items(order\_id), order\_status\_history(order\_id)

주문번호 생성: ORD-YYYYMMDD-NNNN (당일 순번 4자리)
동시 주문에도 중복이 나지 않게 DB 함수 또는 유니크 제약 + 재시도로 처리하라.

────────────────────────────────
\[2] 주문서 작성 (프론트)
────────────────────────────────
app/(shop)/checkout/page.tsx 를 새로 만들어라.
/order 는 장바구니 화면으로 두고, 거기서 \[주문하기] 버튼으로 넘어간다.

■ 화면 구성

1. 주문 상품 목록 — 이름·옵션·수량·금액 (수정 불가, 장바구니로 돌아가 수정)
2. 주문자 정보 — 이름 · 연락처 · 이메일(선택)
3. 배송지 정보 — 받는분 · 연락처 · 우편번호 · 주소 · 상세주소 · 배송메모
★ 주소 검색은 외부 라이브러리 설치 없이,
다음 우편번호 서비스 스크립트를 next/script로 불러 사용하라.
(https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js)
"주문자 정보와 동일" 체크박스를 두어라.
4. 결제 수단 — 지금은 무통장입금만. 입금자명 입력칸.
★ 카드결제 자리를 비활성 상태로 표시하고 "준비 중"이라고 두어라.
나중에 PG를 붙일 자리다.
5. 금액 요약 — 상품합계 · 배송비 · 도서산간추가 · 총 결제금액
설정의 무료배송 기준 금액을 적용하라.
제주·도서산간은 우편번호로 판별해 추가배송비를 더하라.
6. 약관 동의 — 구매조건 확인 및 결제진행 동의 (필수)
7. \[주문하기] 버튼

■ 검증

* 필수값 미입력 시 해당 칸으로 스크롤 + 붉은 안내
* 연락처는 숫자만, 자동 하이픈
* ★ 주문 직전에 서버에서 재고와 판매상태를 다시 확인하라.
품절된 상품이 있으면 주문을 막고 어떤 상품인지 알려줘라.
* ★ 금액은 절대 클라이언트가 보낸 값을 믿지 마라.
서버에서 상품 가격·옵션 추가금액·배송비를 다시 계산해 저장하라.

■ 주문 완료 화면
app/(shop)/checkout/complete/page.tsx

* 주문번호 크게 표시
* 입금 계좌 안내 (설정에서 읽음)
* 입금 기한 안내 (기본 24시간, 설정에서 조절)
* "주문 내역 복사" 버튼
* ★ 주문 완료 페이지는 검색에 잡히면 안 된다. noindex 처리하라.

■ 비회원 주문 조회
app/(shop)/order-lookup/page.tsx

* 주문번호 + 주문자 연락처로 조회
* 주문 상태, 배송 정보, 송장번호 표시
* 이 페이지도 noindex

────────────────────────────────
\[3] 설정 추가
────────────────────────────────
관리자 설정에 아래를 추가하라. site\_settings에 저장한다.

* 입금 계좌 (은행 · 계좌번호 · 예금주)
* 입금 기한 (시간 단위, 기본 24)
* 도서산간 추가배송비 적용 우편번호 규칙 (기본값 제공)
* 주문 알림 받을 텔레그램 사용 여부 토글

★ 입금 계좌는 주문 완료 화면과 주문 조회 화면에서만 보이게 하라.
상품 페이지나 푸터에 노출하지 마라. (스팸 수집 대상이 된다)

────────────────────────────────
\[4] 관리자 — 주문 관리 (/admin/orders)
────────────────────────────────
■ 목록

* 상단 상태별 탭: 전체 · 입금대기 · 결제완료 · 상품준비중 · 배송중 ·
배송완료 · 구매확정 · 취소 · 교환 · 반품 · 결제실패
각 탭에 건수 뱃지
* 표: 주문번호 · 주문일시 · 주문자 · 상품(대표1개 외 N건) ·
결제금액 · 입금자명 · 상태 · 송장 · 관리
* 검색: 주문번호 · 주문자명 · 연락처 · 입금자명
* 기간 필터: 오늘 · 7일 · 30일 · 직접입력
* 정렬: 최신순 기본
* 페이지네이션 20건

■ 일괄 처리

* 체크박스 선택 후 상태 일괄 변경
* 선택 항목 또는 현재 필터 결과를 CSV로 내보내기
★ 라이브러리 추가 없이 CSV. UTF-8 BOM을 넣어 엑셀에서 한글이 깨지지 않게.
★ 택배사 일괄등록 양식에 맞게 컬럼을 구성하라:
주문번호 · 받는분 · 연락처 · 우편번호 · 주소 · 상품명 · 수량 · 배송메모

■ 주문 상세 (/admin/orders/\[id])

* 주문 정보 · 주문자 · 배송지 · 결제 정보 · 상품 목록
* 상태 변경 드롭다운 + 메모 입력 → 변경 시 order\_status\_history에 기록
* 송장 입력: 택배사 선택(CJ대한통운·한진·롯데·우체국·로젠 등) + 송장번호
★ 송장을 입력하면 상태를 자동으로 '배송중'으로 바꿔라
* 배송지 수정 (배송 전까지만 가능)
* 관리자 메모
* ★ 부분 취소: 상품별로 취소 처리. 취소된 품목은 item\_status='cancelled'.
취소 후 총액을 다시 계산해 표시하라. (실제 환불은 수동)
* 상태 변경 이력 타임라인 표시
* 주문서 인쇄용 화면 (간단한 인쇄 레이아웃)

────────────────────────────────
\[5] 관리자 — 대시보드 (/admin)
────────────────────────────────
주문이 생겼으므로 이제 대시보드가 의미를 갖는다. 관리자 첫 화면으로 바꿔라.

* 오늘 주문금액 · 이번달 주문금액 (전일·전월 대비 증감)
* 오늘 주문건수 · 입금대기 건수 · 미출고(결제완료+상품준비중) 건수
* 상태별 건수 카드
* 최근 주문 10건 (클릭 시 주문 상세로)
* ★ 입금대기가 있으면 눈에 띄게 강조하라. 매일 확인할 항목이다.
* 데이터가 없어도 화면이 깨지지 않게 하라. 0으로 표시.

────────────────────────────────
\[6] 텔레그램 알림
────────────────────────────────
lib/telegram.ts 를 만들어라. 서버 전용.

* 환경변수 TELEGRAM\_BOT\_TOKEN / TELEGRAM\_CHAT\_ID 사용
* 값이 비어 있으면 아무 동작도 하지 말고 조용히 넘어가라. 에러를 내지 마라.
* 알림 전송 실패가 주문 저장을 막으면 안 된다.
try/catch로 감싸고 실패해도 주문은 정상 처리되게 하라.

■ 이번에 붙일 이벤트: 새 주문
메시지 형식:
🛍 새 주문 (주문번호)
주문자 · 연락처
상품명 x수량 (여러 건이면 목록)
결제금액
입금자명
관리자에서 보기: {SITE\_URL}/admin/orders/{id}

■ 문의·리뷰 알림은 다음 단계다. 함수 자리만 만들어 두어라.

────────────────────────────────
\[7] RLS 활성화 ★ 이번에 반드시 한다
────────────────────────────────
주문 데이터부터는 손님의 개인정보(이름·연락처·주소)가 들어간다.
지금처럼 RLS를 끈 채로 두면 anon key로 남의 주문을 읽을 수 있다.

supabase/rls-2a.sql 파일을 만들어라. 내용:

* orders, order\_items, order\_status\_history: RLS 활성화,
anon/authenticated에는 아무 정책도 부여하지 않는다 (service\_role만 접근)
* products, categories, brands, site\_settings: RLS 활성화 +
anon에 select만 허용하는 정책 (공개 읽기)
* templates: service\_role만

★ 프론트에서 상품·카테고리를 읽는 코드가 anon key를 쓰고 있다면
서버 컴포넌트로 옮기거나 공개 읽기 정책이 걸리도록 정리하라.
★ RLS를 켠 뒤 사이트 전 페이지가 정상 동작하는지 직접 확인하고
결과를 보고하라. 상품이 안 보이면 정책이 잘못된 것이다.

────────────────────────────────
\[8] 사이드바 갱신
────────────────────────────────
대시보드
주문 관리
상품 관리
분류 관리
브랜드 관리
디자인 관리
설정
─────────
(회원 관리 · 문의 관리 · 리뷰 관리 — 준비 중 회색)

입금대기 건수를 주문 관리 메뉴 옆에 뱃지로 표시하라.

────────────────────────────────
\[9] 마무리
────────────────────────────────

* npm run build 통과 (Type error·Failed to compile 0건)
* 실행할 SQL 파일과 순서를 마지막에 알려줘라
(schema-2a.sql → rls-2a.sql 순서)
* 깃허브에 올려라
* 마지막에 한국어로 알려줘라:

  1. 실행할 SQL 파일과 순서
  2. 텔레그램 알림을 받으려면 무엇을 설정해야 하는지
  3. 주문이 들어왔을 때 사장님이 처리하는 순서
  4. 이번에 만들지 않은 것 (다음 단계)



────────────────────────────────

\[10] 국내 쇼핑몰 필수 항목 추가

────────────────────────────────



10-1. 현금영수증

\- 주문서에 현금영수증 신청 영역을 두어라.

&#x20; 신청안함 / 소득공제(휴대폰번호) / 지출증빙(사업자번호)

\- orders 테이블에 컬럼 추가:

&#x20;   cash\_receipt\_type   text    -- none | personal | business

&#x20;   cash\_receipt\_no     text

\- 관리자 주문 상세에서 이 정보를 볼 수 있게 하라 (수동 발급용)



10-2. 에스크로·구매안전서비스 표시

\- 설정에 "구매안전서비스 안내 문구"와 "인증 이미지 URL" 항목을 두어라

\- 값이 있으면 푸터와 주문 완료 화면에 표시하고, 없으면 표시하지 마라

\- 무통장입금 선결제는 결제대금예치 또는 소비자피해보상보험 표시가

&#x20; 법적으로 요구된다. 자리를 비워두되 구조는 만들어라.



10-3. 손님의 주문 취소 요청

\- 주문 조회 화면에서 "주문 취소 요청" 버튼

\- 상태가 입금대기 또는 결제완료일 때만 가능

\- 요청하면 관리자에게 텔레그램 알림, 관리자가 확인 후 처리

\- 배송 시작 후에는 버튼 대신 "고객센터로 문의" 안내



10-4. 배송 추적

\- 관리자가 송장을 입력하면 주문 조회 화면에 택배사 조회 링크를 만들어라

\- 택배사별 조회 URL 형식을 lib/couriers.ts에 정리해 두어라

\- 클릭 시 새 탭에서 해당 택배사 조회 페이지로 이동



10-5. 재고 차감 시점

\- 주문이 생성되는 시점에 옵션 조합의 재고를 차감하라

\- 주문 취소 시 재고를 되돌려라

\- 재고가 부족하면 주문 자체를 막아라 (서버에서 검증)

\- 재고를 관리하지 않는 조합(stock이 null)은 차감하지 마라



10-6. PG 연동 대비 (구조만)

\- lib/payments/ 폴더를 만들고 인터페이스를 정의하라:

&#x20;   createPayment(order) / verifyPayment(data) / cancelPayment(order)

\- 지금은 무통장입금 구현체만 만들어라 (bank-transfer.ts)

\- 나중에 PG 구현체를 파일 하나 추가하는 것으로 붙일 수 있게 하라

\- orders 테이블에 컬럼 추가:

&#x20;   pg\_provider   text

&#x20;   pg\_tid        text     -- PG 거래번호

&#x20;   paid\_at       timestamptz

\- ★ 결제 검증은 반드시 서버에서 한다는 전제로 구조를 짜라.

&#x20; 클라이언트가 보낸 결제 결과를 그대로 믿는 구조를 만들지 마라.



10-7. 개인정보 보관

\- 주문 데이터에 개인정보가 들어간다. 관리자 외에는 접근 불가여야 한다.

\- 주문 조회 화면은 주문번호 + 연락처 조합으로만 접근 가능하게 하고,

&#x20; 연속 시도를 막는 간단한 제한(같은 IP 분당 10회)을 두어라

