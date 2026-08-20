'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import RichTextEditor from '@/components/admin/RichTextEditor';
import { saveImportSettingsAction } from '@/app/admin/import-actions';
import {
  emptyImportBlock,
  fillTemplate,
  type ImportBlock,
  type ImportSettings,
} from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** 상단·하단 공통 블록 한 칸 */
function BlockEditor({
  title,
  hint,
  block,
  onChange,
}: {
  title: string;
  hint: string;
  block: ImportBlock;
  onChange: (next: ImportBlock) => void;
}) {
  return (
    <section className="admin-card p-4 md:p-5">
      <h2 className="text-[18px] font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-500">{hint}</p>

      <label className="mt-3 flex items-center gap-2 text-[16px] text-slate-800">
        <input
          type="checkbox"
          checked={block.enabled}
          onChange={(event) => onChange({ ...block, enabled: event.target.checked })}
          className="h-4 w-4"
        />
        가져올 때 자동으로 붙이기
      </label>

      {block.enabled ? (
        <>
          <div className="mt-3 flex flex-wrap gap-3">
            {(['image', 'text'] as const).map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-[16px] text-slate-800">
                <input
                  type="radio"
                  name={`${title}-kind`}
                  checked={block.kind === kind}
                  onChange={() => onChange({ ...block, kind })}
                  className="h-4 w-4"
                />
                {kind === 'image' ? '이미지' : '글'}
              </label>
            ))}
          </div>

          <div className="mt-3">
            {block.kind === 'image' ? (
              <ImageUploader
                images={block.imageUrl ? [block.imageUrl] : []}
                onChange={(next) => onChange({ ...block, imageUrl: next[0] ?? '' })}
                slug="common"
                multiple={false}
                frame="full"
                label="공통 블록 이미지를 올려 주세요"
              />
            ) : (
              <RichTextEditor
                value={block.body}
                onChange={(next) => onChange({ ...block, body: next })}
                placeholder="배송 안내·브랜드 소개 등. {상품명} 을 넣으면 상품명으로 바뀝니다."
              />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * 상품 가져오기 설정.
 *
 * ★ 매번 손으로 붙이던 브랜드 배너·배송 안내를 여기 한 번만 등록해 두면
 *   가져올 때마다 상세페이지 앞뒤에 자동으로 붙습니다. 상품마다 뺄 수 있습니다.
 */
export default function ImportSettingsForm({ initial }: { initial: ImportSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ImportSettings>(initial);
  const [message, setMessage] = useState<Message>(null);

  const addTemplate = () =>
    setForm((prev) => ({
      ...prev,
      templates: [
        ...prev.templates,
        { id: `t-${Date.now().toString(36)}`, title: '', body: '' },
      ],
    }));

  const patchTemplate = (id: string, patch: { title?: string; body?: string }) =>
    setForm((prev) => ({
      ...prev,
      templates: prev.templates.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));

  const removeTemplate = (id: string) =>
    setForm((prev) => ({
      ...prev,
      templates: prev.templates.filter((item) => item.id !== id),
    }));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveImportSettingsAction(form);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '가져오기 설정을 저장했습니다.' });
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <BlockEditor
        title="상단 공통 블록"
        hint="상세페이지 맨 위에 붙습니다. 브랜드 배너처럼 모든 상품에 공통으로 들어가는 내용에 씁니다."
        block={form.topBlock}
        onChange={(next) => setForm((prev) => ({ ...prev, topBlock: next }))}
      />

      <BlockEditor
        title="하단 공통 블록"
        hint="상세페이지 맨 아래에 붙습니다. 배송·교환 안내나 브랜드 소개에 씁니다."
        block={form.bottomBlock}
        onChange={(next) => setForm((prev) => ({ ...prev, bottomBlock: next }))}
      />

      {/* ── 글 템플릿 ─────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[18px] font-semibold text-slate-900">글 템플릿</h2>
          <button type="button" onClick={addTemplate} className="admin-btn">
            + 템플릿 추가
          </button>
        </div>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          가져오기 화면의 <strong>+ 글 넣기</strong>에서 한 번에 꺼내 쓸 수 있습니다.{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">{'{상품명}'}</code> 을 넣으면
          그 상품 이름으로 바뀝니다.
        </p>

        {form.templates.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-[15px] text-slate-500">
            아직 등록한 템플릿이 없습니다.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {form.templates.map((template) => (
              <li key={template.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={template.title}
                    onChange={(event) =>
                      patchTemplate(template.id, { title: event.target.value })
                    }
                    placeholder="템플릿 이름 (예: 소재·관리법)"
                    aria-label="템플릿 이름"
                    className="admin-input md:max-w-[320px]"
                  />
                  <button
                    type="button"
                    onClick={() => removeTemplate(template.id)}
                    className="admin-btn-danger ml-auto"
                  >
                    삭제
                  </button>
                </div>

                <div className="mt-3">
                  <RichTextEditor
                    value={template.body}
                    onChange={(next) => patchTemplate(template.id, { body: next })}
                    placeholder="{상품명} 은 부드러운 촉감의 원단을 사용했습니다."
                  />
                </div>

                {template.body.includes('{상품명}') ? (
                  <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[14px] leading-relaxed text-slate-600">
                    미리보기 —{' '}
                    {fillTemplate(
                      template.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
                      '가니 레오파드 반팔티'
                    )}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[16px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '가져오기 설정 저장'}
        </button>
        <button
          type="button"
          onClick={() =>
            setForm({ topBlock: emptyImportBlock(), bottomBlock: emptyImportBlock(), templates: [] })
          }
          className="admin-btn"
        >
          전부 비우기
        </button>
      </div>
    </form>
  );
}
