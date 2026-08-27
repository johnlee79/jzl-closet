'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import RichTextEditor from '@/components/admin/RichTextEditor';
import { deleteNoticeAction, saveNoticeAction } from '@/app/admin/content-actions';
import { formatDate } from '@/lib/format';
import type { Notice } from '@/lib/notices';
/*
 * ** lib/notices.ts 가 아니라 lib/notice-kind.ts 에서 가져옵니다.
 *   lib/notices.ts 는 server-only 라 이 화면(브라우저에서 도는 화면)이
 *   읽으면 **빌드가 통째로 실패합니다.** 실제로 한 번 막혔습니다.
 *   타입(Notice)만은 가져와도 됩니다. 타입은 빌드할 때 사라집니다.
 */
import { NOTICE_KINDS, stripTags, type NoticeKind } from '@/lib/notice-kind';

/**
 * ================================================================
 * ** 공지 관리 — 「구분」 한 칸이 늘었습니다 (2-C, 2026-08-27)
 * ================================================================
 *
 * ** 화면을 새로 만들지 않았습니다. (사장님 지시)
 *   편집기·등록·수정·삭제가 공지와 완전히 같습니다. 다른 것은 「구분」
 *   하나뿐입니다. 표를 나누면 같은 화면을 한 벌 더 만들게 되고, 두 벌이
 *   조금씩 어긋나기 시작합니다.
 *
 * ** 다만 목록은 두 덩어리로 나눠 보여 줍니다.
 *   섞여 있으면 어느 것이 손님 공지 화면에 나가는지 한눈에 안 보입니다.
 * ================================================================
 */

type Message = { tone: 'ok' | 'error'; text: string } | null;

type Draft = {
  title: string;
  content: string;
  kind: NoticeKind;
  isPinned: boolean;
  isVisible: boolean;
};

function emptyDraft(kind: NoticeKind): Draft {
  return { title: '', content: '', kind, isPinned: false, isVisible: true };
}

