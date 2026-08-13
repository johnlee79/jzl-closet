JZL CLOSET 자사몰에 관리자 페이지를 붙인다. 이번 단계(1-A)의 범위는
"데이터베이스 연결 + 상품 관리 + 이미지 업로드"까지다.
분류/설정/디자인 관리는 다음 단계에서 하므로 이번에 만들지 마라.

질문하지 말고 끝까지 완성하고, npm run build가 통과할 때까지 스스로 고쳐라.

────────────────────────────────
[0] 전제 조건
────────────────────────────────
- 프로젝트 루트에 .env.local 파일이 이미 있다. 아래 키가 들어 있다:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET_NAME
  NEXT_PUBLIC_R2_PUBLIC_URL
  ADMIN_PASSWORD
  TELEGRAM_BOT_TOKEN (지금은 비어 있음)
  TELEGRAM_CHAT_ID (지금은 비어 있음)

★ .env.local 파일의 값을 절대 읽어서 출력하지 마라. 로그에도 찍지 마라.
★ .gitignore에 .env* 가 포함돼 있는지 확인하고, 없으면 추가하라.
★ .env.local.example 파일을 만들어 키 이름만 적고 값은 비워둬라.
  (이건 깃허브에 올라가도 되는 파일이다)

────────────────────────────────
[1] 추가 패키지
────────────────────────────────
아래 3개만 설치하라. 그 외 UI 키트·상태관리 라이브러리는 설치 금지.
  @supabase/supabase-js
  @aws-sdk/client-s3
  sharp

────────────────────────────────
[2] 데이터베이스 스키마
────────────────────────────────
supabase/schema.sql 파일을 만들어 아래 테이블 생성 SQL을 작성하라.
(내가 Supabase SQL Editor에 직접 붙여넣어 실행할 것이다. 실행은 네가 하지 마라.)

products 테이블:
  id                uuid primary key default gen_random_uuid()
  slug              text unique not null        -- URL용. 영문 소문자+하이픈
  name              text not null
  brand_slug        text
  category_slug     text not null
  sub_category_slug text
  price             integer not null
  original_price    integer                      -- 할인 전 가격
  summary           text
  origin            text                         -- 원산지
  manufacturer      text                         -- 제조사
  gender            text default 'women'         -- women | men | unisex
  season            text
  thumbnails        jsonb default '[]'           -- 이미지 URL 배열
  options           jsonb default '[]'           -- [{name, values[], soldOutValues[]}]
  detail_blocks     jsonb default '[]'           -- 상세 본문 블록 배열
  measurements      jsonb default '[]'           -- [{label, value}]
  is_new            boolean default false
  is_sale           boolean default false
  is_sold_out       boolean default false
  is_visible        boolean default true         -- 전시 여부
  free_shipping     boolean default false
  display_order     integer default 0            -- 진열 순서. 작을수록 앞
  created_at        timestamptz default now()
  updated_at        timestamptz default now()

인덱스: category_slug, brand_slug, is_visible, display_order

detail_blocks의 형태는 기존 lib/products.ts의 DetailBlock 타입과 동일하게 유지하라:
  { type:'image', src, alt, caption? }
  { type:'text', heading?, body }
  { type:'spec', rows:[{label,value}] }

RLS는 이번 단계에서 켜지 마라. (관리자만 쓰는 단계다. 다음 단계에서 설정한다)

────────────────────────────────
[3] Supabase 연결
────────────────────────────────
- lib/supabase/client.ts  — 브라우저용. ANON_KEY 사용
- lib/supabase/server.ts   — 서버 전용. SERVICE_ROLE_KEY 사용
  ★ server.ts는 절대 클라이언트 컴포넌트에서 import되면 안 된다.
    파일 최상단에 import 'server-only' 를 넣어 실수를 막아라.
- lib/products.ts는 삭제하지 말고, DB에서 읽어오는 함수로 바꿔라:
    getProducts(filter?)  getProductBySlug(slug)  getProductsByCategory(...)
  기존 하드코딩 배열은 supabase/seed.sql로 옮겨서 초기 데이터로 넣을 수 있게 하라.
  (이것도 내가 직접 실행한다)

