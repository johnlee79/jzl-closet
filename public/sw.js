/*
 * ============================================================
 * 서비스 워커 — 스스로 빠집니다 (2026-08-25)
 * ============================================================
 *
 * ★★ 왜 껐는가
 *   오픈 직후 로그인 상태가 헤더와 서버에서 다르게 보이는 일이 있었습니다.
 *   원인은 lib/member.ts 가 확인에 실패했을 때 "비회원" 으로 확정하던 것이었고,
 *   이 워커와는 무관합니다. (여기 fetch 핸들러는 respondWith 를 부르지 않아
 *   요청을 가로채지 않았습니다. 쿠키를 벗길 수 없는 구조였습니다)
 *
 *   그래도 껐습니다. 오픈한 상태에서 그날 새로 들어간 전역 장치를 남겨 두면,
 *   다음에 무슨 일이 나도 "그것 때문인가" 를 매번 다시 의심하게 됩니다.
 *   손님이 실제로 물건을 사는 중에는 의심할 것이 적을수록 좋습니다.
 *
 * ★★ 파일을 지우지 않고 이 내용으로 바꾼 이유
 *   지우면 이미 손님 브라우저에 설치된 워커가 그대로 남습니다.
 *   /sw.js 가 404 가 되어도 등록은 사라지지 않습니다.
 *   이 파일이 있어야 브라우저가 새 워커를 받아 가고, 그 새 워커가
 *   자기 자신을 해제합니다. 손님이 다음에 사이트를 열 때 조용히 빠집니다.
 *
 * ★ 다시 켤 때는 이 파일을 예전 내용(빈 fetch 핸들러)으로 되돌리고
 *   components/InstallPrompt.tsx 의 등록 부분을 살리면 됩니다.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 혹시 남아 있는 저장분이 있으면 전부 지웁니다.
      try {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      } catch (error) {
        /* 저장소를 못 쓰는 환경이면 그냥 넘어갑니다. */
      }

      // ★ 자기 자신을 해제합니다. 이 뒤로 이 워커는 아무것도 하지 않습니다.
      try {
        await self.registration.unregister();
      } catch (error) {
        /* 해제에 실패해도 아래 fetch 핸들러가 없어 하는 일이 없습니다. */
      }

      /*
       * ★ 열려 있는 창들을 새로 고칩니다.
       *   워커가 빠진 상태로 다시 그려져야 완전히 정리됩니다.
       */
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) client.navigate(client.url);
      } catch (error) {
        /* 못 해도 다음 방문에 정리됩니다. */
      }
    })()
  );
});

/*
 * ★ fetch 핸들러를 두지 않습니다.
 *   핸들러가 없으면 브라우저가 이 워커를 거치지 않고 바로 네트워크로 갑니다.
 */
