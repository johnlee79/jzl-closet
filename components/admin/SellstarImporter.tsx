'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import BulkImageUpload from '@/components/admin/BulkImageUpload';
import RichTextEditor from '@/components/admin/RichTextEditor';
import {
  ManufacturerField,
  OriginField,
  SummaryField,
  brandOrigin,
} from '@/components/admin/ProductInfoFields';
import {
  fetchSellstarAction,
  importProductAction,
  type ImportPayload,
} from '@/app/admin/import-actions';
import { formatPrice, slugify } from '@/lib/product-utils';
import { splitOriginAndManufacturer } from '@/lib/origin';
import { fillTemplate, type ImportSettings } from '@/lib/site-config';
import type { Brand } from '@/lib/brands';
import type { Category } from '@/lib/categories';
import type { DetailBlock, UploadedImage } from '@/lib/types';

/**
 * 셀스타 상품 가져오기.
 *
 * 흐름
 *   1) 주소·번호를 넣고 불러오기 → 셀스타 응답을 화면에 채웁니다
 *   2) 상세 구성에서 쓸 이미지만 남기고, 사이사이에 글·이미지를 끼웁니다
 *   3) [가져오기 시작] 을 누르면 이미지를 R2 로 복사하고 임시저장으로 등록합니다
 *
 * ★ 이미지는 5장씩 나눠 보냅니다. 21장을 한 번에 보내면 서버 함수 시간 제한에 걸립니다.
 * ★ 등록은 항상 노출 꺼짐(임시저장) 상태입니다.
 */

/** 한 번에 복사할 이미지 수 — 서버 라우트의 제한과 같아야 합니다. */
const BATCH = 5;

type Row =
  | {
      key: string;
      kind: 'image';
      /** 셀스타 원본 주소. 직접 올린 이미지는 이미 R2 주소입니다. */
      url: string;
      /** 등록에 포함할지 */
      checked: boolean;
      /** 리셀러 브랜드 이미지 (기본 해제) */
      reseller: boolean;
      /** 이미 우리 R2 에 있는 이미지인지 (직접 올린 것) */
      local: boolean;
      width: number;
      height: number;
      alt: string;
    }
  | { key: string; kind: 'text'; body: string; checked: boolean };

type Message = { tone: 'ok' | 'error'; text: string } | null;

let seq = 0;
const nextKey = (): string => {
  seq += 1;
  return `row-${seq}-${Math.random().toString(36).slice(2, 7)}`;
};

