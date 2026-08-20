'use client';

import { useRef, useState, useTransition } from 'react';
import { createAdminReviewAction } from '@/app/admin/content-actions';
import { MAX_REVIEW_ATTACHMENTS, MAX_REVIEW_LENGTH, SPONSORED_NOTICE } from '@/lib/site-config';
import { ACCEPT_IMAGE, deleteImages, uploadImages } from '@/lib/upload-client';

/**
 * 관리자가 직접 등록하는 리뷰.
 * 체험단·서포터즈가 실제로 제품을 받아 쓴 후기를 대신 입력하는 용도입니다.
 *
 * ★ "체험단·무상제공 후기" 는 기본으로 체크되어 있습니다.
 *   체크를 풀려고 하면 확인 창을 띄웁니다.
 *   이 표시가 있어야 표시광고법상 문제가 없습니다. 기능을 빼거나 숨기지 마세요.
 */
/** 작성일에 미래 날짜를 고르지 못하게 막습니다. */
const TODAY = new Date().toISOString().slice(0, 10);

export default function AdminReviewForm({
  tags,
  products,
  onDone,
}: {
  tags: string[];
  products: { slug: string; name: string }[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [productSearch, setProductSearch] = useState('');
  const [productSlug, setProductSlug] = useState('');
  const [writerName, setWriterName] = useState('');
  const [rating, setRating] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  // ★ 기본값은 체크된 상태입니다.
  const [isSponsored, setIsSponsored] = useState(true);
  /**
   * 화면에 보여 줄 작성일.
   * ★ 상품을 먼저 보내고 체험단 사진이 며칠 뒤에 오는 경우가 있어 실제 날짜와 맞춥니다.
   *   비워 두면 지금 시각으로 들어갑니다. 실제 등록 시각(created_at)은 따로 남습니다.
   */
  const [writtenDate, setWrittenDate] = useState('');
  const [writtenTime, setWrittenTime] = useState('');
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState('');

  const filtered = productSearch.trim()
    ? products.filter(
        (product) =>
          product.name.toLowerCase().includes(productSearch.trim().toLowerCase()) ||
          product.slug.includes(productSearch.trim().toLowerCase())
      )
    : products;

  const toggleTag = (tag: string) =>
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );

  /** 체크를 풀려고 하면 한 번 더 확인합니다. */
  const changeSponsored = (checked: boolean) => {
    if (!checked) {
      const ok = window.confirm(
        '제품을 무상 제공받은 후기는 그 사실을 표시해야 합니다.\n실제 구매 후기가 맞습니까?'
      );
      if (!ok) return;
    }
    setIsSponsored(checked);
  };

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const room = MAX_REVIEW_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setError(`사진은 최대 ${MAX_REVIEW_ATTACHMENTS}개까지 올릴 수 있습니다.`);
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
      const result = await createAdminReviewAction({
        productSlug,
        writerName,
        rating,
        tags: selected,
        content,
        attachments,
        isSponsored,
        writtenAt: writtenDate
          ? writtenTime
            ? `${writtenDate}T${writtenTime}`
            : writtenDate
          : '',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // 다음 등록을 이어서 하기 쉽게 내용만 비웁니다.
      setWriterName('');
      setContent('');
      setSelected([]);
      setAttachments([]);
      setIsSponsored(true);
      setWrittenDate('');
      setWrittenTime('');
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[16px] text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="admin-label" htmlFor="ar-search">
            상품 찾기
          </label>
          <input
            id="ar-search"
            type="search"
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="상품명 또는 slug"
            className="admin-input"
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="ar-product">
            상품 선택 *
          </label>
          <select
            id="ar-product"
            value={productSlug}
            onChange={(event) => setProductSlug(event.target.value)}
            className="admin-input"
          >
            <option value="">선택하세요 ({filtered.length}개)</option>
            {filtered.map((product) => (
              <option key={product.slug} value={product.slug}>
                {product.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="admin-label" htmlFor="ar-writer">
            작성자 이름 *
          </label>
          <input
            id="ar-writer"
            type="text"
            value={writerName}
            onChange={(event) => setWriterName(event.target.value)}
            placeholder="홍길동"
            className="admin-input"
          />
        </div>
        <div>
          <span className="admin-label">작성일 (선택)</span>
          <div className="flex gap-2">
            <input
              type="date"
              value={writtenDate}
              max={TODAY}
              onChange={(event) => setWrittenDate(event.target.value)}
              aria-label="후기 작성일"
              className="admin-input"
            />
            <input
              type="time"
              value={writtenTime}
              onChange={(event) => setWrittenTime(event.target.value)}
              aria-label="후기 작성 시각"
              disabled={!writtenDate}
              className="admin-input max-w-[130px]"
            />
          </div>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            비워 두면 지금 시각으로 들어갑니다. 미래 날짜는 고를 수 없습니다. 시간을 비우면
            그날 낮 12시로 저장됩니다.
          </p>
        </div>

        <div>
          <label className="admin-label" htmlFor="ar-rating">
            별점 *
          </label>
          <select
            id="ar-rating"
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
            className="admin-input"
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {'★'.repeat(value)} {value}점
              </option>
            ))}
          </select>
        </div>
      </div>

      {tags.length > 0 ? (
        <div>
          <span className="admin-label">태그</span>
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const on = selected.includes(tag);
              return (
                <li key={tag}>
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={on}
                    className={`rounded-md border px-3 py-1.5 text-[15px] transition-colors ${
                      on
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
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

      <div>
        <div className="flex items-baseline justify-between">
          <label className="admin-label" htmlFor="ar-content">
            내용 *
          </label>
          <span
            className={`text-[14px] ${
              content.length > MAX_REVIEW_LENGTH ? 'text-red-700' : 'text-slate-500'
            }`}
          >
            {content.length}/{MAX_REVIEW_LENGTH}
          </span>
        </div>
        <textarea
          id="ar-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
          maxLength={MAX_REVIEW_LENGTH}
          className="admin-input leading-relaxed"
        />
      </div>

      <div>
        <span className="admin-label">
          사진·동영상 (최대 {MAX_REVIEW_ATTACHMENTS}개)
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading !== null || attachments.length >= MAX_REVIEW_ATTACHMENTS}
            className="admin-btn"
          >
            {uploading !== null ? `올리는 중 ${uploading}%` : '파일 선택'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_IMAGE}
            multiple
            onChange={(event) => void handleFiles(event.target.files)}
            className="hidden"
          />
          <span className="text-[15px] text-slate-500">
            {attachments.length}/{MAX_REVIEW_ATTACHMENTS}
          </span>
        </div>

        {attachments.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {attachments.map((url) => (
              <li key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-[80px] w-[80px] rounded-md border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(url)}
                  aria-label="사진 삭제"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[15px] leading-none text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ★ 표시광고법 — 체험단 후기임을 밝히는 자리입니다. */}
      <div
        className={`rounded-md border p-4 ${
          isSponsored ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'
        }`}
      >
        <label className="flex cursor-pointer items-start gap-3 text-[16px] text-slate-900">
          <input
            type="checkbox"
            checked={isSponsored}
            onChange={(event) => changeSponsored(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <strong>체험단·무상제공 후기</strong>
            <span className="mt-1 block text-[15px] leading-relaxed">
              {isSponsored ? (
                <>
                  상품 페이지의 이 후기 아래에 <strong>{SPONSORED_NOTICE}</strong> 가
                  표시됩니다.
                </>
              ) : (
                <>
                  표시 문구가 나오지 않습니다. 실제 구매 후기가 아니라면 반드시 다시
                  체크해 주세요. 무상 제공 사실을 숨기면 표시광고법 위반입니다.
                </>
              )}
            </span>
          </span>
        </label>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending || !productSlug || !writerName.trim() || !content.trim()}
          className="admin-btn-primary"
        >
          {pending ? '등록 중…' : '리뷰 등록'}
        </button>
        <p className="mt-2 text-[14px] text-slate-500">
          실제 주문과 연결되지 않습니다. 포인트도 적립되지 않고 텔레그램 알림도 가지
          않습니다.
        </p>
      </div>
    </form>
  );
}
