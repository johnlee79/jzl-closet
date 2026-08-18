import { permanentRedirect } from 'next/navigation';

/**
 * 예전 브랜드 목록 주소 /brand.
 *
 * ★ 3-G 에서 목록을 /brands 로 옮겼습니다. 여기는 넘겨주기만 합니다.
 *   같은 목록을 두 주소에 두면 검색엔진이 어느 쪽을 본문으로 볼지 정하지 못하고,
 *   이미 밖에 퍼진 /brand 링크도 살려 둬야 합니다.
 *   308(영구)로 넘겨 두면 색인도 새 주소로 옮겨 갑니다.
 *
 * ★ /brand/{slug} 상세는 그대로입니다. 주소를 바꾸지 않았습니다.
 *   이미 색인된 브랜드 페이지 주소를 바꾸면 그동안 쌓인 순위를 버리게 됩니다.
 */
export default function BrandListRedirect(): never {
  permanentRedirect('/brands');
}
