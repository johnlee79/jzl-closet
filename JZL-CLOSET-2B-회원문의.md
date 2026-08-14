JZL CLOSET 2단계-B 작업이다.
범위: 회원가입·로그인 · 마이페이지 · 1:1 문의.
리뷰, 포인트, 공지, 팝업, 통계는 다음 단계이므로 이번에 만들지 마라.

질문하지 말고 끝까지 완성하고, npm run build가 통과할 때까지 스스로 고쳐라.

────────────────────────────────
[0] 전제
────────────────────────────────
- 현재 모든 주문이 비회원 주문이다. 회원 기능을 붙이되,
  ★ 비회원 주문은 그대로 유지하라. 회원가입을 강제하지 마라.
  국내 쇼핑몰에서 가입 강제는 이탈률을 크게 높인다.
- 인증은 Supabase Auth(이메일 + 비밀번호)를 쓴다.
  소셜 로그인(카카오 등)은 이번 범위가 아니다. 나중에 붙일 자리만 남겨라.

────────────────────────────────
[1] DB 스키마
────────────────────────────────
supabase/schema-2b.sql 파일을 만들어라. (내가 SQL Editor에서 직접 실행한다)

profiles 테이블 (auth.users와 1:1):
  id                uuid primary key references auth.users(id) on delete cascade
  name              text not null
  phone             text
  email             text
  postcode          text
  address1          text
  address2          text
  status            text default 'active'      -- active | inactive | withdrawn
  agree_terms       boolean default false      -- 이용약관 (필수)
  agree_privacy     boolean default false      -- 개인정보 수집·이용 (필수)
  agree_age14       boolean default false      -- 만 14세 이상 (필수)
  agree_marketing   boolean default false      -- 마케팅 수신 (선택)
  agreed_at         timestamptz
  last_login_at     timestamptz
  withdrawn_at      timestamptz
  admin_memo        text
  created_at        timestamptz default now()
  updated_at        timestamptz default now()

orders 테이블에 컬럼 추가:
  user_id  uuid references auth.users(id) on delete set null
  ★ 기존 주문은 null이다. 비회원 주문을 그대로 두기 위함이다.

inquiries 테이블 (1:1 문의):
  id            uuid primary key default gen_random_uuid()
  inquiry_no    text unique not null          -- INQ-20260814-0001
  user_id       uuid references auth.users(id) on delete set null
  order_id      uuid references public.orders(id) on delete set null
  product_id    uuid                          -- 상품 문의인 경우
  category      text not null                 -- 주문/배송 | 교환/반품 | 상품 | 기타
  title         text not null
  content       text not null
  writer_name   text not null
  writer_phone  text
  writer_email  text
  password_hash text                          -- 비회원 문의 조회용
  is_secret     boolean default true
  status        text default 'pending'        -- pending | answered | closed
  answer        text
  answered_at   timestamptz
  attachments   jsonb default '[]'::jsonb
  created_at    timestamptz default now()
  updated_at    timestamptz default now()

인덱스: profiles(status), orders(user_id), inquiries(status),
       inquiries(created_at desc), inquiries(user_id)

★ 문의번호도 주문번호와 같은 방식으로 발급하라 (next_inquiry_no 함수).

────────────────────────────────
[2] 회원가입 / 로그인 (프론트)
────────────────────────────────
■ 회원가입 (/signup)
- 이메일 · 비밀번호 · 비밀번호 확인 · 이름 · 연락처
- 주소 입력 (선택, 다음 우편번호 서비스)
- 약관 동의:
    [필수] 만 14세 이상입니다
    [필수] 이용약관 동의        — 전문 보기 링크(/terms)
    [필수] 개인정보 수집·이용 동의 — 전문 보기 링크(/privacy)
    [선택] 마케팅 정보 수신 동의
    "전체 동의" 체크박스를 맨 위에 두어라
  ★ 필수 항목 미동의 시 가입 불가. 동의 시각(agreed_at)을 반드시 저장하라.
    나중에 분쟁이 생기면 동의 여부와 시각이 증거가 된다.
