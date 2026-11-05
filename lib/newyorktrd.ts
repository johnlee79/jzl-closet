import 'server-only';

import type { OptionGroup } from '@/lib/types';

/**
 * 뉴욕트렌딕(newyorktrd.co.kr · cafe24) 상품 가져오기.
 *
 * ★ 셀스타와 결정적으로 다른 점
 *   셀스타는 JSON API 지만 뉴욕트렌딕은 공개 API 가 없어 HTML 을 긁습니다.
 *   그래서 뉴욕트렌딕이 화면 디자인을 바꾸면 그날로 깨집니다. 깨질 때는
 *   "가격을 찾지 못했습니다 (판매가 자리가 비어 있음)" 처럼 **무엇을 못 찾았는지**
 *   화면에 그대로 나오게 warnings 로 돌려줍니다. (newyorktrd-import-v2.md 2번)
 *
 * ★ 데이터 출처
 *   - 상품명·브랜드 → JSON-LD (ProductGroup) 가 가장 깨끗합니다.
 *   - 판매가        → <meta property="product:price:amount">
 *   - 소비자가(정가) → #span_product_price_custom 안의 글자
 *   - 대표 이미지    → .xans-product-addimage 안의 <li><img>
 *   - 상세 이미지    → #prdDetailContent 안의 ec-data-src (cafe24 lazy)
 *   - 옵션          → <select>·<option> — 라벨 안에 [품절]·(+N,000원) 가 섞여 있음
 *
 * ★ JSON-LD 의 품절 정보를 쓰지 않는 이유
 *   세 시험 상품 전부 variants.offers.availability 가 InStock 으로만 왔는데
 *   실제 HTML 옵션에는 [품절] 이 섞여 있었습니다. JSON-LD 는 참고용으로만
 *   쓰고 품절은 HTML 라벨만 봅니다.
 */

/* ------------------------------------------------------------------
 * 쇼핑몰 — 뉴욕트렌딕 · 에르스한 (2026-11-05)
 *
 * ★ 둘 다 카페24 쇼핑몰이라 파서를 같이 씁니다. 다른 부분만 여기 설정으로 갈라집니다.
 *   에르스한 조사 (product_no 33·12·76·145·161) 에서 다른 점:
 *   · 대표 이미지 — 뉴욕은 .xans-product-addimage 안의 <ul><li>, 에르스한은
 *     #prdThumbView 안에 슬라이드(div) 가 한 장씩. (gallery: 'slides')
 *   · 상세 — 뉴욕은 #prdDetailContent + ec-data-src(lazy), 에르스한은
 *     #prdDetail > .detail-content + 그냥 src. readDetailBlocks 가 둘 다 받습니다.
 *   · 옵션 — 에르스한은 「색상」「사이즈」 를 따로 고르는 상품이 있습니다 (select 두 개).
 *     이때는 HTML 에 조합이 없어서 option_stock_data (카페24 가 페이지에 넣는 JSON) 로 읽습니다.
 *   · 배너 — 에르스한 상세 앞뒤의 mgtop_01.gif · mgtop_{브랜드}_01.jpg · bottom_01.jpg
 *     (theplanet.hgodo.com/mogli/). 실제 상세는 mg_d25.jpg · /clothes/nw_d217.jpg 같은 이름.
 * ------------------------------------------------------------------ */

export type Cafe24ShopKey = 'newyorktrd' | 'aershan';

type Cafe24Shop = {
  key: Cafe24ShopKey;
  /** 화면·오류 문구에 쓰는 이름 */
  label: string;
  base: string;
  /** 주소에 이 글자가 있으면 이 쇼핑몰 */
  hostPattern: RegExp;
  /** 번호만 쓸 때 앞에 붙이는 표시 — 「nyt 26」 · 「에르스한 33」 */
  prefixPattern: RegExp;
  /** og:title 꼬리표 — 「 - 뉴욕트렌딕 (newyorktrendique)」 · 「 - 에르스한」 */
  titleSuffix: RegExp;
  gallery: 'list' | 'slides';
  /** 상세 이미지 파일 이름이 이 쇼핑몰의 로고·배너인지 */
  isBanner: (basename: string) => boolean;
};

