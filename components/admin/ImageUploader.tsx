'use client';

import { useCallback, useRef, useState } from 'react';
import { ACCEPT_IMAGE, deleteImages, uploadImages } from '@/lib/upload-client';

type ImageMeta = { width?: number; height?: number; bytes?: number };

/** 1.2MB 처럼 읽기 쉬운 형태로 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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
  /**
   * 고객 화면에서 이 이미지가 어떻게 나오는지.
   *   thumb  3:4 틀에 맞춰 잘립니다 (상품 썸네일 · 목록 카드)
   *   full   자르지 않고 원본 비율 그대로 나옵니다 (상세설명 · 배너 · 팝업 · 로고)
   *
   * ★ thumb 일 때만 "고객 화면 / 원본 전체" 를 나란히 보여 줍니다.
   *   자르지 않는 이미지에 잘림 미리보기를 붙이면 없는 문제를 있는 것처럼 보여 줍니다.
   */
  frame?: 'thumb' | 'full';
};

/**
 * 드래그 앤 드롭 업로드 + 진행률 + 미리보기 + 드래그 순서 변경 + 삭제.
 * 업로드는 서버(/api/upload)에서 webp 로 최적화된 뒤 R2 에 올라갑니다.
 */
export default function ImageUploader({
  images,
  onChange,
  slug,
  multiple = true,
  showPrimaryBadge = false,
  label = '이미지를 끌어다 놓거나 클릭해서 선택하세요',
  frame = 'thumb',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const dragIndex = useRef<number | null>(null);

  /**
   * 이미지별 원본 크기·용량.
   * ★ 방금 올린 이미지는 서버 응답에 크기·용량이 들어 있습니다.
   *   예전에 올려 둔 이미지는 용량을 알 수 없어, 화면에 뜰 때 픽셀만 재서 채웁니다.
   */
  const [meta, setMeta] = useState<Record<string, ImageMeta>>({});

  const noteSize = useCallback((src: string, width: number, height: number) => {
    setMeta((prev) =>
      prev[src]?.width === width ? prev : { ...prev, [src]: { ...prev[src], width, height } }
    );
  }, []);

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

      // 방금 올린 이미지의 크기·용량을 기억해 둡니다.
      setMeta((prev) => {
        const next = { ...prev };
        for (const item of uploaded) {
          next[item.url] = { width: item.width, height: item.height, bytes: item.bytes };
        }
        return next;
      });

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
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((src, index) => {
            const info = meta[src];
            return (
              <li
                key={`${src}-${index}`}
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(index)}
                className="relative cursor-move overflow-hidden rounded-md border border-slate-200 bg-white"
              >
                {/* ★ 자르지 않고 나가는 이미지(상세설명·배너·팝업)는 원본 하나만 보여 줍니다.
                    잘림 미리보기를 붙이면 없는 문제를 있는 것처럼 보여 주게 됩니다.
                    세로로 아주 긴 상세 이미지도 전체가 보이도록 높이만 제한합니다. */}
                {frame === 'full' ? (
                  <div className="relative flex max-h-[420px] items-center justify-center overflow-y-auto bg-slate-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      onLoad={(event) =>
                        noteSize(
                          src,
                          event.currentTarget.naturalWidth,
                          event.currentTarget.naturalHeight
                        )
                      }
                      className="block h-auto w-full"
                    />
                  </div>
                ) : (
                <div className="grid grid-cols-2">
                  <div className="relative border-r border-slate-200 bg-slate-100">
                    <div className="aspect-[3/4] w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        onLoad={(event) =>
                          noteSize(
                            src,
                            event.currentTarget.naturalWidth,
                            event.currentTarget.naturalHeight
                          )
                        }
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center text-[11px] text-white">
                      고객 화면
                    </span>
                  </div>

                  <div className="relative bg-slate-50">
                    <div className="flex aspect-[3/4] w-full items-center justify-center p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center text-[11px] text-white">
                      원본 전체
                    </span>
                  </div>
                </div>
                )}

                <p className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] tabular-nums text-slate-500">
                  <span>
                    {info?.width
                      ? `${info.width} × ${info.height}px`
                      : '크기 확인 중…'}
                    {info?.bytes ? ` · ${formatBytes(info.bytes)}` : ''}
                  </span>
                  <span className="text-slate-400">{index + 1}번</span>
                </p>

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
            );
          })}
        </ul>
      ) : null}

      {images.length > 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
          {frame === 'full'
            ? '고객 화면에서도 자르지 않고 원본 비율 그대로 나갑니다. 세로로 긴 이미지는 여기서 스크롤해 전체를 확인하세요.'
            : '왼쪽이 고객 화면에서 실제로 보이는 범위입니다. 오른쪽 원본과 비교해 잘리면 안 되는 부분이 있는지 확인하세요.'}
          {images.length > 1
            ? ' 미리보기를 끌어다 놓으면 순서가 바뀌고 화면도 바로 따라갑니다. 맨 앞이 대표 이미지입니다.'
            : ''}
        </p>
      ) : null}
    </div>
  );
}
