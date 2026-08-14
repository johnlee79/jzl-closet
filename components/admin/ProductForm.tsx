'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DetailEditor from '@/components/admin/DetailEditor';
import ImageUploader from '@/components/admin/ImageUploader';
import OptionEditor from '@/components/admin/OptionEditor';
import {
  createTemplateAction,
  deleteTemplateAction,
  saveProductAction,
} from '@/app/admin/actions';
import { sortedBrands, type Brand } from '@/lib/brands';
import {
  filterableCategories,
  visibleSubCategories,
  type Category,
} from '@/lib/categories';
import { rebuildCombinations, slugify } from '@/lib/product-utils';
import type { Gender, Product, ProductInput, Template } from '@/lib/types';

export const PREVIEW_STORAGE_KEY = 'jzl-admin-preview-draft';

type ProductFormProps = {
  /** 수정 화면이면 기존 상품, 새 상품이면 undefined */
  product?: Product;
  templates: Template[];
  /** 분류·브랜드는 DB 에서 오므로 서버 페이지가 읽어 넘겨 줍니다. */
  allCategories: Category[];
  allBrands: Brand[];
};

function emptyInput(): ProductInput {
  return {
    slug: '',
    name: '',
    brandSlug: null,
    categorySlug: '',
    subCategorySlug: null,
    price: 0,
    originalPrice: null,
    summary: '',
    origin: null,
    manufacturer: null,
    gender: 'women',
    season: null,
    thumbnails: [],
    optionGroups: [],
    optionCombinations: [],
    detail: [],
    measurements: [],
    isNew: false,
    isSale: false,
    isSoldOut: false,
    isVisible: true,
    freeShipping: false,
    displayOrder: 0,
  };
}

function toInput(product: Product): ProductInput {
  const { id, createdAt, updatedAt, ...rest } = product;
  void id;
  void createdAt;
  void updatedAt;
  return rest;
}

const genders: { value: Gender; label: string }[] = [
  { value: 'women', label: '여성' },
  { value: 'men', label: '남성' },
  { value: 'unisex', label: '공용' },
];

