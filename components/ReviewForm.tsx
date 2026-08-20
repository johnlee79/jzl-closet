'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import StarRating from '@/components/StarRating';
import { submitReviewAction } from '@/app/(shop)/mypage/review-actions';
import { formatPrice } from '@/lib/product-utils';
import { MAX_REVIEW_ATTACHMENTS, MAX_REVIEW_LENGTH } from '@/lib/site-config';
import { ACCEPT_IMAGE, deleteImages, uploadImages } from '@/lib/upload-client';

/** 별점 고르기 — 1~5 별을 눌러 정합니다. */
function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
      role="radiogroup"
      aria-label="별점"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star}점`}
          onMouseEnter={() => setHover(star)}
          onFocus={() => setHover(star)}
          onClick={() => onChange(star)}
          className="p-1"
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={star <= shown ? 'text-wine' : 'text-stone'}
          >
            <path
              fill="currentColor"
              d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z"
            />
          </svg>
        </button>
      ))}
      <span className="ml-2 text-[16px] text-ink">{shown > 0 ? `${shown}점` : ''}</span>
    </div>
  );
}

export default function ReviewForm({
  orderId,
  orderNo,
  product,
  tags,
  /** 적립될 포인트 안내 (0이면 안내하지 않습니다) */
  pointText,
}: {
  orderId: string;
  orderNo: string;
  product: { slug: string; name: string; optionKey: string; thumbnail: string };
  tags: string[];
  pointText: { text: number; photo: number };
}) {
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rating, setRating] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ earned: number } | null>(null);

  const toggleTag = (tag: string) =>
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const room = MAX_REVIEW_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setError(`사진은 최대 ${MAX_REVIEW_ATTACHMENTS}장까지 올릴 수 있습니다.`);
      return;
    }

    setError('');
    setUploading(0);
    try {
      const uploaded = await uploadImages(files.slice(0, room), 'reviews', setUploading);
      setAttachments((prev) => [...prev, ...uploaded.map((item) => item.url)]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : '사진을 올리지 못했습니다.'
      );
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAttachment = (url: string) => {
    setAttachments((prev) => prev.filter((item) => item !== url));
    void deleteImages([url]);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError('');
    startTransition(async () => {
      const result = await submitReviewAction({
        orderId,
        productSlug: product.slug,
        rating,
        tags: selected,
        content,
        attachments,
      });
      if (!result.ok) {
        setError(result.error);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setDone({ earned: result.data.earned });
    });
  };

  /** 지금 조건에서 받게 될 포인트 */
  const expected = attachments.length > 0 ? pointText.photo : pointText.text;

  if (done) {
    return (
      <div className="border border-stone p-6 md:p-8">
        <h2 className="font-serif text-[22px] text-ink">후기를 등록했습니다</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink">
          {done.earned > 0
            ? `${formatPrice(done.earned)}원 포인트를 적립해 드렸습니다. 감사합니다.`
            : '소중한 후기 감사합니다.'}
        </p>
        <div className="btn-row mt-6">
          <Link href={`/products/${product.slug}`} className="btn-primary">
            상품 페이지에서 보기
          </Link>
          <Link href="/mypage/orders" className="btn-secondary">
            주문 내역으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {error ? (
        <p
          role="alert"
          className="mb-8 border border-wine bg-wine/5 px-5 py-4 text-[16px] leading-relaxed text-wine"
        >
          {error}
        </p>
      ) : null}

      {/* ── 대상 상품 ─────────────────────────────────── */}
      <div className="flex items-center gap-4 border border-stone p-4">
        {product.thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.thumbnail}
            alt=""
            className="h-[72px] w-[56px] shrink-0 border border-stone object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-[17px] font-medium leading-snug text-ink">{product.name}</p>
          <p className="mt-1 text-[14px] text-muted">
            {product.optionKey || '옵션 없음'} · 주문 {orderNo}
          </p>
        </div>
      </div>

      {/* ── 별점 ──────────────────────────────────────── */}
      <div className="mt-10">
        <span className="label-xs block">별점 *</span>
        <div className="mt-3">
          <StarPicker value={rating} onChange={setRating} />
        </div>
      </div>

      {/* ── 태그 ──────────────────────────────────────── */}
      {tags.length > 0 ? (
        <div className="mt-10">
          <span className="label-xs block">좋았던 점 (여러 개 선택 가능)</span>
          <ul className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const on = selected.includes(tag);
              return (
                <li key={tag}>
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={on}
                    className={`inline-flex min-h-[44px] items-center border px-4 text-[15px] transition-colors ${
                      on
                        ? 'border-ink bg-ink text-paper'
                        : 'border-stone text-ink hover:border-ink'
                    }`}
                  >
                    {tag}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ── 본문 ──────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <label htmlFor="review-content" className="label-xs">
            후기 내용 *
          </label>
          <span
            className={`text-[14px] ${
              content.length > MAX_REVIEW_LENGTH ? 'text-wine' : 'text-muted'
            }`}
          >
            {content.length}/{MAX_REVIEW_LENGTH}
          </span>
        </div>
        <textarea
          id="review-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={7}
          maxLength={MAX_REVIEW_LENGTH}
          placeholder="사이즈나 색감, 착용감처럼 다른 분들께 도움이 될 내용을 적어 주시면 좋습니다."
          className="mt-2 w-full resize-none border border-stone bg-transparent p-4 text-[16px] leading-relaxed text-ink outline-none focus:border-ink"
        />
      </div>

      {/* ── 사진 ──────────────────────────────────────── */}
      <div className="mt-8">
        <span className="label-xs block">
          사진·동영상 (선택, 최대 {MAX_REVIEW_ATTACHMENTS}개)
        </span>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading !== null || attachments.length >= MAX_REVIEW_ATTACHMENTS}
            className="btn-secondary min-h-[44px] px-5 py-0 text-[15px] disabled:opacity-40"
          >
            {uploading !== null ? `올리는 중 ${uploading}%` : '사진 선택'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_IMAGE}
            multiple
            onChange={(event) => void handleFiles(event.target.files)}
            className="hidden"
          />
          <span className="text-[14px] text-muted">
            {attachments.length}/{MAX_REVIEW_ATTACHMENTS}개
          </span>
        </div>

        {attachments.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-3">
            {attachments.map((url) => (
              <li key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-[96px] w-[96px] border border-stone object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(url)}
                  aria-label="사진 삭제"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-black/60 text-[15px] leading-none text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {expected > 0 ? (
        <p className="mt-6 border border-stone px-5 py-4 text-[15px] leading-relaxed text-ink">
          지금 등록하시면 <strong>{formatPrice(expected)}P</strong> 가 적립됩니다.
          {attachments.length === 0 && pointText.photo > pointText.text ? (
            <span className="mt-1 block text-[14px] text-muted">
              사진 첨부 시 {formatPrice(pointText.photo)}P 적립
            </span>
          ) : null}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || rating === 0 || !content.trim()}
        className="btn-primary mt-8 w-full"
      >
        {pending ? '등록 중…' : '후기 등록'}
      </button>

      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        같은 주문의 같은 상품에는 후기를 한 번만 남기실 수 있습니다.
      </p>
    </form>
  );
}
