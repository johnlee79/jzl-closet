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
