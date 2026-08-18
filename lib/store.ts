import { DEFAULT_STORE } from '@/lib/site-config';

/** 배포 주소. 도메인을 바꾸면 여기만 고치면 됩니다. */
export const SITE_URL = 'https://jzl-closet.vercel.app';

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
