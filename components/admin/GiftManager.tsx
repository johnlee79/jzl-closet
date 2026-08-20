'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import { deleteGiftAction, saveGiftAction } from '@/app/admin/referral-actions';
import type { Gift } from '@/lib/referrals';

/**
 * 사은품 등록.
 *
 * ★ 사진이 이 화면의 핵심입니다.
 *   회원은 마이페이지 초대 화면에서 이 사진을 보고 "받고 싶다"고 느낍니다.
 *   글자만 있으면 목표를 채울 이유가 잘 와닿지 않습니다.
 */

type Draft = {
  name: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  isVisible: boolean;
  displayOrder: number;
};

function emptyDraft(order: number): Draft {
  return {
    name: '',
    description: '',
    imageUrl: '',
    linkUrl: '',
    isVisible: true,
    displayOrder: order,
  };
}

function GiftForm({
  initial,
  isNew,
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft;
  isNew: boolean;
  busy: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="border border-slate-200 p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="admin-label">사은품 이름</label>
          <input
            type="text"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="캠핑 테이블"
            className="admin-input"
          />
        </div>
        <div>
          <label className="admin-label">진열 순서</label>
          <input
            type="number"
            value={draft.displayOrder}
            onChange={(event) => set('displayOrder', Number(event.target.value) || 0)}
            className="admin-input"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="admin-label">설명 문구</label>
        <textarea
          rows={2}
          value={draft.description}
          onChange={(event) => set('description', event.target.value)}
          placeholder="접이식 원목 캠핑 테이블입니다. 색상은 랜덤 발송됩니다."
          className="admin-input"
        />
      </div>

      <div className="mt-4">
        <label className="admin-label">링크 (선택)</label>
        <input
          type="text"
          value={draft.linkUrl}
          onChange={(event) => set('linkUrl', event.target.value)}
          placeholder="/products/item-abc 또는 https://…"
          className="admin-input"
        />
        <p className="mt-1 text-[14px] text-slate-500">
          상품 페이지나 소개 페이지로 연결합니다. 비워 두면 링크를 걸지 않습니다.
        </p>
      </div>

      <div className="mt-4">
        <label className="admin-label">사은품 이미지</label>
        <ImageUploader
          images={draft.imageUrl ? [draft.imageUrl] : []}
          onChange={(images) => set('imageUrl', images[0] ?? '')}
          slug="referral-gift"
          multiple={false}
          label="사은품 이미지"
          // ★ 사은품 사진은 자르지 않고 원본 비율 그대로 보여 줍니다.
          //   상품 썸네일이 아니라 "이런 걸 드립니다" 하고 보여 주는 사진입니다.
          frame="full"
        />
      </div>

      <label className="mt-4 flex items-center gap-2 text-[16px] text-slate-800">
        <input
          type="checkbox"
          checked={draft.isVisible}
          onChange={(event) => set('isVisible', event.target.checked)}
        />
        회원 화면에 보이기
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy}
          className="admin-btn-primary disabled:opacity-50"
        >
          {busy ? '저장 중…' : isNew ? '등록' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="admin-btn">
          취소
        </button>
      </div>
    </div>
  );
}

export default function GiftManager({ gifts }: { gifts: Gift[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const save = (draft: Draft, id?: string) => {
    startTransition(async () => {
      const result = await saveGiftAction(draft, id);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다.' });
      setEditing(null);
      router.refresh();
    });
  };

  const remove = (id: string, name: string) => {
    // ★ 목표가 이 사은품을 쓰고 있으면 목표 쪽 연결이 비워집니다. 미리 알려 줍니다.
    if (!window.confirm(`"${name}" 사은품을 지울까요?\n이 사은품을 쓰는 목표는 보상이 비워집니다.`)) {
      return;
    }
    startTransition(async () => {
      const result = await deleteGiftAction(id);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '지웠습니다.' });
      router.refresh();
    });
  };

  const nextOrder = gifts.length > 0 ? Math.max(...gifts.map((g) => g.displayOrder)) + 1 : 0;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {message ? (
        <p
          role="status"
          className={`text-[15px] ${
            message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {gifts.length === 0 && editing !== 'new' ? (
        <p className="text-[16px] text-slate-600">
          아직 등록한 사은품이 없습니다. 포인트 보상만 쓰신다면 등록하지 않으셔도 됩니다.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {gifts.map((gift) => (
          <li key={gift.id}>
            {editing === gift.id ? (
              <GiftForm
                initial={{
                  name: gift.name,
                  description: gift.description,
                  imageUrl: gift.imageUrl,
                  linkUrl: gift.linkUrl,
                  isVisible: gift.isVisible,
                  displayOrder: gift.displayOrder,
                }}
                isNew={false}
                busy={pending}
                onSave={(draft) => save(draft, gift.id)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-4 border border-slate-200 p-4">
                {gift.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={gift.imageUrl}
                    alt={gift.name}
                    className="h-[64px] w-[86px] shrink-0 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-[64px] w-[86px] shrink-0 items-center justify-center bg-slate-100 text-[14px] text-slate-400">
                    이미지 없음
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] text-slate-900">{gift.name}</p>
                  {gift.description ? (
                    <p className="mt-1 text-[15px] text-slate-600">{gift.description}</p>
                  ) : null}
                  {!gift.isVisible ? (
                    <span className="admin-badge mt-1 inline-block">숨김</span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(gift.id)}
                    className="admin-btn"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(gift.id, gift.name)}
                    disabled={pending}
                    className="admin-btn-danger disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        <GiftForm
          initial={emptyDraft(nextOrder)}
          isNew
          busy={pending}
          onSave={(draft) => save(draft)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="admin-btn-primary"
          >
            + 사은품 등록
          </button>
        </div>
      )}
    </div>
  );
}
