'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ImageUploader from '@/components/admin/ImageUploader';
import { saveOgImageAction } from '@/app/admin/settings-actions';
import { OG_IMAGE_SIZE } from '@/lib/site-config';

/**
 * 공유 미리보기 이미지 (og:image)
 *
 * ★ 무엇인가
 *   카카오톡·메신저에 사이트 주소를 붙여 넣으면 뜨는 그림입니다.
 *   손님 대부분이 카카오톡으로 링크를 주고받아서, 이 그림이 첫인상이 됩니다.
 *
 * ★ 비워 두면 지금처럼 자동 생성 이미지를 씁니다.
 *   app/opengraph-image.tsx 가 브랜드명을 얹어 1200×630 으로 그려 줍니다.
 *   그래서 "안 올리면 아무것도 안 나온다" 가 아니라 "기본 그림이 나간다" 입니다.
 *
 * ★ 업로드는 기존 파이프라인을 그대로 씁니다. (AboutImageForm 과 같은 방식)
 *   ImageUploader 가 /api/upload 로 보내 webp 로 줄인 뒤 R2 에 올리고 주소를 돌려줍니다.
 *
 * ★ frame='full' 입니다. 잘라 보여 주면 실제와 다른 인상을 줍니다.
 *   이 이미지는 원본 비율 그대로 공유 카드에 나갑니다.
 */
export default function OgImageForm({ imageUrl }: { imageUrl: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(imageUrl);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const save = (next: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveOgImageAction(next);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({
        tone: 'ok',
        text: next
          ? '저장했습니다. 공유 카드에 바로 반영됩니다.'
          : '이미지를 비웠습니다. 자동 생성 이미지로 돌아갑니다.',
      });
      router.refresh();
    });
  };

  return (
    <section className="admin-card p-4 md:p-5">
      <h2 className="text-[18px] font-semibold text-slate-900">공유 미리보기 이미지</h2>
      <p className="mt-1 text-[16px] leading-relaxed text-slate-600">
        카카오톡·메신저에 사이트 주소를 붙여 넣었을 때 뜨는 그림입니다.
        권장 크기 <strong>{OG_IMAGE_SIZE}</strong> (가로로 넓은 직사각형).
      </p>

      <div className="mt-4">
        <ImageUploader
          images={url ? [url] : []}
          onChange={(next) => {
            const first = next[0] ?? '';
            setUrl(first);
            /*
             * 올리거나 지우는 즉시 저장합니다.
             * 저장 버튼을 따로 두면 올려 놓고 저장을 빠뜨린 채 나가는 일이 생깁니다.
             */
            save(first);
          }}
          slug="og"
          multiple={false}
          frame="full"
          label="공유 미리보기 이미지를 끌어다 놓거나 클릭해서 선택하세요"
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

      <div className="mt-4 rounded-md bg-slate-50 p-3 text-[15px] leading-relaxed text-slate-700">
        <p className="font-semibold text-slate-900">알아 두실 것</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          <li>
            비워 두면 지금처럼 <strong>자동 생성 이미지</strong>가 나갑니다.
            브랜드명을 얹어 {OG_IMAGE_SIZE} 로 그려 줍니다.
          </li>
          <li>
            <strong>상품 상세·브랜드·소개 페이지는 그대로 자기 대표 사진</strong>을 씁니다.
            이 이미지는 메인·목록·안내처럼 내세울 사진이 없는 화면에만 쓰입니다.
          </li>
          <li>
            카카오톡은 한 번 읽은 미리보기를 한동안 저장해 둡니다. 바꾼 뒤에도 예전 그림이
            보이면 카카오 개발자 사이트의 캐시 초기화를 쓰거나 하루 정도 기다리세요.
          </li>
        </ul>
      </div>

      {pending ? (
        <p className="mt-3 text-[15px] text-slate-500">저장 중…</p>
      ) : null}
    </section>
  );
}
