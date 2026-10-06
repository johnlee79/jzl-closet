'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseExcelFile, type ParsedWorkbook } from '@/lib/cost-sheet-parser';
import {
  extractImagesFromXlsx,
  resizeImageToWebp,
  type ImageMap,
} from '@/lib/cost-sheet-images';
import {
  previewMatchesAction,
  uploadFullSheetAction,
  type Candidate,
  type PreviewRow,
} from '@/app/admin/cost-sheet-actions';
import ZoomImage from '@/components/admin/ZoomImage';
import { formatPrice } from '@/lib/product-utils';

/**
 * 뉴욕트렌딕 단가표 엑셀 ↔ 우리 상품 매칭 화면.
 *
 * ★ 55MB 파일을 브라우저에서 읽습니다 (명세 2번). 서버로는 글자만 전송합니다.
 *
 * ★ 1단계 범위
 *   상품명 첫 줄 + 품번 + 위탁가만 다룹니다. 색상·사이즈·품절·실측은 없음.
 *   매칭은 전부 사람이 고름. 유일한 자동은 "기억된 짝" 뿐.
 */

type SelectionState = {
  /** 사람이 고른 productId. '' 는 「해당 없음」, null 은 아직 안 고름 */
  chosen: string | '' | null;
};

/** 알파 사진은 블록 어딘가에 꽂혀 있어 rowStart 와 정확히 안 맞을 수 있어요. 근접 매치. */
function findImageForRow(
  images: ImageMap,
  sheet: string,
  rowStart: number
): { bytes: Uint8Array; mime: string } | null {
  for (let delta = 0; delta <= 10; delta += 1) {
    const key = `${sheet}:${rowStart + delta}`;
    const img = images.get(key);
    if (img) return { bytes: img.bytes, mime: img.mime };
  }
  return null;
}

