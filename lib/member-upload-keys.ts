/**
 * 손님(리뷰·문의) 사진의 저장 위치 규칙.
 *
 * ★ 저장 위치: {폴더}/{회원 id}/{타임스탬프}-{랜덤6자}.webp  (썸네일은 …/thumb/…)
 *   products/ 아래가 아닙니다. 관리자 상품 이미지와 섞이지 않습니다.
 *
 * ★ 「남의 사진을 지울 수 없다」는 약속이 전부 여기 한 곳에 있습니다.
 *   아무것도 가져오지 않는 순수 함수라 따로 떼어 시험할 수 있습니다.
 */

export const MEMBER_FOLDERS: Record<string, string> = {
  reviews: '리뷰 사진',
  inquiries: '문의 사진',
};

export function makeMemberKeys(folder: string, userId: string): { key: string; thumbKey: string } {
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  const fileName = `${Date.now()}-${random}.webp`;
  return {
    key: `${folder}/${userId}/${fileName}`,
    thumbKey: `${folder}/${userId}/thumb/${fileName}`,
  };
}

/**
 * 이 회원이 지워도 되는 키인지.
 * @returns 지워도 되면 [본 이미지 키, 썸네일 키], 썸네일 주소가 들어왔으면 [] (본 이미지와 짝으로 지웁니다),
 *          자기 폴더 밖이면 null
 */
export function ownMemberKeys(key: string, folder: string, userId: string): string[] | null {
  if (!(folder in MEMBER_FOLDERS) || !userId) return null;
  const prefix = `${folder}/${userId}/`;
  // ★ '..' 나 '//' 같은 꼼수로 폴더 밖을 가리키는 것도 막습니다.
  if (!key.startsWith(prefix) || key.includes('..') || key.includes('//') || key.includes('\\')) {
    return null;
  }
  const rest = key.slice(prefix.length);
  if (!rest) return null;
  if (rest.startsWith('thumb/')) return /^thumb\/[^/]+$/.test(rest) ? [] : null;
  if (rest.includes('/')) return null;
  return [key, `${prefix}thumb/${rest}`];
}
