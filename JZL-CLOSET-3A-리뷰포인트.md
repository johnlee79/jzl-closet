JZL CLOSET 3단계-A 작업이다.
범위: 헤더 로그인 버튼 개선 · 리뷰 · 포인트 · 공지사항 · 팝업 · 매출/상품 통계.

질문하지 말고 끝까지 완성하고, npm run build가 통과할 때까지 스스로 고쳐라.

────────────────────────────────
[0] 헤더 로그인·회원가입 노출 개선 (먼저 처리)
────────────────────────────────
■ 데스크탑
- 현재 로그인·회원가입이 텍스트로만 있어 눈에 띄지 않는다. 버튼으로 바꿔라.
    [로그인]   1px ink 테두리, 투명 배경, ink 글씨
    [회원가입]  ink 배경, paper 글씨
  높이 34px, 좌우 여백 px-4, rounded-sm, 두 버튼 간격 gap-2
- 글자 크기는 메뉴보다 한 단계 작게(13px), 자간 유지
- 장바구니(CART)는 버튼 오른쪽에 두되 여백이나 구분선으로 분리하라
- 로그인 상태에서는 [마이페이지](테두리 버튼) + 로그아웃(텍스트 링크)

■ 모바일 ★ 핵심
- 현재 로그인·회원가입이 햄버거 메뉴 안 MY 항목에 숨어 있다.
  ★ 헤더 상단으로 꺼내라. 메뉴를 열지 않아도 바로 보여야 한다.
- 배치: 좌측 햄버거(≡) · 가운데 로고 · 우측 [로그인] 버튼 + 장바구니 아이콘
- 화면이 좁으므로 회원가입 버튼은 헤더에 넣지 마라.
  로그인 화면 안의 "회원가입" 링크로 넘어가면 된다
- 로그인 상태면 [로그인] 자리에 사람 모양 아이콘(마이페이지 링크)
- 버튼 높이 36px 이상, 터치 영역 44px 이상
- 로고와 버튼이 겹치거나 줄바꿈되지 않게 하라.
  좁아지면 로고 글자 크기를 살짝 줄여 대응하라

■ 햄버거 메뉴 안쪽
- 로그인 상태: 마이페이지·주문내역·문의내역·로그아웃
- 비로그인: 로그인·회원가입 버튼을 메뉴 맨 위에 크게 배치

■ 확인
데스크탑·태블릿·모바일 세 폭에서 헤더가 깨지지 않는지 확인하라.
색은 ink/paper/stone 안에서만 쓰고 그림자는 넣지 마라.

────────────────────────────────
[1] DB 스키마
────────────────────────────────
supabase/schema-3a.sql 파일을 만들어라. (내가 SQL Editor에서 직접 실행한다)

reviews 테이블:
  id             uuid primary key default gen_random_uuid()
  product_id     uuid not null
  product_slug   text not null
  user_id        uuid references auth.users(id) on delete set null
  order_id       uuid references public.orders(id) on delete set null
  writer_name    text not null
  rating         integer not null          -- 1~5
  tags           jsonb default '[]'::jsonb -- 선택한 긍정 태그 배열
  content        text not null
  attachments    jsonb default '[]'::jsonb -- 이미지·동영상 URL 배열
  is_sponsored   boolean default false     -- 체험단·무상제공 여부
  is_visible     boolean default true
  admin_reply    text
  replied_at     timestamptz
  helpful_count  integer default 0
  created_at     timestamptz default now()
  updated_at     timestamptz default now()

point_transactions 테이블:
  id          uuid primary key default gen_random_uuid()
  user_id     uuid not null references auth.users(id) on delete cascade
  amount      integer not null          -- 적립 +, 사용 -
  balance     integer not null          -- 이 거래 후 잔액
  reason      text not null             -- signup | review_text | review_photo | order_use | admin | cancel
  memo        text
  ref_id      uuid                      -- 관련 리뷰/주문 id
  created_at  timestamptz default now()

profiles에 컬럼 추가:
  point_balance integer default 0

notices 테이블:
  id           uuid primary key default gen_random_uuid()
  title        text not null
  content      text not null
  is_pinned    boolean default false
  is_visible   boolean default true
  view_count   integer default 0
  created_at   timestamptz default now()
  updated_at   timestamptz default now()

popups 테이블:
  id            uuid primary key default gen_random_uuid()
  title         text not null
  image_url     text
  content       text
  link_url      text
  position      text default 'center'    -- center | left | right
  width         integer default 400
  starts_at     timestamptz
  ends_at       timestamptz
  is_visible    boolean default true
  show_on       text default 'home'      -- home | all
  display_order integer default 0
  created_at    timestamptz default now()

인덱스: reviews(product_id), reviews(created_at desc), reviews(is_visible),
       point_transactions(user_id, created_at desc),
       notices(is_visible, is_pinned), popups(is_visible)