────────────────────────────────
[4] 프론트를 DB 기반으로 전환 — SEO 유지가 핵심
────────────────────────────────
★ 지금 전 페이지가 정적 생성(SSG)이다. DB로 옮기면서 이걸 깨뜨리지 마라.

- 상품 상세/목록/카테고리 페이지에 export const revalidate = 60 을 넣어
  ISR로 동작시켜라. HTML은 여전히 서버에서 완성된 상태로 나가야 한다.
- generateStaticParams는 DB에서 slug 목록을 읽어오도록 바꿔라.
- 관리자에서 상품을 저장/수정하면 revalidatePath()로 해당 페이지만
  즉시 다시 굽게 하라. (60초 기다릴 필요 없이 바로 반영)
- sitemap.ts도 DB에서 읽도록 변경.
- JSON-LD(Product/BreadcrumbList/Organization)는 그대로 유지하라.

검증: 빌드 후 상품 상세 HTML에 상품 설명 텍스트와 JSON-LD가
그대로 들어 있는지 직접 확인하고 결과를 보고하라.

────────────────────────────────
[5] 이미지 업로드 (R2)
────────────────────────────────
app/api/upload/route.ts 를 만들어라. 서버 전용이다.

동작:
1. 이미지 파일을 받는다 (여러 장 동시 가능)
2. sharp로 자동 최적화한다:
   - 가로 최대 1600px로 축소 (원본이 작으면 그대로)
   - webp로 변환, quality 82
   - 썸네일용 400px 버전도 함께 생성
3. R2에 업로드한다. 경로 규칙:
   products/{상품slug}/{타임스탬프}-{랜덤6자}.webp
   products/{상품slug}/thumb/{같은이름}.webp
4. NEXT_PUBLIC_R2_PUBLIC_URL을 붙인 완성 URL을 반환한다

★ 원본을 그대로 올리지 마라. 최적화 없이 3MB 이미지가 올라가면
  사이트가 느려지고 저장 용량도 빨리 찬다.
★ 업로드 전 검증: 이미지 형식만 허용(jpg/png/webp/gif), 파일당 최대 20MB
★ 삭제 API도 만들어라. app/api/upload/route.ts의 DELETE 메서드.

