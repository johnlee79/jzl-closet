import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReviewForm from '@/components/ReviewForm';
import { getActiveMember } from '@/lib/auth';
import { getOrderOfUser } from '@/lib/orders';
import { hasReviewed } from '@/lib/reviews';
import { getPointSettings, getReviewSettings } from '@/lib/settings';

export const metadata = { title: '후기 쓰기' };

type PageProps = { searchParams: { order?: string; product?: string } };

export default async function NewReviewPage({ searchParams }: PageProps) {
  const member = await getActiveMember();
  if (!member) return null;

  const orderId = (searchParams.order ?? '').trim();
  const productSlug = (searchParams.product ?? '').trim();
  if (!orderId || !productSlug) notFound();

  // ★ 본인 주문인지 서버에서 확인합니다.
  const order = await getOrderOfUser(member.user.id, orderId);
  if (!order) notFound();

  const item = order.items.find(
    (entry) => entry.productSlug === productSlug && entry.itemStatus === 'normal'
  );
  if (!item) notFound();

  const reviewable = ['delivered', 'confirmed'].includes(order.status);
  const already = item.productId ? await hasReviewed(order.id, item.productId) : false;

  const [review, points] = await Promise.all([getReviewSettings(), getPointSettings()]);

  if (!reviewable || already) {
    return (
      <section>
        <h2 className="font-serif text-[22px] text-ink">후기 쓰기</h2>
        <p className="mt-6 border border-stone px-5 py-4 text-[16px] leading-relaxed text-ink">
          {already
            ? '이미 이 상품의 후기를 남기셨습니다.'
            : '배송이 완료된 주문에만 후기를 남기실 수 있습니다.'}
        </p>
        <Link href="/mypage/orders" className="btn-secondary mt-6">
          주문 내역으로
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-serif text-[22px] text-ink">후기 쓰기</h2>
      <div className="mt-8">
        <ReviewForm
          orderId={order.id}
          orderNo={order.orderNo}
          product={{
            slug: item.productSlug,
            name: item.productName,
            optionKey: item.optionKey,
            thumbnail: item.thumbnailUrl,
          }}
          tags={review.tags}
          pointText={{
            text: points.reviewText.enabled ? points.reviewText.amount : 0,
            photo: points.reviewPhoto.enabled ? points.reviewPhoto.amount : 0,
          }}
        />
      </div>
    </section>
  );
}
