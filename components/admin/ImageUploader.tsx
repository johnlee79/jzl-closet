'use client';

import { useRef, useState } from 'react';
import { ACCEPT_IMAGE, deleteImages, uploadImages } from '@/lib/upload-client';

type ImageUploaderProps = {
  images: string[];
  onChange: (next: string[]) => void;
  /** 저장 경로 products/{slug}/... 에 쓰입니다. */
  slug: string;
  /** 여러 장을 받을지. false 면 한 장만 유지합니다. */
  multiple?: boolean;
  /** 첫 번째 이미지에 "대표" 뱃지를 붙일지 */
  showPrimaryBadge?: boolean;
  label?: string;
};

/**
 * 드래그 앤 드롭 업로드 + 진행률 + 썸네일 격자 + 드래그 순서 변경 + 삭제.
 * 업로드는 서버(/api/upload)에서 webp 로 최적화된 뒤 R2 에 올라갑니다.
 */
export default function ImageUploader({
  images,
  onChange,
  slug,
  multiple = true,
  showPrimaryBadge = false,
  label = '이미지를 끌어다 놓거나 클릭해서 선택하세요',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const dragIndex = useRef<number | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setError('');
    setProgress(0);
    try {
      const uploaded = await uploadImages(
        multiple ? files : files.slice(0, 1),
        slug,
        setProgress
      );
      const urls = uploaded.map((item) => item.url);
      onChange(multiple ? [...images, ...urls] : urls.slice(0, 1));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '업로드에 실패했습니다.');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAt = (index: number) => {
    const target = images[index];
    onChange(images.filter((_, position) => position !== index));
    if (target) void deleteImages([target]);
  };

  /** 썸네일을 끌어다 순서를 바꿉니다. */
  const handleDrop = (target: number) => {
    const source = dragIndex.current;
    dragIndex.current = null;
    if (source === null || source === target) return;

    const next = [...images];
    const [moved] = next.splice(source, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          // 썸네일 순서 변경 드래그와 구분: 파일이 있을 때만 업로드합니다.
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
          disabled={progress !== null}
          className="admin-btn mt-3"
        >
          {progress !== null ? '업로드 중…' : '파일 선택'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_IMAGE}
          multiple={multiple}
          onChange={(event) => void handleFiles(event.target.files)}
          className="hidden"
        />
        <p className="mt-2 text-[12px] text-slate-500">
          jpg · png · webp · gif / 한 장당 20MB까지. 올리면 자동으로 webp 로 최적화됩니다.
        </p>

        {progress !== null ? (
          <div className="mt-3">
            <div
              role="progressbar"
              aria-valuenow={progress}
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
              {progress}% {progress === 100 ? '— 이미지 변환 중…' : ''}
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      {images.length > 0 ? (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {images.map((src, index) => (
            <li
              key={`${src}-${index}`}
              draggable
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              className="group relative cursor-move overflow-hidden rounded-md border border-slate-200 bg-slate-100"
            >
              <div className="aspect-[3/4] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>

              {showPrimaryBadge && index === 0 ? (
                <span className="admin-badge absolute left-1 top-1 bg-blue-700 text-white">
                  대표
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`${index + 1}번째 이미지 삭제`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[14px] leading-none text-white transition-opacity hover:bg-black/80"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {images.length > 1 ? (
        <p className="mt-2 text-[12px] text-slate-500">
          썸네일을 끌어다 놓으면 순서가 바뀝니다. 맨 앞이 대표 이미지입니다.
        </p>
      ) : null}
    </div>
  );
}
