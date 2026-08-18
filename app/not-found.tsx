import Link from 'next/link';

/**
 * ============================================================
 * 뿌리 404 (3-J)
 * ============================================================
 *
 * ★ app/(shop)/not-found.tsx 와 별개로 필요합니다.
 *   그쪽은 (shop) 그룹 안에서 notFound() 를 불렀을 때만 나옵니다.
 *   어느 그룹에도 걸리지 않는 주소(예: /없는주소, /admin/없는주소)는
 *   여기로 오는데, 이 파일이 없으면 Next 의 기본 흑백 화면이 그대로 나옵니다.
 *   실제로 /this-page-does-not-exist 를 열어 보면 그 화면이 나왔습니다.
 *
 * ★ 이 파일은 뿌리 레이아웃 아래에서 그려집니다. 헤더·푸터가 없습니다.
 *   (shop) 레이아웃 밖이라 SiteProvider 도 없어, 설정을 읽는 컴포넌트를
 *   여기서 쓰면 안 됩니다. 그래서 글자와 링크만으로 만듭니다.
 *
 * ★ 사과조로 길게 쓰지 않습니다. 어디로 갈 수 있는지만 짧게 알려 줍니다.
 */
export default function RootNotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[1400px] flex-col justify-center px-5 py-20 md:px-10">
      <p className="font-display text-[64px] font-light leading-none tracking-[0.16em] text-ink md:text-[88px]">
        404
      </p>
      <h1 className="mt-6 font-serif text-[22px] leading-snug text-ink md:text-[28px]">
        찾으시는 페이지가 없습니다
      </h1>
      <p className="mt-4 max-w-[520px] text-[16px] leading-[1.9] text-ink md:text-[17px]">
        주소가 바뀌었거나 지워진 페이지일 수 있습니다.
      </p>

      <div className="btn-row mt-10 max-w-[420px]">
        <Link href="/" className="btn-primary">
          홈으로
        </Link>
        <Link href="/products" className="btn-secondary">
          전체 상품 보기
        </Link>
      </div>
    </div>
  );
}
