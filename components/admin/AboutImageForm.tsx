'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ImageUploader from '@/components/admin/ImageUploader';
import { saveAboutImageAction } from '@/app/admin/settings-actions';
import { ABOUT_IMAGE_SIZE } from '@/lib/site-config';

/**
 * /about 대표 이미지 (3-I)
 *
 * ★ 업로드는 기존 파이프라인을 그대로 씁니다. ImageUploader 가 /api/upload 로 보내
 *   webp 로 줄인 뒤 R2 에 올리고 주소를 돌려줍니다. 여기서는 그 주소만 저장합니다.
 * ★ frame='full' 입니다. 이 이미지는 자르지 않고 원본 비율 그대로 나갑니다.
 *   3:4 로 잘리는 미리보기를 붙이면 없는 문제를 있는 것처럼 보여 줍니다.
 * ★ 비워 두면 /about 이 이미지 영역 자체를 건너뛰고 제목부터 시작합니다.
 */
export default function AboutImageForm({ imageUrl }: { imageUrl: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(imageUrl);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const save = (next: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveAboutImageAction(next);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({
        tone: 'ok',
        text: next ? '저장했습니다. /about 에 바로 반영됩니다.' : '이미지를 비웠습니다.',
      });
      router.refresh();
    });
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4">
      <p className="text-[15px] leading-relaxed text-slate-600">
        /about 맨 위에 깔리는 가로로 넓은 이미지입니다. 권장 크기 {ABOUT_IMAGE_SIZE}.
        비워 두면 이미지 없이 제목부터 시작합니다.
      </p>

      <div className="mt-4">
        <ImageUploader
          images={url ? [url] : []}
          onChange={(next) => {
            const first = next[0] ?? '';
            setUrl(first);
            // 올리거나 지우는 즉시 저장합니다. 저장 버튼을 따로 누르게 하면
            // 올려 놓고 저장을 빠뜨린 채 나가는 일이 생깁니다.
            save(first);
          }}
          slug="about"
          multiple={false}
          frame="full"
          label="대표 이미지를 끌어다 놓거나 클릭해서 선택하세요"
        />
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

      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/about" target="_blank" rel="noreferrer" className="admin-btn">
          페이지 보기 ↗
        </a>
        {pending ? <span className="self-center text-[15px] text-slate-500">저장 중…</span> : null}
      </div>
    </div>
  );
}
