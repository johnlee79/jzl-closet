'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import BrandLogoField from '@/components/admin/BrandLogoField';
import ImageUploader from '@/components/admin/ImageUploader';
import {
  deleteBrandAction,
  reorderBrandsAction,
  saveBrandAction,
  toggleBrandAction,
} from '@/app/admin/taxonomy-actions';
import { brandImage, type Brand } from '@/lib/brands';
import { slugify } from '@/lib/product-utils';

type Message = { tone: 'ok' | 'error'; text: string } | null;

type Draft = {
  slug: string;
  label: string;
  name: string;
  nameKo: string;
  tagline: string;
  story: string; // 편집 중에는 여러 줄 텍스트. 빈 줄이 문단 구분입니다.
  origin: string;
  since: string;
  imageUrl: string;
  logoUrl: string;
  logoOriginalUrl: string;
  logoScale: number;
  isVisible: boolean;
  isFeatured: boolean;
};

function toDraft(brand: Brand): Draft {
  return {
    slug: brand.slug,
    label: brand.label,
    name: brand.name,
    nameKo: brand.nameKo,
    tagline: brand.tagline,
    story: brand.story.join('\n\n'),
    origin: brand.origin,
    since: brand.since,
    imageUrl: brand.imageUrl,
    logoUrl: brand.logoUrl,
    logoOriginalUrl: brand.logoOriginalUrl,
    logoScale: brand.logoScale,
    isVisible: brand.isVisible,
    isFeatured: brand.isFeatured,
  };
}

function emptyDraft(): Draft {
  return {
    slug: '',
    label: '',
    name: '',
    nameKo: '',
    tagline: '',
    story: '',
    origin: '대한민국',
    since: '',
    imageUrl: '',
    logoUrl: '',
    logoOriginalUrl: '',
    logoScale: 1,
    isVisible: true,
    isFeatured: false,
  };
}

/* ------------------------------------------------------------------
 * 추가·수정 폼
 * ------------------------------------------------------------------ */

