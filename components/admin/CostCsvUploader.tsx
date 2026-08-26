'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  applyCostCsvAction,
  previewCostCsvAction,
  type CostPreview,
} from '@/app/admin/cost-actions';
import { formatPrice } from '@/lib/product-utils';

/**
 * ================================================================
 * ** 원가 CSV 올리기 (2026-08-27)
 * ================================================================
 *
 * ** 올린다고 바로 저장하지 않습니다.
 *   무엇이 저장되고 무엇이 안 되는지 먼저 보여 주고, 버튼을 눌러야 저장합니다.
 *   원가는 덮어쓰면 이전 값을 알 수 없습니다.
 *
 * ** 짝이 안 맞는 줄은 건너뛰고 무엇이 안 맞았는지 전부 보여 줍니다.
 *   (사장님 지시) 조용히 넘어가면 왜 안 들어갔는지 알 수 없습니다.
 * ================================================================
 */
export default function CostCsvUploader() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<CostPreview | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const pick = async (file: File | null) => {
    setPreview(null);
    setMessage(null);
    if (!file) return;

    setFileName(file.name);
    /*
     * ** 엑셀이 붙이는 UTF-8 BOM 은 lib/cost-csv.ts 가 걷어냅니다.
     *   text() 는 UTF-8 로 읽습니다. 엑셀에서 "CSV UTF-8" 로 저장해야 합니다.
     */
    const text = await file.text();

    startTransition(async () => {
      const result = await previewCostCsvAction(text);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setPreview(result.data);
    });
  };

  const save = () => {
    if (!preview || preview.matched.length === 0) return;
    startTransition(async () => {
      const result = await applyCostCsvAction(
        preview.matched.map((row) => ({ slug: row.slug, costPrice: row.costPrice }))
      );
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: `${result.data.saved}개 상품의 원가를 저장했습니다.` });
      setPreview(null);
      setFileName('');
      router.refresh();
    });
  };

  const badLines = preview ? [...preview.notFound, ...preview.problems] : [];

  return (
    <div className="admin-card p-5">
      <h2 className="text-[18px] font-semibold text-slate-900">원가 CSV 올리기</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-slate-600">
        「상품 CSV 내보내기」로 받은 파일에 <strong>「원가」 열</strong>을 하나 만들어 채운 뒤
        그대로 올리십시오. slug 로 짝지어 <strong>원가 한 칸만</strong> 저장합니다.
      </p>
      <ul className="mt-2 list-disc pl-5 text-[14px] leading-relaxed text-slate-500">
        <li>엑셀에서 저장할 때 <strong>CSV UTF-8</strong> 로 저장해 주세요. 아니면 한글이 깨집니다.</li>
        <li>원가 칸을 <strong>비워 두면 건너뜁니다.</strong> 이미 넣은 원가를 지우지 않습니다.</li>
        <li><strong>0 은 진짜 0원</strong>으로 저장됩니다. 비워 두는 것과 다릅니다.</li>
        <li>slug 열은 건드리지 마세요.</li>
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="admin-btn cursor-pointer">
          파일 고르기
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void pick(event.target.files?.[0] ?? null)}
          />
        </label>
        {fileName ? <span className="text-[15px] text-slate-600">{fileName}</span> : null}
        {pending ? <span className="text-[15px] text-slate-500">읽는 중…</span> : null}
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-3 text-[15px] ${
            message.tone === 'ok' ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {/* ── 미리보기 ─────────────────────────────────────── */}
      {preview ? (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <p className="text-[16px] text-slate-800">
            파일에서 읽은 줄 <strong>{preview.totalLines}줄</strong>
          </p>
          <ul className="mt-2 space-y-1 text-[15px]">
            <li className="text-green-700">✔ 저장할 것 {preview.matched.length}줄</li>
            <li className="text-amber-700">
              ⚠ 상품명이 다름 {preview.matched.filter((row) => row.nameMismatch).length}줄 (저장은
              됩니다)
            </li>
            <li className="text-red-700">✘ 상품을 못 찾음 {preview.notFound.length}줄</li>
            <li className="text-red-700">✘ 원가가 잘못됨 {preview.problems.length}줄</li>
            <li className="text-slate-500">– 비어 있어 건너뜀 {preview.skipped.length}줄</li>
          </ul>

          {badLines.length > 0 ? (
            <div className="mt-4">
              <p className="text-[15px] font-medium text-slate-800">저장되지 않는 줄</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead className="border-b border-slate-200 text-left text-slate-600">
                    <tr>
                      <th scope="col" className="px-2 py-1 font-medium">줄</th>
                      <th scope="col" className="px-2 py-1 font-medium">slug</th>
                      <th scope="col" className="px-2 py-1 font-medium">원가 칸</th>
                      <th scope="col" className="px-2 py-1 font-medium">왜</th>
                    </tr>
                  </thead>
                  <tbody>
                    {badLines.map((row) => (
                      <tr key={`${row.line}-${row.slug}`} className="border-b border-slate-100">
                        <td className="px-2 py-1 tabular-nums">{row.line}</td>
                        <td className="px-2 py-1 text-slate-700">{row.slug || '(비어 있음)'}</td>
                        <td className="px-2 py-1 text-slate-700">{row.raw || '(비어 있음)'}</td>
                        <td className="px-2 py-1 text-red-700">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {preview.matched.some((row) => row.nameMismatch) ? (
            <div className="mt-4 border border-amber-300 bg-amber-50 p-3">
              <p className="text-[15px] font-medium text-amber-900">
                파일의 상품명이 실제 상품명과 다릅니다 — 확인해 주세요
              </p>
              <ul className="mt-1 space-y-1 text-[14px] text-amber-900">
                {preview.matched
                  .filter((row) => row.nameMismatch)
                  .map((row) => (
                    <li key={row.slug}>
                      {row.line}번째 줄 — 파일 「{row.nameInFile}」 / 실제 「{row.productName}」
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {preview.matched.length > 0 ? (
            <>
              <div className="mt-4 max-h-[320px] overflow-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead className="sticky top-0 border-b border-slate-200 bg-white text-left text-slate-600">
                    <tr>
                      <th scope="col" className="px-2 py-1 font-medium">상품명</th>
                      <th scope="col" className="px-2 py-1 text-right font-medium">지금 원가</th>
                      <th scope="col" className="px-2 py-1 text-right font-medium">새 원가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matched.map((row) => (
                      <tr key={row.slug} className="border-b border-slate-100">
                        <td className="px-2 py-1 text-slate-800">{row.productName}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-500">
                          {row.before === null ? '없음' : formatPrice(row.before)}
                        </td>
                        <td className="px-2 py-1 text-right font-medium tabular-nums text-slate-900">
                          {formatPrice(row.costPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setFileName('');
                  }}
                  className="admin-btn"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="admin-btn-primary"
                >
                  {pending ? '저장 중…' : `${preview.matched.length}줄 저장하기`}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-[15px] text-slate-600">저장할 줄이 없습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