★ 포인트 잔액은 profiles.point_balance에 두되,
  point_transactions와 어긋나지 않게 항상 트랜잭션 안에서 함께 갱신하라.

────────────────────────────────
[2] 리뷰 — 프론트
────────────────────────────────
■ 상품 상세에 리뷰 영역
- 평균 별점 + 리뷰 개수를 상품명 아래에 요약 표시
- 별점 분포 막대(5점 몇 개, 4점 몇 개…)
- 태그 통계: 많이 선택된 긍정 태그를 상위 3개 표시
- 리뷰 목록: 별점 · 작성자(가운데 마스킹: 홍*동) · 날짜 · 태그 · 본문 · 첨부 이미지
- 정렬: 최신순 / 별점 높은순 / 낮은순
- 사진 있는 리뷰만 보기 필터
- 이미지 클릭 시 확대 보기
- ★ is_sponsored가 true인 리뷰에는 반드시 아래 문구를 리뷰 하단에 표시하라:
  "※ 제품을 무상으로 제공받아 작성된 후기입니다"
  작은 글씨(12px, muted)로 하되 숨기거나 흐리게 만들지 마라. 법적 표시다.
- 관리자 답변이 있으면 리뷰 아래 들여쓰기해서 표시

■ 리뷰 작성 (회원)
- 마이페이지 > 주문 내역에서 배송완료·구매확정 주문에 [리뷰 쓰기] 버튼
- 별점(1~5 별 클릭) · 긍정 태그 다중 선택 · 본문(0/500 글자수 표시)
- 이미지·동영상 첨부 최대 5개 (R2 업로드, 이미지 자동 최적화)
- 긍정 태그 기본 목록:
    빠른배송 · 포장이 꼼꼼해요 · 품질이 좋아요 ·
    사진과 같아요 · 가성비 좋아요 · 재구매할게요
  ★ 태그 목록은 관리자에서 수정할 수 있게 site_settings에 저장하라
- 같은 주문의 같은 상품에는 리뷰를 한 번만 쓸 수 있게 하라
- 작성 완료 시 포인트 자동 적립 (아래 [3] 참고)

────────────────────────────────
[3] 포인트
────────────────────────────────
■ 적립 규칙 (관리자 설정에서 금액 조절 가능, site_settings에 저장)
  회원가입          기본 1000원 (가입 즉시 1회)
  텍스트 리뷰       기본 500원
  사진·동영상 리뷰  기본 1000원 (이미지가 1개 이상이면 이쪽)
  ★ 각 항목마다 on/off 토글과 금액 입력칸을 두어라. 0이면 적립하지 않는다

■ 사용
- 주문서에 포인트 사용 입력칸 (보유 포인트 표시, 전액 사용 버튼)
- 최소 사용 금액 설정 (기본 1000원 이상부터 사용 가능)
- 최대 사용 비율 설정 (기본 상품금액의 100%)
- ★ 포인트 사용액도 서버에서 다시 검증하라. 잔액보다 많이 쓸 수 없다
- 주문 취소 시 사용한 포인트를 되돌리고, 적립된 포인트는 회수하라

■ 마이페이지 > 포인트
- 현재 잔액 크게 표시
- 적립·사용 내역 목록 (날짜 · 내용 · 금액 · 잔액)

■ 관리자
- 회원 상세에서 포인트 수동 지급·차감 (사유 입력 필수)
- 포인트 내역 조회

────────────────────────────────
[4] 관리자 — 리뷰 관리 (/admin/reviews)
────────────────────────────────
- 목록: 상품 · 별점 · 작성자 · 내용 요약 · 사진 · 체험단 · 노출 · 작성일
- 필터: 상품, 별점, 사진 유무, 노출 여부, 체험단 여부
- 노출 on/off 토글 (부적절한 리뷰 숨김)
- 관리자 답변 작성
- 리뷰 삭제

■ 리뷰 직접 등록 ★
실제 주문과 연결되지 않은 리뷰를 관리자가 등록할 수 있게 하라.
체험단·서포터즈가 실제로 제품을 받아 쓴 후기를 대신 입력하는 용도다.

- 상품 검색해서 선택
- 별점 · 태그 · 작성자 이름 · 본문 · 이미지/동영상 첨부(최대 5개)
- ★ "체험단·무상제공 후기" 체크박스를 두고, 기본값을 체크된 상태로 하라
  체크하면 is_sponsored = true 로 저장되고
  프론트에 "※ 제품을 무상으로 제공받아 작성된 후기입니다"가 표시된다
- 체크를 해제하려 하면 확인 창을 띄워라:
  "제품을 무상 제공받은 후기는 그 사실을 표시해야 합니다.
   실제 구매 후기가 맞습니까?"
  ★ 이 표시가 있어야 표시광고법상 문제가 없다. 기능을 빼거나 숨기지 마라
