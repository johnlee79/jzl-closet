'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/components/admin/RichTextEditor';
import { resetCopyAction, saveCopyAction } from '@/app/admin/settings-actions';
import {
  COPY_GROUPS,
  COPY_KEYS,
  COPY_META,
  STORE_TOKENS,
  type CopyBlock,
  type CopyKey,
  type CopySection,
  type CopySettings,
} from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/* ------------------------------------------------------------------
 * 항목 하나 — 문단 여러 개를 다룹니다.
 * ------------------------------------------------------------------ */

function CopyEditor({
  copyKey,
  initial,
}: {
  copyKey: CopyKey;
  initial: CopySection;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blocks, setBlocks] = useState<CopyBlock[]>(initial);
  const [message, setMessage] = useState<Message>(null);
  const meta = COPY_META[copyKey];

  const patch = (index: number, next: Partial<CopyBlock>) =>
    setBlocks((prev) =>
      prev.map((block, position) => (position === index ? { ...block, ...next } : block))
    );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(target, 0, next.splice(index, 1)[0]);
      return next;
    });
  };

  const remove = (index: number) => {
    if (!window.confirm(`${meta.blockLabel} ${index + 1} 을 지울까요?`)) return;
    setBlocks((prev) => prev.filter((_, position) => position !== index));
  };

  const add = () => setBlocks((prev) => [...prev, { heading: '', body: '' }]);

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveCopyAction(copyKey, blocks);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: `저장했습니다. ${meta.path} 에 바로 반영됩니다.` });
      router.refresh();
    });
  };

  const reset = () => {
    if (!window.confirm('지금 내용을 버리고 기본값으로 되돌릴까요?')) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resetCopyAction(copyKey);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setBlocks(result.data);
      setMessage({ tone: 'ok', text: '기본값으로 되돌렸습니다.' });
      router.refresh();
    });
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4">
      <p className="text-[14px] leading-relaxed text-slate-600">{meta.hint}</p>

      <ul className="mt-4 flex flex-col gap-4">
        {blocks.map((block, index) => (
          <li key={index} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-slate-700">
                {meta.blockLabel} {index + 1}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="위로"
                  className="admin-btn"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === blocks.length - 1}
                  aria-label="아래로"
                  className="admin-btn"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="admin-btn-danger"
                >
                  삭제
                </button>
              </div>
            </div>

            <div className="mt-3">
              <label className="admin-label" htmlFor={`${copyKey}-${index}-heading`}>
                소제목
              </label>
              <input
                id={`${copyKey}-${index}-heading`}
                type="text"
                value={block.heading}
                onChange={(event) => patch(index, { heading: event.target.value })}
                placeholder="비워 두면 소제목 없이 본문만 나옵니다"
                className="admin-input"
              />
            </div>

            <div className="mt-3">
              <span className="admin-label">본문</span>
              <RichTextEditor
                value={block.body}
                onChange={(html) => patch(index, { body: html })}
                placeholder="본문을 입력하세요"
              />
            </div>
          </li>
        ))}
      </ul>

      <button type="button" onClick={add} className="admin-btn mt-4">
        + {meta.blockLabel} 추가
      </button>

      <details className="mt-4 rounded-md bg-white p-3 text-[14px] text-slate-700">
        <summary className="cursor-pointer font-medium text-slate-900">
          자동으로 바뀌는 값 (치환자)
        </summary>
        <p className="mt-2 leading-relaxed text-slate-600">
          아래 글자를 본문에 그대로 넣으면 설정 &gt; 스토어 정보의 값으로 바뀝니다. 사업자
          정보를 한 번만 고치면 약관·안내 페이지에 그대로 반영됩니다.
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {STORE_TOKENS.map((item) => (
            <li key={item.token} className="text-slate-600">
              <code className="rounded bg-slate-100 px-1">{item.token}</code> {item.label}
            </li>
          ))}
        </ul>
      </details>

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

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '저장'}
        </button>
        <button type="button" onClick={reset} disabled={pending} className="admin-btn">
          기본값으로 되돌리기
        </button>
        <a href={meta.path} target="_blank" rel="noreferrer" className="admin-btn">
          페이지 보기 ↗
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * 항목 목록
 * ------------------------------------------------------------------ */

