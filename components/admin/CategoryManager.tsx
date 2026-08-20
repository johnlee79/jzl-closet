'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import { CATEGORY_IMAGE_SIZE } from '@/lib/site-config';
import { useRouter } from 'next/navigation';
import {
  deleteCategoryAction,
  reorderCategoriesAction,
  reorderSubCategoriesAction,
  saveCategoryAction,
  toggleCategoryAction,
} from '@/app/admin/taxonomy-actions';
import type { Category, SubCategory } from '@/lib/categories';
import { slugify } from '@/lib/product-utils';

type Counts = {
  byCategory: Record<string, number>;
  bySubCategory: Record<string, number>;
};

type Draft = {
  slug: string;
  label: string;
  nameKo: string;
  description: string;
  isVisible: boolean;
  /** 대표 이미지 (R2). 메인 CATEGORY 카드에 씁니다. (3-K) */
  imageUrl: string;
};

type Message = { tone: 'ok' | 'error'; text: string } | null;

function emptyDraft(): Draft {
  return { slug: '', label: '', nameKo: '', description: '', isVisible: true, imageUrl: '' };
}

/* ------------------------------------------------------------------
 * 추가·수정 폼
 * ------------------------------------------------------------------ */

function CategoryForm({
  initial,
  parentSlug,
  isNew,
  busy,
  onSave,
  onCancel,
}: {
  initial: Draft;
  parentSlug: string | null;
  isNew: boolean;
  busy: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const idPrefix = `${parentSlug ?? 'root'}-${initial.slug || 'new'}`;
  const slugInvalid = isNew && draft.slug.length > 0 && !/^[a-z0-9-]+$/.test(draft.slug);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
      className="rounded-md border border-blue-200 bg-blue-50/50 p-4"
    >
      <h3 className="text-[16px] font-semibold text-slate-900">
        {isNew
          ? parentSlug
            ? `${parentSlug} 아래에 소분류 추가`
            : '대분류 추가'
          : `${initial.slug} 수정`}
      </h3>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="admin-label" htmlFor={`${idPrefix}-slug`}>
            slug (주소)
          </label>
          <div className="flex gap-2">
            <input
              id={`${idPrefix}-slug`}
              type="text"
              value={draft.slug}
              disabled={!isNew}
              onChange={(event) => {
                setSlugTouched(true);
                set('slug', event.target.value.toLowerCase());
              }}
              placeholder="outer"
              className="admin-input"
            />
            {isNew ? (
              <button
                type="button"
                onClick={() => {
                  setSlugTouched(true);
                  set('slug', slugify(draft.label));
                }}
                className="admin-btn shrink-0"
              >
                자동
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] text-slate-500">
            {isNew
              ? '영문 소문자·숫자·하이픈만 씁니다. 등록 후에는 바꿀 수 없습니다.'
              : '주소에 쓰이므로 변경할 수 없습니다.'}
          </p>
          {slugInvalid ? (
            <p className="mt-1 text-[14px] text-red-700">
              영문 소문자·숫자·하이픈만 쓸 수 있습니다.
            </p>
          ) : null}
        </div>

        <div>
          <label className="admin-label" htmlFor={`${idPrefix}-label`}>
            라벨 (화면 표시용)
          </label>
          <input
            id={`${idPrefix}-label`}
            type="text"
            value={draft.label}
            onChange={(event) => {
              const value = event.target.value;
              set('label', value);
              // slug 를 아직 손대지 않았다면 라벨에서 만들어 줍니다.
              if (isNew && !slugTouched) set('slug', slugify(value));
            }}
            placeholder="OUTER"
            className="admin-input"
          />
          <p className="mt-1 text-[14px] text-slate-500">한글·영문 자유롭게 쓰세요.</p>
        </div>

        <div>
          <label className="admin-label" htmlFor={`${idPrefix}-nameko`}>
            한글명 (h1·메타데이터)
          </label>
          <input
            id={`${idPrefix}-nameko`}
            type="text"
            value={draft.nameKo}
            onChange={(event) => set('nameKo', event.target.value)}
            placeholder="아우터"
            className="admin-input"
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-[16px] text-slate-800">
            <input
              type="checkbox"
              checked={draft.isVisible}
              onChange={(event) => set('isVisible', event.target.checked)}
              className="h-4 w-4"
            />
            노출 (끄면 메뉴·사이트맵·카테고리 페이지에서 빠집니다)
          </label>
        </div>

        <div className="md:col-span-2">
          <label className="admin-label" htmlFor={`${idPrefix}-desc`}>
            설명 (선택) — 카테고리 페이지 상단 문구
          </label>
          <textarea
            id={`${idPrefix}-desc`}
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
            rows={2}
            className="admin-input"
          />
        </div>

        {/*
          대표 이미지 (3-K)
          ★ 대분류에만 씁니다. 메인 CATEGORY 섹션의 네 칸에 들어가는 사진입니다.
            소분류는 그 카드에 나오지 않으므로 자리를 만들지 않습니다.
          ★ 올리지 않으면 카드가 이미지 없이 글자만 나옵니다. 회색 빈 상자가 남지 않습니다.
          ★ frame='thumb' 입니다. 카드가 3:4 로 잘라 쓰기 때문에 잘림 미리보기를 함께 봅니다.
        */}
        {parentSlug === null ? (
          <div className="md:col-span-2">
            <span className="admin-label">
              대표 이미지 (선택) — 메인 CATEGORY 카드. 권장 {CATEGORY_IMAGE_SIZE}
            </span>
            <p className="mb-2 text-[14px] leading-relaxed text-slate-500">
              올리지 않으면 카드에 이미지 없이 이름과 상품 수만 나옵니다. 세로로 긴 3:4
              비율로 잘려 나갑니다.
            </p>
            <ImageUploader
              images={draft.imageUrl ? [draft.imageUrl] : []}
              onChange={(next) => set('imageUrl', next[0] ?? '')}
              slug={`category/${draft.slug || 'new'}`}
              multiple={false}
              frame="thumb"
              label="분류 대표 이미지를 끌어다 놓거나 클릭해서 선택하세요"
            />
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

/* ------------------------------------------------------------------
 * 목록
 * ------------------------------------------------------------------ */

export default function CategoryManager({
  categories,
  counts,
}: {
  categories: Category[];
  counts: Counts;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  /** 드래그 중에 화면이 바로 바뀌도록 순서만 따로 들고 있습니다. */
  const [order, setOrder] = useState<string[]>(() => categories.map((item) => item.slug));
  const [subOrder, setSubOrder] = useState<Record<string, string[]>>({});
  const dragSlug = useRef<string | null>(null);
  const dragSub = useRef<{ parent: string; slug: string } | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [addingParent, setAddingParent] = useState(false);
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);

  // 서버에서 새 데이터가 오면 순서를 다시 맞춥니다.
  const signature = categories.map((item) => item.slug).join('|');
  useEffect(() => {
    setOrder(categories.map((item) => item.slug));
    setSubOrder(
      Object.fromEntries(
        categories.map((item) => [item.slug, item.children.map((child) => child.slug)])
      )
    );
    // signature 가 바뀔 때만 (드래그 중에 되돌아가지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const bySlug = new Map(categories.map((item) => [item.slug, item]));
  const rows = order
    .map((slug) => bySlug.get(slug))
    .filter((item): item is Category => Boolean(item));

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    okText?: string
  ) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? '처리하지 못했습니다.' });
        router.refresh();
        return;
      }
      if (okText) setMessage({ tone: 'ok', text: okText });
      router.refresh();
    });
  };

  /* ── 대분류 드래그 ─────────────────────────────────── */
  const dropParent = (targetSlug: string) => {
    const source = dragSlug.current;
    dragSlug.current = null;
    if (!source || source === targetSlug) return;

    const next = [...order];
    const from = next.indexOf(source);
    const to = next.indexOf(targetSlug);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    run(() => reorderCategoriesAction(next), '순서를 저장했습니다.');
  };

  /* ── 소분류 드래그 ─────────────────────────────────── */
  const dropSub = (parentSlug: string, targetSlug: string) => {
    const source = dragSub.current;
    dragSub.current = null;
    if (!source || source.parent !== parentSlug || source.slug === targetSlug) return;

    const current = subOrder[parentSlug] ?? [];
    const next = [...current];
    const from = next.indexOf(source.slug);
    const to = next.indexOf(targetSlug);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    setSubOrder((prev) => ({ ...prev, [parentSlug]: next }));
    run(() => reorderSubCategoriesAction(parentSlug, next), '순서를 저장했습니다.');
  };

  const save = (draft: Draft, parentSlug: string | null, isNew: boolean) => {
    run(
      () =>
        saveCategoryAction(
          {
            slug: draft.slug.trim(),
            label: draft.label.trim(),
            nameKo: draft.nameKo.trim(),
            parentSlug,
            description: draft.description.trim(),
            isVisible: draft.isVisible,
            imageUrl: draft.imageUrl.trim(),
          },
          isNew
        ),
      isNew ? '분류를 추가했습니다.' : '분류를 수정했습니다.'
    );
    setEditing(null);
    setAddingParent(false);
    setAddingSubTo(null);
  };

  const remove = (slug: string, name: string, isSub: boolean) => {
    if (!window.confirm(`"${name}" 분류를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    run(() => deleteCategoryAction(slug, isSub), '분류를 삭제했습니다.');
  };

  const subRows = (category: Category): SubCategory[] => {
    const childBySlug = new Map(category.children.map((child) => [child.slug, child]));
    const list = subOrder[category.slug] ?? category.children.map((child) => child.slug);
    return list
      .map((slug) => childBySlug.get(slug))
      .filter((child): child is SubCategory => Boolean(child));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-slate-600">
          왼쪽 손잡이(≡)를 끌어 순서를 바꿉니다. 대분류를 누르면 소분류가 펼쳐집니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setAddingParent((prev) => !prev);
            setEditing(null);
          }}
          className="admin-btn-primary"
        >
          + 대분류 추가
        </button>
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

      {addingParent ? (
        <div className="mt-4">
          <CategoryForm
            initial={emptyDraft()}
            parentSlug={null}
            isNew
            busy={pending}
            onSave={(draft) => save(draft, null, true)}
            onCancel={() => setAddingParent(false)}
          />
        </div>
      ) : null}

      <div className="admin-card mt-4 overflow-hidden">
        {/* 표 머리 — 모바일에서는 숨기고 카드처럼 보여 줍니다. */}
        <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-[15px] font-medium text-slate-600 md:flex">
          <span className="w-10">순서</span>
          <span className="flex-1">라벨</span>
          <span className="w-[140px]">한글명</span>
          <span className="w-[90px]">소분류</span>
          <span className="w-[80px]">상품</span>
          <span className="w-[70px]">노출</span>
          <span className="w-[210px] text-right">관리</span>
        </div>

        <ul>
          {rows.map((category, index) => {
            const children = subRows(category);
            const open = expanded === category.slug;
            const productCount = counts.byCategory[category.slug] ?? 0;

            return (
              <li
                key={category.slug}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropParent(category.slug)}
                className="border-b border-slate-200 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 md:flex-nowrap">
                  {/* 손잡이에만 draggable 을 겁니다. 행 전체에 걸면 입력칸에서 글자를 못 고릅니다. */}
                  <span
                    draggable
                    onDragStart={() => {
                      dragSlug.current = category.slug;
                    }}
                    title="끌어서 순서 변경"
                    className="w-10 cursor-move select-none text-[18px] text-slate-400"
                  >
                    ≡ <span className="text-[14px] tabular-nums">{index + 1}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : category.slug)}
                    aria-expanded={open}
                    className="flex-1 text-left"
                  >
                    <span className="text-[16px] font-medium text-slate-900">
                      {category.label}
                    </span>
                    <span className="ml-2 text-[14px] text-slate-500">/{category.slug}</span>
                    {category.matchType ? (
                      <span className="admin-badge ml-2 bg-slate-100 text-slate-600">
                        모음
                      </span>
                    ) : null}
                  </button>

                  <span className="w-[140px] text-[16px] text-slate-700">
                    {category.nameKo}
                  </span>
                  <span className="w-[90px] text-[15px] text-slate-600">
                    {category.children.length}개
                  </span>
                  <span className="w-[80px] text-[15px] text-slate-600">
                    {productCount}개
                  </span>

                  <span className="w-[70px]">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={category.isVisible}
                      aria-label={`${category.label} 노출`}
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => toggleCategoryAction(category.slug, !category.isVisible),
                          category.isVisible ? '숨김으로 바꿨습니다.' : '노출로 바꿨습니다.'
                        )
                      }
                      className="inline-flex items-center"
                    >
                      <span
                        className={`relative block h-5 w-9 rounded-full transition-colors ${
                          category.isVisible ? 'bg-blue-700' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                            category.isVisible ? 'left-[18px]' : 'left-0.5'
                          }`}
                        />
                      </span>
                    </button>
                  </span>

                  <span className="flex w-[210px] flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : category.slug)}
                      className="admin-btn"
                    >
                      소분류 {open ? '접기' : '보기'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(editing === category.slug ? null : category.slug);
                        setAddingParent(false);
                      }}
                      className="admin-btn"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(category.slug, category.label, false)}
                      className="admin-btn-danger"
                    >
                      삭제
                    </button>
                  </span>
                </div>

                {editing === category.slug ? (
                  <div className="px-4 pb-4">
                    <CategoryForm
                      initial={{
                        slug: category.slug,
                        label: category.label,
                        nameKo: category.nameKo,
                        description: category.description,
                        isVisible: category.isVisible,
                        imageUrl: category.imageUrl,
                      }}
                      parentSlug={null}
                      isNew={false}
                      busy={pending}
                      onSave={(draft) => save(draft, null, false)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : null}

                {open ? (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[15px] font-semibold text-slate-700">
                        {category.label} 소분류 {children.length}개
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          setAddingSubTo(addingSubTo === category.slug ? null : category.slug)
                        }
                        className="admin-btn"
                      >
                        + 소분류 추가
                      </button>
                    </div>

                    {addingSubTo === category.slug ? (
                      <div className="mt-3">
                        <CategoryForm
                          initial={emptyDraft()}
                          parentSlug={category.slug}
                          isNew
                          busy={pending}
                          onSave={(draft) => save(draft, category.slug, true)}
                          onCancel={() => setAddingSubTo(null)}
                        />
                      </div>
                    ) : null}

                    {children.length === 0 ? (
                      <p className="mt-3 text-[15px] text-slate-500">
                        소분류가 없습니다. 소분류가 없으면 헤더 드롭다운과 필터 줄을 그리지
                        않습니다.
                      </p>
                    ) : (
                      <ul className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                        {children.map((child, childIndex) => (
                          <li
                            key={child.slug}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => dropSub(category.slug, child.slug)}
                            className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
                          >
                            <span
                              draggable
                              onDragStart={() => {
                                dragSub.current = { parent: category.slug, slug: child.slug };
                              }}
                              title="끌어서 순서 변경"
                              className="w-9 cursor-move select-none text-[17px] text-slate-400"
                            >
                              ≡ <span className="text-[14px] tabular-nums">{childIndex + 1}</span>
                            </span>
                            <span className="flex-1 text-[16px] text-slate-900">
                              {child.label}
                              <span className="ml-2 text-[14px] text-slate-500">
                                /{child.slug}
                              </span>
                            </span>
                            <span className="w-[120px] text-[15px] text-slate-600">
                              {child.nameKo}
                            </span>
                            <span className="w-[70px] text-[15px] text-slate-600">
                              {counts.bySubCategory[child.slug] ?? 0}개
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={child.isVisible}
                              aria-label={`${child.label} 노출`}
                              disabled={pending}
                              onClick={() =>
                                run(
                                  () => toggleCategoryAction(child.slug, !child.isVisible),
                                  child.isVisible ? '숨김으로 바꿨습니다.' : '노출로 바꿨습니다.'
                                )
                              }
                              className="inline-flex items-center"
                            >
                              <span
                                className={`relative block h-5 w-9 rounded-full transition-colors ${
                                  child.isVisible ? 'bg-blue-700' : 'bg-slate-300'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                                    child.isVisible ? 'left-[18px]' : 'left-0.5'
                                  }`}
                                />
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditing(editing === child.slug ? null : child.slug)
                              }
                              className="admin-btn"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => remove(child.slug, child.label, true)}
                              className="admin-btn-danger"
                            >
                              삭제
                            </button>

                            {editing === child.slug ? (
                              <div className="w-full pt-2">
                                <CategoryForm
                                  initial={{
                                    slug: child.slug,
                                    label: child.label,
                                    nameKo: child.nameKo,
                                    description: child.description ?? '',
                                    isVisible: child.isVisible,
                                    // 소분류에는 대표 이미지가 없습니다. (메인 카드에 안 나옵니다)
                                    imageUrl: '',
                                  }}
                                  parentSlug={category.slug}
                                  isNew={false}
                                  busy={pending}
                                  onSave={(draft) => save(draft, category.slug, false)}
                                  onCancel={() => setEditing(null)}
                                />
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
