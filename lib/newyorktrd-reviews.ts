import 'server-only';

import { NewyorktrdError, newyorktrdUrl } from '@/lib/newyorktrd';

/**
 * 뉴욕트렌딕 상품 후기 가져오기.
 *
 * ★ 조사 결과 (newyorktrd-import-v2.md 외 추가 조사)
 *   · /board/product/list.html?product_no=N 는 상품 필터가 무시됩니다. 쓰지 마세요.
 *   · 상품별 후기는 상품 상세의 ‘#prdReview’ 영역이 서버에서 그려 줍니다.
 *     URL /product/detail.html?product_no=N&page_4=P 로 페이지가 넘어갑니다.
 *     최대 5페이지 × 5건 = 25건까지 노출됩니다 (뉴욕 쪽 UI 제약).
 *   · 각 후기의 상세 URL 은 /article/상품-사용후기/4/{리뷰id}/ 입니다.
 *     이 상세 페이지에 글·사진·별점·작성자·날짜가 모두 들어 있습니다.
 *   · 작성자명은 이미 "임****" 처럼 마스킹되어 옵니다. 그대로 저장합니다.
 *
 * ★ 반드시 지킬 것 (표시광고법)
 *   · 저장할 때 source='newyorktrd' 를 꼭 넣습니다. 손님 화면이 이 값을 보고
 *     "뉴욕트렌딕 구매 후기" 배지를 띄웁니다.
 *   · user_id 는 null 로 둡니다. 포인트 지급 로직 (points.ts) 이 null 이면
 *     지급하지 않도록 만들어져 있어, 적립이 자연히 막힙니다.
 *   · 동영상은 가져오지 않습니다 (<video>·<source> 태그 전부 무시).
 */

const BASE = 'https://newyorktrd.co.kr';
const BOARD_NO = 4;

/* ------------------------------------------------------------------
 * HTTP
 * ------------------------------------------------------------------ */

async function fetchHtml(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
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
      `뉴욕트렌딕에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요. (${
        error instanceof Error ? error.message : '네트워크 오류'
      })`
    );
  }

  if (response.status === 403 || response.status === 429) {
    throw new NewyorktrdError(
      `뉴욕트렌딕이 요청을 막았습니다 (HTTP ${response.status}). 시간을 두고 다시 시도해 주세요.`
    );
  }
  if (!response.ok) {
    throw new NewyorktrdError(`뉴욕트렌딕 응답 오류입니다. (HTTP ${response.status})`);
  }

  return response.text();
}

/* ------------------------------------------------------------------
 * 유틸
 * ------------------------------------------------------------------ */

function toAbsoluteUrl(url: string): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/^http:/, 'https:');
  }
  if (trimmed.startsWith('/')) return `${BASE}${trimmed}`;
  return trimmed;
}

