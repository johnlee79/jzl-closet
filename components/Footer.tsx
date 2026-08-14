import Link from 'next/link';
import KakaoButton from '@/components/KakaoButton';
import { visibleCategories, type Category } from '@/lib/categories';
import type { StoreSettings } from '@/lib/site-config';

const infoLinks = [
  { href: '/about', label: '브랜드 소개' },
  { href: '/notice', label: '공지사항' },
  { href: '/brand', label: '브랜드 목록' },
  { href: '/guide', label: '배송·교환·반품 안내' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
  { href: '/order', label: '장바구니' },
  { href: '/order-lookup', label: '주문 조회' },
  { href: '/inquiry/new', label: '1:1 문의' },
];

/** 구매안전(에스크로) 서비스 표시. 설정에 값이 있을 때만 넘어옵니다. */
export type EscrowNotice = {
  notice: string;
  imageUrl: string;
  linkUrl: string;
};

/** 분류와 스토어 정보는 DB 에서 읽어 레이아웃이 넘겨 줍니다. */
export default function Footer({
  categories,
  store,
  escrow,
}: {
  categories: Category[];
  store: StoreSettings;
  escrow?: EscrowNotice;
}) {
  const menu = visibleCategories(categories);

  return (
    <footer className="mt-20 border-t border-stone md:mt-32">
      <div className="shell grid grid-cols-1 gap-12 py-16 md:grid-cols-4 md:gap-8 md:py-20">
        <div className="md:col-span-2">
          <p className="font-display text-[22px] font-light tracking-[0.34em] text-ink">
            {store.name}
          </p>
          <p className="mt-4 font-serif text-[17px] text-ink">{store.slogan}</p>
          <p className="mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink">
            {store.intro}
          </p>

          <div className="mt-8">
            <p className="label-xs">고객센터</p>
            <a
              href={`tel:${store.phone}`}
              className="mt-2 block font-display text-[26px] tracking-[0.1em] text-ink"
            >
              {store.phone}
            </a>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{store.hours}</p>
            {store.email ? (
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                <a href={`mailto:${store.email}`} className="underline underline-offset-4">
                  {store.email}
                </a>
              </p>
            ) : null}
            <div className="mt-5">
              <KakaoButton channelUrl={store.kakao} phone={store.phone} />
            </div>
          </div>
        </div>

        <nav aria-label="카테고리">
          <p className="label-xs">CATEGORY</p>
          <ul className="mt-4 flex flex-col gap-3">
            {menu.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  className="tap-target text-[15px] text-ink transition-opacity duration-200 hover:opacity-60"
                >
                  {category.nameKo}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/products"
                className="tap-target text-[15px] text-ink transition-opacity duration-200 hover:opacity-60"
              >
                전체 상품
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="이용 안내">
          <p className="label-xs">INFORMATION</p>
          <ul className="mt-4 flex flex-col gap-3">
            {infoLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="tap-target text-[15px] text-ink transition-opacity duration-200 hover:opacity-60"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-stone">
        <div className="shell py-10">
          <h2 className="label-xs">사업자 정보</h2>
          <dl className="mt-4 flex flex-col gap-2 text-[13px] leading-relaxed text-muted md:flex-row md:flex-wrap md:gap-x-8">
            <div className="flex gap-2">
              <dt>상호</dt>
              <dd className="text-ink">{store.business.company}</dd>
            </div>
            <div className="flex gap-2">
              <dt>대표자</dt>
              <dd className="text-ink">{store.business.ceo}</dd>
            </div>
            <div className="flex gap-2">
              <dt>사업자등록번호</dt>
              <dd className="text-ink">{store.business.regNumber}</dd>
            </div>
            <div className="flex gap-2">
              <dt>통신판매업신고번호</dt>
              <dd className="text-ink">{store.business.mailOrder}</dd>
            </div>
            <div className="flex gap-2">
              <dt>주소</dt>
              <dd className="text-ink">{store.business.address}</dd>
            </div>
            <div className="flex gap-2">
              <dt>고객센터</dt>
              <dd className="text-ink">{store.phone}</dd>
            </div>
          </dl>
          {/* 구매안전서비스 — 무통장입금 선결제는 표시가 필요합니다. */}
          {escrow && (escrow.notice || escrow.imageUrl) ? (
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-stone pt-6">
              {escrow.imageUrl ? (
                <a
                  href={escrow.linkUrl || undefined}
                  target={escrow.linkUrl ? '_blank' : undefined}
                  rel="noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={escrow.imageUrl}
                    alt="구매안전서비스 가입 확인"
                    className="h-auto max-w-[120px]"
                  />
                </a>
              ) : null}
              {escrow.notice ? (
                <p className="max-w-[640px] text-[13px] leading-relaxed text-muted">
                  {escrow.notice}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-6 text-[13px] tracking-[0.1em] text-muted">
            © {store.name} ALL RIGHTS RESERVED.
          </p>
        </div>
      </div>
    </footer>
  );
}
