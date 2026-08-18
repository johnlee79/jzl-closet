'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import SnsLinks from '@/components/SnsLinks';
import { saveSnsAction } from '@/app/admin/settings-actions';
import { SNS_ITEMS, hasAnySns, type SnsKey, type SnsSettings } from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/**
 * 설정 > SNS.
 *
 * ★ 입력칸은 SNS_ITEMS 를 돌면서 만듭니다.
 *   나중에 유튜브·페이스북을 붙일 때 이 파일은 고치지 않아도 됩니다.
 *   (lib/site-config.ts 의 SNS_ITEMS 와 components/SnsIcons.tsx 만 고치면 됩니다)
 *
 * ★ 위챗만 입력칸이 아니라 이미지 업로드입니다.
 *   위챗에는 프로필 주소라는 개념이 없어 QR 을 보여 줘야 하기 때문입니다.
 *   올린 이미지는 R2 에 저장되고, 손님 화면에서는 눌렀을 때 모달로 뜹니다.
 */
export default function SnsForm({ initial }: { initial: SnsSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<SnsSettings>(initial);
  const [message, setMessage] = useState<Message>(null);

  const setLink = (key: SnsKey, value: string) => {
    setForm((prev) => ({ ...prev, links: { ...prev.links, [key]: value } }));
    setMessage(null);
  };

  const setQr = (value: string) => {
    setForm((prev) => ({ ...prev, wechatQrUrl: value }));
    setMessage(null);
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveSnsAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다. 푸터에 바로 반영됩니다.' });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">SNS 주소</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          푸터와 브랜드 페이지 아래쪽에 아이콘으로 나갑니다.{' '}
          <strong>비워 두면 그 아이콘은 나오지 않습니다.</strong> 주소는 http:// 또는
          https:// 로 시작해야 합니다.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {SNS_ITEMS.map((item) => (
            <div key={item.key}>
              <label className="admin-label" htmlFor={`sns-${item.key}`}>
                {item.label}
              </label>
              <input
                id={`sns-${item.key}`}
                type="url"
                inputMode="url"
                value={form.links[item.key]}
                onChange={(event) => setLink(item.key, event.target.value)}
                placeholder={item.placeholder}
                className="admin-input"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">위챗 QR 이미지</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          위챗은 링크로 열 수 없어 QR 이미지를 씁니다. 손님이 아이콘을 누르면 사이트를
          벗어나지 않고 이 이미지가 창으로 뜹니다. 정사각형 이미지를 권장합니다.
        </p>

        <div className="mt-4">
          <ImageUploader
            images={form.wechatQrUrl ? [form.wechatQrUrl] : []}
            onChange={(next) => setQr(next[0] ?? '')}
            slug="sns/wechat"
            multiple={false}
            label="위챗 QR 이미지를 끌어다 놓거나 클릭해서 선택하세요"
            frame="full"
          />
        </div>
      </section>

      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">미리보기</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          손님 화면에 나갈 모습입니다. (저장 전에도 지금 입력한 값으로 보여 줍니다)
        </p>
        <div className="mt-3 rounded-md border border-slate-200 bg-[#F6F5F2] px-3 py-2">
          {hasAnySns(form) ? (
            <SnsLinks sns={form} />
          ) : (
            <p className="py-3 text-[13px] text-slate-500">
              아직 채운 항목이 없어 푸터에 SNS 줄이 나오지 않습니다.
            </p>
          )}
        </div>
      </section>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[14px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="admin-btn-primary disabled:opacity-50"
        >
          {pending ? '저장 중…' : 'SNS 설정 저장'}
        </button>
      </div>
    </div>
  );
}