const SHOPS: Record<Cafe24ShopKey, Cafe24Shop> = {
  newyorktrd: {
    key: 'newyorktrd',
    label: '뉴욕트렌딕',
    base: 'https://newyorktrd.co.kr',
    hostPattern: /newyorktrd/i,
    prefixPattern: /^(?:nyt|뉴욕트렌딕|뉴욕|n[:：])\s*(\d+)$/i,
    titleSuffix: /\s*-\s*뉴욕트렌딕[^]*$/i,
    gallery: 'list',
    isBanner: (basename) => {
      // 브랜드 모음전 네비 배너: nt_stussy01, nt_polp02, nt_ami_top, nt_ami_op, ...
      //   단, nt_ami_d01 처럼 _d\d+ 가 붙은 실제 상세 이미지는 배너가 아닙니다.
      if (/^nt_/i.test(basename) && !/_d\d+/i.test(basename)) return true;
      // 공통 top/bottom 배너
      if (/^(top|bottom)_\d+/i.test(basename)) return true;
      // 브랜드별 헤더 배너: polotop_02.jpg, stussytop_03_01.jpg
      if (/[a-z]+top_\d+/i.test(basename)) return true;
      return false;
    },
  },
  aershan: {
    key: 'aershan',
    label: '에르스한',
    base: 'https://aershan.co.kr',
    hostPattern: /aershan/i,
    prefixPattern: /^(?:aershan|에르스한|ers|a[:：])\s*(\d+)$/i,
    titleSuffix: /\s*-\s*에르스한[^]*$/i,
    gallery: 'slides',
    isBanner: (basename) => {
      // 상단 공통 gif · 브랜드 머리 배너: mgtop_01.gif · mgtop_stussy_01.jpg · mgtop_bp_01.jpg
      if (/^mgtop_/i.test(basename)) return true;
      // 하단 공통 배너: bottom_01.jpg
      if (/^(top|bottom)_\d+/i.test(basename)) return true;
      return false;
    },
  },
};

export function cafe24ShopLabel(key: Cafe24ShopKey): string {
  return SHOPS[key].label;
}

/**
 * 입력이 어느 카페24 쇼핑몰 쪽인지. 둘 다 아니면 null (→ 셀스타).
 *   주소에 newyorktrd / aershan 이 있거나, 번호 앞에 표시(nyt 26 · 에르스한 33) 가 붙은 경우.
 */
export function detectCafe24Shop(input: string): Cafe24ShopKey | null {
  const text = (input ?? '').trim();
  if (!text) return null;
  for (const shop of Object.values(SHOPS)) {
    if (shop.hostPattern.test(text) || shop.prefixPattern.test(text)) return shop.key;
  }
  return null;
}

/**
 * 입력값에서 카페24 상품번호를 뽑습니다. 두 쇼핑몰 주소 모양이 같습니다.
 *   …/product/detail.html?product_no=26  → 26
 *   …/product/스투시-.../26/category/1/   → 26
 *   nyt 26 · 뉴욕 26 · 에르스한 33        → 26 · 26 · 33
 * 알아볼 수 없으면 0.
 */
export function parseCafe24ProductNo(input: string, shopKey: Cafe24ShopKey): number {
  const text = (input ?? '').trim();
  if (!text) return 0;

  // product_no=... 쿼리
  const query = /[?&]product_no=(\d+)/.exec(text);
  if (query) return Number(query[1]);

  // /product/슬러그/{번호}/
  const path = /\/product\/[^/]+\/(\d+)(?:\/|$|\?)/.exec(text);
  if (path) return Number(path[1]);

  // 접두어 + 번호
  const prefix = SHOPS[shopKey].prefixPattern.exec(text);
  if (prefix) return Number(prefix[1]);

  return 0;
}

export function cafe24ProductUrl(shopKey: Cafe24ShopKey, id: number): string {
  return `${SHOPS[shopKey].base}/product/detail.html?product_no=${id}`;
}

/* ------------------------------------------------------------------
 * 뉴욕트렌딕 전용 이름 (예전 그대로 — 후기 가져오기가 씁니다)
 * ------------------------------------------------------------------ */

export function parseNewyorktrdId(input: string): number {
  return parseCafe24ProductNo(input, 'newyorktrd');
}

/** 운영자가 넣은 입력이 뉴욕트렌딕 쪽인지 판단합니다. */
export function isNewyorktrdInput(input: string): boolean {
  return detectCafe24Shop(input) === 'newyorktrd';
}

/** 상품번호로 원본 상세 주소를 만듭니다. */
export function newyorktrdUrl(id: number): string {
  return cafe24ProductUrl('newyorktrd', id);
}

/* ------------------------------------------------------------------
 * 결과 모양 — 셀스타 파서와 똑같이 맞춥니다 (newyorktrd-import-v2.md 4-1)
 * ------------------------------------------------------------------ */