export default function SellstarImporter({
  allCategories,
  allBrands,
  settings,
}: {
  allCategories: Category[];
  allBrands: Brand[];
  settings: ImportSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [input, setInput] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [existing, setExisting] = useState<{ slug: string; name: string } | null>(null);

  /* ── 불러온 상품 ─────────────────────────────────────── */
  const [loaded, setLoaded] = useState(false);
  const [sellstarId, setSellstarId] = useState(0);
  const [sellstarPrice, setSellstarPrice] = useState(0);
  const [sellstarSalePrice, setSellstarSalePrice] = useState(0);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [price, setPrice] = useState(0);
  const [originalPrice, setOriginalPrice] = useState(0);
  const [categorySlug, setCategorySlug] = useState('');
  const [subCategorySlug, setSubCategorySlug] = useState('');
  const [brandSlug, setBrandSlug] = useState('');
  const [origin, setOrigin] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [originFromBrand, setOriginFromBrand] = useState(false);
  const [freeShipping, setFreeShipping] = useState(false);
  const [useOwnShipping, setUseOwnShipping] = useState(false);
  const [shippingNote, setShippingNote] = useState('');

  const [galleryRows, setGalleryRows] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<{ name: string; values: string[] }[]>([]);
  const [variants, setVariants] = useState<
    { key: string; label: string; stock: number | null; soldOut: boolean }[]
  >([]);

  /* ── 진행 상태 ───────────────────────────────────────── */
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState<string[]>([]);

  const dragIndex = useRef<number | null>(null);

  const subCategories = useMemo(
    () => allCategories.find((item) => item.slug === categorySlug)?.children ?? [],
    [allCategories, categorySlug]
  );

  /**
   * 브랜드 선택 — 브랜드에 적힌 원산지를 원산지 칸에 옮겨 담습니다.
   * 규칙은 상품 등록 화면과 같습니다. 이미 값이 있으면 덮지 않습니다.
   */
  const chooseBrand = (slug: string) => {
    setBrandSlug(slug);
    const fromBrand = brandOrigin(allBrands, slug || null);
    // 사람이 적은 값은 덮지 않고, 앞서 브랜드에서 들어온 값만 갈아 끼웁니다.
    const canFill = !origin.trim() || originFromBrand;
    if (fromBrand && canFill) {
      setOrigin(fromBrand);
      setOriginFromBrand(true);
    }
  };

  /* ── 1) 불러오기 ─────────────────────────────────────── */

  const load = () => {
    setMessage(null);
    setWarnings([]);
    setExisting(null);
    setFailed([]);

    startTransition(async () => {
      const response = await fetch(
        `/api/admin/import/sellstar?id=${encodeURIComponent(input.trim())}`,
        { cache: 'no-store' }
      );
      const payload = (await response.json()) as {
        product?: Awaited<ReturnType<typeof fetchSellstarAction>>;
        error?: string;
        existing?: { slug: string; name: string } | null;
      };

      if (!response.ok) {
        setMessage({ tone: 'error', text: payload.error ?? '가져오지 못했습니다.' });
        return;
      }

      // 라우트가 돌려주는 형태에 맞춰 읽습니다.
      const raw = payload as unknown as {
        product: {
          sellstarId: number;
          name: string;
          price: number;
          salePrice: number;
          gallery: { url: string; width: number; height: number }[];
          blocks: (
            | { kind: 'image'; url: string; reseller: boolean; gif: boolean }
            | { kind: 'text'; body: string }
          )[];
          optionGroups: { name: string; values: string[] }[];
          variants: { key: string; label: string; stock: number | null; soldOut: boolean }[];
          shipping: { baseFee: number; extraJeju: number; returnFee: number; exchangeFee: number; courier: string; avgDeliveryDays: number } | null;
          warnings: string[];
        };
        existing: { slug: string; name: string } | null;
      };

      const product = raw.product;

      setSellstarId(product.sellstarId);
      setSellstarPrice(product.price);
      setSellstarSalePrice(product.salePrice);
      setName(product.name);
      setSlug(slugify(product.name));
      setSummary('');
      // ★ 셀스타 판매가를 기본값으로 두되, 최종 결정은 운영자가 합니다.
      setPrice(product.salePrice);
      setOriginalPrice(product.price);
      setGroups(product.optionGroups);
      setVariants(product.variants);
      setWarnings(product.warnings);
      setExisting(raw.existing);

      setGalleryRows(
        product.gallery.map((image) => ({
          key: nextKey(),
          kind: 'image' as const,
          url: image.url,
          checked: true,
          reseller: false,
          local: false,
          width: image.width,
          height: image.height,
          alt: product.name,
        }))
      );

      /* 상세 구성 — 공통 블록을 앞뒤에 끼웁니다. */
      const body: Row[] = product.blocks.map((block, index) =>
        block.kind === 'image'
          ? {
              key: nextKey(),
              kind: 'image' as const,
              url: block.url,
              // ★ 리셀러 브랜드 이미지는 기본으로 해제합니다. 다시 켤 수 있습니다.
              checked: !block.reseller,
              reseller: block.reseller,
              local: false,
              width: 0,
              height: 0,
              alt: `${product.name} 상세 이미지 ${index + 1}`,
            }
          : { key: nextKey(), kind: 'text' as const, body: block.body, checked: true }
      );

      const head: Row[] = settings.topBlock.enabled ? [toRow(settings.topBlock, product.name)] : [];
      const tail: Row[] = settings.bottomBlock.enabled
        ? [toRow(settings.bottomBlock, product.name)]
        : [];

      setRows([...head, ...body, ...tail]);
      setShippingNote(
        product.shipping
          ? `배송비 ${formatPrice(product.shipping.baseFee)}원 · 제주 ${formatPrice(
              product.shipping.extraJeju
            )}원 · 반품 ${formatPrice(product.shipping.returnFee)}원 · 교환 ${formatPrice(
              product.shipping.exchangeFee
            )}원 · ${product.shipping.courier} · 평균 ${product.shipping.avgDeliveryDays}일`
          : '배송 정보를 가져오지 못했습니다.'
      );
      setFreeShipping((product.shipping?.baseFee ?? 0) === 0);
      setLoaded(true);
      setMessage({ tone: 'ok', text: `불러왔습니다. 확인 후 아래에서 등록해 주세요.` });
    });
  };

  /** 설정의 공통 블록 → 편집 줄 */
  function toRow(
    block: ImportSettings['topBlock'],
    productName: string
  ): Row {
    return block.kind === 'image'
      ? {
          key: nextKey(),
          kind: 'image',
          url: block.imageUrl,
          checked: true,
          reseller: false,
          // 설정에 등록해 둔 이미지는 이미 우리 저장소에 있습니다.
          local: true,
          width: 0,
          height: 0,
          alt: productName,
        }
      : {
          key: nextKey(),
          kind: 'text',
          body: fillTemplate(block.body, productName),
          checked: true,
        };
  }

  /* ── 2) 상세 구성 편집 ───────────────────────────────── */

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((row) => (row.key === key ? ({ ...row, ...patch } as Row) : row))
    );

  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((row) => row.key !== key));

  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /** 특정 위치에 새 줄을 끼웁니다. */
  const insertAt = (index: number, row: Row) =>
    setRows((prev) => {
      const next = [...prev];
      next.splice(index, 0, row);
      return next;
    });

  const insertText = (index: number, body: string) =>
    insertAt(index, { key: nextKey(), kind: 'text', body, checked: true });

  const insertImages = (index: number, images: UploadedImage[]) =>
    setRows((prev) => {
      const next = [...prev];
      next.splice(
        index,
        0,
        ...images.map<Row>((image) => ({
          key: nextKey(),
          kind: 'image',
          url: image.url,
          checked: true,
          reseller: false,
          local: true,
          width: image.width,
          height: image.height,
          alt: name,
        }))
      );
      return next;
    });

  /* ── 3) 등록 ─────────────────────────────────────────── */

  /** 셀스타 이미지를 5장씩 우리 R2 로 옮깁니다. */
  const copyImages = async (
    urls: string[],
    onStep: (done: number) => void
  ): Promise<{ map: Map<string, UploadedImage>; errors: string[] }> => {
    const map = new Map<string, UploadedImage>();
    const errors: string[] = [];
    let done = 0;

    for (let index = 0; index < urls.length; index += BATCH) {
      const slice = urls.slice(index, index + BATCH);
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch('/api/admin/import/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: slice, slug: slug || slugify(name) }),
      });

      if (!response.ok) {
        // 이 묶음은 통째로 실패했지만 다음 묶음은 계속 진행합니다.
        errors.push(...slice.map((url) => `${url} — 서버 오류`));
        done += slice.length;
        onStep(done);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const payload = (await response.json()) as {
        results: (
          | { ok: true; source: string; image: UploadedImage }
          | { ok: false; source: string; error: string }
        )[];
      };

      for (const item of payload.results) {
        if (item.ok) map.set(item.source, item.image);
        else errors.push(`${item.source} — ${item.error}`);
      }

      done += slice.length;
      onStep(done);
    }

    return { map, errors };
  };

  const register = async () => {
    if (busy) return;

    const usedGallery = galleryRows.filter((row) => row.kind === 'image' && row.checked);
    const usedRows = rows.filter((row) => row.checked);

    if (usedGallery.length === 0) {
      setMessage({ tone: 'error', text: '대표 이미지를 하나 이상 선택해 주세요.' });
      return;
    }
    if (!categorySlug) {
      setMessage({ tone: 'error', text: '분류를 선택해 주세요.' });
      return;
    }

    setBusy(true);
    setMessage(null);
    setFailed([]);

    try {
      // 아직 우리 저장소에 없는 이미지만 옮기면 됩니다.
      const remote = [
        ...usedGallery.map((row) => (row.kind === 'image' ? row.url : '')),
        ...usedRows.map((row) => (row.kind === 'image' && !row.local ? row.url : '')),
      ].filter(Boolean);

      const unique = Array.from(new Set(remote));
      setProgress({ done: 0, total: unique.length });

      const { map, errors } = await copyImages(unique, (done) =>
        setProgress({ done, total: unique.length })
      );
      setFailed(errors);

      const thumbnails = usedGallery
        .map((row) => (row.kind === 'image' ? map.get(row.url)?.url : undefined))
        .filter((url): url is string => Boolean(url));

      if (thumbnails.length === 0) {
        setMessage({
          tone: 'error',
          text: '대표 이미지를 한 장도 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        });
        return;
      }

      const detail: DetailBlock[] = [];
      for (const row of usedRows) {
        if (row.kind === 'text') {
          if (row.body.trim()) detail.push({ type: 'text', body: row.body });
          continue;
        }
        const copied = row.local ? null : map.get(row.url);
        const url = row.local ? row.url : copied?.url;
        if (!url) continue;
        detail.push({
          type: 'image',
          src: url,
          alt: row.alt,
          // ★ 원본 크기를 함께 저장해 손님 화면에서 자리를 미리 잡습니다. (CLS 방지)
          width: copied?.width ?? row.width ?? 0,
          height: copied?.height ?? row.height ?? 0,
        });
      }

      /*
        원산지와 제조사를 제자리에 놓고 보냅니다.
        ★ 제조사 칸에 나라 이름만 적혀 있으면 원산지로 옮기고 제조사는 비웁니다.
          영문으로 적혀 있으면 한글로 바꿉니다. (CHINA → 중국)
          서버(import-actions)에서도 같은 정리를 한 번 더 합니다. 여기는 화면용,
          거기는 마지막 관문입니다. 둘 다 lib/origin.ts 의 같은 함수를 씁니다.
      */
      const placed = splitOriginAndManufacturer({ origin, manufacturer });

      const payload: ImportPayload = {
        sellstarId,
        sellstarPrice,
        sellstarSalePrice,
        name,
        slug,
        summary,
        price,
        originalPrice: originalPrice > price ? originalPrice : null,
        categorySlug,
        subCategorySlug: subCategorySlug || null,
        brandSlug: brandSlug || null,
        origin: placed.origin,
        manufacturer: placed.manufacturer,
        thumbnails,
        detail,
        optionGroups: groups,
        optionCombinations: variants.map((variant) => ({
          key: variant.key,
          extraPrice: 0,
          stock: variant.stock,
          isActive: !variant.soldOut,
        })),
        freeShipping,
      };

      const result = await importProductAction(payload);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }

      router.push(`/admin/products/${result.data.id}`);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '등록에 실패했습니다.',
      });
    } finally {
      setBusy(false);
    }
  };

  /* ================================================================ */

  const inputClass = 'admin-input';

  return (
    <div className="flex flex-col gap-5">
      {/* ── 주소 입력 ─────────────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">셀스타 상품 주소</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          전체 주소(https://sellstar.kr/marquenco/product/188)와 번호(188) 둘 다 됩니다.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                load();
              }
            }}
            placeholder="https://sellstar.kr/marquenco/product/188"
            className={`${inputClass} md:max-w-[520px]`}
          />
          <button
            type="button"
            onClick={load}
            disabled={pending || busy || !input.trim()}
            className="admin-btn-primary"
          >
            {pending ? '불러오는 중…' : '불러오기'}
          </button>
        </div>

        {message ? (
          <p
            role="status"
            className={`mt-3 rounded-md px-3 py-2 text-[16px] ${
              message.tone === 'ok'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </p>
        ) : null}

        {existing ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[15px] leading-relaxed text-amber-900">
            ★ 이미 등록된 상품입니다 —{' '}
            <Link href={`/admin/products?q=${existing.slug}`} className="underline">
              {existing.name}
            </Link>
            . 그대로 등록하면 같은 상품이 하나 더 생깁니다. 기존 상품을 고치시려면 그쪽
            편집 화면에서 <strong>셀스타에서 다시 불러오기</strong>를 쓰세요.
          </p>
        ) : null}

        {warnings.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-[15px] text-amber-900">
            {warnings.map((warning) => (
              <li key={warning}>· {warning}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {!loaded ? null : (
        <>
          {/* ── 기본 정보 ─────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">기본 정보</h2>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="admin-label" htmlFor="im-name">상품명</label>
                <input
                  id="im-name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setSlug(slugify(event.target.value));
                  }}
                  className={inputClass}
                />
              </div>

              <div className="md:col-span-2">
                <SummaryField id="im-summary" value={summary} onChange={setSummary} />
              </div>

              {/* 셀스타 가격은 참고용입니다. */}
              <div className="md:col-span-2 rounded-md bg-slate-50 px-3 py-2 text-[15px] text-slate-700">
                셀스타 정가 <strong>{formatPrice(sellstarPrice)}원</strong> · 판매가{' '}
                <strong>{formatPrice(sellstarSalePrice)}원</strong>
                <span className="ml-2 text-slate-500">(참고용)</span>
              </div>

              <div>
                <label className="admin-label" htmlFor="im-price">JZL 판매가 *</label>
                <input
                  id="im-price"
                  type="number"
                  min={0}
                  step={100}
                  value={price}
                  onChange={(event) => setPrice(Math.max(0, Number(event.target.value) || 0))}
                  className={`${inputClass} tabular-nums`}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[10, 20, 30].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() =>
                        setPrice(
                          Math.round((sellstarSalePrice * (100 + percent)) / 100 / 100) * 100
                        )
                      }
                      className="admin-btn min-h-0 px-2 py-1 text-[15px]"
                    >
                      +{percent}%
                    </button>
                  ))}
                  <span className="self-center text-[14px] text-slate-500">
                    셀스타 판매가 기준 · 100원 단위
                  </span>
                </div>
              </div>

              <div>
                <label className="admin-label" htmlFor="im-origin-price">정가 (할인 전)</label>
                <input
                  id="im-origin-price"
                  type="number"
                  min={0}
                  step={100}
                  value={originalPrice}
                  onChange={(event) =>
                    setOriginalPrice(Math.max(0, Number(event.target.value) || 0))
                  }
                  className={`${inputClass} tabular-nums`}
                />
                <p className="mt-1 text-[14px] text-slate-500">
                  판매가보다 크면 할인 표시가 붙습니다.
                </p>
              </div>

              <div>
                <label className="admin-label" htmlFor="im-category">분류 *</label>
                <select
                  id="im-category"
                  value={categorySlug}
                  onChange={(event) => {
                    setCategorySlug(event.target.value);
                    setSubCategorySlug('');
                  }}
                  className={inputClass}
                >
                  <option value="">선택하세요</option>
                  {allCategories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.nameKo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="admin-label" htmlFor="im-sub">소분류</label>
                <select
                  id="im-sub"
                  value={subCategorySlug}
                  onChange={(event) => setSubCategorySlug(event.target.value)}
                  disabled={subCategories.length === 0}
                  className={inputClass}
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
                <label className="admin-label" htmlFor="im-brand">브랜드</label>
                <select
                  id="im-brand"
                  value={brandSlug}
                  onChange={(event) => chooseBrand(event.target.value)}
                  className={inputClass}
                >
                  <option value="">선택 안 함</option>
                  {allBrands.map((brand) => (
                    <option key={brand.slug} value={brand.slug}>
                      {brand.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="admin-label" htmlFor="im-slug">주소(slug)</label>
                <input
                  id="im-slug"
                  type="text"
                  value={slug}
                  onChange={(event) => setSlug(slugify(event.target.value))}
                  className={inputClass}
                />
              </div>

              {/*
                ★ 셀스타는 원산지·제조사를 주지 않습니다. (응답에 그런 항목이 없습니다)
                  그래서 여기서 받습니다. 예전에는 칸 자체가 없어 등록을 끝낸 뒤
                  상품 수정 화면으로 다시 들어가야 했습니다.
                ★ 브랜드를 고르면 원산지가 자동으로 들어옵니다. 상품 등록 화면과 같습니다.
              */}
              <OriginField
                id="im-origin"
                value={origin}
                onChange={(value) => {
                  setOrigin(value);
                  setOriginFromBrand(false);
                }}
                fromBrand={originFromBrand}
              />

              <ManufacturerField
                id="im-manufacturer"
                value={manufacturer}
                onChange={setManufacturer}
                originFilled={Boolean(origin.trim())}
                onMoveToOrigin={(country) => {
                  setOrigin(country);
                  setManufacturer('');
                  setOriginFromBrand(false);
                }}
              />
            </div>
          </section>

          {/* ── 옵션 · 재고 ───────────────────────────── */}
          {groups.length > 0 ? (
            <section className="admin-card p-4 md:p-5">
              <h2 className="text-[18px] font-semibold text-slate-900">옵션 · 재고</h2>
              <p className="mt-1 text-[15px] text-slate-500">
                {groups.map((group) => `${group.name}(${group.values.length})`).join(' · ')} —
                조합 {variants.length}개. 재고와 품절은 여기서 고칠 수 있습니다.
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[16px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[15px] text-slate-600">
                      <th scope="col" className="px-3 py-2 font-medium">조합</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">재고</th>
                      <th scope="col" className="px-3 py-2 font-medium">품절</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((variant, index) => (
                      <tr key={variant.key} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2 text-slate-900">{variant.key}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={variant.stock ?? ''}
                            onChange={(event) => {
                              const raw = event.target.value;
                              setVariants((prev) =>
                                prev.map((item, position) =>
                                  position === index
                                    ? { ...item, stock: raw === '' ? null : Math.max(0, Number(raw) || 0) }
                                    : item
                                )
                              );
                            }}
                            placeholder="미관리"
                            className={`${inputClass} max-w-[110px] text-right tabular-nums`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={variant.soldOut}
                            onChange={(event) =>
                              setVariants((prev) =>
                                prev.map((item, position) =>
                                  position === index
                                    ? { ...item, soldOut: event.target.checked }
                                    : item
                                )
                              )
                            }
                            className="h-4 w-4"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[14px] text-slate-500">
                재고를 비워 두면 수량을 관리하지 않고 품절 체크만 씁니다.
              </p>
            </section>
          ) : null}

          {/* ── 배송 ──────────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">배송 · 반품</h2>
            <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
              셀스타 값 — {shippingNote}
            </p>

            <label className="mt-3 flex items-start gap-2 text-[16px] text-slate-800">
              <input
                type="checkbox"
                checked={!useOwnShipping}
                onChange={(event) => setUseOwnShipping(!event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                우리 공통 배송·판매정보 설정을 씁니다 (권장)
                <span className="mt-1 block text-[14px] leading-relaxed text-slate-500">
                  설정 &gt; 판매정보 · 배송·반품 값이 전 상품에 함께 적용됩니다. 셀스타
                  값과 다르면 우리 설정이 우선입니다.
                </span>
              </span>
            </label>

            {useOwnShipping ? (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[14px] leading-relaxed text-amber-900">
                상품별 배송 설정은 아직 만들지 않았습니다. 지금은 무료배송 여부만
                상품에 저장되고, 나머지 안내는 공통 설정을 씁니다.
              </p>
            ) : null}

            <label className="mt-3 flex items-center gap-2 text-[16px] text-slate-800">
              <input
                type="checkbox"
                checked={freeShipping}
                onChange={(event) => setFreeShipping(event.target.checked)}
                className="h-4 w-4"
              />
              이 상품은 무료배송
            </label>
          </section>

          {/* ── 대표 이미지 ───────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">
              대표 이미지 ({galleryRows.filter((row) => row.checked).length}/{galleryRows.length})
            </h2>
            <p className="mt-1 text-[15px] text-slate-500">
              체크한 것만 등록합니다. 맨 앞이 목록에 나오는 대표 이미지입니다.
            </p>

            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {galleryRows.map((row, index) =>
                row.kind === 'image' ? (
                  <li key={row.key} className="rounded-md border border-slate-200 bg-white">
                    <label className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-[14px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={(event) =>
                          setGalleryRows((prev) =>
                            prev.map((item, position) =>
                              position === index
                                ? { ...item, checked: event.target.checked }
                                : item
                            )
                          )
                        }
                        className="h-4 w-4"
                      />
                      {index + 1}번
                    </label>
                    <div className="aspect-[3/4] w-full overflow-hidden bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.url} alt="" className="h-full w-full object-cover" />
                    </div>
                  </li>
                ) : null
              )}
            </ul>
          </section>

          {/* ── 상세페이지 구성 ───────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">
              상세페이지 구성 ({rows.filter((row) => row.checked).length}/{rows.length})
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
              체크를 풀면 등록에서 빠집니다. 리셀러(마르크앤코) 브랜드 이미지는 자동으로
              풀어 두었습니다. 사이사이 <strong>+ 추가</strong>로 글이나 우리 이미지를
              끼워 넣을 수 있고, 끌어서 순서를 바꿀 수 있습니다.
            </p>

            <div className="mt-4 flex flex-col">
              <InsertBar
                index={0}
                slug={slug || slugify(name)}
                templates={settings.templates}
                productName={name}
                onText={insertText}
                onImages={insertImages}
              />

              {rows.map((row, index) => (
                <div key={row.key}>
                  <div
                    draggable
                    onDragStart={() => {
                      dragIndex.current = index;
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      const from = dragIndex.current;
                      dragIndex.current = null;
                      if (from !== null) moveRow(from, index);
                    }}
                    className={`rounded-lg border bg-white ${
                      row.checked ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <label className="flex cursor-pointer items-center gap-2 text-[15px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={(event) => patchRow(row.key, { checked: event.target.checked })}
                          className="h-4 w-4"
                        />
                        <span className="cursor-grab select-none text-slate-400" title="끌어서 순서 변경">
                          ⠿
                        </span>
                        {index + 1}. {row.kind === 'image' ? '이미지' : '글'}
                        {row.kind === 'image' && row.reseller ? (
                          <span className="admin-badge bg-amber-100 text-amber-800">
                            리셀러 브랜드 이미지
                          </span>
                        ) : null}
                        {row.kind === 'image' && row.local ? (
                          <span className="admin-badge bg-slate-100 text-slate-600">
                            직접 올림
                          </span>
                        ) : null}
                      </label>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveRow(index, index - 1)}
                          disabled={index === 0}
                          aria-label="위로"
                          className="admin-btn min-h-0 px-2 py-1"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRow(index, index + 1)}
                          disabled={index === rows.length - 1}
                          aria-label="아래로"
                          className="admin-btn min-h-0 px-2 py-1"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          className="admin-btn-danger min-h-0 px-2 py-1"
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    <div className="p-3">
                      {row.kind === 'image' ? (
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-3">
                          <div className="w-full max-w-[220px] overflow-hidden rounded border border-slate-200 bg-slate-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={row.url} alt="" className="block h-auto w-full" />
                          </div>
                          <div className="flex-1">
                            <label className="admin-label" htmlFor={`alt-${row.key}`}>
                              대체 텍스트(alt) — 검색 노출에 중요합니다
                            </label>
                            <input
                              id={`alt-${row.key}`}
                              type="text"
                              value={row.alt}
                              onChange={(event) => patchRow(row.key, { alt: event.target.value })}
                              className={inputClass}
                            />
                          </div>
                        </div>
                      ) : (
                        <RichTextEditor
                          value={row.body}
                          onChange={(next) => patchRow(row.key, { body: next })}
                          placeholder="상품 설명·소재·관리법 등을 적어 주세요. 검색 노출에 도움이 됩니다."
                        />
                      )}
                    </div>
                  </div>

                  <InsertBar
                    index={index + 1}
                    slug={slug || slugify(name)}
                    templates={settings.templates}
                    productName={name}
                    onText={insertText}
                    onImages={insertImages}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── 등록 ──────────────────────────────────── */}
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[18px] font-semibold text-slate-900">등록</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
              이미지를 우리 저장소로 옮긴 뒤 <strong>임시저장(노출 꺼짐)</strong> 상태로
              등록합니다. 확인하신 뒤 상품 편집 화면에서 판매중으로 바꿔 주세요.
            </p>

            {busy ? (
              <div className="mt-3">
                <div
                  role="progressbar"
                  aria-valuenow={progress.done}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{
                      width: `${
                        progress.total > 0
                          ? Math.round((progress.done / progress.total) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[15px] tabular-nums text-slate-600">
                  이미지 {progress.done}/{progress.total} 처리 중…
                </p>
              </div>
            ) : null}

            {failed.length > 0 ? (
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[15px] text-amber-900">
                <p className="font-medium">가져오지 못한 이미지 {failed.length}장</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {failed.slice(0, 5).map((item) => (
                    <li key={item} className="break-all">· {item}</li>
                  ))}
                </ul>
                {failed.length > 5 ? <p className="mt-1">외 {failed.length - 5}건</p> : null}
                <p className="mt-1">나머지는 정상 등록되었습니다. 편집 화면에서 채워 주세요.</p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void register()}
              disabled={busy || pending}
              className="admin-btn-primary mt-4"
            >
              {busy ? '가져오는 중…' : '이미지 옮기고 임시저장으로 등록'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
 * 사이에 끼우는 줄
 * ------------------------------------------------------------------ */

function InsertBar({
  index,
  slug,
  templates,
  productName,
  onText,
  onImages,
}: {
  index: number;
  slug: string;
  templates: ImportSettings['templates'];
  productName: string;
  onText: (index: number, body: string) => void;
  onImages: (index: number, images: UploadedImage[]) => void;
}) {
  const [open, setOpen] = useState<'none' | 'text' | 'image'>('none');

  return (
    <div className="py-1.5">
      {open === 'none' ? (
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
          <button
            type="button"
            onClick={() => setOpen('text')}
            className="admin-btn min-h-0 px-2 py-1 text-[14px]"
          >
            + 글 넣기
          </button>
          <button
            type="button"
            onClick={() => setOpen('image')}
            className="admin-btn min-h-0 px-2 py-1 text-[14px]"
          >
            + 이미지 넣기
          </button>
          <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        </div>
      ) : null}

      {open === 'text' ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onText(index, '');
                setOpen('none');
              }}
              className="admin-btn min-h-0 px-2 py-1 text-[14px]"
            >
              빈 글 넣기
            </button>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  onText(index, fillTemplate(template.body, productName));
                  setOpen('none');
                }}
                className="admin-btn min-h-0 px-2 py-1 text-[14px]"
              >
                {template.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen('none')}
              className="ml-auto text-[14px] text-slate-500 underline"
            >
              닫기
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="mt-2 text-[14px] text-slate-500">
              설정 &gt; 가져오기에서 자주 쓰는 문구를 템플릿으로 등록해 두면 여기에
              나옵니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {open === 'image' ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <BulkImageUpload
            slug={slug}
            onUploaded={(images) => {
              onImages(index, images);
              setOpen('none');
            }}
            label="여기에 넣을 이미지를 끌어다 놓거나 클릭해서 고르세요"
            hint="사이즈표·배너처럼 직접 만든 이미지를 끼워 넣을 때 씁니다."
          />
          <button
            type="button"
            onClick={() => setOpen('none')}
            className="mt-2 text-[14px] text-slate-500 underline"
          >
            닫기
          </button>
        </div>
      ) : null}
    </div>
  );
}
