'use client';

import { useRef, useState } from 'react';
import BulkImageUpload from '@/components/admin/BulkImageUpload';
import ImageUploader from '@/components/admin/ImageUploader';
import RichTextEditor from '@/components/admin/RichTextEditor';
import type { DetailBlock, Template, UploadedImage } from '@/lib/types';

type DetailEditorProps = {
  blocks: DetailBlock[];
  onChange: (next: DetailBlock[]) => void;
  slug: string;
  templates: Template[];
  onSaveTemplate: (title: string, body: string) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
};

function blockTitle(block: DetailBlock): string {
  if (block.type === 'image') return '이미지';
  if (block.type === 'text') return '문구';
  return '표';
}

export default function DetailEditor({
  blocks,
  onChange,
  slug,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
}: DetailEditorProps) {
  const dragIndex = useRef<number | null>(null);
  const [draggable, setDraggable] = useState<number | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');

  const update = (index: number, next: DetailBlock) => {
    onChange(blocks.map((block, position) => (position === index ? next : block)));
  };

  const add = (block: DetailBlock) => onChange([...blocks, block]);

  /**
   * 여러 장을 한 번에 올려 이미지 칸을 그만큼 만듭니다.
   * ★ alt 는 비워 둡니다. 검색 노출에 중요하므로 아래 각 칸에서 채워 주세요.
   * ★ 원본 크기를 함께 저장합니다. 손님 화면에서 이미지 자리를 미리 잡아
   *   늦게 뜰 때 아래 내용이 밀리지 않게 합니다.
   */
  const addImages = (images: UploadedImage[]) => {
    if (images.length === 0) return;
    onChange([
      ...blocks,
      ...images.map<DetailBlock>((image) => ({
        type: 'image',
        src: image.url,
        alt: '',
        caption: '',
        width: image.width,
        height: image.height,
      })),
    ]);
  };

  const remove = (index: number) => {
    onChange(blocks.filter((_, position) => position !== index));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length || from === to) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => add({ type: 'image', src: '', alt: '', caption: '' })}
          className="admin-btn"
        >
          + 이미지
        </button>
        <button
          type="button"
          onClick={() => add({ type: 'text', heading: '', body: '' })}
          className="admin-btn"
        >
          + 문구
        </button>
        <button
          type="button"
          onClick={() => add({ type: 'spec', rows: [{ label: '', value: '' }] })}
          className="admin-btn"
        >
          + 표
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setTemplatesOpen((prev) => !prev)}
            aria-expanded={templatesOpen}
            className="admin-btn"
          >
            문구 템플릿 ▾
          </button>

          {templatesOpen ? (
            <div className="absolute left-0 z-20 mt-1 w-[280px] rounded-md border border-slate-200 bg-white p-2 shadow-lg">
              {templates.length === 0 ? (
                <p className="px-2 py-3 text-[15px] text-slate-500">
                  저장된 템플릿이 없습니다. 문구 블록 아래의 &ldquo;템플릿으로 저장&rdquo;을
                  눌러 자주 쓰는 문구를 등록해 두세요.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {templates.map((template) => (
                    <li key={template.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          add({ type: 'text', heading: '', body: template.body });
                          setTemplatesOpen(false);
                        }}
                        className="flex-1 rounded px-2 py-2 text-left text-[15px] text-slate-700 hover:bg-slate-100"
                      >
                        {template.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteTemplate(template.id)}
                        aria-label={`${template.title} 템플릿 삭제`}
                        className="rounded px-2 py-2 text-[15px] text-slate-400 hover:bg-red-50 hover:text-red-700"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ★ 상세페이지는 이미지가 스무 장씩 되기도 합니다. 한 번에 올립니다. */}
      <div className="mt-4">
        <BulkImageUpload
          slug={slug}
          onUploaded={addImages}
          label="상세 이미지를 여러 장 끌어다 놓거나 클릭해서 한 번에 선택하세요"
          hint="고른 순서대로 아래에 이미지 칸이 만들어집니다. 순서는 나중에 끌어서 바꿀 수 있습니다."
        />
      </div>

      {blocks.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-[16px] text-slate-500">
          위에서 이미지를 여러 장 올리거나, 이미지·문구·표 블록을 하나씩 추가하세요.
          추가한 순서대로 상세 페이지에 쌓입니다.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {blocks.map((block, index) => (
            <li
              key={`${block.type}-${index}`}
              draggable={draggable === index}
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const from = dragIndex.current;
                dragIndex.current = null;
                setDraggable(null);
                if (from !== null) move(from, index);
              }}
              onDragEnd={() => setDraggable(null)}
              className="rounded-lg border border-slate-200 bg-white"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  {/* 드래그 핸들 */}
                  <span
                    onMouseDown={() => setDraggable(index)}
                    onMouseUp={() => setDraggable(null)}
                    role="button"
                    tabIndex={-1}
                    aria-label="드래그해서 순서 변경"
                    title="드래그해서 순서 변경"
                    className="cursor-grab select-none px-1 text-[18px] leading-none text-slate-400"
                  >
                    ⠿
                  </span>
                  <span className="text-[15px] font-medium text-slate-700">
                    {index + 1}. {blockTitle(block)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label="위로"
                    className="admin-btn min-h-0 px-2 py-1"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, index + 1)}
                    disabled={index === blocks.length - 1}
                    aria-label="아래로"
                    className="admin-btn min-h-0 px-2 py-1"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="admin-btn-danger min-h-0 px-2 py-1"
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="p-3">
                {block.type === 'image' ? (
                  <div className="flex flex-col gap-3">
                    <ImageUploader
                      images={block.src ? [block.src] : []}
                      onChange={(next) => update(index, { ...block, src: next[0] ?? '' })}
                      slug={slug}
                      multiple={false}
                      label="상세 이미지를 끌어다 놓거나 클릭해서 선택하세요"
                      frame="full"
                    />
                    <div>
                      <label className="admin-label" htmlFor={`alt-${index}`}>
                        대체 텍스트(alt) — 검색 노출에 중요합니다
                      </label>
                      <input
                        id={`alt-${index}`}
                        type="text"
                        value={block.alt}
                        onChange={(event) => update(index, { ...block, alt: event.target.value })}
                        placeholder="예: 울 코트 차콜 정면 착용 컷"
                        className="admin-input"
                      />
                      {!block.alt.trim() ? (
                        <p className="mt-1 text-[14px] text-amber-700">
                          alt 가 비어 있습니다. 저장 시 다시 확인합니다.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="admin-label" htmlFor={`caption-${index}`}>
                        캡션 (선택)
                      </label>
                      <input
                        id={`caption-${index}`}
                        type="text"
                        value={block.caption ?? ''}
                        onChange={(event) =>
                          update(index, { ...block, caption: event.target.value })
                        }
                        placeholder="이미지 아래에 작게 들어가는 설명"
                        className="admin-input"
                      />
                    </div>
                  </div>
                ) : null}

                {block.type === 'text' ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="admin-label" htmlFor={`heading-${index}`}>
                        소제목 (선택)
                      </label>
                      <input
                        id={`heading-${index}`}
                        type="text"
                        value={block.heading ?? ''}
                        onChange={(event) =>
                          update(index, { ...block, heading: event.target.value })
                        }
                        className="admin-input"
                      />
                    </div>
                    <div>
                      <span className="admin-label">본문</span>
                      <RichTextEditor
                        value={block.body}
                        onChange={(html) => update(index, { ...block, body: html })}
                      />
                    </div>

                    {savingIndex === index ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={templateTitle}
                          onChange={(event) => setTemplateTitle(event.target.value)}
                          placeholder="템플릿 이름 (예: 소재 관리법)"
                          className="admin-input flex-1"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await onSaveTemplate(templateTitle, block.body);
                            setTemplateTitle('');
                            setSavingIndex(null);
                          }}
                          className="admin-btn"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setSavingIndex(null)}
                          className="admin-btn"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSavingIndex(index)}
                        className="self-start text-[15px] text-blue-700 underline underline-offset-4"
                      >
                        이 문구를 템플릿으로 저장
                      </button>
                    )}
                  </div>
                ) : null}

                {block.type === 'spec' ? (
                  <div className="flex flex-col gap-2">
                    {block.rows.map((row, rowIndex) => (
                      <div key={rowIndex} className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={row.label}
                          onChange={(event) =>
                            update(index, {
                              ...block,
                              rows: block.rows.map((item, position) =>
                                position === rowIndex
                                  ? { ...item, label: event.target.value }
                                  : item
                              ),
                            })
                          }
                          placeholder="항목 (예: 소재)"
                          aria-label={`${rowIndex + 1}번째 항목명`}
                          className="admin-input w-[160px] flex-none"
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(event) =>
                            update(index, {
                              ...block,
                              rows: block.rows.map((item, position) =>
                                position === rowIndex
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            })
                          }
                          placeholder="값 (예: 울 70% · 폴리에스터 30%)"
                          aria-label={`${rowIndex + 1}번째 값`}
                          className="admin-input min-w-[180px] flex-1"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            update(index, {
                              ...block,
                              rows: block.rows.filter((_, position) => position !== rowIndex),
                            })
                          }
                          className="admin-btn-danger min-h-0 px-2.5 py-1.5"
                        >
                          행 삭제
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        update(index, { ...block, rows: [...block.rows, { label: '', value: '' }] })
                      }
                      className="admin-btn self-start"
                    >
                      + 행 추가
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