/** 썸네일 주소를 가장 큰 /big/ 로 바꿉니다. */
function toBigImage(url: string): string {
  return url.replace(/\/(?:tiny|small|medium)\//, '/big/');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/* ------------------------------------------------------------------
 * 결과 모양
 * ------------------------------------------------------------------ */

export type NewyorktrdReview = {
  /** 뉴욕 쪽 리뷰 번호 — 중복 방지 키 */
  reviewId: string;
  /** 원본 상세 주소 */
  sourceUrl: string;
  /** 작성자명 (이미 마스킹돼서 옴, "임****" 형태) */
  writerName: string;
  /** 1~5. 못 읽으면 5 로 둡니다 (뉴욕 쪽 전부 5점이 기본) */
  rating: number;
  /** 본문. 글만 남깁니다 (이미지는 photos 로 뺍니다) */
  content: string;
  /** 사용자 업로드 사진 URL 목록 (뉴욕 쪽 원본 주소) — 저장 전 R2 로 복사해야 합니다 */
  photos: string[];
  /** ISO 문자열 */
  writtenAt: string;
};

/* ------------------------------------------------------------------
 * 리뷰 목록 — 상품 상세 페이지에서 리뷰 ID 긁기
 * ------------------------------------------------------------------ */

/** 한 페이지의 상품 상세 HTML 에서 리뷰 ID 들을 추출합니다. */
function extractReviewIds(html: string): string[] {
  // 상품 상세의 #alph_origin_board 영역 → .xans-product-review ul 안
  const start = html.indexOf('xans-product-review');
  if (start < 0) return [];
  const end = html.indexOf('xans-product-reviewpaging', start);
  const chunk = html.slice(start, end > 0 ? end : start + 50000);

  const ids: string[] = [];
  const regex = /review_read\.xml\?no=(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(chunk)) !== null) {
    const id = match[1];
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** 상품에 리뷰가 몇 페이지까지 있는지. 1~5 로 제한됩니다 (뉴욕 쪽 UI). */
function extractMaxPage(html: string): number {
  const start = html.indexOf('xans-product-reviewpaging');
  if (start < 0) return 1;
  const chunk = html.slice(start, start + 3000);
  const regex = /page_4=(\d+)/g;
  let max = 1;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(chunk)) !== null) {
    const n = Number(match[1]);
    if (n > max) max = n;
  }
  return max;
}

/* ------------------------------------------------------------------
 * 리뷰 상세 파싱
 * ------------------------------------------------------------------ */

export type ReviewDetail = NewyorktrdReview | { skipped: true; reason: string };

/**
 * 리뷰 상세 HTML 하나를 파싱합니다.
 * ★ 상품번호가 일치하지 않으면 skipped 를 돌려 줍니다 (상품별 필터가 완벽하지 않을 때 안전장치).
 */
export function parseReviewDetail(
  html: string,
  reviewId: string,
  expectedProductNo: number
): ReviewDetail {
  // ─ 상품번호 검증 ─
  // /product/슬러그/{번호}/ 패턴에서 뽑습니다.
  const prodMatch = /\/product\/[^/]+\/(\d+)\//.exec(html);
  const foundProductNo = prodMatch ? Number(prodMatch[1]) : 0;
  if (foundProductNo && foundProductNo !== expectedProductNo) {
    return {
      skipped: true,
      reason: `상품번호 불일치 (리뷰 ${reviewId} 은 상품 ${foundProductNo} 쪽입니다)`,
    };
  }

  // ─ 작성자 ─
  const writerMatch = /class="writer"[^>]*>[\s\S]*?<strong[^>]*>[^<]*<\/strong>\s*([^<\n]+?)<span/
    .exec(html);
  const writerName = writerMatch ? decodeEntities(writerMatch[1].trim()) : '';

  // ─ 날짜 ─
  const dateMatch = /class="regdate\s*"[^>]*>[\s\S]*?<strong[^>]*>[^<]*<\/strong>\s*([\d\- :]+)/
    .exec(html);
  const dateText = dateMatch ? dateMatch[1].trim() : '';
  // "2026-10-01 11:26:00" → ISO. 한국 시간 기준으로 저장합니다.
  const writtenAt = dateText
    ? new Date(dateText.replace(' ', 'T') + '+09:00').toISOString()
    : new Date().toISOString();

  // ─ 별점 ─
  // <img src="/morenvyimg/point05.svg" alt="5점">
  const ratingMatch = /morenvyimg\/point0?(\d+)\.svg["'][^>]*alt="(\d+)점"/.exec(html);
  let rating = ratingMatch ? Number(ratingMatch[2]) : 5;
  if (!Number.isFinite(rating) || rating < 1) rating = 5;
  if (rating > 5) rating = 5;

  // ─ 본문 영역 ─
  // <div class="content "> ... <div class="fr-view fr-view-article">본문HTML</div> ... </div>
  // ★ 사진이 fr-view 바깥(별도 첨부 영역)에 들어 있을 수도 있어 두 번 봅니다.
  const bodyMatch = /class="fr-view[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  const bodyHtml = bodyMatch ? bodyMatch[1] : '';

  // 본문 아래 ~ 추천(vote) 블록 전까지의 범위도 함께 봅니다 (첨부 사진이 분리된 경우 대비).
  const contentStart = html.indexOf('class="content');
  const contentEnd = html.indexOf('class="vote', contentStart);
  const contentArea =
    contentStart >= 0 ? html.slice(contentStart, contentEnd > 0 ? contentEnd : contentStart + 20000) : '';

  // ─ 사진 ─
  // 사용자 업로드 사진은 <img ...> 로 들어옵니다. 동영상(<video>, <source>) 은 전부 거릅니다.
  // ★ cafe24 는 지연 로딩 때 ec-data-src 속성에 실제 URL 을 넣어 둡니다. 둘 다 봅니다.
  // ★ 현재(2026-10) 뉴욕트렌딕은 사진 후기를 Alpha Review 외부 위젯(JS)에 저장하고 있어
  //   서버 HTML 에는 손님 사진이 보이지 않습니다. 이 자리는 "들어오면 받는" 안전망입니다.
  const photos: string[] = [];
  const seenPhotos = new Set<string>();
  const scanImgs = (chunk: string) => {
    const imgRegex = /<img\b[^>]+>/gi;
    let imgTag: RegExpExecArray | null;
    while ((imgTag = imgRegex.exec(chunk)) !== null) {
      const ecSrc = /ec-data-src=["']([^"']+)["']/i.exec(imgTag[0])?.[1];
      const plainSrc = /\bsrc=["']([^"']+)["']/i.exec(imgTag[0])?.[1];
      const raw = (ecSrc || plainSrc || '').trim();
      if (!raw) continue;
      const abs = toAbsoluteUrl(raw);
      if (!abs) continue;
      // 시스템 아이콘·이모지 제외
      if (/img\.echosting\.cafe24\.com/i.test(abs)) continue;
      if (/morenvyimg/i.test(abs)) continue;
      if (/\/0_img\//i.test(abs)) continue;
      if (/facebook\.com\/tr/i.test(abs)) continue;
      if (abs.startsWith('data:')) continue;
      // 글 안에서 상품 썸네일(/web/product/) 가 끌어와지는 경우는 손님 사진이 아니라 제외합니다.
      if (/\/web\/product\//i.test(abs)) continue;
      // 손님 업로드 사진이 올 수 있는 자리 — 셋 다 받습니다.
      //   newyorktrd.co.kr/web/upload/...  theplanet.hgodo.com/...  review-media.alphwidget.com/...
      const okHost =
        /newyorktrd\.co\.kr\/web\/upload\//i.test(abs) ||
        /theplanet\.hgodo\.com\//i.test(abs) ||
        /review-media\.alphwidget\.com\//i.test(abs);
      if (!okHost) continue;
      if (seenPhotos.has(abs)) continue;
      seenPhotos.add(abs);
      photos.push(toBigImage(abs));
    }
  };
  scanImgs(bodyHtml);
  scanImgs(contentArea);

  // ─ 본문 글 (이미지·동영상 태그 제거) ─
  const cleanedBody = bodyHtml
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<video\b[\s\S]*?<\/video>/gi, '')
    .replace(/<source\b[^>]*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  const content = decodeEntities(stripTags(cleanedBody));

  return {
    reviewId,
    sourceUrl: `${BASE}/article/상품-사용후기/${BOARD_NO}/${reviewId}/`,
    writerName,
    rating,
    content,
    photos: Array.from(new Set(photos)),
    writtenAt,
  };
}

/* ------------------------------------------------------------------
 * 공개 API
 * ------------------------------------------------------------------ */

/**
 * 상품의 리뷰 ID 목록을 한 페이지씩 가져옵니다.
 * ★ 리뷰 상세까지는 안 받습니다. 상세는 fetchReviewDetail() 로 따로.
 *   페이지네이션 각 호출마다 상품 상세 HTML (200KB 안팎) 을 한 번씩 받습니다.
 */
export async function fetchReviewIdsPage(
  productNo: number,
  page: number
): Promise<{ ids: string[]; totalPages: number }> {
  if (!productNo || productNo <= 0) throw new NewyorktrdError('상품번호를 확인해 주세요.');
  const url =
    page <= 1
      ? newyorktrdUrl(productNo)
      : `${newyorktrdUrl(productNo)}&page_${BOARD_NO}=${page}`;
  const html = await fetchHtml(url);
  return {
    ids: extractReviewIds(html),
    totalPages: Math.min(5, Math.max(1, extractMaxPage(html))),
  };
}

/** 리뷰 상세 하나를 받아 파싱합니다. */
export async function fetchReviewDetail(
  reviewId: string,
  expectedProductNo: number
): Promise<ReviewDetail> {
  const url = `${BASE}/article/${encodeURIComponent('상품-사용후기')}/${BOARD_NO}/${reviewId}/`;
  const html = await fetchHtml(url);
  return parseReviewDetail(html, reviewId, expectedProductNo);
}
