'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ImageUploader from '@/components/admin/ImageUploader';
import { saveDesignAction } from '@/app/admin/settings-actions';
import {
  BANNER_SIZE_MOBILE,
  BANNER_SIZE_PC,
  DEFAULT_BANNER_INTERVAL,
  MAX_BANNERS,
  MAX_BANNER_INTERVAL,
  MIN_BANNER_INTERVAL,
  emptyBanner,
  type Banner,
  type DesignSettings,
} from '@/lib/site-config';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/**
 * 메인 배너 관리.
 * 최대 5개, 드래그로 순서 변경, PC·모바일 이미지를 따로 올립니다.
 */
export default function BannerManager({ initial }: { initial: DesignSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banners, setBanners] = useState<Banner[]>(initial.banners);
  const [interval, setIntervalMs] = useState(initial.interval);
  const [message, setMessage] = useState<Message>(null);
  const dragIndex = useRef<number | null>(null);

  const patch = (id: string, next: Partial<Banner>) =>
    setBanners((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));

  const add = () => {
    if (banners.length >= MAX_BANNERS) return;
    // id 는 화면에서 구분만 하면 되므로 시각으로 만듭니다.
    setBanners((prev) => [...prev, emptyBanner(`banner-${Date.now().toString(36)}`)]);
  };

  const remove = (id: string) => {
    if (!window.confirm('이 배너를 삭제할까요?')) return;
    setBanners((prev) => prev.filter((item) => item.id !== id));
  };

  const drop = (target: number) => {
    const source = dragIndex.current;
    dragIndex.current = null;
    if (source === null || source === target) return;
    setBanners((prev) => {
      const next = [...prev];
      next.splice(target, 0, next.splice(source, 1)[0]);
      return next;
    });
  };

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      // ★ 섹션 노출은 이 화면에서 다루지 않습니다. 지금 값을 그대로 다시 저장해
      //   배너만 고쳐도 섹션 설정이 초기화되지 않게 합니다.
      const result = await saveDesignAction({ banners, interval, sections: initial.sections });
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: '배너를 저장했습니다. 첫 화면에 바로 반영됩니다.' });
      router.refresh();
    });
  };

  const visibleCount = banners.filter((item) => item.isVisible && item.imageUrl).length;

  return (
    <div className="flex flex-col gap-5">
      <section className="admin-card p-4 md:p-5">
        <h2 className="text-[16px] font-semibold text-slate-900">자동 슬라이드</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          배너는 상품 이미지와 달리 천천히 넘어가야 읽힙니다. 기본값은{' '}
          {DEFAULT_BANNER_INTERVAL / 1000}초입니다.
          {visibleCount <= 1
            ? ' 지금은 노출 배너가 1개 이하라 슬라이드하지 않습니다.'
            : ''}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-[200px]">
            <label className="admin-label" htmlFor="banner-interval">
              간격 (밀리초)
            </label>
            <input
              id="banner-interval"
              type="number"
              min={MIN_BANNER_INTERVAL}
              max={MAX_BANNER_INTERVAL}
              step={500}
              value={interval}
              onChange={(event) => setIntervalMs(Number(event.target.value) || 0)}
              className="admin-input tabular-nums"
            />
          </div>
          <p className="pb-2 text-[13px] text-slate-600">
            = {(interval / 1000).toFixed(1)}초 · {MIN_BANNER_INTERVAL / 1000}~
            {MAX_BANNER_INTERVAL / 1000}초 사이로 넣어 주세요.
          </p>
        </div>
      </section>

      <section className="admin-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900">
              메인 배너 {banners.length}/{MAX_BANNERS}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              권장 사이즈 — PC {BANNER_SIZE_PC} · 모바일 {BANNER_SIZE_MOBILE}
            </p>
          </div>
          <button
            type="button"
            onClick={add}
            disabled={banners.length >= MAX_BANNERS}
            className="admin-btn"
          >
            + 배너 추가
          </button>
        </div>

        {banners.length === 0 ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-4 text-[13px] leading-relaxed text-slate-600">
            등록된 배너가 없습니다. 배너를 하나도 넣지 않으면 첫 화면은 큰 사진 없이
            브랜드명부터 시작합니다. (3-K 에서 바꿨습니다 — 예전에는 없는 파일을
            가리키느라 회색 상자만 남았습니다)
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {banners.map((banner, index) => (
              <li
                key={banner.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => drop(index)}
                className="rounded-md border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* 손잡이에만 draggable 을 겁니다. 카드 전체에 걸면 입력이 불편합니다. */}
                  <span
                    draggable
                    onDragStart={() => {
                      dragIndex.current = index;
                    }}
                    title="끌어서 순서 변경"
                    className="cursor-move select-none text-[14px] font-semibold text-slate-700"
                  >
                    ≡ 배너 {index + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-[13px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={banner.isVisible}
                        onChange={(event) =>
                          patch(banner.id, { isVisible: event.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      노출
                    </label>
                    <button
                      type="button"
                      onClick={() => remove(banner.id)}
                      className="admin-btn-danger"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <span className="admin-label">PC 이미지 · {BANNER_SIZE_PC}</span>
                    <ImageUploader
                      images={banner.imageUrl ? [banner.imageUrl] : []}
                      onChange={(next) => patch(banner.id, { imageUrl: next[0] ?? '' })}
                      slug={`banners/${banner.id}`}
                      multiple={false}
                      label="가로형 이미지를 올리세요"
                      frame="full"
                    />
                  </div>
                  <div>
                    <span className="admin-label">모바일 이미지 · {BANNER_SIZE_MOBILE}</span>
                    <ImageUploader
                      images={banner.mobileImageUrl ? [banner.mobileImageUrl] : []}
                      onChange={(next) =>
                        patch(banner.id, { mobileImageUrl: next[0] ?? '' })
                      }
                      slug={`banners/${banner.id}-m`}
                      multiple={false}
                      label="세로형 이미지를 올리세요 (없으면 PC 이미지를 씁니다)"
                      frame="full"
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="admin-label" htmlFor={`${banner.id}-title`}>
                      제목
                    </label>
                    <input
                      id={`${banner.id}-title`}
                      type="text"
                      value={banner.title}
                      onChange={(event) => patch(banner.id, { title: event.target.value })}
                      className="admin-input"
                    />
                  </div>
                  <div>
                    <label className="admin-label" htmlFor={`${banner.id}-subtitle`}>
                      부제
                    </label>
                    <input
                      id={`${banner.id}-subtitle`}
                      type="text"
                      value={banner.subtitle}
                      onChange={(event) =>
                        patch(banner.id, { subtitle: event.target.value })
                      }
                      className="admin-input"
                    />
                  </div>
                  <div>
                    <label className="admin-label" htmlFor={`${banner.id}-button`}>
                      버튼 문구
                    </label>
                    <input
                      id={`${banner.id}-button`}
                      type="text"
                      value={banner.buttonText}
                      onChange={(event) =>
                        patch(banner.id, { buttonText: event.target.value })
                      }
                      placeholder="컬렉션 보기"
                      className="admin-input"
                    />
                  </div>
                  <div>
                    <label className="admin-label" htmlFor={`${banner.id}-link`}>
                      링크
                    </label>
                    <input
                      id={`${banner.id}-link`}
                      type="text"
                      value={banner.link}
                      onChange={(event) => patch(banner.id, { link: event.target.value })}
                      placeholder="/products"
                      className="admin-input"
                    />
                    <p className="mt-1 text-[12px] text-slate-500">
                      사이트 안이면 /products 처럼, 밖이면 https:// 로 시작해 주세요.
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[14px] ${
            message.tone === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div>
        <button type="button" onClick={save} disabled={pending} className="admin-btn-primary">
          {pending ? '저장 중…' : '배너 저장'}
        </button>
      </div>
    </div>
  );
}
