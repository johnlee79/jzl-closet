import 'server-only';

import type { Browser, LaunchOptions } from 'puppeteer-core';

/**
 * 뉴욕트렌딕 상품 페이지를 헤드리스 Chrome 으로 열어 알파 리뷰 위젯이 그린 손님
 * 사진을 긁어 옵니다.
 *
 * ★ 반드시 지킬 것 (사장님 지시, 2026-10-05)
 *   · 알파리뷰 API 를 직접 부르거나 Origin / Referer 를 꾸미지 않습니다 — 그건 접근
 *     제한 우회입니다. 일반 방문자처럼 상품 페이지(/product/detail.html?product_no=N)
 *     를 열고 화면에 그려진 것만 봅니다.
 *   · 동영상은 가져오지 않습니다 (사진 호스트와 URL 패턴만 통과시킵니다).
 *   · 상품 하나씩 차례로. 몰아서 열지 않습니다.
 *   · 메모리가 넘치면 함수가 통째로 죽어, 한 번에 브라우저 하나만 뜨도록
 *     모듈 레벨 뮤텍스로 막습니다. 두 번째 호출은 "다른 요청이 끝날 때까지" 기다리게
 *     하지 않고 바로 409 로 돌려보내 사장님이 다시 누르게 합니다.
 *
 * ★ 환경 분기
 *   · Vercel (process.env.VERCEL === '1') : @sparticuz/chromium 로 번들된 바이너리
 *   · 로컬 : 사장님 PC 의 Chrome 설치본 (C:/Program Files/Google/Chrome/...)
 *     로컬에서 돌리는 건 테스트용입니다. 배포본은 Vercel 쪽을 씁니다.
 */

export type PhotoGroup = {
  /**
   * 같은 손님의 사진 묶음. 알파 위젯 리뷰 상세 팝업 하나 = 손님 한 명 = 한 그룹입니다.
   * 짝 못 찾는 사진은 writerName 이 비어 있고 photos 가 1장짜리입니다.
   */
  writerName: string;
  /** 알파가 보여 주는 상대 날짜 ("1주 전") 또는 절대 날짜 — 짝맞춤 참고용 */
  dateText: string;
  /** 리뷰 본문. 짝맞춤 참고용으로 글 처음 수십 자가 중요합니다. */
  content: string;
  photos: string[];
};

type ScrapeResult = {
  groups: PhotoGroup[];
  elapsedMs: number;
};

/* ------------------------------------------------------------------
 * 동시 실행 가드
 * ------------------------------------------------------------------ */

let running = false;

export class BrowserBusyError extends Error {
  constructor() {
    super('다른 요청이 브라우저를 쓰고 있습니다. 잠시 뒤 다시 눌러 주세요.');
    this.name = 'BrowserBusyError';
  }
}

/* ------------------------------------------------------------------
 * 사진 호스트 — URL 로만 걸러 영상·외부 자원은 흘러들지 못하게
 * ------------------------------------------------------------------ */

export const ALLOWED_PHOTO_HOSTS = new Set([
  'newyorktrd.co.kr',
  'newyorktrd.cafe24.com',
  'theplanet.hgodo.com',
  'review-media.alphwidget.com',
]);

const PHOTO_PATH_PATTERNS = [
  /\/web\/upload\/appfiles\//i, // 알파리뷰 앱 저장소
  /\/web\/upload\/review\//i, // 혹시 쓰이는 경우
];

function isReviewPhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PHOTO_HOSTS.has(parsed.hostname)) return false;
    return PHOTO_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------
 * 브라우저 띄우기 (환경별)
 * ------------------------------------------------------------------ */