/** 등록·수정 폼 */
function NoticeForm({
  initial,
  isNew,
  busy,
  /** 한 화면에 폼이 여러 개 뜨므로 칸 이름이 겹치지 않게 합니다. */
  idPrefix,
  onSave,
  onCancel,
}: {
  initial: Draft;
  isNew: boolean;
  busy: boolean;
  idPrefix: string;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const isFaq = draft.kind === 'faq';
  /*
   * ** 손님이 실제로 보게 될 글자 수입니다.
   *   채팅에 내보낼 때 쓰는 것과 **같은 함수**로 셉니다. 따로 세면
   *   "관리자에는 380자인데 손님한테는 다르다" 가 됩니다.
   */
  const plainLength = stripTags(draft.content).length;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
      className="rounded-md border border-blue-200 bg-blue-50/50 p-4"
    >
      <h3 className="text-[16px] font-semibold text-slate-900">
        {isNew ? '등록' : '수정'}
      </h3>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr]">
        <div>
          <label className="admin-label" htmlFor={`${idPrefix}-kind`}>
            구분
          </label>
          <select
            id={`${idPrefix}-kind`}
            value={draft.kind}
            onChange={(event) => set('kind', event.target.value as NoticeKind)}
            className="admin-input"
          >
            {NOTICE_KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="admin-label" htmlFor={`${idPrefix}-title`}>
            {isFaq ? '질문' : '제목'}
          </label>
          <input
            id={`${idPrefix}-title`}
            type="text"
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            className="admin-input"
          />
        </div>
      </div>

      <div className="mt-3">
        <span className="admin-label">{isFaq ? '답변' : '내용'}</span>
        <RichTextEditor
          value={draft.content}
          onChange={(html) => set('content', html)}
          placeholder={
            isFaq
              ? '손님에게 그대로 나갈 답변입니다. 비워 두면 채팅에 이 질문이 안 보입니다.'
              : '공지 내용을 입력하세요. 굵게 · 줄바꿈 · 링크 · 정렬을 쓸 수 있습니다.'
          }
        />

        {/*
          ** 자주 묻는 질문은 채팅 말풍선에 **글자와 줄바꿈만** 나갑니다.
            굵게·링크·가운데정렬은 안 보입니다. 미리 알려 드립니다.
          ** 길이는 자르지 않습니다. 대신 글자 수를 보여 드립니다.
            잘라 버리면 어디가 잘렸는지 사장님이 알 수 없고, 중요한 말이
            잘린 채 나가면 그게 곧 분쟁이 됩니다.
        */}
        {isFaq ? (
          <div className="mt-2 text-[14px] leading-relaxed text-slate-500">
            <p>
              채팅 말풍선에는 <strong>글자와 줄바꿈만</strong> 보입니다. 굵게·링크·정렬은
              안 나갑니다. 링크로 보내야 하는 것은 질문으로 만들지 마세요.
            </p>
            <p className={plainLength > 400 ? 'mt-1 font-semibold text-amber-700' : 'mt-1'}>
              답변 {plainLength}자
              {plainLength === 0
                ? ' — 비어 있어서 지금은 채팅에 안 보입니다.'
                : plainLength > 400
                  ? ' — 말풍선 하나로는 깁니다. 줄이시는 것을 권합니다. (그래도 다 보여 줍니다)'
                  : ''}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-[16px] text-slate-800">
          <input
            type="checkbox"
            checked={draft.isPinned}
            onChange={(event) => set('isPinned', event.target.checked)}
            className="h-4 w-4"
          />
          상단 고정
        </label>
        <label className="flex items-center gap-2 text-[16px] text-slate-800">
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
  /** 어느 덩어리에서 「등록」을 눌렀는지. null 이면 안 열려 있습니다. */
  const [adding, setAdding] = useState<NoticeKind | null>(null);
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
    const what = draft.kind === 'faq' ? '질문' : '공지';
    run(
      () => saveNoticeAction(draft, id),
      id ? `${what}을 수정했습니다.` : `${what}을 등록했습니다.`
    );
    setAdding(null);
    setEditing(null);
  };

  const remove = (notice: Notice) => {
    const what = notice.kind === 'faq' ? '질문' : '공지';
    if (!window.confirm(`"${notice.title}" ${what}을 삭제할까요?`)) return;
    run(() => deleteNoticeAction(notice.id), `${what}을 삭제했습니다.`);
  };

  /** 목록 한 줄. 공지와 질문이 같은 모양을 씁니다. */
  const renderRow = (notice: Notice) => {
    const isFaq = notice.kind === 'faq';
    /** 답변이 비어 있으면 손님 채팅에 안 보입니다. 그것을 표시합니다. */
    const emptyAnswer = stripTags(notice.content) === '';

    return (
      <li key={notice.id} className="border-b border-slate-200 last:border-b-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="flex-1 min-w-0">
            {notice.isPinned ? (
              <span className="admin-badge mr-2 bg-wine/10 text-wine">고정</span>
            ) : null}
            {!notice.isVisible ? (
              <span className="admin-badge mr-2 bg-slate-100 text-slate-600">숨김</span>
            ) : null}
            {isFaq && emptyAnswer ? (
              <span className="admin-badge mr-2 bg-amber-100 text-amber-800">답변 없음</span>
            ) : null}
            <span className="text-[16px] font-medium text-slate-900">{notice.title}</span>
          </span>

          {/* 자주 묻는 질문은 손님 화면이 따로 없어 조회수가 의미 없습니다. */}
          {isFaq ? null : (
            <span className="text-[15px] text-slate-500">조회 {notice.viewCount}</span>
          )}
          <span className="text-[15px] text-slate-500">{formatDate(notice.createdAt)}</span>

          <span className="flex shrink-0 gap-1.5">
            {isFaq ? null : (
              <Link href={`/notice/${notice.id}`} target="_blank" className="admin-btn">
                보기
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setEditing(editing === notice.id ? null : notice.id);
                setAdding(null);
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
                kind: notice.kind,
                isPinned: notice.isPinned,
                isVisible: notice.isVisible,
              }}
              isNew={false}
              busy={pending}
              idPrefix={`edit-${notice.id}`}
              onSave={(draft) => save(draft, notice.id)}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : null}
      </li>
    );
  };

  /*
   * ** 두 덩어리로 나눠 보여 줍니다. 섞어 두면 어느 것이 손님 공지 화면에
   *   나가고 어느 것이 채팅에만 나가는지 한눈에 안 보입니다.
   * ** 구분 칸이 아직 없으면 전부 '공지' 로 잡혀서 아래 「자주 묻는 질문」이
   *   비어 있게 됩니다. 그때는 왜 비었는지 화면에 적어 줍니다.
   */
  const list = (kind: NoticeKind) => notices.filter((notice) => notice.kind === kind);

  const section = (kind: NoticeKind, heading: string, hint: string) => {
    const rows = list(kind);
    return (
      <section className="mt-8 first:mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">
              {heading}{' '}
              <span className="text-[15px] font-normal text-slate-500">{rows.length}건</span>
            </h2>
            <p className="mt-1 text-[15px] text-slate-600">{hint}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAdding(adding === kind ? null : kind);
              setEditing(null);
            }}
            className="admin-btn-primary"
          >
            + {heading} 등록
          </button>
        </div>

        {adding === kind ? (
          <div className="mt-4">
            <NoticeForm
              initial={emptyDraft(kind)}
              isNew
              busy={pending}
              idPrefix={`new-${kind}`}
              onSave={(draft) => save(draft)}
              onCancel={() => setAdding(null)}
            />
          </div>
        ) : null}

        <div className="admin-card mt-4 overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-[16px] leading-relaxed text-slate-500">
              {kind === 'faq'
                ? '등록된 질문이 없습니다. 정리SQL/12 를 아직 안 돌리셨다면 먼저 돌려 주세요.'
                : '등록된 공지가 없습니다.'}
            </p>
          ) : (
            <ul>{rows.map(renderRow)}</ul>
          )}
        </div>
      </section>
    );
  };

  return (
    <div>
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

      {section(
        'notice',
        '공지사항',
        '손님 공지 화면(/notice)에 보입니다. 상단 고정한 것이 맨 위로 옵니다.'
      )}
      {section(
        'faq',
        '자주 묻는 질문',
        '채팅 상담창에만 보입니다. 손님 공지 화면에는 안 나갑니다. 답변이 비어 있으면 그 질문은 채팅에 안 보입니다.'
      )}
    </div>
  );
}
