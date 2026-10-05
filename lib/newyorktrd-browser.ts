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

type ScrapeResult = {
  photos: string[];
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
 * 상품 하나의 사진을 긁어 옵니다.
 *
 * 흐름
 *   1) 뉴욕트렌딕 상품 상세 열기 (일반 User-Agent 그대로)
 *   2) #prdReview 로 스크롤 → 알파 위젯이 느긋하게 로드
 *   3) 리뷰 영역 안쪽을 두세 번 더 스크롤해 더 많은 슬라이드가 뜨도록 유도
 *   4) 모든 Shadow DOM 을 재귀로 걸어 appfiles 경로의 사진 URL 수집
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

    // #prdReview 로 스크롤해서 알파 위젯 로딩을 유도
    await page.evaluate(async () => {
      const total = document.body.scrollHeight;
      for (let y = 0; y < total; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      document.querySelector('#prdReview')?.scrollIntoView();
    });

    // 알파 위젯이 자리를 잡을 때까지 기다립니다 (평균 8~10초)
    await new Promise((r) => setTimeout(r, 10000));

    // 리뷰 영역을 몇 번 더 왕복해 뒤쪽 사진이 로드되게
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i += 1) {
        document.querySelector('#prdReview')?.scrollIntoView({ block: 'end' });
        await new Promise((r) => setTimeout(r, 1200));
        document.querySelector('#prdReview')?.scrollIntoView({ block: 'start' });
        await new Promise((r) => setTimeout(r, 500));
      }
    });

    // 모든 Shadow DOM 걸으면서 사진 URL 수집 — 영상·시스템 아이콘·상품 썸네일은 뺍니다
    const urls = await page.evaluate(() => {
      const out: string[] = [];
      const walk = (root: Document | ShadowRoot | Element) => {
        for (const img of Array.from(root.querySelectorAll('img'))) {
          const src = img.currentSrc || img.src || '';
          if (!src) continue;
          // 아주 작은 아이콘(장식용)은 제외
          if (img.naturalWidth > 0 && img.naturalWidth < 60) continue;
          out.push(src);
        }
        for (const el of Array.from(root.querySelectorAll('*'))) {
          const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot;
          if (shadow) walk(shadow);
        }
      };
      walk(document);
      return out;
    });

    const unique = Array.from(new Set(urls)).filter(isReviewPhotoUrl);
    return { photos: unique, elapsedMs: Date.now() - started };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // 닫기 실패는 조용히 — 다음 요청에서 뮤텍스가 풀립니다
      }
    }
    running = false;
  }
}
