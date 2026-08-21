'use client';

import { useRef, useState } from 'react';

/**
 * ============================================================
 * 브랜드 로고 — 올리면 크기를 자동으로 맞춰 저장합니다
 * ============================================================
 *
 * ★★ 왜 일반 이미지 업로더를 안 쓰는가
 *   상품 사진 업로더는 가로 1600px 로 줄이고 썸네일을 함께 만듭니다.
 *   브랜드 로고는 "다른 로고와 같은 크기로 보이게 하는 것" 이 목적이라
 *   처리가 완전히 다릅니다. (800×360 캔버스에 면적 기준으로 배치)
 *
 * ★★ 원본은 따로 보관합니다.
 *   균일화는 되돌릴 수 없습니다. 배율을 바꿔 다시 구울 때는 언제나 원본에서
 *   시작해야 합니다. 이미 축소된 이미지를 다시 키우면 화질이 깨집니다.
 *
 * ★ 미리보기 배경을 체크무늬로 깝니다.
 *   투명 배경이 제대로 살아 있는지 눈으로 확인할 수 있어야 합니다.
 *   흰 배경으로 깔면 흰 여백이 있는 파일과 구분되지 않습니다.
 */

export type BrandLogoValue = {
  logoUrl: string;
  logoOriginalUrl: string;
  logoScale: number;
};

type Report = {
  before: { width: number; height: number };
  after: { width: number; height: number };
  ratio: number;
  inkRatio: number;
  k: number;
  finalW: number;
  finalH: number;
  warnings: string[];
};

const MIN = 0.7;
const MAX = 1.5;

/** 투명 배경을 눈으로 확인하기 위한 체크무늬 (SVG · 이미지 파일 없이) */
const CHECKER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23e2e8f0'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23e2e8f0'/%3E%3C/svg%3E\")";

export default function BrandLogoField({
  value,
  slug,
  onChange,
}: {
  value: BrandLogoValue;
  /** 저장 경로에 쓸 브랜드 slug */
  slug: string;
  onChange: (next: BrandLogoValue) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  const call = async (form: FormData, label: string) => {
    setBusy(label);
    setError('');
    try {
      const res = await fetch('/api/admin/brand-logo', { method: 'POST', body: form });
      const data = (await res.json()) as {
        logoUrl?: string;
        logoOriginalUrl?: string;
        report?: Report;
        error?: string;
      };
      if (!res.ok || !data.logoUrl) {
        setError(data.error ?? '로고를 처리하지 못했습니다.');
        return;
      }
      setReport(data.report ?? null);
      onChange({
        logoUrl: data.logoUrl,
        logoOriginalUrl: data.logoOriginalUrl ?? value.logoOriginalUrl,
        logoScale: value.logoScale,
      });
    } catch {
      setError('업로드 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy('');
    }
  };

  const upload = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('slug', slug || 'brand');
    form.append('logoScale', String(value.logoScale));
    void call(form, '올리는 중…');
  };

  /** 배율만 바꿔 원본에서 다시 굽습니다. */
  const rebuild = (scale: number) => {
    if (!value.logoOriginalUrl) {
      setError('원본이 없어 다시 만들 수 없습니다. 로고를 다시 올려 주세요.');
      return;
    }
    const form = new FormData();
    form.append('originalUrl', value.logoOriginalUrl);
    form.append('slug', slug || 'brand');
    form.append('logoScale', String(scale));
    void call(form, '다시 만드는 중…');
  };

  const setScale = (raw: number) => {
    const scale = Math.min(MAX, Math.max(MIN, Number(raw) || 1));
    onChange({ ...value, logoScale: scale });
  };

  return (
    <div>
      {/* ── 미리보기 ── */}
      {value.logoUrl ? (
        <div className="mb-3 flex flex-wrap items-start gap-4">
          <div
            /*
             * ★ 800:360 비율 그대로 보여 줍니다. 손님 화면과 같은 상자여야
             *   여기서 괜찮아 보이는 것이 화면에서도 괜찮습니다.
             */
            className="flex h-[108px] w-[240px] shrink-0 items-center justify-center rounded-md border border-slate-200"
            style={{ backgroundImage: CHECKER }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.logoUrl}
              alt="로고 미리보기"
              className="h-[108px] w-[240px] object-contain"
            />
          </div>

          <div className="min-w-0 text-[14px] leading-relaxed text-slate-600">
            {report ? (
              <>
                <p>
                  원본 {report.before.width}×{report.before.height}
                  {report.after.width !== report.before.width ||
                  report.after.height !== report.before.height
                    ? ` → 여백 정리 ${report.after.width}×${report.after.height}`
                    : ' (잘라낼 여백 없음)'}
                </p>
                <p>
                  가로세로 비율 {report.ratio.toFixed(2)} · 칠해진 비율{' '}
                  {Math.round(report.inkRatio * 100)}% · 보정 {report.k.toFixed(2)}배
                </p>
                <p className="text-slate-800">
                  캔버스 안 최종 크기 <strong>{report.finalW}×{report.finalH}</strong>
                </p>
                {report.warnings.map((w) => (
                  <p key={w} className="mt-1 text-amber-800">
                    ★ {w}
                  </p>
                ))}
              </>
            ) : (
              <p>이미 균일화된 로고입니다. 배율을 바꾸면 원본에서 다시 만듭니다.</p>
            )}
            <p className="mt-1 text-[13px] text-slate-400">
              원본 보관 {value.logoOriginalUrl ? '있음' : '없음 — 다시 올리면 보관됩니다'}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── 올리기 ── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(busy)}
          className="admin-btn"
        >
          {busy || (value.logoUrl ? '다른 로고로 바꾸기' : '로고 올리기')}
        </button>
        {value.logoUrl ? (
          <button
            type="button"
            onClick={() => {
              setReport(null);
              onChange({ logoUrl: '', logoOriginalUrl: '', logoScale: value.logoScale });
            }}
            disabled={Boolean(busy)}
            className="admin-btn"
          >
            로고 지우기
          </button>
        ) : null}
      </div>

      {/* ── 미세 조정 ── */}
      <div className="mt-4 rounded-md bg-slate-50 p-3">
        <label className="admin-label" htmlFor={`logo-scale-${slug}`}>
          크기 미세 조정 (기본 1.0)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`logo-scale-${slug}`}
            type="number"
            step={0.05}
            min={MIN}
            max={MAX}
            value={value.logoScale}
            onChange={(event) => setScale(Number(event.target.value))}
            className="admin-input w-[110px] tabular-nums"
          />
          <button
            type="button"
            onClick={() => rebuild(value.logoScale)}
            disabled={Boolean(busy) || !value.logoOriginalUrl}
            className="admin-btn"
          >
            이 배율로 다시 만들기
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
          로고 크기는 <strong>면적 기준</strong>으로 자동으로 맞춰집니다. 칠해진 비율까지
          재서 보정하지만, 눈으로만 보이는 차이가 남을 수 있습니다. 그때만 이 값을
          조정하세요. ({MIN} ~ {MAX})
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-amber-800">
          ★ 배율을 바꾸면 <strong>원본에서 다시 만듭니다.</strong> 이미 줄어든 이미지를 또
          키우면 화질이 깨지기 때문입니다. 바꾼 뒤 [이 배율로 다시 만들기]를 누르고,
          위 미리보기를 확인한 다음 저장하세요.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[15px] text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