- 비밀번호 규칙: 8자 이상, 영문+숫자 조합. 화면에 규칙을 미리 표시하라
- 이메일 중복 확인
- 가입 완료 후 자동 로그인

■ 로그인 (/login)
- 이메일 + 비밀번호
- "로그인 상태 유지" 체크박스
- 비밀번호 찾기 링크
- 로그인 실패 시 "이메일 또는 비밀번호가 올바르지 않습니다"로 통일하라.
  ★ 어느 쪽이 틀렸는지 알려주면 가입 여부가 노출된다.
- 5회 연속 실패하면 1분간 대기시켜라

■ 비밀번호 재설정 (/reset-password)
- 이메일 입력 → Supabase Auth의 재설정 메일 발송
- 메일 링크로 새 비밀번호 설정

■ 헤더
- 비로그인: 로그인 / 회원가입
- 로그인: 마이페이지 / 로그아웃 (이름 표시)
- 모바일 메뉴에도 반영

────────────────────────────────
[3] 마이페이지 (/mypage)
────────────────────────────────
- 대시보드: 이름 인사, 주문 건수 요약(입금대기·배송중·배송완료)
- 주문 내역 (/mypage/orders)
    · 목록 + 상세. 비회원 주문 조회와 같은 정보
    · 상태별 필터
    · 배송중이면 택배사 조회 링크
    · 입금대기·결제완료 상태면 취소 요청 버튼
- 문의 내역 (/mypage/inquiries)
- 회원정보 수정 (/mypage/profile)
    · 이름 · 연락처 · 주소 변경
    · 비밀번호 변경 (현재 비밀번호 확인 후)
    · 마케팅 수신 동의 변경
- 회원 탈퇴 (/mypage/withdraw)
    ★ 탈퇴 시 주문 내역은 보존하라. 전자상거래법상 거래기록은
      5년 보관 의무가 있다. profiles.status를 'withdrawn'으로 바꾸고
      개인정보 필드를 마스킹하되, 주문 데이터는 남긴다.
    · 탈퇴 사유 선택 (선택 입력)
    · 재확인 창 필수

■ 비회원 주문을 회원 계정에 연결
- 마이페이지에 "비회원 주문 불러오기" 기능
- 주문번호 + 주문자 연락처를 입력하면 그 주문의 user_id를 현재 계정으로 설정
- ★ 이미 다른 계정에 연결된 주문은 불러오지 못하게 막아라

────────────────────────────────
[4] 주문서에 회원 연동
────────────────────────────────
- 로그인 상태면 주문서에 이름·연락처·주소를 자동으로 채워라
- 주문 생성 시 user_id를 저장하라
- 로그인 안 했으면 지금처럼 비회원 주문으로 진행
- 주문서 상단에 "로그인하고 주문하기" 안내를 작게 두되, 강요하지 마라

────────────────────────────────
[5] 1:1 문의 (프론트)
────────────────────────────────
■ 문의 작성 (/inquiry/new)
- 문의 유형 선택: 주문/배송 · 교환/반품 · 상품 · 기타
- 제목 · 내용
- 회원이면 이름·연락처·이메일 자동 입력, 비회원이면 직접 입력 + 조회용 비밀번호
- 이미지 첨부 (최대 3장, R2 업로드)
- 관련 주문 선택 (회원이면 본인 주문 목록에서, 비회원이면 주문번호 입력)
- 비밀글 여부 (기본 켜짐)

■ 문의 조회
- 회원: 마이페이지 > 문의 내역
- 비회원: /inquiry/lookup 에서 문의번호 + 비밀번호
- 답변이 등록되면 상태가 '답변완료'로 바뀐다

■ 상품 상세 페이지에 문의 영역
- 해당 상품에 대한 문의 목록 (비밀글은 제목만 "비밀글입니다"로 표시)
- [상품 문의하기] 버튼 → 상품이 미리 선택된 상태로 문의 작성

