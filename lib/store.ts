import { DEFAULT_STORE } from '@/lib/site-config';

/**
 * 배포 주소. 도메인을 바꾸면 여기만 고치면 됩니다.
 *
 * ★ 끝에 슬래시(/)를 붙이지 마세요. 쓰는 쪽이 전부 `${SITE_URL}/무엇` 으로
 *   이어 붙이기 때문에 //products 처럼 슬래시가 겹칩니다.
 * ★ 여기를 고친 뒤에는 Supabase 대시보드의 Authentication > URL Configuration 도
 *   같이 고쳐야 합니다. 회원가입·비밀번호 재설정 메일의 돌아오는 주소를
 *   Supabase 가 허용 목록과 대조해서 막기 때문입니다. (아래 auth-actions.ts 참고)
 */
export const SITE_URL = 'https://jzl.kr';

/**
 * 검색엔진 소유확인 값 (3-M)
 *
 * ★ 비밀이 아닙니다. 어차피 모든 페이지의 HTML 에 그대로 실려 나가는 값입니다.
 *   그래서 환경변수로 빼지 않고 여기에 둡니다. 환경변수로 두면 Vercel 설정을
 *   따로 손대야 하고, 나중에 태그가 왜 없는지 찾기 어려워집니다.
 *
 * ★ 어디에 쓰이나 — app/layout.tsx 의 metadata.verification 으로 들어가
 *   <meta name="google-site-verification">, <meta name="naver-site-verification">
 *   두 줄이 됩니다. 이 줄이 사라지면 서치콘솔·웹마스터도구의 소유확인이 풀립니다.
 *   확인을 마친 뒤에도 지우지 마세요. 검색엔진이 주기적으로 다시 확인합니다.
 *
 *   구글  — 서치콘솔 (search.google.com/search-console)
 *   네이버 — 서치어드바이저 (searchadvisor.naver.com)
 */
export const SITE_VERIFICATION = {
  google: 'oGI1IKtH999GKbaBoI8iDqW7XM_JBZ34UXpwR7vN-Gc',
  naver: '61c6f3ea756a2dac39a6313e0f0e6baed34c2305',
} as const;

/**
 * 스토어 정보 기본값.
 *
 * ★ 1-B 부터 실제 값은 site_settings 테이블(key = 'store')에서 읽습니다.
 *   관리자 > 설정 > 스토어 정보 에서 고치세요.
 *   여기 있는 값은 아직 아무것도 저장하지 않았을 때 쓰이는 폴백입니다.
 *   (서버 컴포넌트는 lib/settings.ts 의 getCachedStore() 를 쓰세요)
 */
export const store = DEFAULT_STORE;

/**
 * 공유 카드 기본 이미지 (3-J)
 *
 * ★ app/opengraph-image.tsx 가 그려 주는 1200×630 이미지입니다.
 *   파일 기반 메타데이터는 페이지가 openGraph 를 직접 정의하면 덮이지 않고
 *   통째로 사라집니다. (Next 는 openGraph 객체를 통째로 갈아 끼웁니다)
 *   그래서 대표 이미지가 따로 없는 페이지에는 이 값을 명시적으로 넣습니다.
 * ★ 상품·브랜드·편집숍 소개처럼 제 이미지가 있는 페이지는 그대로 두세요.
 *   여기 값을 넣으면 오히려 자기 사진이 가려집니다.
 */
export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'JZL CLOSET',
};