function BrandForm({
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
  const [slugTouched, setSlugTouched] = useState(!isNew);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const id = `brand-${initial.slug || 'new'}`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
      className="rounded-md border border-blue-200 bg-blue-50/50 p-4"
    >
      <h3 className="text-[16px] font-semibold text-slate-900">
        {isNew ? '브랜드 추가' : `${initial.label} 수정`}
      </h3>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="admin-label" htmlFor={`${id}-slug`}>
            slug (주소)
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-slug`}
              type="text"
              value={draft.slug}
              disabled={!isNew}
              onChange={(event) => {
                setSlugTouched(true);
                set('slug', event.target.value.toLowerCase());
              }}
              placeholder="nord-blanc"
              className="admin-input"
            />
            {isNew ? (
              <button
                type="button"
                onClick={() => {
                  setSlugTouched(true);
                  set('slug', slugify(draft.label || draft.name));
                }}
                className="admin-btn shrink-0"
              >
                자동
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] text-slate-500">
            {isNew
              ? '/brand/nord-blanc 의 뒷부분입니다. 등록 후에는 바꿀 수 없습니다.'
              : '주소에 쓰이므로 변경할 수 없습니다.'}
          </p>
        </div>

        <div>
          <label className="admin-label" htmlFor={`${id}-label`}>
            라벨 (화면 표시용)
          </label>
          <input
            id={`${id}-label`}
            type="text"
            value={draft.label}
            onChange={(event) => {
              const value = event.target.value;
              set('label', value);
              if (isNew && !slugTouched) set('slug', slugify(value));
            }}
            placeholder="GANNI"
            className="admin-input"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor={`${id}-name`}>
            정식 표기 (JSON-LD·이미지 alt)
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="GANNI"
            className="admin-input"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor={`${id}-nameko`}>
            한글명
          </label>
          <input
            id={`${id}-nameko`}
            type="text"
            value={draft.nameKo}
            onChange={(event) => set('nameKo', event.target.value)}
            placeholder="노르 블랑"
            className="admin-input"
          />
        </div>

        <div className="md:col-span-2">
          <label className="admin-label" htmlFor={`${id}-tagline`}>
            한 줄 소개
          </label>
          <input
            id={`${id}-tagline`}
            type="text"
            value={draft.tagline}
            onChange={(event) => set('tagline', event.target.value)}
            placeholder="겨울을 위한 최소한의 구성"
            className="admin-input"
          />
        </div>

        <div className="md:col-span-2">
          <label className="admin-label" htmlFor={`${id}-story`}>
            브랜드 스토리
          </label>
          <textarea
            id={`${id}-story`}
            value={draft.story}
            onChange={(event) => set('story', event.target.value)}
            rows={6}
            placeholder={'첫 문단을 적습니다.\n\n빈 줄을 하나 넣으면 다음 문단이 됩니다.'}
            className="admin-input leading-relaxed"
          />
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
            빈 줄 하나가 문단 구분입니다. 이 글은 <code>/brand/{draft.slug || 'slug'}</code>{' '}
            페이지에 실제 텍스트로 출력되어 “{draft.label || '브랜드'} 브랜드” 같은 검색
            유입 경로가 됩니다. 두세 문단으로 충분히 적어 주세요.
          </p>
        </div>

        <div>
          <label className="admin-label" htmlFor={`${id}-origin`}>
            원산지
          </label>
          <input
            id={`${id}-origin`}
            type="text"
            value={draft.origin}
            onChange={(event) => set('origin', event.target.value)}
            className="admin-input"
          />
        </div>

        <div>
          <label className="admin-label" htmlFor={`${id}-since`}>
            설립연도
          </label>
          <input
            id={`${id}-since`}
            type="text"
            value={draft.since}
            onChange={(event) => set('since', event.target.value)}
            placeholder="2019"
            className="admin-input"
          />
        </div>

        <div className="md:col-span-2">
          <span className="admin-label">대표 이미지</span>
          <p className="mb-2 text-[14px] leading-relaxed text-slate-500">
            <code>/brand/{draft.slug || '{slug}'}</code> 페이지 맨 위에 가로로 넓게 깔립니다.{' '}
            <strong>올린 비율 그대로 나오며 잘리지 않습니다.</strong> 가로로 넓은 사진을
            권합니다. (21:9 또는 16:9) 세로로 긴 사진을 올리면 화면을 크게 차지합니다.
          </p>
          <ImageUploader
            images={draft.imageUrl ? [draft.imageUrl] : []}
            onChange={(next) => set('imageUrl', next[0] ?? '')}
            slug={`brands/${draft.slug || 'new'}`}
            multiple={false}
            label="브랜드 대표 이미지를 끌어다 놓거나 클릭해서 선택하세요"
            frame="full"
          />
        </div>

        <div className="md:col-span-2">
          <span className="admin-label">로고 (선택)</span>
          <p className="mb-2 text-[14px] leading-relaxed text-slate-500">
            ★ <strong>상품 카드 · 상품 상세 · 상품 목록 필터 · 브랜드 페이지</strong>의
            브랜드명 자리에 씁니다. <strong>비워 두면 지금처럼 브랜드명이 글자로
            나옵니다.</strong> 로고는 각 브랜드사의 등록상표라, 쓸 수 있는 것만 올려 주세요.
          </p>
          <ul className="mb-2 list-disc pl-5 text-[14px] leading-relaxed text-slate-500">
            <li>
              <strong>배경이 없는 PNG</strong>를 권합니다. GIF · JPG · WEBP 도 올라가며,
              투명한 배경은 그대로 유지됩니다.
            </li>
            <li>
              <strong>크기는 올리는 즉시 자동으로 맞춰집니다.</strong> 다른 브랜드 로고와
              같은 무게로 보이도록 넓이(가로×세로)를 기준으로 계산해 800×360 투명
              캔버스 한가운데에 얹어 저장합니다. 비율은 건드리지 않으므로 찌그러지지
              않습니다.
            </li>
            <li>
              가로로 아주 긴 로고는 그만큼 <strong>낮게</strong>, 정사각형에 가까운 로고는
              <strong>크게</strong> 들어갑니다. 눈에 보이는 크기를 맞추기 위한 것이라
              정상입니다.
            </li>
            <li>
              글자가 아주 작게 들어간 로고는 상품 카드에서 알아보기 어렵습니다.
              <strong>심볼이나 워드마크만</strong> 있는 것이 좋습니다.
            </li>
          </ul>
          <BrandLogoField
            slug={draft.slug || 'new'}
            value={{
              logoUrl: draft.logoUrl,
              logoOriginalUrl: draft.logoOriginalUrl,
              logoScale: draft.logoScale,
            }}
            onChange={(next) => {
              set('logoUrl', next.logoUrl);
              set('logoOriginalUrl', next.logoOriginalUrl);
              set('logoScale', next.logoScale);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-5 md:col-span-2">
          <label className="flex items-center gap-2 text-[16px] text-slate-800">
            <input
              type="checkbox"
              checked={draft.isVisible}
              onChange={(event) => set('isVisible', event.target.checked)}
              className="h-4 w-4"
            />
            노출
          </label>
          <label className="flex items-center gap-2 text-[16px] text-slate-800">
            <input
              type="checkbox"
              checked={draft.isFeatured}
              onChange={(event) => set('isFeatured', event.target.checked)}
              className="h-4 w-4"
            />
            강조 (브랜드 목록 위쪽에 크게 노출)
          </label>
        </div>
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

export default function BrandManager({
  brands,
  counts,
}: {
  brands: Brand[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const [order, setOrder] = useState<string[]>(() => brands.map((item) => item.slug));
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const dragSlug = useRef<string | null>(null);

  const signature = brands.map((item) => item.slug).join('|');
  useEffect(() => {
    setOrder(brands.map((item) => item.slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const bySlug = new Map(brands.map((item) => [item.slug, item]));
  const rows = order
    .map((slug) => bySlug.get(slug))
    .filter((item): item is Brand => Boolean(item));

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

  const drop = (targetSlug: string) => {
    const source = dragSlug.current;
    dragSlug.current = null;
    if (!source || source === targetSlug) return;

    const next = [...order];
    const from = next.indexOf(source);
    const to = next.indexOf(targetSlug);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    run(() => reorderBrandsAction(next), '순서를 저장했습니다.');
  };

  const save = (draft: Draft, isNew: boolean) => {
    run(
      () =>
        saveBrandAction(
          {
            slug: draft.slug.trim(),
            label: draft.label.trim(),
            name: draft.name.trim() || draft.label.trim(),
            nameKo: draft.nameKo.trim(),
            tagline: draft.tagline.trim(),
            story: draft.story
              .split(/\n\s*\n/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean),
            origin: draft.origin.trim(),
            since: draft.since.trim(),
            imageUrl: draft.imageUrl.trim(),
            logoUrl: draft.logoUrl.trim(),
            logoOriginalUrl: draft.logoOriginalUrl.trim(),
            logoScale: draft.logoScale,
            isVisible: draft.isVisible,
            isFeatured: draft.isFeatured,
          },
          isNew
        ),
      isNew ? '브랜드를 추가했습니다.' : '브랜드를 수정했습니다.'
    );
    setEditing(null);
    setAdding(false);
  };

  const remove = (brand: Brand) => {
    if (!window.confirm(`"${brand.label}" 브랜드를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    run(() => deleteBrandAction(brand.slug), '브랜드를 삭제했습니다.');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-slate-600">
          왼쪽 손잡이(≡)를 끌어 순서를 바꿉니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding((prev) => !prev);
            setEditing(null);
          }}
          className="admin-btn-primary"
        >
          + 브랜드 추가
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

      {adding ? (
        <div className="mt-4">
          <BrandForm
            initial={emptyDraft()}
            isNew
            busy={pending}
            onSave={(draft) => save(draft, true)}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : null}

      <div className="admin-card mt-4 overflow-hidden">
        <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-[15px] font-medium text-slate-600 md:flex">
          <span className="w-10">순서</span>
          <span className="w-[64px]">이미지</span>
          <span className="flex-1">라벨</span>
          <span className="w-[150px]">정식명</span>
          <span className="w-[70px]">상품수</span>
          <span className="w-[64px]">노출</span>
          <span className="w-[64px]">강조</span>
          <span className="w-[140px] text-right">관리</span>
        </div>

        <ul>
          {rows.map((brand, index) => (
            <li
              key={brand.slug}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(brand.slug)}
              className="border-b border-slate-200 last:border-b-0"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 md:flex-nowrap">
                {/* 손잡이에만 draggable 을 겁니다. 행 전체에 걸면 입력칸에서 글자를 못 고릅니다. */}
                <span
                  draggable
                  onDragStart={() => {
                    dragSlug.current = brand.slug;
                  }}
                  title="끌어서 순서 변경"
                  className="w-10 cursor-move select-none text-[18px] text-slate-400"
                >
                  ≡ <span className="text-[14px] tabular-nums">{index + 1}</span>
                </span>

                <span className="w-[64px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brandImage(brand)}
                    alt=""
                    className="h-12 w-12 rounded-md border border-slate-200 bg-slate-100 object-cover"
                  />
                </span>

                <span className="flex-1">
                  <span className="text-[16px] font-medium text-slate-900">
                    {brand.label}
                  </span>
                  <span className="ml-2 text-[14px] text-slate-500">/{brand.slug}</span>
                  {brand.tagline ? (
                    <span className="block text-[14px] text-slate-500">{brand.tagline}</span>
                  ) : null}
                </span>

                <span className="w-[150px] text-[15px] text-slate-700">{brand.name}</span>
                <span className="w-[70px] text-[15px] text-slate-600">
                  {counts[brand.slug] ?? 0}개
                </span>

                <span className="w-[64px]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={brand.isVisible}
                    aria-label={`${brand.label} 노출`}
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => toggleBrandAction(brand.slug, { isVisible: !brand.isVisible }),
                        brand.isVisible ? '숨김으로 바꿨습니다.' : '노출로 바꿨습니다.'
                      )
                    }
                    className="inline-flex items-center"
                  >
                    <span
                      className={`relative block h-5 w-9 rounded-full transition-colors ${
                        brand.isVisible ? 'bg-blue-700' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                          brand.isVisible ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </span>

                <span className="w-[64px]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={brand.isFeatured}
                    aria-label={`${brand.label} 강조`}
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          toggleBrandAction(brand.slug, { isFeatured: !brand.isFeatured }),
                        brand.isFeatured ? '강조를 껐습니다.' : '강조로 바꿨습니다.'
                      )
                    }
                    className="inline-flex items-center"
                  >
                    <span
                      className={`relative block h-5 w-9 rounded-full transition-colors ${
                        brand.isFeatured ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                          brand.isFeatured ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </span>

                <span className="flex w-[140px] flex-wrap justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(editing === brand.slug ? null : brand.slug);
                      setAdding(false);
                    }}
                    className="admin-btn"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(brand)}
                    className="admin-btn-danger"
                  >
                    삭제
                  </button>
                </span>
              </div>

              {editing === brand.slug ? (
                <div className="px-4 pb-4">
                  <BrandForm
                    initial={toDraft(brand)}
                    isNew={false}
                    busy={pending}
                    onSave={(draft) => save(draft, false)}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
