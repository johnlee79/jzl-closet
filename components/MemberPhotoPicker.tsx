'use client';

import { useRef, useState } from 'react';
import {
  ACCEPT_IMAGE,
  deleteMemberImages,
  uploadMemberImages,
  type MemberUploadFolder,
  type MemberUploadProgress,
} from '@/lib/upload-client';

/**
 * 손님 사진 고르기 — 리뷰 쓰기와 1:1 문의가 같이 씁니다.
 *
 * ★★ 오류는 버튼 바로 아래에 띄웁니다 (2026-09-29)
 *   전에는 폼 맨 위에 떴습니다. 사진 버튼은 폼 아래쪽이라 휴대폰에서는
 *   화면 밖이었고, 손님에게는 「아무 일도 안 일어남」으로 보였습니다.
 *
 * ★ 여러 장을 고르면 「3장 중 2장째」처럼 보여 줍니다. 멈춘 줄 알면 나갑니다.
 */
export default function MemberPhotoPicker({
  folder,
  max,
  value,
  onChange,
  buttonLabel,
  unit,
}: {
  folder: MemberUploadFolder;
  max: number;
  value: string[];
  onChange: (next: string[]) => void;
  /** 버튼 글자 — 「사진 선택」, 「이미지 선택」 */
  buttonLabel: string;
  /** 세는 단위 — 「개」, 「장」 */
  unit: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<MemberUploadProgress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (fileRef.current) fileRef.current.value = '';
    if (files.length === 0) return;

    const room = max - value.length;
    if (room <= 0) {
      setErrors([`최대 ${max}${unit}까지 올릴 수 있습니다.`]);
      return;
    }

    const picked = files.slice(0, room);
    const skipped = files.length - picked.length;
    setErrors([]);
    setProgress({ index: 1, total: picked.length, percent: 0 });

    try {
      const result = await uploadMemberImages(picked, folder, setProgress);
      if (result.urls.length > 0) onChange([...value, ...result.urls]);
      setErrors([
        ...result.errors,
        ...(skipped > 0
          ? [`최대 ${max}${unit}까지라 ${skipped}${unit}은 올리지 않았습니다.`]
          : []),
      ]);
    } finally {
      setProgress(null);
    }
  };

  const remove = (url: string) => {
    onChange(value.filter((item) => item !== url));
    void deleteMemberImages([url], folder);
  };

  const busy = progress !== null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || value.length >= max}
          className="btn-secondary min-h-[44px] px-5 py-0 text-[15px] disabled:opacity-40"
        >
          {busy
            ? progress.total > 1
              ? `${progress.total}${unit} 중 ${progress.index}${unit}째 올리는 중 ${progress.percent}%`
              : `올리는 중 ${progress.percent}%`
            : buttonLabel}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_IMAGE}
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
          className="hidden"
        />
        <span className="text-[14px] text-muted">
          {value.length}/{max}
          {unit}
        </span>
      </div>

      {errors.length > 0 ? (
        <div
          role="alert"
          className="mt-3 border border-wine bg-wine/5 px-4 py-3 text-[15px] leading-relaxed text-wine"
        >
          {errors.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      {value.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-3">
          {value.map((url) => (
            <li key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-[96px] w-[96px] border border-stone object-cover" />
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="사진 삭제"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-black/60 text-[15px] leading-none text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
