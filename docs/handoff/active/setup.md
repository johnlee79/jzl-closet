# JZL CLOSET 설치·연결 참조

적용 범위: 로컬 실행·기존 배포·가져오기·SQL·인증 설정
이 문서는 현재 업무 지시가 아닌 활성 작업 규칙이다. 해당 작업의 현재 승인 범위를 확인한 뒤 필요한 절만 읽는다. 시작 시 일괄 로드하지 않는다. 날짜가 있는 실측·설정·예시는 그 날짜의 근거이며 지금 상태는 재확인한다.

# JZL CLOSET

제이진엘 클로젯 — 편안함에 감성을 더하다.
의류·가방·슈즈·액세서리를 소개하는 브랜드 편집숍 사이트입니다.

Next.js 14 (App Router) · TypeScript · Tailwind CSS v3 · Supabase · Cloudflare R2.
상품·분류·브랜드·설정·문구를 관리자 화면에서 고치고, 프론트는 ISR 로 굽습니다.

## 로컬에서 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드
npm start        # 빌드 결과 확인
```

## 배포

GitHub 저장소를 Vercel에서 New Project → Import → Deploy 하면 추가 설정 없이 배포됩니다.
배포 도메인이 정해지면 `lib/store.ts` 의 `SITE_URL` 을 실제 주소로 바꿔주세요.
(사이트맵·JSON-LD·OG 태그가 이 값을 사용합니다.)

환경변수는 `.env.local` 에 있는 값을 Vercel Project → Settings → Environment Variables 에 그대로 넣습니다. 특히 `CRON_SECRET` 은 입금대기 자동취소(`/api/cron/auto-cancel`)를 여는 열쇠라, 빠뜨리면 빌드는 되지만 자동취소가 영영 돌지 않습니다.

`vercel.json` 의 크론은 **Hobby 플랜 제약(하루 1회)** 에 맞춰 `0 19 * * *` (UTC 19시 = 한국시간 새벽 4시)로 두었습니다. `*/10 * * * *` 로 두면 배포 자체가 거부됩니다. **Pro 로 전환하면 10분 주기로 되돌리세요.** 그 전까지는 관리자가 주문 목록·대시보드에 들어올 때마다 기한이 지난 건을 정리하므로 실무상 문제는 없습니다.

## 셀스타 상품 가져오기

관리자 > 상품 관리 > **상품 가져오기** 에서 셀스타 상품 주소(또는 상품번호)를 넣으면 정보와 이미지를 가져옵니다.

- 셀스타 API 는 브라우저에서 바로 부를 수 없어(CORS) 서버 라우트 `/api/admin/import/sellstar` 가 대신 부릅니다.
- 이 API 는 `Authorization: Bearer <키>` 를 요구합니다. 키가 바뀌면 `.env.local` 의 `SELLSTAR_API_KEY` 를 채워 주세요. (비워 두면 코드 안의 기본값을 씁니다)
- 이미지는 우리 R2 로 복사해 저장합니다. 셀스타에서 이미지가 바뀌거나 지워져도 상품 페이지가 깨지지 않습니다. `.gif` 는 움직임이 살아 있도록 원본 그대로 올립니다.
- 등록은 항상 **임시저장(노출 꺼짐)** 상태입니다. 확인한 뒤 상품 편집 화면에서 판매중으로 바꿔 주세요.
- 상세페이지 앞뒤에 자동으로 붙일 공통 블록과 글 템플릿은 관리자 > 설정 > **가져오기** 에서 등록합니다.

## Supabase SQL 실행 순서

Supabase 대시보드 > SQL Editor 에 아래 순서로 한 번씩 실행합니다. 여러 번 실행해도 안전합니다.

1. `supabase/schema.sql` — 상품 · 문구 템플릿
2. `supabase/settings.sql` — 사이트 설정(site_settings)
3. `supabase/schema-1b.sql` — 분류(categories) · 브랜드(brands)
4. `supabase/seed-1b.sql` — 기존 코드에 있던 분류·브랜드 데이터를 DB 로 옮기기
5. `supabase/schema-2a.sql` — 주문(orders · order_items · order_status_history)
6. `supabase/rls-2a.sql` — 주문 접근 제어(RLS)
7. `supabase/schema-2b.sql` — 회원(profiles) · 1:1 문의(inquiries) · orders.user_id
8. `supabase/rls-2b.sql` — 회원·문의 접근 제어(RLS)
9. 이어서 아래 순서로 실행합니다. **스키마를 전부 먼저, RLS 를 전부 나중에** 입니다.

   ```
   schema-3a → schema-3b → schema-3c → schema-3d → schema-3e → schema-3f
   rls-3a → rls-3b → rls-3c → rls-3f
   ```

   - `3a` 리뷰·포인트·공지·팝업
   - `3b` 가입경로·포인트 유효기간
   - `3c` 팝업 기간·입금대기 자동취소
   - `3d` 셀스타 상품 가져오기 컬럼
   - `3e` 브랜드 로고
   - `3f` 추천 코드 — 회원 코드 발급, 방문·추천 관계, 목표·사은품·달성 기록

   > **3-G 에는 새 SQL 이 없습니다.** (카카오 로그인 · 모바일 상단바 · 카카오 문의 전환 ·
   > 푸터 SNS · `/brands` · 공유 안내 문구) 새로 생긴 설정은 전부 `site_settings` 의
   > JSON 값(`sns` 키, `referral` 키의 문구 두 개)이라 표를 건드리지 않습니다.
   > 위 목록까지만 실행하시면 됩니다.

10. `supabase/schema-3k.sql` — 분류 대표 이미지 컬럼
11. `supabase/schema-4a.sql` — **카드결제(KSNET)**. 주문에 결제 정보 칸을 더하고
    결제 원문 로그(`payment_logs`)를 만듭니다.
12. `supabase/rls-4a.sql` — 결제 로그 접근 제어(RLS). **반드시 11번 다음입니다.**

   > **11번을 돌리기 전에는 카드결제를 켜지 마세요.**
   > 승인 결과를 저장할 칸이 없어 결제는 승인되는데 주문은 결제대기로 남습니다.
   > (무통장입금은 11번 전에도 지금까지처럼 정상 동작합니다)

   각 파일 맨 위 주석에 그 파일이 하는 일과 전체 순서가 적혀 있습니다.
   여러 번 실행해도 안전하며, 이미 실행한 파일을 다시 돌려도 데이터가 바뀌지 않습니다.
   **RLS 파일이 반드시 마지막입니다.**

### SQL 을 다 돌렸는지 확인하기

```
npm run check:schema
```

코드가 쓰는 컬럼·DB 함수가 실제 스키마에 다 있는지 대조합니다.
빠진 게 있으면 어느 파일의 어느 컬럼인지 알려 주고 종료 코드 1 로 끝납니다.

> 왜 따로 두는가 — 컬럼 이름이 하나 틀리면 조회가 통째로 실패하는데,
> 우리 코드는 조회 실패를 "빈 목록" 으로 넘기는 곳이 많아 화면이 깨지지 않고
> 그냥 비어 보입니다. 빌드는 이걸 잡지 못합니다. 타입에는 맞고 DB 에만 안 맞기 때문입니다.
> 실제로 `products.thumbnails` 를 `images` 라고 적어 두는 바람에
> 관리자 상품 목록이 한동안 통째로 비어 있었습니다. (건수만 맞고 목록은 0건)

3·4번을 실행하기 전에도 사이트는 정상 동작합니다.
테이블이 없거나 비어 있으면 `lib/categories.ts` · `lib/brands.ts` 의 폴백 값을 씁니다.

6·8번을 실행하면 주문·회원·문의 테이블이 `service_role` 로만 열립니다.
이 프로젝트의 서버 코드는 전부 `service_role` 을 쓰므로 사이트는 그대로 동작합니다.

## Supabase Auth 설정

회원가입·로그인은 Supabase Auth(이메일 + 비밀번호)를 씁니다.
대시보드에서 아래를 확인하세요.

| 항목 | 위치 | 권장 |
|---|---|---|
| 이메일 인증 요구 | Authentication → Sign In / Providers → Email → **Confirm email** | 켜 두면 `/signup/complete` 안내 화면을 거칩니다 |
| 구글 로그인 | Authentication → Sign In / Providers → **Google** | 활성화 + 클라이언트 ID/Secret 등록 |
| 카카오 로그인 | Authentication → Sign In / Providers → **Kakao** | 활성화 + REST API 키/Client Secret 등록 |
| 사이트 주소 | Authentication → URL Configuration → **Site URL** | 배포 주소 |
| 허용 리다이렉트 | 같은 화면 → **Redirect URLs** | `{주소}/auth/callback` 추가 |
| 메일 템플릿 | Authentication → Emails → Templates | 한국어로 다듬기 (선택) |

구글 로그인과 메일 링크 모두 `/auth/callback` 으로 들어와 세션으로 바뀐 뒤 목적지로 이동합니다.
클라이언트 ID / Secret 은 Supabase 대시보드에만 두고 코드에는 넣지 않습니다.

### 구글 로그인이 안 될 때

| 증상 | 확인할 곳 |
|---|---|
| `redirect_uri_mismatch` | Google Cloud → 사용자 인증 정보 → OAuth 클라이언트 → **승인된 리디렉션 URI** 에 `https://<프로젝트>.supabase.co/auth/v1/callback` 이 있는지 |
| `액세스 차단됨` · 앱이 확인되지 않음 | Google Cloud → **OAuth 동의 화면** 이 테스트 중이면 **테스트 사용자**에 로그인할 계정을 추가 |
| 돌아온 뒤 로그인 안 됨 | Supabase → URL Configuration → **Redirect URLs** 에 `{배포주소}/auth/callback` 이 있는지 |
| `?error=profile` 로 돌아옴 | `supabase/schema-2b.sql` 을 실행했는지 (profiles 테이블) |

