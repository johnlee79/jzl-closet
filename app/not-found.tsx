import Link from 'next/link';
import { getVisibleCategories } from '@/lib/categories';
import { store } from '@/lib/store';

export default function NotFound() {
  const menu = getVisibleCategories();

  return (
    <div className="shell flex min-h-[60vh] flex-col justify-center py-20">
      <p className="font-display text-[64px] font-light leading-none tracking-[0.16em] text-ink md:text-[88px]">
        404
      </p>
      <h1 className="mt-6 font-serif text-[22px] leading-snug text-ink md:text-[28px]">
        찾으시는 페이지가 없습니다
      </h1>
      <p className="mt-4 max-w-[520px] text-[13px] leading-[1.9] text-muted md:text-[14px]">
        주소가 바뀌었거나 판매가 종료된 상품일 수 있습니다. 아래 링크에서 다시
        찾아보시거나 고객센터 {store.phone}으로 문의해 주세요.
      </p>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link href="/" className="btn-primary">
          홈으로
        </Link>
        <Link href="/products" className="btn-secondary">
          전체 상품 보기
        </Link>
      </div>

      <nav aria-label="카테고리" className="mt-12 border-t border-stone pt-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-3">
          {menu.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/category/${category.slug}`}
                className="text-[13px] text-muted transition-colors duration-200 hover:text-ink"
              >
                {category.nameKo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