/**
 * Vercel 함수에 Chromium 바이너리(brotli ~70MB)를 번들링하려 했는데 번들링 설정이
 * 끝까지 안 먹어서 bin/ 폴더가 매번 함수에서 사라졌습니다 (outputFileTracingIncludes·
 * serverComponentsExternalPackages 다 걸어도 webpack 이 숫자 모듈 ID 로 바꿔
 * require.resolve 가 깨짐). 그래서 @sparticuz/chromium-min 으로 바꿨습니다 — 패키지
 * 자체는 ~1MB 로 작고, 실행 바이너리는 **런타임에 원격 URL** 에서 받아 /tmp 로 풀어
 * 씁니다. 번들 걱정 끝. (2026-10-05)
 *
 * ★ Vercel 공식 가이드와 같은 방식입니다. 콜드 스타트 때 한 번 받고 (/tmp 는 함수
 *   인스턴스가 살아 있는 동안 유지됨) 그 뒤 요청은 캐시된 바이너리를 재사용합니다.
 * ★ URL 은 CHROMIUM_PACK_URL 환경변수로 덮어쓸 수 있습니다. GitHub release 가 느리거나
 *   막히면 저희 R2 로 올려서 거기 가리키게 하세요.
 */
const DEFAULT_CHROMIUM_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar';

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');

  // Vercel · AWS Lambda 환경 — chromium-min + 원격 바이너리
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromiumModule = await import('@sparticuz/chromium-min');
    const chromium = chromiumModule.default;
    const url = process.env.CHROMIUM_PACK_URL ?? DEFAULT_CHROMIUM_URL;
    const options: LaunchOptions = {
      args: chromium.args,
      defaultViewport: { width: 1280, height: 2000 },
      executablePath: await chromium.executablePath(url),
      headless: true,
    };
    return puppeteer.launch(options);
  }

  // 로컬 — 설치된 Chrome 을 그대로 씁니다.
  const localChrome =
    process.env.CHROME_PATH ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe';
  return puppeteer.launch({
    executablePath: localChrome,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 2000 },
  });
}

/* ------------------------------------------------------------------
 * 긁기
 * ------------------------------------------------------------------ */

/**
 * 상품 하나의 사진 그룹을 긁어 옵니다.
 *
 * 흐름
 *   1) 뉴욕트렌딕 상품 상세 열기 (일반 방문자 User-Agent, Origin/Referer 꾸미지 않음)
 *   2) #prdReview 로 스크롤 → 알파 위젯이 느긋하게 로드
 *   3) 리뷰 영역을 몇 번 왕복해 뒤쪽 사진까지 로드
 *   4) **썸네일을 하나씩 클릭해 리뷰 상세 팝업을 열고**, 작성자·날짜·글·사진 묶음을 추출
 *   5) 팝업을 DOM 에서 제거(단순 닫기가 때때로 안 먹어서) 하고 다음 썸네일로
 *   6) 같은 손님의 사진 5~6장이 한 그룹으로 묶여 돌아옵니다
 *
 * ★ 알려진 한계
 *   nuke 후에도 가끔 다음 썸네일 클릭에서 팝업이 열리지 않습니다. 사장님께 보고한 그대로
 *   도저히 안 되는 몇 장은 그룹핑에서 빠지고, 그 사진은 preview-photos 라우트가
 *   "글 없음 · 사진만" 단건 리뷰로 폴백해 보여 줍니다. 완벽한 짝맞춤이 아니라
 *   "대부분 묶이고 몇 장은 단건" 이라는 상태입니다.
 *
 * ★ 조사 때 왜 팝업이 안 열렸는가 (사장님 질문에 대한 답)
 *   · 썸네일 좌표가 뷰포트 밖(y=-11772)이었습니다 — 알파 위젯 자체로 스크롤을 안 해서.
 *     이제는 widget.scrollIntoView 로 뷰포트 안쪽에 넣은 뒤 좌표를 잽니다.
 *   · img.click() 은 알파의 핸들러를 못 깨웁니다 (핸들러가 상위 review-media-container 에
 *     있거나 shadow DOM 바깥에 걸림). page.mouse.click(x, y) 로 실제 합성 클릭을 날리면
 *     shadow DOM 경계를 넘어 핸들러에 도달합니다.
 *   · 팝업이 닫히지 않는 문제 — Escape 와 .detail-popup-product__close 둘 다 가끔 안
 *     먹어서 다음 썸네일 클릭이 팝업 오버레이에 가로막혔습니다. **DOM 에서 .remove()** 로
 *     확실히 지워 피했습니다.
 */
