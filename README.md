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

## Supabase SQL 실행 순서

Supabase 대시보드 > SQL Editor 에 아래 순서로 한 번씩 실행합니다. 여러 번 실행해도 안전합니다.

1. `supabase/schema.sql` — 상품 · 문구 템플릿
2. `supabase/settings.sql` — 사이트 설정(site_settings)
3. `supabase/schema-1b.sql` — 분류(categories) · 브랜드(brands)
4. `supabase/seed-1b.sql` — 기존 코드에 있던 분류·브랜드 데이터를 DB 로 옮기기

3·4번을 실행하기 전에도 사이트는 정상 동작합니다.
테이블이 없거나 비어 있으면 `lib/categories.ts` · `lib/brands.ts` 의 폴백 값을 씁니다.

## 무엇을 어디서 고치나

거의 모든 운영 작업은 **관리자 화면(`/admin`)** 에서 합니다.

| 하고 싶은 일 | 어디서 |
|---|---|
| 상품 등록 · 가격 · 옵션 · 재고 · 상세 | 관리자 > 상품 관리 |
| 대분류 · 소분류 추가 · 순서 · 노출 | 관리자 > 분류 관리 |
| 브랜드 추가 · 스토리 · 대표 이미지 | 관리자 > 브랜드 관리 |
| 메인 배너 · 사이트 문구(약관·안내·404) | 관리자 > 디자인 관리 |
| 브랜드명 · 고객센터 · 사업자 정보 | 관리자 > 설정 > 스토어 정보 |
| 파비콘 · 로고 | 관리자 > 설정 > 브랜딩 |
| 배송비 · 무료배송 기준 · 반품 주소 | 관리자 > 설정 > 배송·반품 |
| 상품 전체 CSV 내려받기 | 관리자 > 설정 > 데이터 내보내기 |
| GA4 측정 ID | 관리자 > 설정 > 분석(GA4) |
| 색상 (ink/paper/stone/muted/wine) | `tailwind.config.ts` + `app/globals.css` |
| 폰트 (CDN @import) | `app/globals.css` 최상단 |
| 배포 주소 | `lib/store.ts` 의 `SITE_URL` |

### label 과 slug

분류·브랜드는 화면 글자와 주소를 분리해 둡니다.

- `label` — 화면에 보이는 글자입니다. 한글·영문 자유롭게 바꿔도 됩니다.
- `slug` — 주소에 쓰입니다. **등록 후에는 바꿀 수 없습니다.** (관리자에서 입력칸을 잠가 둡니다)
  바꾸면 검색 색인이 초기화되기 때문입니다.
- `nameKo` — h1 제목과 메타데이터 전용입니다.

노출을 끄면 메뉴·사이트맵·라우트에서 빠지고 데이터는 남습니다. 다시 켜면 그대로 살아납니다.

### 모음 카테고리

`slug` 가 `all` 인 분류는 전체 상품을, `sale` 인 분류는 세일 상품을 자동으로 모아 보여 줍니다.
(별도 컬럼 없이 slug 약속으로 처리합니다.)

## 상품 이미지

```
public/images/products/{상품id}/01.jpg, 02.jpg, 03.jpg ...
```

`01.jpg` 는 목록 카드 기본 이미지, `02.jpg` 는 마우스를 올렸을 때 바뀌는 이미지입니다.
각 폴더의 `README.txt` 에 규격과 넣는 방법을 적어 두었습니다.
이미지가 없어도 사이트는 정상 동작하며 회색 자리표시자가 표시됩니다.

## 주문 방식

온라인 결제 기능은 제공하지 않습니다.
장바구니(브라우저 localStorage)에 담은 내역을 복사해 고객센터로 보내면 접수되는 문의형 주문입니다.
