import type { MetadataRoute } from 'next';

/**
 * ============================================================
 * 홈 화면에 추가(PWA) — 앱처럼 열리게 하는 설명서
 * ============================================================
 *
 * 이 파일이 /manifest.webmanifest 주소를 만듭니다.
 * 브라우저가 이걸 읽고 "이 사이트는 홈 화면에 추가할 수 있다" 고 판단합니다.
 *
 * ★★ 값을 DB(관리자 설정)에서 읽지 않습니다. 일부러 그렇게 두었습니다.
 *   이 파일이 DB 를 읽으면 요청마다 서버가 도는 주소가 되고, 브라우저가
 *   설치 판단에 쓰는 파일이라 자주·이른 시점에 불립니다. 값이 거의 바뀌지
 *   않는 것들이라 고정해 두는 편이 안전하고 빠릅니다.
 *   상호가 바뀌면 이 파일을 고치면 됩니다.
 *
 * ★ display: 'standalone' — 주소창 없이 앱처럼 열립니다.
 * ★ start_url: '/' — 홈 화면 아이콘을 누르면 첫 화면으로 갑니다.
 *   ?src=pwa 를 붙여 두면 나중에 "앱으로 들어온 손님" 을 구분해 볼 수 있습니다.
 *
 * ★★ 아이콘은 두 종류가 필요합니다.
 *     any      — 그대로 씁니다 (iOS·데스크톱)
 *     maskable — 안드로이드가 원형·사각형 등으로 잘라 냅니다.
 *                그래서 가장자리가 잘려도 괜찮도록 안쪽에 여백을 둔 그림입니다.
 *                여백 없는 그림을 maskable 로 주면 글자가 잘립니다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JZL CLOSET',
    short_name: 'JZL CLOSET',
    description: '해외 브랜드 편집숍 JZL CLOSET',
    start_url: '/?src=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F5F2',
    theme_color: '#14141A',
    lang: 'ko',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