export async function scrapeNewyorktrdPhotos(productNo: number): Promise<ScrapeResult> {
  if (!productNo || productNo <= 0) {
    throw new Error('상품번호를 확인해 주세요.');
  }
  if (running) throw new BrowserBusyError();
  running = true;

  const started = Date.now();
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // 일반 방문자 User-Agent 를 그대로 둡니다. Origin / Referer 를 꾸미는 설정은 하지
    // 않습니다 — 그건 접근 제한 우회로 분류됩니다.
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });

    const url = `https://newyorktrd.co.kr/product/detail.html?product_no=${productNo}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // #prdReview 로 스크롤 → 알파 위젯 로드 유도
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      document.querySelector('#prdReview')?.scrollIntoView();
    });
    await new Promise((r) => setTimeout(r, 10000));

    await page.evaluate(async () => {
      for (let i = 0; i < 3; i += 1) {
        document.querySelector('#prdReview')?.scrollIntoView({ block: 'end' });
        await new Promise((r) => setTimeout(r, 1200));
        document.querySelector('#prdReview')?.scrollIntoView({ block: 'start' });
        await new Promise((r) => setTimeout(r, 500));
      }
    });

    const scrollToPhotoWidget = async () => {
      await page.evaluate(() =>
        document
          .querySelector('.alpha_widget[data-code="8c143796"]')
          ?.scrollIntoView({ block: 'center' })
      );
      await new Promise((r) => setTimeout(r, 800));
    };
    await scrollToPhotoWidget();

    /* 썸네일 하나하나 클릭해 그룹 뽑기 ----------------------------- */
    const groups: PhotoGroup[] = [];
    const seen = new Set<string>();
    // 안전 상한 — 알파 포토리뷰 위젯 썸네일이 보통 20~40장. 그보다 많이 돌진 않습니다.
    const MAX_CLICKS = 30;

    for (let i = 0; i < MAX_CLICKS; i += 1) {
      const thumb = await page.evaluate((seenList: string[]) => {
        const walk = (root: Document | ShadowRoot | Element): { src: string; cx: number; cy: number } | null => {
          for (const el of Array.from(root.querySelectorAll('*'))) {
            if (el.tagName === 'IMG') {
              const img = el as HTMLImageElement;
              const src = img.currentSrc || img.src || '';
              if (!/\/web\/upload\/appfiles\//i.test(src)) continue;
              if (seenList.includes(src)) continue;
              const rect = img.getBoundingClientRect();
              if (rect.width < 40 || rect.height < 40) continue;
              if (rect.top < 0 || rect.top > window.innerHeight) continue;
              if (rect.left < 0 || rect.left > window.innerWidth) continue;
              return { src, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
            }
            const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
            if (shadow) {
              const f = walk(shadow);
              if (f) return f;
            }
          }
          return null;
        };
        return walk(document);
      }, Array.from(seen));

      if (!thumb) break;

      await page.mouse.click(thumb.cx, thumb.cy);
      // 팝업이 뜨고 안쪽 사진이 로드될 시간
      await new Promise((r) => setTimeout(r, 3500));

      const detail = await page.evaluate(() => {
        const findDeep = (r: Document | ShadowRoot, tag: string): Element | null => {
          for (const el of Array.from(r.querySelectorAll('*'))) {
            if (el.tagName.toLowerCase() === tag) return el;
            const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
            if (shadow) {
              const f = findDeep(shadow, tag);
              if (f) return f;
            }
          }
          return null;
        };
        const popup = findDeep(document, 'review-detail-popup');
        if (!popup || !(popup as Element & { shadowRoot: ShadowRoot | null }).shadowRoot) {
          return null;
        }
        const shadowRoot = (popup as Element & { shadowRoot: ShadowRoot }).shadowRoot;

        // 보이는 상태인지 확인
        const style = (popup.ownerDocument?.defaultView ?? window).getComputedStyle(popup);
        if (style.display === 'none' || style.visibility === 'hidden') return null;

        // 전체 텍스트 (style/script 제외)
        const parts: string[] = [];
        const collect = (n: Node) => {
          for (const c of Array.from(n.childNodes)) {
            if (c.nodeType === 3) parts.push(c.textContent ?? '');
            else if (c.nodeType === 1) {
              const el = c as Element;
              if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
              const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
              if (shadow) collect(shadow);
              collect(el);
            }
          }
        };
        collect(shadowRoot);
        const fullText = parts.join(' ').replace(/\s+/g, ' ').trim();

        // 작성자 "박**" 패턴 추출
        const w = /([가-힣])(\*{2,})(?=님|\s|$)/.exec(fullText);
        const writerName = w ? w[1] + w[2] : '';

        // 날짜 — 상대 ("1주 전") 또는 절대 (2026.09.01)
        const dateMatch =
          /(\d+\s*(?:시간|일|주|달|개월|년)\s*전)|(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/.exec(
            fullText
          );
        const dateText = dateMatch ? dateMatch[0] : '';

        // 글 본문 — 날짜 뒤부터 "도움돼요"/"댓글"/"신고" 전까지. 반복 "작성 N 전" 제거
        let content = '';
        if (dateText) {
          const idx = fullText.indexOf(dateText);
          let after = fullText.slice(idx + dateText.length);
          after = after.replace(
            /^(?:작성\s*)?(?:\d+\s*(?:시간|일|주|달|개월|년)\s*전\s*(?:작성)?\s*){0,5}/,
            ''
          );
          const stopIdx = after.search(
            /도움돼요|댓글|신고|이전\s*리뷰|다른\s*리뷰도|구매하기|장바구니/
          );
          content = (stopIdx > 0 ? after.slice(0, stopIdx) : after).replace(/\s+/g, ' ').trim();
        }

        // 사진들 — 팝업 전체의 appfiles / upload/review 사진
        const imgs = new Set<string>();
        const collectImgs = (r: Document | ShadowRoot | Element) => {
          for (const img of Array.from(r.querySelectorAll('img'))) {
            const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || '';
            if (/\/web\/upload\/appfiles\//i.test(src) || /\/web\/upload\/review\//i.test(src)) {
              imgs.add(src);
            }
          }
          for (const el of Array.from(r.querySelectorAll('*'))) {
            const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
            if (shadow) collectImgs(shadow);
          }
        };
        collectImgs(shadowRoot);

        return { writerName, dateText, content, photos: Array.from(imgs) };
      });

      if (detail && detail.photos.length > 0) {
        for (const photo of detail.photos) seen.add(photo);
        seen.add(thumb.src);
        groups.push(detail);
      } else {
        // 팝업 못 열면 해당 썸네일만 seen 처리하고 다음으로
        seen.add(thumb.src);
      }

      // 팝업을 DOM 에서 지웁니다 — close 버튼은 가끔 안 먹어 오버레이가 다음 클릭을 가로챕니다
      await page.evaluate(() => {
        const findDeep = (r: Document | ShadowRoot, tag: string): Element | null => {
          for (const el of Array.from(r.querySelectorAll('*'))) {
            if (el.tagName.toLowerCase() === tag) return el;
            const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
            if (shadow) {
              const f = findDeep(shadow, tag);
              if (f) return f;
            }
          }
          return null;
        };
        const popup = findDeep(document, 'review-detail-popup');
        if (popup) popup.remove();
      });

      await new Promise((r) => setTimeout(r, 1200));
      await scrollToPhotoWidget();
    }

    return { groups, elapsedMs: Date.now() - started };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // 닫기 실패는 조용히
      }
    }
    running = false;
  }
}