────────────────────────────────
[6] 관리자 로그인
────────────────────────────────
- app/admin/login/page.tsx — 비밀번호 입력 한 칸
- ADMIN_PASSWORD와 대조. 맞으면 httpOnly 쿠키 발급 (7일)
- middleware.ts로 /admin/* 전체를 보호. 미인증이면 /admin/login으로
  ★ /admin/login 자체는 예외 처리할 것
- 비밀번호를 클라이언트로 내려보내지 마라. 서버에서만 대조한다
- 로그아웃 버튼

────────────────────────────────
[7] 관리자 레이아웃
────────────────────────────────
app/admin/layout.tsx — 프론트와 완전히 분리된 레이아웃.
- 프론트의 브랜드 디자인(명조체·와인색)을 쓰지 마라.
  관리자는 실용 위주다. 시스템 폰트, 밝은 배경, 명확한 대비.
- 좌측 사이드바 + 우측 콘텐츠
- 사이드바 메뉴 (이번 단계에 만드는 것만):
    상품 관리
    (분류 관리 / 설정 — 다음 단계, 회색 비활성으로 표시만)
- 모바일에서도 쓸 수 있게 반응형으로. 폰으로 급하게 품절 처리하는 일이 생긴다.

────────────────────────────────
[8] 상품 목록 (/admin/products) — 관리자 첫 화면
────────────────────────────────
- 테이블: 썸네일 · 상품명 · 브랜드 · 카테고리 · 가격 · 진열순서 · 상태
- 검색: 상품명·브랜드
- 필터: 카테고리, 노출/숨김, 품절
- ★ 목록에서 바로 수정 가능한 항목 (상세 진입 없이 즉시 저장):
    가격 · 품절 토글 · 노출 토글 · 진열순서 숫자
- 각 행에 [수정] [복제] [삭제] 버튼
  · 복제: 모든 값을 그대로 복사하고 상품명 뒤에 " (사본)",
    slug 뒤에 "-copy" 를 붙여 새 상품 생성. 이미지도 그대로 참조.
  · 삭제: 확인 창 필수
- 페이지네이션 20개씩

────────────────────────────────
[9] 상품 등록/수정 (/admin/products/new, /admin/products/[id])
────────────────────────────────
한 화면에 아래 섹션을 세로로 배치하라.

1) 기본 정보
   상품명 / slug(자동생성, 수정가능) / 브랜드(선택) /
   대분류·소분류(연동 선택) / 판매가 / 할인전 가격 /
   한줄 설명 / 원산지 / 제조사 / 성별 / 시즌
   뱃지 체크: 신상품 · 세일 · 품절
   전시: 노출 / 숨김
   배송비: 무료 / 유료
   진열순서

2) 대표 이미지
   - 드래그 앤 드롭으로 여러 장 한 번에 업로드
   - 업로드 중 진행률 표시
   - 썸네일 격자로 표시, 드래그해서 순서 변경
   - 첫 번째가 대표 이미지 (뱃지 표시)
   - 각 이미지에 삭제 버튼

3) 옵션
   - 옵션 사용 ON/OFF 토글
   - ON이면 옵션 그룹 추가 가능:
       옵션명 입력 (예: 컬러) + 옵션값 여러 개 (예: 블랙, 아이보리)
       각 옵션값 옆에 품절 체크박스
   - 옵션 그룹은 여러 개 추가 가능 (컬러 + 사이즈)

4) 실측 사이즈
   - 항목명 + 값 쌍을 자유롭게 추가 (어깨 44cm 등)
   - 행 추가/삭제

5) 상세 편집기 ★ 이 화면의 핵심
   - 상단에 [+ 이미지] [+ 문구] [+ 표] 버튼
   - 추가된 블록이 세로로 쌓인다
   - 각 블록: 좌측에 드래그 핸들(순서 변경), 우측에 삭제 버튼
   - 이미지 블록: 드래그 업로드 + alt 입력칸 + 캡션 입력칸
     ★ alt는 비어 있으면 저장 시 경고를 띄워라. SEO에 중요하다.
   - 문구 블록: 소제목(선택) + 본문. 본문은 간단 편집기:
       굵게 · 줄바꿈 · 링크 · 정렬(좌/중/우) 만 지원.
       표나 폰트 크기 같은 고급 기능은 넣지 마라.
   - 표 블록: 항목/값 행 추가·삭제
   - ★ 문구 템플릿 기능:
       자주 쓰는 문구(소재 관리법, 배송 안내 등)를 저장해두고
       클릭 한 번으로 문구 블록에 삽입. 템플릿은 DB 테이블로 관리
       (templates 테이블: id, title, body, created_at)

6) 하단 고정 바
   [미리보기] [저장] [저장 후 계속]
   - 미리보기: 새 탭에서 실제 상품 상세 화면으로 확인.
     아직 저장 안 된 상태도 볼 수 있어야 한다 (임시 저장 방식)
   - 저장 시 revalidatePath로 프론트 즉시 반영
   - 저장 안 하고 페이지를 벗어나면 경고

────────────────────────────────
[10] 빌드 안전
────────────────────────────────
- 'use client' 경계 주의. 관리자 화면은 대부분 클라이언트 컴포넌트다.
  서버 전용 코드(SERVICE_ROLE_KEY 사용)가 클라이언트로 새지 않게 하라.
- 환경변수 누락 시 빌드가 죽지 않게 방어 코드를 넣되,
  런타임에 명확한 에러 메시지를 보여줘라.
- 타입은 lib/types.ts에 모아라. any 남발 금지.
- npm run build 성공 기준:
    종료코드 0 / "Generating static pages (N/N)" 출력 /
    "Failed to compile" 또는 "Type error" 한 줄도 없을 것

────────────────────────────────
[11] 마지막 출력
────────────────────────────────
작업 후 한국어로 알려줘라:
1) supabase/schema.sql 을 어디에 어떻게 붙여넣어 실행하는지 (단계별로)
2) 관리자 페이지 접속 주소와 로그인 방법
3) 첫 상품을 등록하는 순서
4) 이번 단계에서 만들지 않은 것 (다음 단계 예정 목록)

지금 바로 시작하라. 질문하지 말고 끝까지 완성하라.