export type NewyorktrdImage = {
  url: string;
  width: number;
  height: number;
};

export type NewyorktrdBlock =
  | {
      kind: 'image';
      url: string;
      /** 로고·배너·네비게이션 이미지 — 기본으로 체크 해제됩니다 (리셀러와 같은 자리) */
      reseller: boolean;
      gif: boolean;
    }
  | { kind: 'text'; body: string };

export type NewyorktrdVariant = {
  key: string;
  label: string;
  stock: number | null;
  soldOut: boolean;
  /** 옵션별 추가금 (+N원). 기본 0. */
  extraPrice: number;
  price: number;
};

export type NewyorktrdProduct = {
  /** 어느 카페24 쇼핑몰인지 — products.source 에 그대로 저장됩니다 */
  source: Cafe24ShopKey;
  /** 그 쇼핑몰의 상품번호 (이름은 예전 그대로 — 에르스한 상품도 이 자리) */
  newyorktrdId: number;
  sourceUrl: string;
  name: string;
  /** 소비자가 (참고용) */
  price: number;
  /** 판매가 (참고용) */
  salePrice: number;
  /** 뉴욕트렌딕에 적힌 브랜드 이름 — 자동 매칭 힌트 */
  brandName: string;
  mainImage: NewyorktrdImage | null;
  gallery: NewyorktrdImage[];
  blocks: NewyorktrdBlock[];
  optionGroups: OptionGroup[];
  variants: NewyorktrdVariant[];
  warnings: string[];
};

export class NewyorktrdError extends Error {}

/* ------------------------------------------------------------------
 * 자잘한 도구
 * ------------------------------------------------------------------ */

function toAbsoluteUrl(url: string, base: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // http → https 로 올립니다. (고정 자원이라 둘 다 열립니다)
    return trimmed.replace(/^http:/, 'https:');
  }
  if (trimmed.startsWith('/')) return `${base}${trimmed}`;
  return trimmed;
}

/** 뉴욕트렌딕 상품 썸네일 주소를 가장 큰 /big/ 로 바꿉니다. */
function toBigImage(url: string): string {
  return url.replace(/\/(?:tiny|small|medium)\//, '/big/');
}

/** 상품 상세 안의 이미지 — 로고/배너로 보이는 이미지를 걸러냅니다 (쇼핑몰마다 규칙이 다름). */
function looksLikeBanner(url: string, shop: Cafe24Shop): boolean {
  const basename = (url.split('/').pop() ?? '').split('?')[0];
  return shop.isBanner(basename);
}

export function isGifUrl(url: string): boolean {
  return /\.gif(\?|#|$)/i.test(url);
}

/** 상품 상세에 넣기엔 부적절한 UI 리소스 (아이콘·로고·외부 추적 등) */
function isSystemAsset(url: string): boolean {
  if (!url) return true;
  if (/^about:blank$/i.test(url)) return true;
  if (/facebook\.com\/tr/i.test(url)) return true;
  if (/img\.echosting\.cafe24\.com/i.test(url)) return true;
  if (/\/0_img\//i.test(url)) return true;
  if (/\/morenvyimg\//i.test(url)) return true;
  if (/\/web\/upload\/icon_/i.test(url)) return true;
  return false;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/** 숫자 추출 — "259,000원" → 259000, "67900" → 67900 */
function parseMoney(text: string): number {
  const digits = (text ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/* ------------------------------------------------------------------
 * HTML 받아오기
 * ------------------------------------------------------------------ */

async function fetchHtml(url: string, label: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        // ★ 뉴욕트렌딕과 사전 승인된 통합이지만 User-Agent 는 평범한 브라우저 값을
        //   그대로 씁니다. 서버 쪽에서 환영받지 못하는 UA 는 공지 없이 막는 경우가 있어서입니다.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    throw new NewyorktrdError(
      `${label}에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요. (${
        error instanceof Error ? error.message : '네트워크 오류'
      })`
    );
  }

  if (response.status === 403 || response.status === 429) {
    // 승인된 사이라 사람인 척 꾸미지 않고 멈춥니다. (명세 3-④)
    throw new NewyorktrdError(
      `${label} 쪽에서 요청을 막았습니다 (HTTP ${response.status}). ` +
        `시간을 두고 다시 시도하거나, ${label}에 서버 주소 허용을 요청해 주세요.`
    );
  }
  if (!response.ok) {
    throw new NewyorktrdError(`${label} 응답 오류입니다. (HTTP ${response.status})`);
  }

  return response.text();
}

/* ------------------------------------------------------------------
 * JSON-LD 블록 꺼내기 — 브랜드·이름 참고용
 * ------------------------------------------------------------------ */

type JsonLdVariant = {
  '@type'?: string;
  name?: string;
  color?: string;
  size?: string;
  brand?: { name?: string };
  offers?: { price?: number | string; availability?: string };
};
type JsonLdProductGroup = {
  '@type'?: string;
  name?: string;
  variesBy?: string[];
  hasVariant?: JsonLdVariant[];
};

function readJsonLd(html: string): JsonLdProductGroup | null {
  // ★ 이 프로젝트의 컴파일 설정에서는 String.prototype.matchAll 반환값을 바로
  //   스프레드할 수 없습니다 (lib/sellstar.ts 와 같은 사유). exec 루프를 돕니다.
  const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1]);
  }

  for (const raw of blocks) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (
          item &&
          typeof item === 'object' &&
          (item as JsonLdProductGroup)['@type'] === 'ProductGroup'
        ) {
          return item as JsonLdProductGroup;
        }
      }
    } catch {
      // JSON-LD 파싱 실패는 조용히 넘어갑니다. HTML 쪽을 끝까지 믿어 봅니다.
    }
  }
  return null;
}

