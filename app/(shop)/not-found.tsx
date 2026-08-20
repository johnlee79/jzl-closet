import Link from 'next/link';
import { visibleCategories } from '@/lib/categories';
import { resolveCopy } from '@/lib/copy';
import { getCachedCopy, getCachedStore } from '@/lib/settings';
import { getCachedCategories } from '@/lib/taxonomy';

export default async function NotFound() {
  const [categories, store, copy] = await Promise.all([
    getCachedCategories(),
    getCachedStore(),
    getCachedCopy(),
  ]);

  const menu = visibleCategories(categories);
  const blocks = resolveCopy(copy.notFound, store);
  const first = blocks[0];

  return (
    <div className="shell flex min-h-[60vh] flex-col justify-center py-20">
      <p className="font-display text-[64px] font-light leading-none tracking-[0.16em] text-ink md:text-[88px]">
        404
      </p>
      <h1 className="mt-6 font-serif text-[24px] leading-snug text-ink md:text-[30px]">
        {first?.heading || '찾으시는 페이지가 없습니다'}
      </h1>
      {blocks.map((block, index) => (
        <div
          key={index}
          className="detail-body mt-4 max-w-[520px] text-[17px] leading-[1.9] text-ink md:text-[18px]"
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      ))}

      <div className="btn-row mt-10">
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
                className="text-[16px] text-ink transition-colors duration-200 hover:text-ink"
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
