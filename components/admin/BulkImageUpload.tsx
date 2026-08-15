'use client';

import { useRef, useState } from 'react';
import { ACCEPT_IMAGE, uploadImages } from '@/lib/upload-client';
import type { UploadedImage } from '@/lib/types';

/**
 * 이미지 여러 장을 한 번에 올리는 자리.
 *
 * ★ 상세설명 이미지를 한 장씩 올리려면 [+ 이미지] → 파일 선택을 장수만큼 반복해야 했습니다.
 *   상세페이지가 스무 장씩 되는 경우가 많아 등록이 너무 느렸습니다.
 *   여기서는 한 번에 골라 올리고, 올라온 순서대로 이미지 칸을 만들어 줍니다.
 *
 * ★ 순서 변경·개별 삭제는 만들어진 뒤 각 칸에서 합니다. (드래그로 옮깁니다)
 */
export default function BulkImageUpload({
  slug,
  onUploaded,
  label = '이미지를 여러 장 끌어다 놓거나 클릭해서 한 번에 선택하세요',
  hint = '고른 순서대로 아래에 추가됩니다.',
}: {
  /** 저장 경로 products/{slug}/... 에 쓰입니다. */
  slug: string;
  /**
   * 업로드가 끝나면 올라간 이미지를 순서대로 넘겨 줍니다.
   * ★ 주소뿐 아니라 원본 크기까지 넘깁니다. 받는 쪽에서 자리를 미리 잡는 데 씁니다.
   */
  onUploaded: (images: UploadedImage[]) => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setError('');
    setCount(files.length);
    setProgress(0);

    try {
      const uploaded = await uploadImages(files, slug, setProgress);
      onUploaded(uploaded);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : '업로드에 실패했습니다.'
      );
    } finally {
      setProgress(null);
      setCount(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const busy = progress !== null;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files);
      }}
      className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
        dragOver ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      <p className="text-[14px] text-slate-600">{label}</p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="admin-btn-primary mt-3"
      >
        {busy ? `업로드 중… ${count}장` : '파일 여러 장 선택'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMAGE}
        multiple
        onChange={(event) => void handleFiles(event.target.files)}
        className="hidden"
      />

      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        {hint} jpg · png · webp · gif / 한 장당 20MB까지. 올리면 자동으로 webp 로
        최적화됩니다.
      </p>

      {busy ? (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuenow={progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-[12px] text-slate-600">
            {count}장 · {progress}%
            {progress === 100 ? ' — 이미지 변환 중…' : ''}
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
