'use client';

import { useEffect, useState } from 'react';
import { useSite } from '@/components/SiteProvider';
import { buildShareText, buildShareUrl } from '@/lib/referral-code';

/**
 * 내 추천 코드와 초대 링크를 보여 주고, 복사·공유를 돕습니다.
 *
 * ★ 주소를 서버에서 만들지 않고 브라우저에서 만듭니다.
 *   개발용 주소(localhost)와 실제 주소가 다른데, 서버에서 굳혀 두면
 *   미리보기 환경에서 엉뚱한 주소가 복사됩니다.
 * ★ 그림자·이모지를 쓰지 않습니다.
 */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      // 복사가 막힌 브라우저입니다. 글자는 그대로 보이니 손으로 옮겨 적을 수 있습니다.
      setDone(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="btn-secondary min-h-[44px] shrink-0 px-4 py-0 text-[14px]"
    >
      {done ? '복사됨' : '복사'}
    </button>
  );
}

export default function InviteLinkBox({
  code,
  shareLine,
}: {
  code: string;
  shareLine: string;
}) {
  const { store } = useSite();
  const [origin, setOrigin] = useState('');
  const [note, setNote] = useState('');

  // ★ 서버에서 그릴 때는 window 가 없습니다. 화면에 붙은 뒤에 채웁니다.
  //   그리는 도중에 상태를 바꾸면 다시 그리기가 반복될 수 있어 effect 로 미룹니다.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = origin ? buildShareUrl(origin, '/', code) : '';

  const share = async () => {
    const text = buildShareText(`${store.name} 초대`, link, store.name, shareLine);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: store.name, text, url: link });
      } catch {
        // 손님이 공유 창을 닫았습니다. 아무 일도 하지 않습니다.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote('초대 문구를 복사했습니다');
    } catch {
      setNote('복사하지 못했습니다. 위 링크를 직접 보내 주세요');
    }
    window.setTimeout(() => setNote(''), 2500);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="label-xs">내 추천 코드</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="select-all text-[32px] font-semibold leading-none tracking-[0.18em] text-ink">
            {code || '—'}
          </p>
          {code ? <CopyButton value={code} label="추천 코드 복사" /> : null}
        </div>
      </div>

      <div>
        <p className="label-xs">내 초대 링크</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* 읽기 전용 칸에 넣어 두면 길어도 화면을 밀지 않고, 길게 눌러 선택할 수 있습니다. */}
          <input
            readOnly
            value={link}
            aria-label="내 초대 링크"
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-[44px] min-w-0 flex-1 border border-stone bg-paper px-3 text-[15px] text-ink"
          />
          <CopyButton value={link} label="초대 링크 복사" />
          <button
            type="button"
            onClick={share}
            className="btn-primary min-h-[44px] shrink-0 px-5 py-0 text-[14px]"
          >
            공유
          </button>
        </div>
        <p aria-live="polite" className="mt-2 text-[14px] text-muted">
          {note}
        </p>
      </div>
    </div>
  );
}
