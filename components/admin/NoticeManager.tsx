'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import RichTextEditor from '@/components/admin/RichTextEditor';
import { deleteNoticeAction, saveNoticeAction } from '@/app/admin/content-actions';
import { formatDate } from '@/lib/format';
import type { Notice } from '@/lib/notices';

type Message = { tone: 'ok' | 'error'; text: string } | null;

type Draft = {
  title: string;
  content: string;
  isPinned: boolean;
  isVisible: boolean;
};

function emptyDraft(): Draft {
  return { title: '', content: '', isPinned: false, isVisible: true };
}

/** 등록·수정 폼 */
function NoticeForm({
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
      className="rounded-md border border-blue-200 bg-blue-50/50 p-4"
    >
      <h3 className="text-[15px] font-semibold text-slate-900">
        {isNew ? '공지 등록' : '공지 수정'}
      </h3>

      <div className="mt-3">
        <label className="admin-label" htmlFor="notice-title">
          제목
        </label>
        <input
          id="notice-title"
          type="text"
          value={draft.title}
          onChange={(event) => set('title', event.target.value)}
          className="admin-input"
        />
      </div>

      <div className="mt-3">
        <span className="admin-label">내용</span>
        <RichTextEditor
          value={draft.content}
          onChange={(html) => set('content', html)}
          placeholder="공지 내용을 입력하세요. 굵게 · 줄바꿈 · 링크 · 정렬을 쓸 수 있습니다."
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-[15px] text-slate-800">
          <input
            type="checkbox"
            checked={draft.isPinned}
            onChange={(event) => set('isPinned', event.target.checked)}
            className="h-4 w-4"
          />
          상단 고정
        </label>
        <label className="flex items-center gap-2 text-[15px] text-slate-800">
          <input
            type="checkbox"
            checked={draft.isVisible}
            onChange={(event) => set('isVisible', event.target.checked)}
            className="h-4 w-4"
          />
          노출
        </label>
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

export default function NoticeManager({ notices }: { notices: Notice[] }) {
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
    run(() => saveNoticeAction(draft, id), id ? '공지를 수정했습니다.' : '공지를 등록했습니다.');
    setAdding(false);
    setEditing(null);
  };

  const remove = (notice: Notice) => {
    if (!window.confirm(`"${notice.title}" 공지를 삭제할까요?`)) return;
    run(() => deleteNoticeAction(notice.id), '공지를 삭제했습니다.');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-slate-600">
          상단 고정한 공지가 목록 맨 위에 나옵니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((prev) => !prev);
            setEditing(null);
          }}
          className="admin-btn-primary"
        >
          + 공지 등록
        </button>
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-4 rounded-md px-3 py-2 text-[15px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {adding ? (
        <div className="mt-4">
          <NoticeForm
            initial={emptyDraft()}
            isNew
            busy={pending}
            onSave={(draft) => save(draft)}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : null}

      <div className="admin-card mt-4 overflow-hidden">
        {notices.length === 0 ? (
          <p className="px-4 py-16 text-center text-[15px] text-slate-500">
            등록된 공지가 없습니다.
          </p>
        ) : (
          <ul>
            {notices.map((notice) => (
              <li key={notice.id} className="border-b border-slate-200 last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <span className="flex-1 min-w-0">
                    {notice.isPinned ? (
                      <span className="admin-badge mr-2 bg-wine/10 text-wine">고정</span>
                    ) : null}
                    {!notice.isVisible ? (
                      <span className="admin-badge mr-2 bg-slate-100 text-slate-600">
                        숨김
                      </span>
                    ) : null}
                    <span className="text-[15px] font-medium text-slate-900">
                      {notice.title}
                    </span>
                  </span>

                  <span className="text-[14px] text-slate-500">
                    조회 {notice.viewCount}
                  </span>
                  <span className="text-[14px] text-slate-500">
                    {formatDate(notice.createdAt)}
                  </span>

                  <span className="flex shrink-0 gap-1.5">
                    <Link
                      href={`/notice/${notice.id}`}
                      target="_blank"
                      className="admin-btn"
                    >
                      보기
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(editing === notice.id ? null : notice.id);
                        setAdding(false);
                      }}
                      className="admin-btn"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(notice)}
                      className="admin-btn-danger"
                    >
                      삭제
                    </button>
                  </span>
                </div>

                {editing === notice.id ? (
                  <div className="px-4 pb-4">
                    <NoticeForm
                      initial={{
                        title: notice.title,
                        content: notice.content,
                        isPinned: notice.isPinned,
                        isVisible: notice.isVisible,
                      }}
                      isNew={false}
                      busy={pending}
                      onSave={(draft) => save(draft, notice.id)}
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