────────────────────────────────
[6] 관리자 — 회원 관리 (/admin/members)
────────────────────────────────
- 목록: 이름 · 이메일 · 연락처 · 상태 · 주문수 · 총 구매금액 · 최근로그인 · 가입일
- 검색: 이름 · 이메일 · 연락처
- 필터: 상태(활성/비활성/탈퇴), 가입기간
- 회원 상세:
    · 기본 정보 수정 (이름 · 연락처 · 이메일 · 주소 · 상태)
    · 약관 동의 여부와 동의 시각 표시
    · 해당 회원의 주문 내역 목록 (클릭 시 주문 상세로)
    · 관리자 메모
    · 비밀번호 재설정 메일 발송 버튼
  ★ 관리자가 회원 비밀번호를 직접 볼 수 없게 하라. 재설정 메일만 보낸다.
- CSV 내보내기 (UTF-8 BOM)

────────────────────────────────
[7] 관리자 — 문의 관리 (/admin/inquiries)
────────────────────────────────
- 상태 탭: 전체 · 미답변 · 답변완료 · 종료 (각 건수 뱃지)
- 목록: 문의번호 · 유형 · 제목 · 작성자 · 관련주문 · 상태 · 등록일
- 검색: 제목 · 내용 · 작성자
- 문의 상세:
    · 문의 내용과 첨부 이미지
    · 관련 주문이 있으면 주문 정보 요약 + 주문 상세 링크
    · 답변 작성 (간단 편집기: 굵게 · 줄바꿈 · 링크)
    · 자주 쓰는 답변 템플릿 삽입 (templates 테이블 재사용)
    · 상태 변경
- ★ 미답변 건수를 사이드바 뱃지로 표시하라

────────────────────────────────
[8] 텔레그램 알림
────────────────────────────────
lib/telegram.ts의 notifyNewInquiry 함수를 실제로 구현하라.
- 새 문의가 등록되면 알림:
    💬 새 문의 (문의번호)
    유형 · 제목
    작성자
    관리자에서 보기: {SITE_URL}/admin/inquiries/{id}
- 설정에서 문의 알림 on/off 토글을 둬라
- 값이 없거나 실패해도 문의 저장은 정상 진행되게 하라

────────────────────────────────
[9] RLS ★ 이번에 반드시 정리한다
────────────────────────────────
supabase/rls-2b.sql 파일을 만들어라.

- profiles: RLS 활성화. 본인 행만 select/update 가능 (auth.uid() = id)
- orders: 로그인 사용자가 자기 주문(user_id = auth.uid())만 select 가능한
  정책 추가. 그 외는 service_role만.
- order_items, order_status_history: 본인 주문에 속한 것만
- inquiries: 본인 문의만. 비회원 문의는 service_role 경유로만 조회
- ★ 관리자 화면은 계속 service_role로 동작한다. 영향 없어야 한다.
- ★ RLS를 적용한 뒤 아래를 직접 확인하고 결과를 보고하라:
    1) 로그인하지 않은 상태에서 상품·카테고리가 정상 노출되는지
    2) 회원 A가 회원 B의 주문을 조회할 수 없는지
    3) 관리자 화면이 모든 주문·회원을 볼 수 있는지

────────────────────────────────
[10] 사이드바
────────────────────────────────
  대시보드
  주문 관리
  회원 관리
  문의 관리      ← 미답변 뱃지
  상품 관리
  분류 관리
  브랜드 관리
  디자인 관리
  설정
  ─────────
  (리뷰 관리 · 포인트 · 공지 — 준비 중 회색)

대시보드에 미답변 문의 건수 카드를 추가하라.

────────────────────────────────
[11] 마무리
────────────────────────────────
- 회원가입·로그인·마이페이지 페이지는 전부 noindex 처리하라
- npm run build 통과 (Type error·Failed to compile 0건)
- 실행할 SQL 파일과 순서를 마지막에 알려줘라
- 깃허브에 올려라
- 마지막에 한국어로 알려줘라:
  1) 실행할 SQL 파일과 순서
  2) Supabase Auth에서 추가로 설정해야 할 것 (이메일 인증 사용 여부,
     비밀번호 재설정 메일 템플릿 등) — 화면 경로까지 구체적으로
  3) 이번에 만들지 않은 것 (다음 단계)