### 카카오 로그인이 안 될 때

| 증상 | 확인할 곳 |
|---|---|
| `KOE205` · "서비스 설정에 오류가 있어 이용할 수 없습니다" | 카카오 개발자 콘솔 → 카카오 로그인 → **동의항목** 에 **프로필 사진**이 켜져 있는지 |
| `KOE006` · redirect_uri 불일치 | 카카오 콘솔 → 카카오 로그인 → **Redirect URI** 에 `https://<프로젝트>.supabase.co/auth/v1/callback` 이 있는지 |
| 돌아온 뒤 로그인 안 됨 | Supabase → URL Configuration → **Redirect URLs** 에 `{배포주소}/auth/callback` 이 있는지 |

> **프로필 사진 동의항목이 왜 필요한가** — 우리가 쓰는 값은 닉네임과 이메일뿐입니다.
> 그런데 Supabase 는 카카오에 늘 `account_email profile_image profile_nickname` 을 요청합니다.
> 코드에서 `scopes` 를 넘겨도 그것으로 **바뀌지 않고 뒤에 덧붙기만** 해서 사진 요청을 뺄 수 없습니다.
> 카카오는 콘솔에 없는 동의항목을 요청받으면 동의 화면 대신 KOE205 를 돌려줍니다.
> 그래서 콘솔에서 프로필 사진을 켜 두어야 합니다. (받아 온 사진은 저장하지 않습니다)

소셜 계정은 연락처를 주지 않습니다. `profiles.phone` 이 비어 있으면 헤더 아래와
마이페이지 상단에 연락처 입력 안내가 뜹니다. (닫아도 연락처를 넣을 때까지 다시 나타납니다)
