'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  applyBulkTrackingAction,
  previewBulkTrackingAction,
} from '@/app/admin/order-actions';
import { COURIER_ALIAS_HINTS } from '@/lib/couriers';
import { statusLabel } from '@/lib/order-status';
import {
  MATCH_BADGE,
  MATCH_LABEL,
  matchCourierName,
  type TrackingMatchRow,
} from '@/lib/tracking-import';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const SAMPLE = `ORD-20260814-0001, CJ대한통운, 123456789012
ORD-20260814-0002, 한진, 987654321098`;

/**
 * 송장번호 일괄 등록.
 *
 * 공급처가 회신한 송장 목록을 그대로 붙여넣거나 CSV 로 올리면
 *   1) 줄 단위로 읽어 주문과 맞춰 보고 (미리보기)
 *   2) 확인한 건만 한 번에 저장합니다.
 * 저장하면 상태가 자동으로 '배송중' 으로 바뀝니다.
 */
export default function BulkTrackingPanel({
  /** 전용 화면에서는 처음부터 펼쳐 둡니다. */
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
} = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<TrackingMatchRow[] | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const counts = {
    ok: rows?.filter((row) => row.status === 'ok').length ?? 0,
    already: rows?.filter((row) => row.status === 'already').length ?? 0,
    notFound: rows?.filter((row) => row.status === 'not_found').length ?? 0,
    invalid: rows?.filter((row) => row.status === 'invalid').length ?? 0,
  };

  /** 실제로 저장할 건들 */
  const targets = (rows ?? []).filter(
    (row) => row.status === 'ok' || (overwrite && row.status === 'already')
  );

  const preview = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await previewBulkTrackingAction(text);
      if (!result.ok) {
        setRows(null);
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setRows(result.data);
    });
  };

  const apply = () => {
    if (targets.length === 0) return;
    if (!window.confirm(`${targets.length}건의 송장을 등록하고 배송중으로 바꿀까요?`)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await applyBulkTrackingAction(
        targets.map((row) => ({
          orderId: row.orderId,
          courierCode: row.courierCode,
          trackingNo: row.trackingNo,
        }))
      );
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }

      const { done, failed, errors } = result.data;
      setMessage({
        tone: failed > 0 ? 'error' : 'ok',
        text:
          `${done}건을 등록하고 배송중으로 바꿨습니다.` +
          (failed > 0 ? ` 실패 ${failed}건.` : '') +
          (errors.length > 0 ? ` (${errors.join(' / ')})` : ''),
      });

      if (done > 0) {
        setText('');
        setRows(null);
        router.refresh();
      }
    });
  };

  /** CSV 파일을 읽어 텍스트 칸에 넣습니다. 파싱은 붙여넣기와 똑같이 처리합니다. */
  const readFile = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    setMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setRows(null);
    };
    reader.onerror = () => {
      setMessage({ tone: 'error', text: '파일을 읽지 못했습니다.' });
    };
    // 엑셀에서 저장한 CSV 는 대부분 UTF-8 입니다.
    reader.readAsText(file, 'utf-8');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="admin-card mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">송장 일괄등록</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            공급처가 회신한 송장 목록을 붙여넣거나 CSV 로 올리면 한 번에 등록합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={open ? 'admin-btn' : 'admin-btn-primary'}
        >
          {open ? '닫기' : '송장 일괄등록'}
        </button>
      </div>

      {open ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          {/* ── 입력 ──────────────────────────────────── */}
          <label className="admin-label" htmlFor="bulk-tracking-text">
            주문번호, 택배사, 송장번호 — 콤마 또는 탭으로 나누고 줄바꿈으로 여러 건
          </label>
          <textarea
            id="bulk-tracking-text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setRows(null);
            }}
            rows={7}
            spellCheck={false}
            placeholder={SAMPLE}
            className="admin-input font-mono text-[13px] leading-relaxed"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={preview}
              disabled={pending || !text.trim()}
              className="admin-btn-primary"
            >
              {pending && !rows ? '확인 중…' : '미리보기'}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="admin-btn"
            >
              CSV 파일 올리기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(event) => readFile(event.target.files)}
              className="hidden"
            />
            {text ? (
              <button
                type="button"
                onClick={() => {
                  setText('');
                  setRows(null);
                  setMessage(null);
                }}
                className="admin-btn"
              >
                지우기
              </button>
            ) : null}
          </div>

          {/* ── 택배사 별칭 안내 ──────────────────────── */}
          <details className="mt-4 rounded-md bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">
            <summary className="cursor-pointer font-medium text-slate-900">
              이렇게 적어도 알아봅니다 (택배사 이름)
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {COURIER_ALIAS_HINTS.map((hint) => (
                <li key={hint.code}>
                  <span className="text-slate-900">{hint.name}</span> —{' '}
                  {hint.aliases.join(' · ')}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-slate-600">
              뒤에 &ldquo;택배&rdquo; 가 붙어 있어도, 대소문자가 달라도 인식합니다. 칸 순서가
              바뀌어 있어도 주문번호·택배사·송장번호를 알아서 찾습니다.
            </p>
          </details>

          {message ? (
            <p
              role="status"
              className={`mt-4 rounded-md px-3 py-2 text-[14px] leading-relaxed ${
                message.tone === 'ok'
                  ? 'bg-green-50 text-green-800'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {message.text}
            </p>
          ) : null}

          {/* ── 미리보기 ──────────────────────────────── */}
          {rows ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-[14px] font-medium text-slate-900">
                  읽은 줄 {rows.length}건
                </p>
                <span className={`admin-badge ${MATCH_BADGE.ok}`}>
                  매칭 성공 {counts.ok}
                </span>
                {counts.already > 0 ? (
                  <span className={`admin-badge ${MATCH_BADGE.already}`}>
                    이미 송장 있음 {counts.already}
                  </span>
                ) : null}
                {counts.notFound > 0 ? (
                  <span className={`admin-badge ${MATCH_BADGE.not_found}`}>
                    주문번호 없음 {counts.notFound}
                  </span>
                ) : null}
                {counts.invalid > 0 ? (
                  <span className={`admin-badge ${MATCH_BADGE.invalid}`}>
                    형식 오류 {counts.invalid}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 max-h-[420px] overflow-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[860px] border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th scope="col" className="w-10 px-3 py-2 font-medium">줄</th>
                      <th scope="col" className="px-3 py-2 font-medium">주문번호</th>
                      <th scope="col" className="px-3 py-2 font-medium">주문자</th>
                      <th scope="col" className="px-3 py-2 font-medium">현재 상태</th>
                      <th scope="col" className="px-3 py-2 font-medium">택배사</th>
                      <th scope="col" className="px-3 py-2 font-medium">송장번호</th>
                      <th scope="col" className="px-3 py-2 font-medium">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${row.line}-${row.orderNo}`}
                        className={`border-b border-slate-100 last:border-b-0 ${
                          row.status === 'ok' ? '' : 'bg-slate-50/60'
                        }`}
                      >
                        <td className="px-3 py-2 tabular-nums text-slate-400">{row.line}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-800">
                          {row.orderNo || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {row.ordererName || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {row.orderStatus ? statusLabel(row.orderStatus) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {matchCourierName(row) || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-slate-800">
                          {row.trackingNo || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`admin-badge ${MATCH_BADGE[row.status]}`}>
                            {MATCH_LABEL[row.status]}
                          </span>
                          {row.message ? (
                            <span className="mt-0.5 block text-[12px] text-slate-500">
                              {row.message}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {counts.already > 0 ? (
                <label className="mt-3 flex items-center gap-2 text-[14px] text-slate-800">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(event) => setOverwrite(event.target.checked)}
                    className="h-4 w-4"
                  />
                  이미 송장이 있는 {counts.already}건도 새 송장으로 덮어쓰기
                </label>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={apply}
                  disabled={pending || targets.length === 0}
                  className="admin-btn-primary"
                >
                  {pending ? '등록 중…' : `${targets.length}건 등록하기`}
                </button>
                <p className="text-[13px] text-slate-500">
                  등록하면 해당 주문의 상태가 자동으로 <strong>배송중</strong>으로 바뀌고,
                  손님의 주문 조회 화면에 배송 조회 링크가 생깁니다.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
