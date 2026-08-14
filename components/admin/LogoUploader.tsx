'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ImageUploader from '@/components/admin/ImageUploader';
import { saveLogoAction } from '@/app/admin/settings-actions';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/**
 * 헤더 로고 이미지.
 * 올리지 않으면 지금처럼 텍스트 로고(JZL CLOSET)를 씁니다.
 */
export default function LogoUploader({
  initialUrl,
  storeName,
}: {
  initialUrl: string;
  storeName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState<Message>(null);

  const save = (next: string) => {
    setUrl(next);
    setMessage(null);
    startTransition(async () => {
      const result = await saveLogoAction(next);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({
        tone: 'ok',
        text: next ? '로고를 적용했습니다.' : '텍스트 로고로 되돌렸습니다.',
      });
      router.refresh();
    });
  };

  return (
    <section className="admin-card p-4 md:p-5">
      <h2 className="text-[16px] font-semibold text-slate-900">로고 이미지</h2>
      <p className="mt-1 text-[13px] text-slate-500">
        헤더에 쓰는 로고입니다. 올리지 않으면 텍스트 로고 “{storeName}” 를 씁니다.
      </p>

      <div className="mt-4">
        <span className="admin-label">미리보기 (헤더 높이 기준)</span>
        <div className="flex h-16 items-center rounded-md border border-slate-200 bg-white px-4">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt="로고 미리보기" className="max-h-9 w-auto object-contain" />
          ) : (
            <span className="font-display text-[20px] font-light tracking-[0.34em] text-slate-900">
              {storeName}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <ImageUploader
          images={url ? [url] : []}
          onChange={(next) => save(next[0] ?? '')}
          slug="branding/logo"
          multiple={false}
          label="로고 이미지를 끌어다 놓거나 클릭해서 선택하세요"
        />
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
          가로로 긴 이미지(예: 400×80)를 권장합니다. 배경이 없는 png 가 가장 깔끔합니다.
        </p>
      </div>

      {url ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => save('')}
          className="admin-btn-danger mt-4"
        >
          텍스트 로고로 되돌리기
        </button>
      ) : null}

      {message ? (
        <p
          role="status"
          className={`mt-4 rounded-md px-3 py-2 text-[14px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
