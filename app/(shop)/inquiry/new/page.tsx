import type { Metadata } from 'next';
import Link from 'next/link';
import InquiryForm, { type OrderOption } from '@/components/InquiryForm';
import { getCurrentProfile, getCurrentUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { getOrdersOfUser } from '@/lib/orders';
import { getProductBySlug } from '@/lib/products';
import { getCachedStore } from '@/lib/settings';

/** ★ 개인정보를 입력하는 화면이라 검색에 잡히면 안 됩니다. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '1:1 문의',
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: { product?: string; order?: string };
};

export default async function NewInquiryPage({ searchParams }: PageProps) {
  const [user, profile, store] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    getCachedStore(),
  ]);

  const isMember = Boolean(user && profile && profile.status === 'active');

  // 회원이면 본인 주문을 골라 붙일 수 있게 목록을 넘깁니다.
  let orders: OrderOption[] = [];
  if (isMember && user) {
    const list = await getOrdersOfUser(user.id);
    orders = list.slice(0, 30).map((order) => {
      const live = order.items.filter((item) => item.itemStatus === 'normal');
      const summary =
        live.length === 0
          ? '(전체 취소)'
          : `${live[0].productName}${live.length > 1 ? ` 외 ${live.length - 1}건` : ''}`;
      return {
        id: order.id,
        label: `${order.orderNo} · ${formatDate(order.createdAt)} · ${summary}`,
      };
    });
  }

  // 상품 상세의 [상품 문의하기] 로 들어온 경우
  const product = searchParams.product
    ? await getProductBySlug(searchParams.product)
    : null;

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">INQUIRY</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          1:1 문의
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          궁금한 점을 남겨 주시면 영업일 기준 1~2일 안에 답변드립니다. 급하신 문의는
          고객센터 {store.phone}으로 전화 주세요.
        </p>
        {!isMember ? (
          <p className="mt-3 text-[15px] text-ink">
            <Link href="/login?next=/inquiry/new" className="link-wine">
              로그인
            </Link>
            하시면 마이페이지에서 문의 내역을 모아 보실 수 있습니다. 로그인 없이도 문의하실
            수 있습니다.
          </p>
        ) : null}
      </header>

      <InquiryForm
        member={
          isMember && profile
            ? {
                name: profile.name,
                phone: profile.phone,
                email: profile.email || user?.email || '',
              }
            : null
        }
        orders={orders}
        product={
          product ? { id: product.id, name: product.name } : null
        }
        defaultOrderId={searchParams.order ?? ''}
      />

      <p className="mt-12 border-t border-stone pt-6 text-[13px] leading-relaxed text-muted">
        비회원으로 문의하셨다면{' '}
        <Link href="/inquiry/lookup" className="link-wine">
          문의 조회
        </Link>
        에서 문의번호와 비밀번호로 답변을 확인하실 수 있습니다.
      </p>
    </div>
  );
}
