'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSite } from '@/components/SiteProvider';
import { CARD_CANCEL_NOTICE, CHAT_SECTIONS, type ChatItem } from '@/lib/chat-menu';
import { useMember } from '@/lib/member';

/**
 * ================================================================
 * ** 채팅 상담 위젯 (1차, 2026-08-27)
 * ================================================================
 *
 * ** 버튼을 눌러 고르는 방식입니다. AI 가 답하지 않습니다.
 *   메뉴는 lib/chat-menu.ts 에 데이터로 있습니다. 여기는 그리기만 합니다.
 *
 * ** 로그인 판정을 새로 하지 않습니다. useMember() 하나만 씁니다.
 *   언제 다시 물어보는지는 components/MemberSync.tsx 가 정합니다.
 *   판정이 두 곳에 있으면 반드시 어긋납니다. 이미 겪었습니다.
 *
 * ** 손님 레이아웃에 붙어 있어 화면을 옮겨도 열린 채로 남습니다.
 *   Next.js 는 화면을 옮길 때 레이아웃을 다시 그리지 않습니다.
 *   관리자 사이드바에서는 그것이 함정이었지만(서버가 읽은 숫자가 굳음),
 *   여기서는 장점입니다. 브라우저에서 도는 상태라 안 죽습니다.
 *
 * ** 전화번호·오픈채팅·운영시간은 SiteProvider 에서 읽습니다.
 *   레이아웃이 이미 한 번 읽어 실어 둔 값입니다. 조회가 늘지 않습니다.
 *   손님 화면의 정적 생성에 영향이 없습니다.
 *
 * * 처음 방문한 손님에게 말풍선을 띄우지 않았습니다. 아래에 이유를 적었습니다.
 * ================================================================
 */

/** 말풍선 — 선이 얇고 단정한 모양. 이미지 파일을 쓰지 않습니다. */
function ChatIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 둥근 사각 말풍선 + 왼쪽 아래 꼬리 */}
      <path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5v-8A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z" />
      {/* 말풍선 안의 점 세 개 */}
      <circle cx="8.6" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export default function ChatWidget() {
  const router = useRouter();
  const { store } = useSite();
  const member = useMember();
  const [open, setOpen] = useState(false);
  /** 채팅창 안에서만 보여 주는 안내 (운영시간·전화·오픈채팅) */
  const [note, setNote] = useState<ChatItem['note'] | null>(null);

  const loggedIn = Boolean(member?.loggedIn);

  /*
   * ** 채팅창이 열려 있는 동안 뒤 화면이 스크롤되지 않게 막습니다.
   *   모바일에서 창이 화면을 거의 덮는데 뒤가 밀리면 손님이 어디 있는지
   *   잃어버립니다. 닫을 때 반드시 되돌립니다.
   * * 원래 값을 기억했다가 그대로 돌려놓습니다. 빈 문자열로 덮으면
   *   다른 곳에서 걸어 둔 값이 있을 때 그것까지 지웁니다.
   */
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  /* ** Esc 로 닫습니다. 모달의 기본 약속입니다. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  /** 화면을 옮기는 항목 — 창을 먼저 닫습니다. 안 그러면 새 화면을 덮습니다. */
  const go = (href: string) => {
    setOpen(false);
    setNote(null);
    router.push(href);
  };

  const phoneDigits = store.phone.replace(/[^0-9]/g, '');

  return (
    <>
      {/* ── 우측 하단 동그란 버튼 ───────────────────────── */}
      <button
        type="button"
        onClick={() => {
          setNote(null);
          setOpen((was) => !was);
        }}
        aria-expanded={open}
        aria-label={open ? '상담 창 닫기' : '상담 창 열기'}
        className="chat-fab"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {/* ── 채팅창 ──────────────────────────────────────── */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="상담"
          /*
            ** z-50 입니다. 헤더(z-40)·팝업(z-40)보다 위입니다.
            ** 모바일은 아래에서 올라와 화면을 거의 덮고(items-end),
              PC 는 우측 하단에 뜹니다. 화면을 다 덮지 않습니다.
          */
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-end md:justify-end md:p-8"
        >
          {/* 바깥을 눌러도 닫힙니다. */}
          <button
            type="button"
            aria-label="상담 창 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
            tabIndex={-1}
          />

          <div className="relative flex max-h-[85vh] w-full flex-col border border-stone bg-paper md:max-h-[620px] md:w-[380px] md:rounded-none">
            {/* 머리 */}
            <div className="flex shrink-0 items-center justify-between border-b border-stone px-5 py-4">
              <p className="font-display text-[20px] font-light tracking-[0.28em] text-ink">
                JZL CLOSET
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>

            {/* 본문 */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-[15px] leading-relaxed text-muted">
                {loggedIn && member?.name ? `${member.name}님, ` : ''}
                무엇을 도와드릴까요? 아래에서 골라 주세요.
              </p>

              {CHAT_SECTIONS.filter((section) =>
                section.audience === 'all'
                  ? true
                  : section.audience === 'member'
                    ? loggedIn
                    : !loggedIn
              ).map((section) => (
                <div key={section.title} className="mt-5">
                  <p className="label-xs text-muted">{section.title}</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {section.items.map((item) => (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() =>
                            item.href ? go(item.href) : setNote(item.note ?? null)
                          }
                          className="w-full border border-stone bg-paper px-4 py-3 text-left transition-colors hover:border-ink"
                        >
                          <span className="block text-[16px] text-ink">{item.label}</span>
                          {item.hint ? (
                            <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">
                              {item.hint}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/*
                ** 카드 취소 안내는 늘 보여 줍니다.
                  취소 절차를 보러 온 손님이 가장 많이 오해하는 부분입니다.
              */}
              <p className="mt-6 border-t border-stone pt-4 text-[14px] leading-relaxed text-muted">
                {CARD_CANCEL_NOTICE}
              </p>
            </div>

            {/* ── 안내 상자 (화면을 옮기지 않는 항목) ───────── */}
            {note ? (
              <div className="shrink-0 border-t border-stone bg-stone/25 px-5 py-4">
                {note === 'hours' ? (
                  <>
                    <p className="text-[15px] font-medium text-ink">운영 시간</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink">{store.hours}</p>
                  </>
                ) : null}

                {note === 'phone' ? (
                  <>
                    <p className="text-[15px] font-medium text-ink">고객센터</p>
                    {/*
                      ** 휴대폰에서는 눌러서 바로 걸립니다.
                      ** PC 에서는 눌러도 아무 일이 없거나 낯선 앱이 뜹니다.
                        그래서 번호를 글자로 함께 보여 줍니다. 눈으로 보고
                        옮겨 적을 수 있어야 합니다.
                    */}
                    <a
                      href={`tel:${phoneDigits}`}
                      className="mt-1 block text-[18px] text-ink underline underline-offset-4"
                    >
                      {store.phone}
                    </a>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted">
                      {store.hours}
                    </p>
                  </>
                ) : null}

                {note === 'kakao' ? (
                  <>
                    <p className="text-[15px] font-medium text-ink">오픈채팅</p>
                    <a
                      href={store.kakao}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 block text-[16px] text-ink underline underline-offset-4"
                    >
                      카카오 오픈채팅 열기
                    </a>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted">
                      새 창에서 열립니다. 남겨 두시면 확인하고 답변드립니다.
                    </p>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={() => setNote(null)}
                  className="mt-3 text-[14px] text-muted underline underline-offset-4"
                >
                  닫기
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