export default function CostSheetMatcher() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [selections, setSelections] = useState<Record<string, SelectionState>>({});
  const [imageMap, setImageMap] = useState<ImageMap>(new Map());
  /** 브라우저 blob URL — 사장님이 미리보기에서 바로 사진을 봅니다. 저장 후 revoke */
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);

  const keyFor = (sheet: string, rowStart: number): string => `${sheet}:${rowStart}`;

  const onFileChange = async (f: File | null) => {
    setFile(f);
    setWorkbook(null);
    setPreviewRows([]);
    setSelections({});
    setImageMap(new Map());
    // 이전 blob URL revoke
    for (const url of Object.values(previewUrls)) URL.revokeObjectURL(url);
    setPreviewUrls({});
    setError(null);
    setSavedSummary(null);
    if (!f) return;
    setNotice('엑셀을 브라우저에서 읽는 중입니다. 55MB 파일은 15~30초 걸립니다…');
    try {
      // 엑셀 데이터와 이미지를 **같은 ArrayBuffer** 로 두 번 파싱해도 되지만, 메모리 안
      // 쓰려고 File 을 그대로 넘깁니다 (내부에서 arrayBuffer 는 재사용 안 됨).
      const [parsed, images] = await Promise.all([
        parseExcelFile(f),
        extractImagesFromXlsx(f).catch((e) => {
          console.warn('[cost-sheet] 이미지 추출 실패, 사진 없이 계속:', e);
          return new Map();
        }),
      ]);
      setWorkbook(parsed);
      setImageMap(images as ImageMap);

      // 상품 "rowStart" 와 알파 셀 anchor row 를 짝 짓습니다. 셀 anchor row 는 0-indexed
      // 라 상품 rowStart (sheet_to_json 의 0-indexed) 와 바로 비교할 수 있습니다. 다만 알파
      // 사진은 보통 상품 블록 어딘가에 꽂혀 있어 정확히 rowStart 와 안 맞을 수 있습니다.
      // 그래서 "같은 시트에서 rowStart 이상·rowStart+8 이하 범위의 첫 사진" 을 선택합니다.
      const urls: Record<string, string> = {};
      for (const sheet of parsed.sheets) {
        for (const product of sheet.products) {
          const match = findImageForRow(images as ImageMap, product.sheet, product.rowStart);
          if (!match) continue;
          const bufferCopy = new Uint8Array(match.bytes.length);
          bufferCopy.set(match.bytes);
          const blob = new Blob([bufferCopy.buffer], { type: match.mime });
          urls[keyFor(product.sheet, product.rowStart)] = URL.createObjectURL(blob);
        }
      }
      setPreviewUrls(urls);

      setNotice(
        `${parsed.sheets.length}개 시트에서 ${parsed.totalProducts}개 상품 · 사진 ${Object.keys(urls).length}장을 읽었습니다. ` +
          '매칭 후보를 불러옵니다…'
      );
      // 서버로 글자만 보내 매칭 미리보기 받기
      const excelProducts = parsed.sheets
        .filter((s) => !s.skipped)
        .flatMap((s) => s.products)
        .map((p) => ({
          key: keyFor(p.sheet, p.rowStart),
          sheet: p.sheet,
          rowStart: p.rowStart,
          name: p.name,
          nameSkus: p.nameSkus,
          normalizedName: p.normalizedName,
          costPrice: p.costPrice,
        }));

      // Server Action 호출을 Transition 안에서
      startTransition(async () => {
        const result = await previewMatchesAction(excelProducts);
        if (!result.ok) {
          setError(result.error);
          setNotice(null);
          return;
        }
        setPreviewRows(result.data.rows);
        // 기억된 짝은 미리 선택 상태로 — 사람이 저장만 누르면 됨
        const initialSel: Record<string, SelectionState> = {};
        for (const row of result.data.rows) {
          const k = row.excel.key;
          if (row.rememberedProductId) {
            initialSel[k] = { chosen: row.rememberedProductId };
          }
        }
        setSelections(initialSel);
        setNotice(null);
      });
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : '엑셀을 읽지 못했습니다.');
      setNotice(null);
    }
  };

  const choose = (key: string, productId: string | '' | null) => {
    setSelections((prev) => ({ ...prev, [key]: { chosen: productId } }));
  };

  const chosenCount = useMemo(
    () => previewRows.filter((r) => selections[r.excel.key]?.chosen !== undefined && selections[r.excel.key]?.chosen !== null).length,
    [previewRows, selections]
  );

  /** 상품 하나의 사진을 300px WebP 로 줄여 /api/upload 로 올리고 URL 을 돌려줍니다. */
  const uploadOneImage = async (
    sheet: string,
    rowStart: number
  ): Promise<string | null> => {
    const match = findImageForRow(imageMap, sheet, rowStart);
    if (!match) return null;
    try {
      const resized = await resizeImageToWebp(match.bytes, match.mime, 300);
      const form = new FormData();
      form.append('files', resized, `${sheet}-${rowStart}.webp`);
      form.append('slug', 'cost-sheet');
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        images?: { url: string }[];
      };
      return payload.images?.[0]?.url ?? null;
    } catch (uploadError) {
      console.warn('[cost-sheet] image upload failed', sheet, rowStart, uploadError);
      return null;
    }
  };

  const save = () => {
    const rows = previewRows
      .filter((r) => {
        const chosen = selections[r.excel.key]?.chosen;
        return chosen !== undefined && chosen !== null; // '' (해당없음) 도 저장 대상에 포함 (기억 저장)
      });

    if (rows.length === 0) {
      setError('저장할 짝이 없습니다. 상품을 하나 이상 골라 주세요.');
      return;
    }
    setError(null);
    setSavedSummary(null);
    startTransition(async () => {
      // 1) 사진 올리기 — 선택한 짝이 있는 행만. 사진 없는 행은 건너뜀.
      setNotice(`사진 ${rows.length}장을 R2 로 올리는 중입니다…`);
      const uploadedImageUrls: Record<string, string | null> = {};
      for (const r of rows) {
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadOneImage(r.excel.sheet, r.excel.rowStart);
        uploadedImageUrls[r.excel.key] = url;
      }
      setNotice(null);

      // 2) 서버에 통째로 저장
      const payload = rows.map((r) => {
        const chosen = selections[r.excel.key]!.chosen!;
        return {
          normalizedName: r.excel.normalizedName,
          rawName: r.excel.name,
          skus: r.excel.nameSkus,
          costPrice: r.excel.costPrice,
          imageUrl: uploadedImageUrls[r.excel.key] ?? null,
          sheetName: r.excel.sheet,
          rowStart: r.excel.rowStart,
          productId: chosen === '' ? null : chosen,
        };
      });

      const result = await uploadFullSheetAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { archived, saved, costs, remembered } = result.data;
      setSavedSummary(
        `단가표 ${saved}건 저장 · 옛 단가표 ${archived}건 기록으로 넘김 · 원가 ${costs}건 저장 · 짝 ${remembered}건 기억. ` +
          '단가표 보기 메뉴로 확인하실 수 있습니다.'
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── 파일 올리기 ─────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">단가표 엑셀 올리기</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-slate-500">
          뉴욕트렌딕이 보낸 <code>상품정보.xlsx</code> 를 올리세요. <strong>브라우저 안에서 읽습니다</strong> —
          서버로 통째로 보내지 않습니다 (55MB · 이미지 296장). 상품명 첫 줄 + 품번 + 위탁가만
          서버로 전달됩니다. 위탁가는 「VAT 미포함」이라고 적혀 있어도 **부가세 포함가**로
          봅니다 (뉴욕과 확인된 사항).
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
          disabled={pending}
          className="mt-3 block w-full text-[15px]"
        />
        {file ? (
          <p className="mt-2 text-[14px] text-slate-500">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 rounded bg-blue-50 px-3 py-2 text-[14px] text-blue-900">{notice}</p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded bg-red-50 px-3 py-2 text-[14px] text-red-800">{error}</p>
        ) : null}
        {savedSummary ? (
          <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-[14px] text-emerald-900">
            {savedSummary}
          </p>
        ) : null}
      </section>

      {/* ── 시트 요약 ─────────────────────────── */}
      {workbook ? (
        <section className="admin-card p-4 md:p-5">
          <h2 className="text-[18px] font-semibold text-slate-900">읽은 결과</h2>
          <ul className="mt-2 flex flex-col gap-1 text-[15px] text-slate-700">
            {workbook.sheets.map((s) => (
              <li key={s.name}>
                · <strong>{s.name}</strong>:{' '}
                {s.skipped ? (
                  <span className="text-amber-700">건너뜀 ({s.reason ?? ''})</span>
                ) : (
                  <>{s.products.length}개 상품</>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── 매칭 ─────────────────────────── */}
      {previewRows.length > 0 ? (
        <section className="admin-card p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[18px] font-semibold text-slate-900">
              상품 짝 짓기 · {chosenCount} / {previewRows.length} 고름
            </h2>
            <button
              type="button"
              onClick={save}
              disabled={pending || chosenCount === 0}
              className="admin-btn-primary"
            >
              {pending ? '저장 중…' : '선택한 짝 저장'}
            </button>
          </div>
          <p className="mt-1 text-[14px] text-slate-500">
            왼쪽은 엑셀 상품 · 오른쪽은 우리 상품 후보 3개입니다. 사진·이름을 보고 **직접
            고르세요**. 「해당 없음」 으로 두면 이름만 기억하고 원가는 저장하지 않습니다.
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {previewRows.map((row) => (
              <RowItem
                key={row.excel.key}
                row={row}
                chosen={selections[row.excel.key]?.chosen ?? null}
                onChoose={(id) => choose(row.excel.key, id)}
                excelImageUrl={previewUrls[row.excel.key] ?? null}
              />
            ))}
          </ul>

          {/* ★ 아래쪽 저장 버튼 — 다 고른 뒤 다시 위로 올라가지 않아도 되게 (사장님 지시 2026-10-06) */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <p className="text-[14px] text-slate-500">
              {chosenCount} / {previewRows.length} 고름
            </p>
            <button
              type="button"
              onClick={save}
              disabled={pending || chosenCount === 0}
              className="admin-btn-primary"
            >
              {pending ? '저장 중…' : '선택한 짝 저장'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------
 * 리뷰 한 줄 (엑셀 상품 하나)
 * ------------------------------------------------------------------ */

function RowItem({
  row,
  chosen,
  onChoose,
  excelImageUrl,
}: {
  row: PreviewRow;
  chosen: string | '' | null;
  onChoose: (id: string | '' | null) => void;
  excelImageUrl: string | null;
}) {
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
        {/* 왼쪽 — 엑셀 상품 */}
        <div className="flex flex-col gap-2 border-r border-slate-100 pr-4">
          {excelImageUrl ? (
            <ZoomImage
              src={excelImageUrl}
              alt={row.excel.name}
              className="h-32 w-32 shrink-0 rounded border border-slate-200 bg-slate-50 cursor-zoom-in"
            />
          ) : (
            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 text-[12px] text-slate-400">
              사진 없음
            </div>
          )}
          <p className="text-[12px] text-slate-500">
            {row.excel.sheet} · r{row.excel.rowStart}
          </p>
          <p className="text-[15px] font-medium text-slate-900">{row.excel.name}</p>
          {row.excel.nameSkus.length > 0 ? (
            <p className="mt-1 text-[13px] text-slate-500">
              품번: {row.excel.nameSkus.join(' · ')}
            </p>
          ) : null}
          <p className="mt-1 text-[14px] text-slate-700">
            위탁가{' '}
            <strong>
              {row.excel.costPrice != null ? `${formatPrice(row.excel.costPrice)}원` : '없음'}
            </strong>
          </p>
          {row.brandAlias ? (
            <p className="mt-1 text-[13px] text-slate-500">
              브랜드: <span className="font-medium">{row.brandAlias}</span>
              {row.brandUnsupported ? (
                <span className="ml-2 inline-flex items-center bg-amber-100 px-1.5 py-0.5 text-[12px] text-amber-900">
                  미취급
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-amber-700">브랜드 줄임말 미등록</p>
          )}
          {row.rememberedProductId ? (
            <p className="mt-1 inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800">
              ✓ 지난 번 짝 기억 — 저장 누르면 반영
            </p>
          ) : null}
        </div>

        {/* 오른쪽 — 우리 후보 */}
        <div className="flex flex-col gap-2">
          {row.candidates.length === 0 ? (
            <p className="text-[14px] text-slate-500">같은 브랜드에서 비슷한 상품이 없습니다.</p>
          ) : (
            row.candidates.map((c) => (
              <CandidateItem
                key={c.productId}
                candidate={c}
                checked={chosen === c.productId}
                onCheck={() => onChoose(c.productId)}
              />
            ))
          )}
          <label className="mt-1 flex cursor-pointer items-center gap-2 text-[14px] text-slate-700">
            <input
              type="radio"
              checked={chosen === ''}
              onChange={() => onChoose('')}
              className="h-4 w-4"
            />
            해당 없음 (원가 저장 안 함, 이름만 기억)
          </label>
        </div>
      </div>
    </li>
  );
}

function CandidateItem({
  candidate: c,
  checked,
  onCheck,
}: {
  candidate: Candidate;
  checked: boolean;
  onCheck: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded border p-2 ${
        checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
      }`}
    >
      <input type="radio" checked={checked} onChange={onCheck} className="h-4 w-4" />
      {/* 작게 보이면 구분이 안 돼 눌러서 크게 — ZoomImage 가 전체화면 확대 */}
      <ZoomImage
        src={c.thumbnail}
        alt={c.name}
        className="h-14 w-14 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50 cursor-zoom-in"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-slate-900">{c.name}</p>
        <p className="mt-0.5 text-[12px] text-slate-500">
          판매가 {formatPrice(c.salePrice)}원
          {c.sku ? ` · 품번 ${c.sku}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-[12px] font-medium text-slate-500 tabular-nums">
        {Math.round(c.similarity * 100)}%
      </span>
    </label>
  );
}
