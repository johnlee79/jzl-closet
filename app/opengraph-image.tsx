import { ImageResponse } from 'next/og';

/**
 * ============================================================
 * 사이트 기본 공유 이미지 (3-J)
 * ============================================================
 *
 * ★ 왜 필요한가
 *   손님 대부분이 카카오톡으로 링크를 주고받습니다. og:image 가 없으면
 *   썸네일 없이 제목만 나가 눈에 띄지 않습니다. 상품·브랜드·소개 페이지는
 *   각자 대표 이미지를 og:image 로 내보내지만, 목록·약관 같은 페이지에는
 *   내세울 이미지가 없어 여태 아무것도 나가지 않았습니다.
 *
 * ★ 왜 그림 파일이 아니라 코드로 만드나
 *   1200×630 짜리 파일을 저장소에 넣어 두면 브랜드명이 바뀔 때 다시 그려야 합니다.
 *   여기서 그리면 글자만 고치면 됩니다. 파일이 늘지도 않습니다.
 *
 * ★ 글자를 영문(JZL CLOSET)으로만 씁니다.
 *   ImageResponse 는 한글을 그리려면 폰트 파일을 따로 실어 보내야 합니다.
 *   공유 카드 하나 때문에 한글 폰트(수 MB)를 함수에 얹을 이유가 없습니다.
 *   영문 로고는 원래 사이트에서도 Cormorant 로 크게 쓰는 표기라 어색하지 않습니다.
 *
 * ★ 이 파일은 하위 경로에 그대로 물려받습니다.
 *   각 페이지가 generateMetadata 에서 openGraph.images 를 직접 지정하면
 *   그쪽이 이깁니다. 상품 상세는 대표 사진이 나갑니다.
 */

/**
 * ★ edge 로 돌립니다. 노드 런타임에서 빌드 때 미리 그리려 하면
 *   기본 폰트를 URL 로 가져오다가 Invalid URL 로 빌드가 깨집니다.
 */
export const runtime = 'edge';

export const alt = 'JZL CLOSET';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** 고객 화면 토큰과 같은 값입니다. (app/globals.css) */
const PAPER = '#F6F5F2';
const INK = '#14141A';
const STONE = '#DBD7D1';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: PAPER,
          color: INK,
          // ★ 그림자를 쓰지 않습니다. 선 하나로만 구분합니다. (프로젝트 규칙)
          border: `1px solid ${STONE}`,
        }}
      >
        <div
          style={{
            fontSize: 96,
            letterSpacing: 28,
            fontWeight: 300,
            display: 'flex',
          }}
        >
          JZL CLOSET
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 30,
            letterSpacing: 10,
            color: '#55524E',
            display: 'flex',
          }}
        >
          BRAND SELECT SHOP
        </div>
      </div>
    ),
    size
  );
}
