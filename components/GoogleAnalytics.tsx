import Script from 'next/script';
import { GA4_ID_PATTERN } from '@/lib/site-config';

/**
 * GA4 (구글 애널리틱스 4) 스크립트.
 *
 * - 측정 ID 가 비어 있으면 아무것도 넣지 않습니다.
 * - 개발 환경(npm run dev)에서는 넣지 않습니다.
 * - 배포본을 로컬에서 돌릴 때(localhost)도 전송하지 않도록
 *   config 호출 앞에 호스트 검사를 한 번 더 둡니다.
 * - strategy="afterInteractive" — 첫 화면 렌더를 막지 않습니다.
 */
export default function GoogleAnalytics({ id }: { id: string }) {
  const measurementId = id.trim();
  if (!GA4_ID_PATTERN.test(measurementId)) return null;
  if (process.env.NODE_ENV !== 'production') return null;

  return (
    <>
      <Script
        id="ga4-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
var host = window.location.hostname;
if (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local')) {
  gtag('config', '${measurementId}');
}
        `}
      </Script>
    </>
  );
}
