# JZL CLOSET

제이진엘 클로젯 — 편안함에 감성을 더하다.
의류·가방·슈즈·액세서리를 소개하는 브랜드 편집숍 사이트입니다.

Next.js 14 (App Router) · TypeScript · Tailwind CSS v3 로 만들었고,
외부 DB·백엔드·환경변수 없이 모든 페이지를 정적 생성(SSG)합니다.

## 로컬에서 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 정적 생성 (57개 페이지)
npm start        # 빌드 결과 확인
```

## 배포

GitHub 저장소를 Vercel에서 New Project → Import → Deploy 하면 추가 설정 없이 배포됩니다.
배포 도메인이 정해지면 `lib/store.ts` 의 `SITE_URL` 을 실제 주소로 바꿔주세요.
(사이트맵·JSON-LD·OG 태그가 이 값을 사용합니다.)

## 무엇을 어디서 고치나

| 하고 싶은 일 | 파일 |
|---|---|
| 상품 추가 · 가격 변경 · 상세 문구 수정 | `lib/products.ts` |
| 카테고리 추가 · 이름 변경 · 순서 · 숨김 | `lib/categories.ts` |
| 브랜드 추가 · 이름 변경 | `lib/brands.ts` |
| 브랜드명 · 전화번호 · 사업자 정보 · 스토리 | `lib/store.ts` |
| 색상 (ink/paper/stone/muted/wine) | `tailwind.config.ts` + `app/globals.css` |
| 폰트 (CDN @import) | `app/globals.css` 최상단 |

### label 과 slug

`lib/categories.ts` 와 `lib/brands.ts` 의 항목은 화면 글자와 주소를 분리해 둡니다.

- `label` — 화면에 보이는 글자입니다. 한글·영문 자유롭게 바꿔도 됩니다.
- `slug` — 주소에 쓰입니다. **절대 바꾸지 마세요.** 바꾸면 검색 순위가 초기화됩니다.
- `nameKo` — h1 제목과 메타데이터 전용입니다.

`isVisible: false` 로 두면 메뉴·사이트맵·라우트에서 빠지고 데이터는 남습니다.
나중에 `true` 로 되돌리면 그대로 살아납니다.

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