/* ------------------------------------------------------------------
 * HTML 조각 뽑기
 * ------------------------------------------------------------------ */

function readMeta(html: string, property: string): string {
  const regex = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  return regex.exec(html)?.[1]?.trim() ?? '';
}

/** og:title 뒤에 붙는 " - 뉴욕트렌딕 (newyorktrendique)" · " - 에르스한" 꼬리표를 뗍니다. */
function cleanName(name: string, shop: Cafe24Shop): string {
  return name
    .replace(shop.titleSuffix, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 갤러리 (.xans-product-addimage) 안의 모든 이미지 — main + extra 를 순서대로 */
function readGallery(html: string, shop: Cafe24Shop): NewyorktrdImage[] {
  if (shop.gallery === 'slides') return readGallerySlides(html, shop);
  const match = html.match(
    /class="[^"]*xans-product-addimage[^"]*"[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/
  );
  if (!match) return [];
  const inner = match[1];
  const regex = /<img[^>]+src=["']([^"']+)["']/g;
  const urls: string[] = [];
  let item: RegExpExecArray | null;
  while ((item = regex.exec(inner)) !== null) {
    const abs = toBigImage(toAbsoluteUrl(item[1], shop.base));
    if (/\/web\/product\/(?:extra\/)?big\//.test(abs)) urls.push(abs);
  }
  const uniq = Array.from(new Set(urls));
  return uniq.map((url) => ({ url, width: 0, height: 0 }));
}

/**
 * 에르스한 — #prdThumbView 안에 슬라이드가 한 장씩 (<ul> 이 없습니다).
 *   첫 슬라이드 = 대표(big), 뒤로 .xans-product-addimage 슬라이드 (big · extra/big).
 *   끝은 좋아요 버튼(.likeButton) · .pagination — 그 뒤는 알파리뷰·추천상품이라 끊습니다.
 * ★ 이미지는 ecimg.cafe24img.com (카페24 CDN) 에 있고 big 만 열립니다 (medium 은 403).
 */
function readGallerySlides(html: string, shop: Cafe24Shop): NewyorktrdImage[] {
  const start = html.indexOf('id="prdThumbView"');
  if (start < 0) return [];
  const ends = ['class="likeButton', 'class="pagination"', 'class="infoArea']
    .map((marker) => html.indexOf(marker, start))
    .filter((index) => index > start);
  const end = ends.length > 0 ? Math.min(...ends) : start + 20000;
  const chunk = html.slice(start, end);
  const regex = /<img[^>]+src=["']([^"']+)["']/g;
  const urls: string[] = [];
  let item: RegExpExecArray | null;
  while ((item = regex.exec(chunk)) !== null) {
    const abs = toBigImage(toAbsoluteUrl(item[1], shop.base));
    if (/\/web\/product\/(?:extra\/)?big\//.test(abs)) urls.push(abs);
  }
  return Array.from(new Set(urls)).map((url) => ({ url, width: 0, height: 0 }));
}

/**
 * 상세 영역의 블록들 — 이미지와 글을 순서대로
 *   뉴욕트렌딕: #prdDetailContent (그 뒤 200KB)
 *   에르스한:   #prdDetail > .detail-content — #prdReview (후기 영역) 앞에서 끊습니다.
 */
function readDetailBlocks(html: string, shop: Cafe24Shop): NewyorktrdBlock[] {
  let chunk: string;
  const start = html.indexOf('id="prdDetailContent"');
  if (start >= 0) {
    // 상세 영역 끝은 다음 anchor 또는 리뷰 영역입니다. 보수적으로 200KB 만 봅니다.
    chunk = html.slice(start, start + 200000);
  } else {
    const outer = html.indexOf('id="prdDetail"');
    if (outer < 0) return [];
    const inner = html.indexOf('class="detail-content"', outer);
    if (inner < 0) return [];
    const review = html.indexOf('id="prdReview"', inner);
    chunk = html.slice(inner, review > inner ? review : inner + 200000);
  }

  // 이미지 — ec-data-src 가 있는 <img> 와 그렇지 않은 <img> 둘 다 모읍니다.
  const blocks: NewyorktrdBlock[] = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(chunk)) !== null) {
    const tag = match[0];
    const ecSrc = /ec-data-src=["']([^"']+)["']/i.exec(tag)?.[1];
    const plainSrc = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    const raw = (ecSrc || plainSrc || '').trim();
    if (!raw) continue;
    const abs = toAbsoluteUrl(raw, shop.base);
    if (isSystemAsset(abs)) continue;
    // 1x1 placeholder 등 매우 짧은 data URI 는 통과시키지 않습니다.
    if (abs.startsWith('data:')) continue;
    blocks.push({
      kind: 'image',
      url: abs,
      reseller: looksLikeBanner(abs, shop),
      gif: isGifUrl(abs),
    });
  }

  // 같은 주소가 여러 번 나오면 한 번만 넣습니다. (lazy 플레이스홀더 처리)
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (block.kind !== 'image') return true;
    if (seen.has(block.url)) return false;
    seen.add(block.url);
    return true;
  });
}

/* ------------------------------------------------------------------
 * 옵션 — <select><optgroup><option> 을 읽습니다.
 * 세 상품 모두 "색상-사이즈" 처럼 묶인 한 그룹의 flat select 를 썼습니다.
 * ------------------------------------------------------------------ */

type RawOption = {
  value: string;
  text: string;
};

function readOptionsBlock(html: string): string | null {
  const start = html.search(/product_option_area=/);
  if (start < 0) return null;
  const end = html.indexOf('</select>', start);
  if (end < 0) return null;
  return html.slice(start, end + '</select>'.length);
}

function readOptgroups(block: string): { label: string; options: RawOption[] }[] {
  const groups: { label: string; options: RawOption[] }[] = [];
  const regex = /<optgroup\s+label=["']([^"']+)["'][^>]*>([\s\S]*?)<\/optgroup>/gi;
  let match;
  while ((match = regex.exec(block)) !== null) {
    const label = decodeHtmlEntities(match[1]).trim();
    const inner = match[2];
    const options = readOptions(inner);
    if (options.length > 0) groups.push({ label, options });
  }
  if (groups.length === 0) {
    // optgroup 없이 바로 option 이 있는 경우도 받아줍니다.
    const flat = readOptions(block);
    if (flat.length > 0) groups.push({ label: '옵션', options: flat });
  }
  return groups;
}

function readOptions(inner: string): RawOption[] {
  const regex = /<option\s+([^>]*)>([\s\S]*?)<\/option>/gi;
  const out: RawOption[] = [];
  let match;
  while ((match = regex.exec(inner)) !== null) {
    const attrs = match[1];
    const text = decodeHtmlEntities(stripTags(match[2])).trim();
    if (!text) continue;
    const valueMatch = /value=["']([^"']*)["']/i.exec(attrs);
    const value = valueMatch?.[1] ?? '';
    // "*" / "**" 는 안내 문구 ("- [필수] 옵션을 선택해 주세요 -")
    if (value === '*' || value === '**' || value === '') continue;
    out.push({ value, text });
  }
  return out;
}

/**
 * 옵션 라벨에서 가격 조정과 품절 표시를 뽑아냅니다.
 *   "11.아미 하트로고 긴팔티-S-그레이 [품절]  (+19,000원)"
 *     → key="아미 하트로고 긴팔티-S-그레이", extra=19000, soldOut=true
 *   "블랙-S" → key="블랙-S", extra=0, soldOut=false
 */
function parseOptionLabel(label: string): {
  key: string;
  extraPrice: number;
  soldOut: boolean;
} {
  // 품절 표시
  const soldOut = /\[품절\]/.test(label);
  let cleaned = label.replace(/\[품절\]/g, '').trim();

  // 추가금
  let extraPrice = 0;
  const extra = /\(\s*([+\-])\s*([\d,]+)\s*원\s*\)/.exec(cleaned);
  if (extra) {
    const sign = extra[1] === '-' ? -1 : 1;
    extraPrice = sign * parseMoney(extra[2]);
    cleaned = cleaned.replace(extra[0], '').trim();
  }

  // 앞머리 번호 (11., 2., 101.) 를 뗍니다.
  cleaned = cleaned.replace(/^\d+\s*[.·]\s*/, '').trim();

  return { key: cleaned, extraPrice, soldOut };
}

/**
 * optgroup label 이 "색상-사이즈" 같은 경우, "-" 로 나뉘지만 라벨 안에도 "-" 가
 * 들어갈 수 있어 어디서 자를지 모호합니다 (아미 모음전은 "제품명-색상-사이즈" 처럼
 * 3단계). 그래서 아래 규칙으로 가릅니다.
 *
 *   · 그룹 라벨이 "A-B-C" 처럼 n 개면 → 라벨도 뒤에서부터 n 개로 자릅니다.
 *   · 자르다 모자라면 그 그룹은 통째로 "옵션" 한 묶음으로 둡니다.
 */
function splitVariantParts(key: string, dimensionCount: number): string[] {
  if (dimensionCount <= 1) return [key];
  const parts = key.split('-').map((part) => part.trim()).filter(Boolean);
  if (parts.length < dimensionCount) return [key];
  // 뒤에서부터 dimensionCount-1 개는 그대로 두고, 앞은 묶어 둡니다.
  //   "11.아미 하트로고-긴팔티-S-그레이" dim=3 → ["11.아미 하트로고 긴팔티", "S", "그레이"]
  //   가 아니라 "-" 기준 split 이므로 "제품명" 안에 "-" 가 있으면 복원이 어렵습니다.
  //   간단하게: 뒤에서 dim-1 개를 분리하고 나머지는 "-" 로 합쳐 복원합니다.
  const tailCount = dimensionCount - 1;
  const tail = parts.slice(-tailCount);
  const head = parts.slice(0, -tailCount).join('-');
  return [head, ...tail];
}

/* ------------------------------------------------------------------
 * 옵션 — 「색상」「사이즈」 를 따로 고르는 상품 (select 가 둘 이상, 에르스한 2026-11-05)
 *
 * ★ 이때 HTML 의 두 번째 select 는 첫 번째를 고르기 전엔 비어 있거나 전부 disabled 라
 *   조합·품절을 알 수 없습니다. 카페24 가 페이지에 넣어 두는 option_stock_data 를 읽습니다.
 *     var option_stock_data = '{"P00000BH000I":{"option_value_orginal":["화이트","S"],
 *        "option_name_original":["색상","사이즈"],"option_price":67900,"is_display":"T",
 *        "is_selling":"T","use_stock":false,"stock_number":0,"use_soldout":"F", ...}, ...}';
 * ★ 품절: is_selling 이 'F' 이거나, 재고를 쓰고(use_stock) 품절 표시를 켜 둔(use_soldout 'T')
 *   조합의 재고가 0 이하일 때. is_display 'F' (숨긴 조합) 는 뺍니다 — 손님 화면에도 안 나옵니다.
 * ------------------------------------------------------------------ */

type StockDataRow = {
  option_value?: string;
  option_value_orginal?: string[];
  option_name_original?: string[];
  option_price?: number | string;
  origin_option_added_price?: number | string;
  is_display?: string;
  is_selling?: string;
  use_stock?: boolean;
  stock_number?: number | null;
  use_soldout?: string;
};

function countOptionSelects(html: string): number {
  const regex = /<select\b[^>]*\bproduct_option_area=/gi;
  let count = 0;
  while (regex.exec(html) !== null) count += 1;
  return count;
}

function readOptionStockData(html: string): Record<string, StockDataRow> | null {
  const match = /option_stock_data\s*=\s*'((?:[^'\\]|\\.)*)'/.exec(html);
  if (!match) return null;
  try {
    // JS 문자열 안의 JSON — 한 번 풀어(\" → ") 서 다시 읽습니다. \' 는 JSON 이 모르는 escape 라 먼저 풉니다.
    const unescaped = JSON.parse(`"${match[1].replace(/\\'/g, "'")}"`) as string;
    const parsed: unknown = JSON.parse(unescaped);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StockDataRow>) : null;
  } catch {
    return null;
  }
}