- user_id는 null로 저장한다 (포인트 적립 없음)

────────────────────────────────
[5] 공지사항
────────────────────────────────
■ 프론트
- /notice 목록 (제목 · 날짜, 고정 공지는 상단)
- /notice/[id] 상세
- 푸터에 공지사항 링크

■ 관리자 (/admin/notices)
- 목록 · 등록 · 수정 · 삭제
- 상단 고정(is_pinned) 토글, 노출 토글
- 본문 편집기는 상품 상세 편집기와 같은 수준 (소제목·굵게·줄바꿈·링크·정렬)

────────────────────────────────
[6] 팝업
────────────────────────────────
■ 프론트
- 메인 진입 시 표시. 설정한 위치(center/left/right)와 폭으로 렌더
- "오늘 하루 보지 않기" 체크 → 쿠키에 저장(24시간)
- "닫기" 버튼
- 노출 기간(starts_at ~ ends_at) 밖이면 표시하지 않는다
- 여러 개면 display_order 순으로 나란히 표시. 겹치지 않게 배치하라
- ★ 모바일에서는 위치·폭 설정을 무시하고 화면 중앙에 가로 90%로 표시하라
- 이미지가 있으면 이미지, 없으면 텍스트 내용을 보여준다
- link_url이 있으면 팝업 클릭 시 이동

■ 관리자 (/admin/popups)
- 목록 · 등록 · 수정 · 삭제
- 이미지 업로드, 위치·폭·노출기간·노출페이지 설정
- 미리보기 기능

────────────────────────────────
[7] 통계 (/admin/stats)
────────────────────────────────
★ 방문자 통계(페이지뷰·체류시간·이탈률)는 만들지 마라.
  GA4를 이미 붙여 두었으니 그쪽에서 본다.
  여기서는 DB에 있는 매출·상품 데이터만 다룬다.
  통계 화면 상단에 "방문자 통계는 Google Analytics에서 확인하세요" 안내와
  GA4 링크를 두어라.

■ 매출 통계
- 기간 선택: 오늘 · 7일 · 30일 · 이번달 · 지난달 · 직접입력
- 총 매출 · 주문 건수 · 평균 객단가 · 취소/반품 금액
- 일자별 매출 추이 (라이브러리 없이 CSS 막대그래프로 직접 그려라)
- 상태별 주문 건수 분포

■ 상품 통계
- 판매 수량 상위 20개 (상품명 · 판매수량 · 매출액)
- 카테고리별 매출 비중
- 브랜드별 매출 비중
- 리뷰가 많은 상품 / 별점이 낮은 상품 (개선 대상 파악용)

■ 내보내기
- 현재 조회 조건의 결과를 CSV로 (UTF-8 BOM)

★ 취소·반품된 주문은 매출에서 제외하라. 부분취소된 품목도 빼야 한다.

────────────────────────────────
[8] 텔레그램 알림
────────────────────────────────
lib/telegram.ts의 notifyNewReview 함수를 실제로 구현하라.
- 새 리뷰가 등록되면 알림 (별점 3점 이하면 ⚠️ 표시를 붙여 눈에 띄게)
    ⭐ 새 리뷰 (별점 5)
    상품명
    작성자 · 사진 N장
    내용 앞부분 100자
    관리자: {링크}
- 설정에서 리뷰 알림 on/off 토글
- ★ 관리자가 직접 등록한 리뷰에는 알림을 보내지 마라

────────────────────────────────
[9] RLS
────────────────────────────────
supabase/rls-3a.sql 파일을 만들어라.
- reviews: anon에 is_visible = true 인 행만 select 허용.
  insert/update/delete는 service_role만
- point_transactions: 본인 것만 select (auth.uid() = user_id)
- notices, popups: anon에 is_visible = true 인 행만 select
- 적용 후 프론트에서 리뷰·공지·팝업이 정상 노출되는지 직접 확인하고 보고하라

────────────────────────────────
[10] 사이드바
────────────────────────────────
  대시보드
  주문 관리
  회원 관리
  문의 관리
  리뷰 관리      ← 신규
  상품 관리
  분류 관리
  브랜드 관리
  디자인 관리
  공지 관리      ← 신규
  팝업 관리      ← 신규
  통계          ← 신규
  설정

대시보드에 오늘 리뷰 수, 별점 3점 이하 리뷰 수를 카드로 추가하라.

────────────────────────────────
[11] 마무리
────────────────────────────────
- npm run build 통과 (Type error·Failed to compile 0건)
- 실행할 SQL 파일과 순서를 마지막에 알려줘라
- 깃허브에 올려라
- 마지막에 한국어로 알려줘라:
  1) 실행할 SQL 파일과 순서
  2) 포인트 적립 금액을 어디서 설정하는지
  3) 체험단 리뷰를 등록하는 순서
  4) 이번까지 만든 기능 전체 목록과, 아직 남은 것
