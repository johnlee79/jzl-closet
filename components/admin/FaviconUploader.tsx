'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { store } from '@/lib/store';
import type { Branding } from '@/lib/types';

const ACCEPT = 'image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico,.png,.svg';
const ENDPOINT = '/api/admin/branding/favicon';

type Message = { tone: 'ok' | 'error' | 'info'; text: string };

/**
 * 파비콘 업로드 · 미리보기 · 기본값 복구.
 * 올린 이미지는 서버에서 32x32(파비콘) · 180x180(애플 터치 아이콘) 두 벌로 만들어집니다.
 */
export default function FaviconUploader({ initial }: { initial: Branding }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState<Branding>(initial);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  /** 업로드한 적이 있으면 keys 가 채워집니다. (기본 파비콘은 비어 있습니다) */
  const custom = branding.keys.length > 0;

  const handleFiles = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || busy) return;

    setBusy(true);
    setMessage(null);

    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(ENDPOINT, { method: 'POST', body: form });
      const payload = (await response.json()) as {
        branding?: Branding;
        resized?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.branding) {
        setMessage({ tone: 'error', text: payload.error ?? '업로드에 실패했습니다.' });
        return;
      }

      setBranding(payload.branding);
      setMessage({
        tone: payload.resized ? 'ok' : 'info',
        text: payload.resized
          ? '파비콘을 바꿨습니다. 브라우저 탭에는 새로고침 후(또는 강력 새로고침 Ctrl+Shift+R) 반영됩니다.'
          : 'ico 파일은 크기 변환 없이 원본 그대로 적용했습니다. 애플 터치 아이콘이 필요하면 png 나 svg 로 올려 주세요.',
      });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: '업로드 중 연결이 끊겼습니다.' });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleReset = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(ENDPOINT, { method: 'DELETE' });
      const payload = (await response.json()) as { branding?: Branding; error?: string };

      if (!response.ok || !payload.branding) {
        setMessage({ tone: 'error', text: payload.error ?? '되돌리지 못했습니다.' });
        return;
      }
      setBranding(payload.branding);
      setMessage({ tone: 'ok', text: '기본 파비콘으로 되돌렸습니다.' });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: '요청 중 연결이 끊겼습니다.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── 현재 적용된 파비콘 ─────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">현재 적용된 파비콘</h2>
        <p className="mt-1 text-[15px] text-slate-500">
          {custom
            ? '올린 이미지가 사이트 전체에 적용되어 있습니다.'
            : '아직 올린 이미지가 없어 기본 파비콘을 쓰고 있습니다.'}
        </p>

        <div className="mt-4 flex flex-wrap items-start gap-6">
          {/* 브라우저 탭 흉내 — 실제로 보이는 크기를 가늠할 수 있게 합니다. */}
          <div>
            <span className="admin-label">브라우저 탭</span>
            <div className="inline-flex max-w-[240px] items-center gap-2 rounded-t-md border border-slate-300 border-b-0 bg-slate-50 px-3 py-2">
              {branding.favicon ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={branding.favicon.url}
                  alt="현재 파비콘"
                  width={16}
                  height={16}
                  className="h-4 w-4 shrink-0 object-contain"
                />
              ) : null}
              <span className="truncate text-[15px] text-slate-700">{store.name}</span>
            </div>
          </div>

          <div>
            <span className="admin-label">32 × 32 (탭·북마크)</span>
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]">
              {branding.favicon ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={branding.favicon.url}
                  alt="32x32 파비콘 미리보기"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
              ) : null}
            </div>
          </div>

          <div>
            <span className="admin-label">180 × 180 (애플 터치 아이콘)</span>
            <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[16px] border border-slate-200 bg-white">
              {branding.appleTouchIcon ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={branding.appleTouchIcon.url}
                  alt="애플 터치 아이콘 미리보기"
                  width={72}
                  height={72}
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          </div>
        </div>

        {branding.source ? (
          <p className="mt-4 break-all text-[14px] text-slate-500">
            원본 파일: {branding.source.name || '(이름 없음)'}
            {branding.updatedAt
              ? ` · ${new Date(branding.updatedAt).toLocaleString('ko-KR')} 적용`
              : ''}
          </p>
        ) : null}

        {custom ? (
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={busy}
            className="admin-btn-danger mt-4"
          >
            기본 파비콘으로 되돌리기
          </button>
        ) : null}
      </section>

      {/* ── 새 파비콘 올리기 ───────────────────────────── */}
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[18px] font-semibold text-slate-900">새 파비콘 올리기</h2>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            void handleFiles(event.dataTransfer.files);
          }}
          className={`mt-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-slate-50'
          }`}
        >
          <p className="text-[16px] text-slate-600">
            이미지를 끌어다 놓거나 클릭해서 선택하세요
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="admin-btn mt-3"
          >
            {busy ? '처리 중…' : '파일 선택'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={(event) => void handleFiles(event.target.files)}
            className="hidden"
          />
          <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
            png · ico · svg / 5MB까지. 올리면 32×32 와 180×180 두 벌을 자동으로 만듭니다.
            <br />
            정사각형에 여백이 조금 있는 단순한 도형이 작은 크기에서 잘 보입니다.
          </p>
        </div>

        {message ? (
          <p
            role="status"
            className={`mt-4 rounded-md px-3 py-2 text-[16px] leading-relaxed ${
              message.tone === 'ok'
                ? 'bg-green-50 text-green-800'
                : message.tone === 'info'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