function readSeparateOptions(
  html: string,
  salePrice: number
): { optionGroups: OptionGroup[]; variants: NewyorktrdVariant[] } | null {
  const data = readOptionStockData(html);
  if (!data) return null;
  const rows = Object.values(data).filter(
    (row) => Array.isArray(row.option_value_orginal) && row.option_value_orginal.length > 0
  );
  if (rows.length === 0) return null;

  const names = rows[0].option_name_original ?? [];
  const dimensionCount = rows[0].option_value_orginal!.length;
  const groupValues: string[][] = Array.from({ length: dimensionCount }, () => []);
  const variants: NewyorktrdVariant[] = [];

  for (const row of rows) {
    if (row.is_display === 'F') continue;
    const parts = (row.option_value_orginal ?? []).map((part) => decodeHtmlEntities(String(part)).trim());
    if (parts.length !== dimensionCount || parts.some((part) => !part)) continue;
    parts.forEach((part, index) => {
      if (!groupValues[index].includes(part)) groupValues[index].push(part);
    });
    const optionPrice = parseMoney(String(row.option_price ?? ''));
    const added = Number(row.origin_option_added_price ?? 0) || 0;
    const extraPrice = optionPrice > 0 && salePrice > 0 ? optionPrice - salePrice : Math.round(added);
    const soldOut =
      row.is_selling === 'F' ||
      (row.use_stock === true && row.use_soldout === 'T' && Number(row.stock_number ?? 0) <= 0);
    variants.push({
      key: parts.join('/'),
      label: row.option_value ? decodeHtmlEntities(row.option_value) : parts.join('-'),
      stock: null, // 재고는 가져오지 않습니다 (명세 4-6)
      soldOut,
      extraPrice,
      price: salePrice + extraPrice,
    });
  }

  const optionGroups: OptionGroup[] = groupValues.map((values, index) => ({
    name: (names[index] ?? '').trim() || '옵션',
    values,
  }));
  return { optionGroups, variants };
}

