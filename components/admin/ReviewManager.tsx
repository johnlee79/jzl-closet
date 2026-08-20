'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import AdminReviewForm from '@/components/admin/AdminReviewForm';
import StarRating from '@/components/StarRating';
import {
  deleteReviewAction,
  replyReviewAction,
  toggleReviewAction,
} from '@/app/admin/content-actions';
import { formatDate } from '@/lib/format';
import type { Review } from '@/lib/reviews';

type Message = { tone: 'ok' | 'error'; text: string } | null;

export default function ReviewManager({
  reviews,
  total,
  tags,
  products,
}: {
  reviews: Review[];
  total: number;
  /** 리뷰 작성 태그 목록 (설정에서 관리) */
  tags: string[];
  /** 직접 등록할 때 고를 상품 목록 */
  products: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [message, setMessage] = useState<Message>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const buildHref = (patch: Record<string, string>): string => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    okText: string
  ) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? '처리하지 못했습니다.' });
        return;
      }
      setMessage({ tone: 'ok', text: okText });
      router.refresh();
    });
  };

  const remove = (review: Review) => {
    if (!window.confirm('이 리뷰를 삭제할까요? 되돌릴 수 없습니다.')) return;
    run(
      () => deleteReviewAction(review.id, review.productSlug),
      '리뷰를 삭제했습니다.'
    );
  };

  const saveReply = (review: Review) => {
    run(
      () => replyReviewAction(review.id, replyText, review.productSlug),
      '답변을 저장했습니다.'
    );
    setReplying(null);
  };

  const select = (key: string, value: string) => router.push(buildHref({ [key]: value }));

  return (
    <div>
      {/* ── 직접 등록 ─────────────────────────────────── */}
      <section className="admin-card mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-slate-900">리뷰 직접 등록</h2>
            <p className="mt-1 text-[15px] text-slate-500">
              체험단·서포터즈가 실제로 받아 쓴 후기를 대신 입력합니다. 주문과 연결되지
              않고 포인트도 적립되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((prev) => !prev)}
            className={adding ? 'admin-btn' : 'admin-btn-primary'}
          >
            {adding ? '닫기' : '+ 리뷰 등록'}
          </button>
        </div>

        {adding ? (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <AdminReviewForm
              tags={tags}
              products={products}
              onDone={() => {
                setAdding(false);
                setMessage({ tone: 'ok', text: '리뷰를 등록했습니다.' });
                router.refresh();
              }}
            />
          </div>
        ) : null}
      </section>

      {/* ── 필터 ──────────────────────────────────────── */}
      <div className="admin-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              select('q', search.trim());
            }}
            className="flex flex-1 items-end gap-2"
          >
            <div className="min-w-[180px] flex-1">
              <label className="admin-label" htmlFor="review-search">
                검색 — 내용 · 작성자 · 상품 slug
              </label>
              <input
                id="review-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="admin-input"
              />
            </div>
            <button type="submit" className="admin-btn-primary">
              검색
            </button>
          </form>

          <div>
            <label className="admin-label" htmlFor="filter-product">상품</label>
            <select
              id="filter-product"
              value={params.get('product') ?? ''}
              onChange={(event) => select('product', event.target.value)}
              className="admin-input w-[200px]"
            >
              <option value="">전체</option>
              {products.map((product) => (
                <option key={product.slug} value={product.slug}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="admin-label" htmlFor="filter-rating">별점</label>
            <select
              id="filter-rating"
              value={params.get('rating') ?? ''}
              onChange={(event) => select('rating', event.target.value)}
              className="admin-input w-[110px]"
            >
              <option value="">전체</option>
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>
                  {rating}점
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="admin-label" htmlFor="filter-photo">사진</label>
            <select
              id="filter-photo"
              value={params.get('photo') ?? ''}
              onChange={(event) => select('photo', event.target.value)}
              className="admin-input w-[110px]"
            >
              <option value="">전체</option>
              <option value="yes">있음</option>
              <option value="no">없음</option>
            </select>
          </div>

          <div>
            <label className="admin-label" htmlFor="filter-visible">노출</label>
            <select
              id="filter-visible"
              value={params.get('visible') ?? ''}
              onChange={(event) => select('visible', event.target.value)}
              className="admin-input w-[110px]"
            >
              <option value="">전체</option>
              <option value="true">노출</option>
              <option value="false">숨김</option>
            </select>
          </div>

          <div>
            <label className="admin-label" htmlFor="filter-sponsored">체험단</label>
            <select
              id="filter-sponsored"
              value={params.get('sponsored') ?? ''}
              onChange={(event) => select('sponsored', event.target.value)}
              className="admin-input w-[110px]"
            >
              <option value="">전체</option>
              <option value="true">체험단</option>
              <option value="false">일반</option>
            </select>
          </div>

          {params.toString() ? (
            <Link href={pathname} className="admin-btn">
              초기화
            </Link>
          ) : null}
        </div>
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-4 rounded-md px-3 py-2 text-[16px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {/* ── 목록 ──────────────────────────────────────── */}
      <div className="admin-card mt-4">
        {reviews.length === 0 ? (
          <p className="px-4 py-16 text-center text-[16px] text-slate-500">
            조건에 맞는 리뷰가 없습니다.
          </p>
        ) : (
          <ul>
            {reviews.map((review) => (
              <li
                key={review.id}
                className={`border-b border-slate-200 p-4 last:border-b-0 ${
                  review.isVisible ? '' : 'bg-slate-50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StarRating value={review.rating} size={14} />
                      <span className="text-[16px] font-medium text-slate-900">
                        {review.writerName}
                      </span>
                      {review.isSponsored ? (
                        <span className="admin-badge bg-amber-100 text-amber-800">
                          체험단
                        </span>
                      ) : null}
                      {review.userId ? null : (
                        <span className="admin-badge bg-slate-100 text-slate-600">
                          직접 등록
                        </span>
                      )}
                      {review.attachments.length > 0 ? (
                        <span className="admin-badge bg-blue-100 text-blue-800">
                          사진 {review.attachments.length}
                        </span>
                      ) : null}
                      {!review.isVisible ? (
                        <span className="admin-badge bg-red-100 text-red-700">숨김</span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-[14px] text-slate-500">
                      <Link
                        href={`/products/${review.productSlug}`}
                        target="_blank"
                        className="text-blue-700 hover:underline"
                      >
                        {review.productSlug}
                      </Link>
                      {' · '}
                      {formatDate(review.writtenAt ?? review.createdAt)}
                      {/* 관리자가 작성일을 따로 지정한 후기는 실제 등록일도 함께 보여 줍니다. */}
                      {review.writtenAt &&
                      review.createdAt &&
                      formatDate(review.writtenAt) !== formatDate(review.createdAt) ? (
                        <span className="ml-1 text-slate-400">
                          (등록 {formatDate(review.createdAt)})
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            toggleReviewAction(
                              review.id,
                              !review.isVisible,
                              review.productSlug
                            ),
                          review.isVisible ? '숨김으로 바꿨습니다.' : '노출로 바꿨습니다.'
                        )
                      }
                      className="admin-btn"
                    >
                      {review.isVisible ? '숨기기' : '노출하기'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplying(replying === review.id ? null : review.id);
                        setReplyText(review.adminReply);
                      }}
                      className="admin-btn"
                    >
                      답변
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(review)}
                      className="admin-btn-danger"
                    >
                      {pending ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                </div>

                {review.tags.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {review.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded bg-slate-100 px-2 py-0.5 text-[14px] text-slate-700"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed text-slate-800">
                  {review.content}
                </p>

                {review.attachments.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {review.attachments.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="h-[80px] w-[80px] rounded-md border border-slate-200 object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {review.adminReply && replying !== review.id ? (
                  <div className="mt-3 rounded-md bg-slate-50 p-3">
                    <p className="text-[14px] font-medium text-slate-600">판매자 답변</p>
                    <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">
                      {review.adminReply}
                    </p>
                  </div>
                ) : null}

                {replying === review.id ? (
                  <div className="mt-3">
                    <textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      rows={3}
                      placeholder="답변을 입력하세요. 비우고 저장하면 답변이 지워집니다."
                      className="admin-input leading-relaxed"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => saveReply(review)}
                        className="admin-btn-primary"
                      >
                        {pending ? '저장 중…' : '답변 저장'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplying(null)}
                        className="admin-btn"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[15px] text-slate-500">전체 {total}건</p>
    </div>
  );
}
