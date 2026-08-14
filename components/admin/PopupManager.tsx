'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import RichTextEditor from '@/components/admin/RichTextEditor';
import { deletePopupAction, savePopupAction } from '@/app/admin/content-actions';
import { sanitizeRichText } from '@/lib/product-utils';
import { POPUP_POSITIONS, POPUP_SHOW_ON } from '@/lib/site-config';
import type { Popup } from '@/lib/popups';

type Message = { tone: 'ok' | 'error'; text: string } | null;

type Draft = {
  title: string;
  imageUrl: string;
  content: string;
  linkUrl: string;
  position: string;
  width: number;
  startsOn: string;
  endsOn: string;
  isVisible: boolean;
  showOn: string;
  displayOrder: number;
};

function emptyDraft(order: number): Draft {
  return {
    title: '',
    imageUrl: '',
    content: '',
    linkUrl: '',
    position: 'center',
    width: 400,
    startsOn: '',
    endsOn: '',
    isVisible: true,
    showOn: 'home',
    displayOrder: order,
  };
}

function PopupForm({
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
  const [preview, setPreview] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
      className="rounded-md border border-blue-200 bg-blue-50/50 p-4"
    >
      <h3 className="text-[14px] font-semibold text-slate-900">
        {isNew ? '팝업 등록' : '팝업 수정'}
      </h3>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="admin-label" htmlFor="popup-title">
            제목 (관리용 · 이미지가 없으면 화면에도 나옵니다)
          </label>
          <input
            id="popup-title"
            type="text"
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            className="admin-input"
          />
        </div>

        <div className="md:col-span-2">
          <span className="admin-label">이미지</span>
          <ImageUploader
            images={draft.imageUrl ? [draft.imageUrl] : []}
            onChange={(next) => set('imageUrl', next[0] ?? '')}
            slug="popups"
            multiple={false}
            label="팝업 이미지를 끌어다 놓거나 클릭해서 선택하세요"
            frame="full"
          />
        </div>

        <div className="md:col-span-2">
          <span className="admin-label">내용 (이미지가 없을 때 보여 줍니다)</span>
          <RichTextEditor
            value={draft.content}
            onChange={(html) => set('content', html)}
            placeholder="이미지 없이 글로만 띄울 때 씁니다."
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="popup-link">
            링크 (선택)
          </label>
          <input
            id="popup-link"
            type="text"
            value={draft.linkUrl}
            onChange={(event) => set('linkUrl', event.target.value)}
            placeholder="/products 또는 https://…"
            className="admin-input"
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="popup-order">
            표시 순서
          </label>
          <input
            id="popup-order"
            type="number"
            value={draft.displayOrder}
            onChange={(event) => set('displayOrder', Number(event.target.value) || 0)}
            className="admin-input tabular-nums"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="popup-position">
            위치 (데스크탑)
          </label>
          <select
            id="popup-position"
            value={draft.position}
            onChange={(event) => set('position', event.target.value)}
            className="admin-input"
          >
            {POPUP_POSITIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="admin-label" htmlFor="popup-width">
            폭 (px, 데스크탑)
          </label>
          <input
            id="popup-width"
            type="number"
            min={240}
            max={720}
            step={10}
            value={draft.width}
            onChange={(event) => set('width', Number(event.target.value) || 400)}
            className="admin-input tabular-nums"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor="popup-start">
            노출 시작일 (비우면 제한 없음)
          </label>
          <input
            id="popup-start"
            type="date"
            value={draft.startsOn}
            onChange={(event) => set('startsOn', event.target.value)}
            className="admin-input"
          />
          <p className="mt-1 text-[12px] text-slate-500">그날 0시부터 (한국시간)</p>
        </div>
        <div>
          <label className="admin-label" htmlFor="popup-end">
            노출 종료일 (비우면 무기한)
          </label>
          <input
            id="popup-end"
            type="date"
            value={draft.endsOn}
            onChange={(event) => set('endsOn', event.target.value)}
            className="admin-input"
          />
          <p className="mt-1 text-[12px] text-slate-500">그날 밤 12시까지 (한국시간)</p>
        </div>

        <div>
          <label className="admin-label" htmlFor="popup-show">
            노출 화면
          </label>
          <select
            id="popup-show"
            value={draft.showOn}
            onChange={(event) => set('showOn', event.target.value)}
            className="admin-input"
          >
            {POPUP_SHOW_ON.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-[14px] text-slate-800">
            <input
              type="checkbox"
              checked={draft.isVisible}
              onChange={(event) => set('isVisible', event.target.checked)}
              className="h-4 w-4"
            />
            노출
          </label>
        </div>
      </div>

      <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
        모바일에서는 위치·폭 설정을 무시하고 화면 가운데에 가로 90%로 뜹니다. 좁은 화면에서
        옆으로 붙이면 잘리기 때문입니다.
      </p>

      {/* ── 미리보기 ─────────────────────────────────── */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setPreview((prev) => !prev)}
          className="admin-btn"
        >
          {preview ? '미리보기 닫기' : '미리보기'}
        </button>

        {preview ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-100 p-6">
            <div
              className="mx-auto border border-slate-300 bg-white"
              style={{ width: `${draft.width}px`, maxWidth: '100%' }}
            >
              {draft.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={draft.imageUrl} alt="" className="block h-auto w-full" />
              ) : (
                <div className="p-5">
                  <p className="text-[16px] font-medium text-slate-900">
                    {draft.title || '(제목 없음)'}
                  </p>
                  {draft.content ? (
                    <div
                      className="mt-2 text-[14px] leading-relaxed text-slate-700"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeRichText(draft.content),
                      }}
                    />
                  ) : null}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 text-[12px] text-slate-500">
                <span className="py-2 pl-3">오늘 하루 보지 않기</span>
                <span className="py-2 pr-3">닫기</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="admin-btn-primary">
          {busy ? '저장 중…' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className="admin-btn">
          취소
        </button>
      </div>
    </form>
  );
}

export default function PopupManager({ popups }: { popups: Popup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

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

  const save = (draft: Draft, id?: string) => {
    run(() => savePopupAction(draft, id), id ? '팝업을 수정했습니다.' : '팝업을 등록했습니다.');
    setAdding(false);
    setEditing(null);
  };

  const remove = (popup: Popup) => {
    if (!window.confirm(`"${popup.title}" 팝업을 삭제할까요?`)) return;
    run(() => deletePopupAction(popup.id), '팝업을 삭제했습니다.');
  };

  const nextOrder = popups.length > 0
    ? Math.max(...popups.map((popup) => popup.displayOrder)) + 10
    : 10;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate-600">
          표시 순서가 작은 팝업부터 왼쪽에 놓입니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((prev) => !prev);
            setEditing(null);
          }}
          className="admin-btn-primary"
        >
          + 팝업 등록
        </button>
      </div>

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

      {adding ? (
        <div className="mt-4">
          <PopupForm
            initial={emptyDraft(nextOrder)}
            isNew
            busy={pending}
            onSave={(draft) => save(draft)}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : null}

      <div className="admin-card mt-4 overflow-hidden">
        {popups.length === 0 ? (
          <p className="px-4 py-16 text-center text-[14px] text-slate-500">
            등록된 팝업이 없습니다.
          </p>
        ) : (
          <ul>
            {popups.map((popup) => (
              <li key={popup.id} className="border-b border-slate-200 last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <span className="w-10 text-[13px] tabular-nums text-slate-400">
                    {popup.displayOrder}
                  </span>

                  {popup.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={popup.imageUrl}
                      alt=""
                      className="h-12 w-12 rounded-md border border-slate-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[11px] text-slate-400">
                      글
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="text-[14px] font-medium text-slate-900">
                      {popup.title}
                    </span>
                    <span className="block text-[12px] text-slate-500">
                      {popup.position} · {popup.width}px ·{' '}
                      {popup.showOn === 'all' ? '모든 화면' : '메인만'}
                    </span>
                  </span>

                  <span className="text-[12px] text-slate-500">
                    {popup.startsOn || popup.endsOn
                      ? `${popup.startsOn || '제한 없음'} ~ ${
                          popup.endsOn || '무기한'
                        }`
                      : '기간 제한 없음'}
                  </span>

                  <span className="admin-badge bg-slate-100 text-slate-600">
                    {popup.isVisible ? '노출' : '숨김'}
                  </span>

                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(editing === popup.id ? null : popup.id);
                        setAdding(false);
                      }}
                      className="admin-btn"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(popup)}
                      className="admin-btn-danger"
                    >
                      삭제
                    </button>
                  </span>
                </div>

                {editing === popup.id ? (
                  <div className="px-4 pb-4">
                    <PopupForm
                      initial={{
                        title: popup.title,
                        imageUrl: popup.imageUrl,
                        content: popup.content,
                        linkUrl: popup.linkUrl,
                        position: popup.position,
                        width: popup.width,
                        startsOn: popup.startsOn,
                        endsOn: popup.endsOn,
                        isVisible: popup.isVisible,
                        showOn: popup.showOn,
                        displayOrder: popup.displayOrder,
                      }}
                      isNew={false}
                      busy={pending}
                      onSave={(draft) => save(draft, popup.id)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