/* ------------------------------------------------------------------
 * 조립
 * ------------------------------------------------------------------ */

function normalize(id: number, html: string, shop: Cafe24Shop): NewyorktrdProduct {
  const warnings: string[] = [];

  /* ── 이름 ─────────────────────────────────────────── */
  const jsonLd = readJsonLd(html);
  const nameFromLd = (jsonLd?.name ?? '').trim();
  const nameFromOg = cleanName(readMeta(html, 'og:title'), shop);
  const name = nameFromLd || nameFromOg;
  if (!name) warnings.push('상품명을 가져오지 못했습니다. 직접 입력해 주세요.');

  /* ── 브랜드 ───────────────────────────────────────── */
  const brandName =
    (jsonLd?.hasVariant?.[0]?.brand?.name ?? '').trim() ||
    // 상품 상세 하단에 적힌 "브랜드 : 스투시" 를 뒤로 밀어 둡니다 (잘 안 나옵니다).
    '';

  /* ── 가격 ─────────────────────────────────────────── */
  // 판매가 = og product:price:amount
  const salePrice = parseMoney(readMeta(html, 'product:price:amount'));
  // 소비자가 = #span_product_price_custom 안의 글자
  const consumerMatch = /id=["']span_product_price_custom["'][^>]*>([\s\S]{0,200}?)<\/span>/.exec(
    html
  );
  const price = consumerMatch ? parseMoney(stripTags(consumerMatch[1])) : 0;
  if (!salePrice && !price) {
    warnings.push('가격을 찾지 못했습니다 (판매가 자리가 비어 있음). 직접 입력해 주세요.');
  }

  /* ── 이미지 ───────────────────────────────────────── */
  const ogImage = toAbsoluteUrl(readMeta(html, 'og:image'), shop.base);
  const gallery = readGallery(html, shop);
  // 갤러리에 og:image 가 빠져 있으면 맨 앞에 넣습니다.
  if (ogImage && !gallery.some((image) => image.url === ogImage)) {
    gallery.unshift({ url: toBigImage(ogImage), width: 0, height: 0 });
  }
  const mainImage = gallery[0] ?? null;
  if (gallery.length === 0) {
    warnings.push('대표 이미지를 가져오지 못했습니다. 직접 올려 주세요.');
  }

  /* ── 상세 블록 ────────────────────────────────────── */
  const blocks = readDetailBlocks(html, shop);
  if (blocks.length === 0) {
    warnings.push(
      '상세 이미지를 0장 찾았습니다 — 페이지 구조가 바뀌었을 수 있습니다. 상세는 직접 구성해 주세요.'
    );
  }

  /* ── 옵션 ────────────────────────────────────────── */
  const optionBlock = readOptionsBlock(html);
  const optgroups = optionBlock ? readOptgroups(optionBlock) : [];

  let optionGroups: OptionGroup[] = [];
  let variants: NewyorktrdVariant[] = [];

  if (countOptionSelects(html) > 1) {
    // 「색상」「사이즈」 를 따로 고르는 상품 — HTML 에 조합이 없어 option_stock_data 로 읽습니다.
    const separate = readSeparateOptions(html, salePrice);
    if (separate && separate.variants.length > 0) {
      optionGroups = separate.optionGroups;
      variants = separate.variants;
    } else {
      warnings.push(
        '옵션을 여러 칸으로 나눠 고르는 상품인데 조합을 읽지 못했습니다. 옵션은 직접 넣어 주세요.'
      );
    }
  } else if (optgroups.length > 0) {
    // 뉴욕트렌딕은 한 optgroup label 안에 모든 조합이 들어옵니다.
    //   예) label="색상-사이즈", 값 "블랙-S" · "블랙-M" ...
    const first = optgroups[0];
    const dimensions = first.label
      .split('-')
      .map((part) => part.trim())
      .filter(Boolean);
    const dimensionCount = Math.max(1, dimensions.length);

    const groupValues: Set<string>[] = Array.from({ length: dimensionCount }, () => new Set<string>());

    variants = first.options.map((option) => {
      const { key, extraPrice, soldOut } = parseOptionLabel(option.text);
      const parts = splitVariantParts(key, dimensionCount);
      // 그룹별로 유니크 값을 모읍니다.
      parts.forEach((part, index) => {
        if (part && groupValues[index]) groupValues[index].add(part);
      });
      return {
        key: parts.join('/'),
        label: option.text,
        stock: null, // 재고는 가져오지 않습니다 (명세 4-6)
        soldOut,
        extraPrice,
        price: salePrice + extraPrice,
      };
    });

    optionGroups = dimensions.map((name, index) => ({
      name: name || '옵션',
      values: Array.from(groupValues[index] ?? []),
    }));
  }

  // 2026-10 현재 뉴욕트렌딕의 "모음전" 류는 하나의 flat optgroup 에 수십·수백 조합을
  // 넣습니다 (아미 모음전 147 조합). 그 그대로 등록해도 되지만 운영자가 눈으로
  // 확인하도록 조합이 아주 많으면 안내만 띄웁니다.
  if (variants.length > 50) {
    warnings.push(
      `옵션이 ${variants.length}개 입니다. "모음전" 상품일 수 있어 확인 후 등록해 주세요.`
    );
  }

  return {
    source: shop.key,
    newyorktrdId: id,
    sourceUrl: cafe24ProductUrl(shop.key, id),
    name: name || '',
    price: price || salePrice, // 소비자가가 없으면 판매가로 떨어뜨립니다.
    salePrice,
    brandName,
    mainImage,
    gallery,
    blocks,
    optionGroups,
    variants,
    warnings,
  };
}

/* ------------------------------------------------------------------
 * 가져오기
 * ------------------------------------------------------------------ */

/**
 * 카페24 쇼핑몰(뉴욕트렌딕 · 에르스한) 상품 하나를 가져옵니다.
 * shopKey 를 빼면 뉴욕트렌딕 (예전 호출 그대로).
 */
export async function fetchNewyorktrdProduct(
  id: number,
  shopKey: Cafe24ShopKey = 'newyorktrd'
): Promise<NewyorktrdProduct> {
  const shop = SHOPS[shopKey];
  if (!id || id <= 0) throw new NewyorktrdError(`${shop.label} 상품번호를 확인해 주세요.`);
  const html = await fetchHtml(cafe24ProductUrl(shopKey, id), shop.label);
  return normalize(id, html, shop);
}

/** 시험용 — 이미 받아 둔 HTML 을 그대로 파싱합니다 (네트워크 없이). */
export function parseCafe24ProductHtml(
  id: number,
  html: string,
  shopKey: Cafe24ShopKey
): NewyorktrdProduct {
  return normalize(id, html, SHOPS[shopKey]);
}