/**
 * ★ 3-I 에서 그룹으로 묶었습니다.
 *   항목이 열네 개가 되면서 평면 나열로는 원하는 문구를 찾기 어려워졌습니다.
 *   실제로 운영자가 메인의 HOW TO ORDER 문구를 고치려다 항목을 찾지 못했습니다.
 *   관리자가 항목을 못 찾으면 없는 기능과 같습니다.
 *
 * ★ '편집숍 소개' 그룹 맨 앞에는 문구가 아니라 대표 이미지 업로드가 옵니다.
 *   페이지 맨 위에 오는 것이 이미지라 화면 순서와 맞춰 둡니다.
 */
export default function CopyManager({
  copy,
  aboutImage,
  heroButtons,
}: {
  copy: CopySettings;
  /** 편집숍 소개 그룹에 끼워 넣을 대표 이미지 업로드 화면 */
  aboutImage?: React.ReactNode;
  /** 메인 화면 그룹에 끼워 넣을 히어로 버튼 설정 화면 (3-J) */
  heroButtons?: React.ReactNode;
}) {
  /** 열려 있는 항목. 문구가 아닌 칸도 이름을 붙여 함께 다룹니다. */
  const [open, setOpen] = useState<CopyKey | 'about-image' | 'hero-buttons' | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {COPY_GROUPS.map((group) => {
        const keys = COPY_KEYS.filter((key) => COPY_META[key].group === group.key);
        if (keys.length === 0) return null;

        const showImage = group.key === 'about' && aboutImage;
        const imageOpen = open === 'about-image';
        const showButtons = group.key === 'home' && heroButtons;
        const buttonsOpen = open === 'hero-buttons';

        return (
          <section key={group.key} aria-labelledby={`copy-group-${group.key}`}>
            <h2
              id={`copy-group-${group.key}`}
              className="mb-2 text-[15px] font-semibold text-slate-900"
            >
              {group.label}
            </h2>

            <div className="admin-card overflow-hidden">
              <ul>
                {showImage ? (
                  <li className="border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => setOpen(imageOpen ? null : 'about-image')}
                      aria-expanded={imageOpen}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <span>
                        <span className="text-[15px] font-medium text-slate-900">
                          편집숍 소개 · 대표 이미지
                        </span>
                        <span className="ml-2 text-[13px] text-slate-500">/about</span>
                        <span className="block text-[13px] text-slate-500">
                          맨 위 배너 이미지 (비우면 나오지 않습니다)
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-[14px] text-slate-500">
                        {imageOpen ? '접기 ▲' : '펼치기 ▼'}
                      </span>
                    </button>
                    {imageOpen ? aboutImage : null}
                  </li>
                ) : null}

                {showButtons ? (
                  <li className="border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => setOpen(buttonsOpen ? null : 'hero-buttons')}
                      aria-expanded={buttonsOpen}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <span>
                        <span className="text-[15px] font-medium text-slate-900">
                          메인 히어로 버튼 (문구·링크)
                        </span>
                        <span className="ml-2 text-[13px] text-slate-500">/</span>
                        <span className="block text-[13px] text-slate-500">
                          첫 화면 버튼 두 개 · 두 번째는 비우면 숨김
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-[14px] text-slate-500">
                        {buttonsOpen ? '접기 ▲' : '펼치기 ▼'}
                      </span>
                    </button>
                    {buttonsOpen ? heroButtons : null}
                  </li>
                ) : null}

                {keys.map((key) => {
                  const meta = COPY_META[key];
                  const expanded = open === key;
                  return (
                    <li key={key} className="border-b border-slate-200 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : key)}
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <span>
                          <span className="text-[15px] font-medium text-slate-900">
                            {meta.title}
                          </span>
                          <span className="ml-2 text-[13px] text-slate-500">
                            {meta.path}
                          </span>
                          <span className="block text-[13px] text-slate-500">
                            {copy[key].length}개 {meta.blockLabel}
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-[14px] text-slate-500">
                          {expanded ? '접기 ▲' : '펼치기 ▼'}
                        </span>
                      </button>

                      {expanded ? (
                        // key 를 붙여 항목을 바꿔 열 때 편집 상태가 섞이지 않게 합니다.
                        <CopyEditor key={key} copyKey={key} initial={copy[key]} />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