export default function ProductForm({
  product,
  templates,
  allCategories,
  allBrands,
}: ProductFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<ProductInput>(() =>
    product ? toInput(product) : emptyInput()
  );
  const [templateList, setTemplateList] = useState<Template[]>(templates);
  const [useOptions, setUseOptions] = useState(
    () => (product?.optionGroups.length ?? 0) > 0
  );
  const [slugTouched, setSlugTouched] = useState(() => Boolean(product));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null
  );

  const categories = useMemo(() => filterableCategories(allCategories), [allCategories]);
  const brands = useMemo(() => sortedBrands(allBrands), [allBrands]);
  const subCategories = useMemo(
    () => (form.categorySlug ? visibleSubCategories(allCategories, form.categorySlug) : []),
    [allCategories, form.categorySlug]
  );

  const set = useCallback(<K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  // 저장하지 않고 페이지를 벗어나면 경고합니다.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /** 상품명을 입력하면 slug 를 자동으로 채웁니다. (직접 고치면 더 이상 건드리지 않습니다) */
  const handleNameBlur = () => {
    if (slugTouched || form.slug) return;
    const generated = slugify(form.name);
    set('slug', generated || `item-${Date.now().toString(36)}`);
  };

  const uploadSlug = form.slug || slugify(form.name) || 'untitled';

  /* ── 저장 ─────────────────────────────────────────────── */
  const buildPayload = (): ProductInput => {
    // 이름이나 값이 비어 있는 그룹은 저장하지 않습니다.
    const groups = useOptions
      ? form.optionGroups
          .filter((group) => group.name.trim() && group.values.length > 0)
          .map((group) => ({ name: group.name.trim(), values: group.values }))
      : [];

    return {
      ...form,
      slug: form.slug.trim(),
      name: form.name.trim(),
      optionGroups: groups,
      // [조합 생성] 을 누르지 않고 저장해도 표가 어긋나지 않게 여기서 맞춰 둡니다.
      optionCombinations: rebuildCombinations(groups, form.optionCombinations),
      measurements: form.measurements.filter((row) => row.label.trim()),
      detail: form.detail.filter((block) => {
        if (block.type === 'image') return Boolean(block.src);
        if (block.type === 'text') {
          return Boolean(block.heading?.trim() || block.body.trim());
        }
        return block.rows.some((row) => row.label.trim() || row.value.trim());
      }),
    };
  };

  const save = async (mode: 'close' | 'continue') => {
    if (saving) return;

    // ★ alt 가 비어 있으면 경고합니다. SEO 에 중요합니다.
    const missingAlt = form.detail.filter(
      (block) => block.type === 'image' && block.src && !block.alt.trim()
    ).length;
    if (missingAlt > 0) {
      const go = window.confirm(
        `상세 이미지 ${missingAlt}개에 대체 텍스트(alt)가 비어 있습니다.\n` +
          '검색 노출에 불리합니다. 이대로 저장할까요?'
      );
      if (!go) return;
    }

    setSaving(true);
    setMessage(null);

    const result = await saveProductAction(buildPayload(), product?.id);
    setSaving(false);

    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error });
      return;
    }

    setDirty(false);
    if (mode === 'close') {
      router.push('/admin/products');
      router.refresh();
      return;
    }

    setMessage({ tone: 'ok', text: '저장했습니다. 쇼핑몰에도 바로 반영됩니다.' });
    if (!product) {
      router.replace(`/admin/products/${result.data.id}`);
    }
    router.refresh();
  };

  /** 저장하지 않은 상태도 새 탭에서 확인할 수 있게 임시 저장 후 미리보기를 엽니다. */
  const openPreview = () => {
    try {
      window.localStorage.setItem(
        PREVIEW_STORAGE_KEY,
        JSON.stringify({ ...buildPayload(), savedAt: Date.now() })
      );
      window.open('/admin/preview', '_blank', 'noopener');
    } catch {
      setMessage({ tone: 'error', text: '미리보기를 열지 못했습니다.' });
    }
  };

  const handleSaveTemplate = async (title: string, body: string) => {
    const result = await createTemplateAction(title, body);
    if (result.ok) {
      setTemplateList((prev) => [
        { ...result.data, createdAt: null },
        ...prev,
      ]);
      setMessage({ tone: 'ok', text: '템플릿을 저장했습니다.' });
    } else {
      setMessage({ tone: 'error', text: result.error });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const result = await deleteTemplateAction(id);
    if (result.ok) {
      setTemplateList((prev) => prev.filter((template) => template.id !== id));
    } else {
      setMessage({ tone: 'error', text: result.error });
    }
  };

  const sectionClass = 'admin-card p-4 md:p-5';
  const sectionTitle = 'text-[16px] font-semibold text-slate-900';

  return (
    <div className="mx-auto w-full max-w-[900px] pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">
            {product ? '상품 수정' : '새 상품 등록'}
          </h1>
          {product ? (
            <p className="mt-1 text-[13px] text-slate-500">/products/{product.slug}</p>
          ) : null}
        </div>
        <Link href="/admin/products" className="admin-btn">
          목록으로
        </Link>
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

      <div className="mt-5 flex flex-col gap-5">
        {/* ── 1) 기본 정보 ─────────────────────────────── */}
        <section className={sectionClass}>
          <h2 className={sectionTitle}>1. 기본 정보</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="admin-label" htmlFor="name">
                상품명 *
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                onBlur={handleNameBlur}
                className="admin-input"
                placeholder="예: 울 블렌드 싱글 코트"
              />
            </div>

            <div className="md:col-span-2">
              <label className="admin-label" htmlFor="slug">
                slug (주소) * — 영문 소문자·숫자·하이픈. 한 번 정하면 바꾸지 마세요
              </label>
              <div className="flex gap-2">
                <input
                  id="slug"
                  type="text"
                  value={form.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    set('slug', event.target.value);
                  }}
                  className="admin-input"
                  placeholder="wool-blend-single-coat"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSlugTouched(true);
                    set('slug', slugify(form.name) || `item-${Date.now().toString(36)}`);
                  }}
                  className="admin-btn shrink-0"
                >
                  자동 생성
                </button>
              </div>
            </div>

            <div>
              <label className="admin-label" htmlFor="brand">
                브랜드 (선택)
              </label>
              <select
                id="brand"
                value={form.brandSlug ?? ''}
                onChange={(event) => set('brandSlug', event.target.value || null)}
                className="admin-input"
              >
                <option value="">선택 안 함</option>
                {brands.map((brand) => (
                  <option key={brand.slug} value={brand.slug}>
                    {brand.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label" htmlFor="gender">
                성별
              </label>
              <select
                id="gender"
                value={form.gender}
                onChange={(event) => set('gender', event.target.value as Gender)}
                className="admin-input"
              >
                {genders.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label" htmlFor="category">
                대분류 *
              </label>
              <select
                id="category"
                value={form.categorySlug}
                onChange={(event) => {
                  set('categorySlug', event.target.value);
                  set('subCategorySlug', null); // 대분류가 바뀌면 소분류를 비웁니다
                }}
                className="admin-input"
              >
                <option value="">선택하세요</option>
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.nameKo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label" htmlFor="subcategory">
                소분류
              </label>
              <select
                id="subcategory"
                value={form.subCategorySlug ?? ''}
                onChange={(event) => set('subCategorySlug', event.target.value || null)}
                disabled={subCategories.length === 0}
                className="admin-input"
              >
                <option value="">선택 안 함</option>
                {subCategories.map((sub) => (
                  <option key={sub.slug} value={sub.slug}>
                    {sub.nameKo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="admin-label" htmlFor="price">
                판매가 *
              </label>
              <input
                id="price"
                type="number"
                min={0}
                step={100}
                value={form.price}
                onChange={(event) => set('price', Number(event.target.value))}
                className="admin-input tabular-nums"
              />
            </div>

            <div>
              <label className="admin-label" htmlFor="original-price">
                할인 전 가격 (선택)
              </label>
              <input
                id="original-price"
                type="number"
                min={0}
                step={100}
                value={form.originalPrice ?? ''}
                onChange={(event) =>
                  set('originalPrice', event.target.value ? Number(event.target.value) : null)
                }
                className="admin-input tabular-nums"
                placeholder="비워 두면 할인 표시가 없습니다"
              />
            </div>

            <div className="md:col-span-2">
              <label className="admin-label" htmlFor="summary">
                한줄 설명
              </label>
              <input
                id="summary"
                type="text"
                value={form.summary}
                onChange={(event) => set('summary', event.target.value)}
                className="admin-input"
                placeholder="목록과 검색 결과에 보이는 짧은 설명"
              />
            </div>

            <div>
              <label className="admin-label" htmlFor="origin">
                원산지
              </label>
              <input
                id="origin"
                type="text"
                value={form.origin ?? ''}
                onChange={(event) => set('origin', event.target.value || null)}
                className="admin-input"
                placeholder="예: 대한민국"
              />
            </div>

            <div>
              <label className="admin-label" htmlFor="manufacturer">
                제조사
              </label>
              <input
                id="manufacturer"
                type="text"
                value={form.manufacturer ?? ''}
                onChange={(event) => set('manufacturer', event.target.value || null)}
                className="admin-input"
              />
            </div>

            <div>
              <label className="admin-label" htmlFor="season">
                시즌
              </label>
              <input
                id="season"
                type="text"
                value={form.season ?? ''}
                onChange={(event) => set('season', event.target.value || null)}
                className="admin-input"
                placeholder="예: 2026 F/W"
              />
            </div>

            <div>
              <label className="admin-label" htmlFor="display-order">
                진열순서 (작을수록 앞)
              </label>
              <input
                id="display-order"
                type="number"
                step={1}
                value={form.displayOrder}
                onChange={(event) => set('displayOrder', Number(event.target.value))}
                className="admin-input tabular-nums"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-100 pt-4">
            <span className="text-[13px] font-medium text-slate-700">뱃지</span>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="checkbox"
                checked={form.isNew}
                onChange={(event) => set('isNew', event.target.checked)}
                className="h-4 w-4"
              />
              신상품
            </label>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="checkbox"
                checked={form.isSale}
                onChange={(event) => set('isSale', event.target.checked)}
                className="h-4 w-4"
              />
              세일
            </label>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="checkbox"
                checked={form.isSoldOut}
                onChange={(event) => set('isSoldOut', event.target.checked)}
                className="h-4 w-4"
              />
              품절
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            <span className="text-[13px] font-medium text-slate-700">전시</span>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="radio"
                name="visible"
                checked={form.isVisible}
                onChange={() => set('isVisible', true)}
                className="h-4 w-4"
              />
              노출
            </label>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="radio"
                name="visible"
                checked={!form.isVisible}
                onChange={() => set('isVisible', false)}
                className="h-4 w-4"
              />
              숨김
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            <span className="text-[13px] font-medium text-slate-700">배송비</span>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="radio"
                name="shipping"
                checked={form.freeShipping}
                onChange={() => set('freeShipping', true)}
                className="h-4 w-4"
              />
              무료
            </label>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="radio"
                name="shipping"
                checked={!form.freeShipping}
                onChange={() => set('freeShipping', false)}
                className="h-4 w-4"
              />
              유료
            </label>
          </div>
        </section>

        {/* ── 2) 대표 이미지 ───────────────────────────── */}
        <section className={sectionClass}>
          <h2 className={sectionTitle}>2. 대표 이미지</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            여러 장을 한 번에 올릴 수 있습니다. 맨 앞 이미지가 목록에 나오는 대표 이미지입니다.
          </p>
          <div className="mt-4">
            <ImageUploader
              images={form.thumbnails}
              onChange={(next) => set('thumbnails', next)}
              slug={uploadSlug}
              showPrimaryBadge
            />
          </div>
        </section>

        {/* ── 3) 옵션 ──────────────────────────────────── */}
        <section className={sectionClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={sectionTitle}>3. 옵션</h2>
            <label className="flex items-center gap-2 text-[14px] text-slate-700">
              <input
                type="checkbox"
                checked={useOptions}
                onChange={(event) => {
                  setUseOptions(event.target.checked);
                  setDirty(true);
                  if (event.target.checked && form.optionGroups.length === 0) {
                    set('optionGroups', [{ name: '', values: [] }]);
                  }
                }}
                className="h-4 w-4"
              />
              옵션 사용
            </label>
          </div>

          {useOptions ? (
            <div className="mt-4">
              <OptionEditor
                groups={form.optionGroups}
                combinations={form.optionCombinations}
                onChange={(next) => {
                  setForm((prev) => ({
                    ...prev,
                    optionGroups: next.groups,
                    optionCombinations: next.combinations,
                  }));
                  setDirty(true);
                }}
              />
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-slate-500">
              옵션을 쓰지 않는 상품입니다. 필요하면 위 &ldquo;옵션 사용&rdquo;을 켜 주세요.
            </p>
          )}
        </section>

        {/* ── 4) 실측 사이즈 ───────────────────────────── */}
        <section className={sectionClass}>
          <h2 className={sectionTitle}>4. 실측 사이즈</h2>
          <div className="mt-4 flex flex-col gap-2">
            {form.measurements.map((row, index) => (
              <div key={index} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={row.label}
                  onChange={(event) =>
                    set(
                      'measurements',
                      form.measurements.map((item, position) =>
                        position === index ? { ...item, label: event.target.value } : item
                      )
                    )
                  }
                  placeholder="항목 (예: 어깨)"
                  aria-label={`실측 항목 ${index + 1}`}
                  className="admin-input w-[180px] flex-none"
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={(event) =>
                    set(
                      'measurements',
                      form.measurements.map((item, position) =>
                        position === index ? { ...item, value: event.target.value } : item
                      )
                    )
                  }
                  placeholder="값 (예: 44cm 또는 44 / 45.5 / 47)"
                  aria-label={`실측 값 ${index + 1}`}
                  className="admin-input min-w-[180px] flex-1"
                />
                <button
                  type="button"
                  onClick={() =>
                    set(
                      'measurements',
                      form.measurements.filter((_, position) => position !== index)
                    )
                  }
                  className="admin-btn-danger min-h-0 px-2.5 py-1.5"
                >
                  행 삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('measurements', [...form.measurements, { label: '', value: '' }])}
              className="admin-btn self-start"
            >
              + 행 추가
            </button>
          </div>
        </section>

        {/* ── 5) 상세 편집기 ───────────────────────────── */}
        <section className={sectionClass}>
          <h2 className={sectionTitle}>5. 상세 편집기</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            이미지·문구·표 블록을 원하는 순서로 쌓아 상세 페이지를 만듭니다.
          </p>
          <div className="mt-4">
            <DetailEditor
              blocks={form.detail}
              onChange={(next) => set('detail', next)}
              slug={uploadSlug}
              templates={templateList}
              onSaveTemplate={handleSaveTemplate}
              onDeleteTemplate={handleDeleteTemplate}
            />
          </div>
        </section>
      </div>

      {/* ── 6) 하단 고정 바 ───────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-[220px]">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-slate-500">
            {dirty ? '저장하지 않은 변경사항이 있습니다.' : '모든 변경사항이 저장되었습니다.'}
          </span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openPreview} className="admin-btn">
              미리보기
            </button>
            <button
              type="button"
              onClick={() => void save('continue')}
              disabled={saving}
              className="admin-btn"
            >
              {saving ? '저장 중…' : '저장 후 계속'}
            </button>
            <button
              type="button"
              onClick={() => void save('close')}
              disabled={saving}
              className="admin-btn-primary"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
