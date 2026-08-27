'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSite } from '@/components/SiteProvider';
import {
  CARD_CANCEL_NOTICE,
  CHAT_TREE,
  ROOT,
  optionsFor,
  type ChatOption,
} from '@/lib/chat-menu';
import { useMember } from '@/lib/member';

/**
 * ================================================================
 * ** 채팅 상담 위젯 (2-A, 2026-08-27)
 * ================================================================
 *
 * ** 대화하듯 한 단계씩 좁혀 들어갑니다.
 *   1차에서는 메뉴를 한 화면에 쭉 늘어놓았는데, "숨겨둔 페이지를 꺼내 놓은
 *   것" 처럼 보이고 대화하는 느낌이 없었습니다.
 *
 *   왼쪽 말풍선 = 우리가 하는 말
 *   오른쪽 말풍선 = 손님이 고른 것
 *   고른 것이 그대로 쌓여서, 위로 올리면 앞서 고른 것이 보입니다.
 *
 * ** 손님이 글을 쓰는 칸은 없습니다. AI 도 없습니다.
 *   버튼으로만 고릅니다. 자유 입력은 '문의 남기기' 화면에서만 받습니다.
 *   주문·배송처럼 틀리면 안 되는 것은 버튼으로 정확히 가야 합니다.
 *
 * ** 창을 닫으면 대화를 버립니다. 다시 열면 처음부터입니다. (사장님 지시)
 *   기억해 두면 "아까 어디까지 갔더라" 를 손님이 다시 읽어야 하고,
 *   로그인 상태가 그 사이 바뀌면 앞뒤가 안 맞는 대화가 남습니다.
 *
 * ** 로그인 판정을 새로 하지 않습니다. useMember() 하나만 씁니다.
 *   언제 다시 물어보는지는 components/MemberSync.tsx 가 정합니다.
 *
 * ** 전화·오픈채팅·운영시간은 SiteProvider 에서 읽습니다.
 *   레이아웃이 이미 한 번 읽어 실어 둔 값이라 조회가 늘지 않습니다.
 *   손님 화면의 정적 생성에 영향이 없습니다.
 *
 * * 이번(2-A)에는 화면만 바꿉니다. 링크와 이동은 1차 그대로입니다.
 * ================================================================
 */

/** 말풍선이 뜨기까지의 짧은 시차. 사람이 말하는 느낌을 냅니다. */
const TYPING_MS = 300;

type Bubble = {
  id: number;
  side: 'them' | 'me';
  text: string;
  /** 전화·오픈채팅처럼 말풍선 안에 링크가 들어가는 경우 */
  extra?: 'phone' | 'kakao';
};

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

/** 말풍선이 뜨기 직전의 점 세 개 */
function Typing() {
  return (
    <div className="flex max-w-[80%] items-center gap-1 border border-stone bg-paper px-4 py-3">
      <span className="sr-only">입력 중</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="chat-dot inline-block h-1.5 w-1.5 rounded-full bg-muted"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </div>
  );
}

export default function ChatWidget() {
  const router = useRouter();
  const { store } = useSite();
  const member = useMember();
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [nodeId, setNodeId] = useState<string>(ROOT);
  const [typing, setTyping] = useState(false);

  const loggedIn = Boolean(member?.loggedIn);
  const seq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** 창을 닫을 때 예약된 말풍선이 뒤늦게 튀어나오지 않게 정리합니다. */
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  /** 잠깐 뜸을 들였다가 우리 말풍선을 답니다. */
  const say = useCallback((text: string, extra?: Bubble['extra']) => {
    setTyping(true);
    const id = window.setTimeout(() => {
      setTyping(false);
      seq.current += 1;
      setBubbles((was) => [...was, { id: seq.current, side: 'them', text, extra }]);
    }, TYPING_MS);
    timers.current.push(id);
  }, []);

  /*
   * ** 창을 열 때마다 처음부터 시작합니다.
   *   닫으면 대화를 버립니다. 기억하지 않습니다.
   */
  useEffect(() => {
    if (!open) {
      clearTimers();
      setTyping(false);
      return;
    }
    setBubbles([]);
    setNodeId(ROOT);
    const hello = loggedIn && member?.name
      ? `${member.name}님, 안녕하세요. 무엇을 도와드릴까요?`
      : '안녕하세요, 무엇을 도와드릴까요?';
    say(hello);
    return clearTimers;
    // ** 열릴 때 한 번만입니다. 로그인 상태가 도중에 바뀌어도 대화를 안 끊습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 새 말풍선이 생기면 아래로 따라 내려갑니다. */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [bubbles, typing]);

  /*
   * ** 채팅창이 열려 있는 동안 뒤 화면이 스크롤되지 않게 막습니다.
   *   원래 값을 기억했다가 그대로 돌려놓습니다.
   */
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  /** Esc 로 닫습니다. 모달의 기본 약속입니다. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (option: ChatOption) => {
    if (typing) return;

    // ① 손님이 고른 것을 오른쪽에 남깁니다.
    seq.current += 1;
    setBubbles((was) => [...was, { id: seq.current, side: 'me', text: option.label }]);

    // ② 화면을 옮기는 것이면 창을 닫고 갑니다. 안 닫으면 새 화면을 덮습니다.
    if (option.href) {
      const href = option.href;
      const id = window.setTimeout(() => {
        setOpen(false);
        router.push(href);
      }, TYPING_MS);
      timers.current.push(id);
      return;
    }

    // ③ 채팅 안에서 답하는 것 — 갈래는 그대로 두고 답만 답니다.
    if (option.note) {
      if (option.note === 'cardCancel') say(CARD_CANCEL_NOTICE);
      if (option.note === 'hours') say(store.hours);
      if (option.note === 'phone') say('고객센터로 연락 주세요.', 'phone');
      if (option.note === 'kakao') say('오픈채팅으로 연결해 드릴게요.', 'kakao');
      return;
    }

    // ④ 다음 갈래로 넘어갑니다.
    if (option.next) {
      const next = option.next;
      setNodeId(next);
      say(CHAT_TREE[next].ask);
    }
  };

  const node = CHAT_TREE[nodeId] ?? CHAT_TREE[ROOT];
  const options = optionsFor(node, loggedIn);
  const phoneDigits = store.phone.replace(/[^0-9]/g, '');

  return (
    <>
      {/* ── 우측 하단 동그란 버튼 ───────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
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
            ** 모바일은 아래에서 올라와 화면을 거의 덮고,
              PC 는 우측 하단에 뜹니다. 화면을 다 덮지 않습니다.
          */
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:justify-end md:p-8"
        >
          <button
            type="button"
            aria-label="상담 창 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
            tabIndex={-1}
          />

          <div className="relative flex max-h-[85vh] w-full flex-col border border-stone bg-paper md:max-h-[620px] md:w-[380px]">
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

            {/* ── 대화 + 선택지 (함께 굴러갑니다) ───────────── */}
            <div
              className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
              /* 읽어 주는 프로그램이 새 말풍선을 읽도록 알려 줍니다. */
              aria-live="polite"
            >
              <ul className="flex flex-col gap-3">
                {bubbles.map((bubble) => (
                  <li
                    key={bubble.id}
                    className={`flex ${bubble.side === 'me' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`chat-bubble max-w-[80%] px-4 py-3 text-[15px] leading-relaxed ${
                        bubble.side === 'me'
                          ? 'bg-ink text-paper'
                          : 'border border-stone bg-paper text-ink'
                      }`}
                    >
                      {bubble.text}

                      {bubble.extra === 'phone' ? (
                        <>
                          {/*
                            ** 휴대폰에서는 눌러서 바로 걸립니다.
                            ** PC 에서는 눌러도 아무 일이 없거나 낯선 앱이 뜹니다.
                              그래서 번호를 글자로 그대로 보여 줍니다.
                          */}
                          <a
                            href={`tel:${phoneDigits}`}
                            className="mt-2 block text-[18px] underline underline-offset-4"
                          >
                            {store.phone}
                          </a>
                          <span className="mt-1 block text-[14px] leading-relaxed text-muted">
                            {store.hours}
                          </span>
                        </>
                      ) : null}

                      {bubble.extra === 'kakao' ? (
                        <a
                          href={store.kakao}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 block underline underline-offset-4"
                        >
                          카카오 오픈채팅 열기 ↗
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}

                {typing ? (
                  <li className="flex justify-start">
                    <Typing />
                  </li>
                ) : null}
              </ul>

              {/*
                ** 선택지는 대화 아래에 함께 굴러갑니다.
                  창 밑에 붙여 두면 위로 올렸을 때 앞 대화를 가립니다.
                ** 말풍선이 뜨는 동안에는 안 보여 줍니다.
                  답이 나오기 전에 다음을 고르면 순서가 엉킵니다.
              */}
              {!typing && bubbles.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-2">
                  {options.map((option) => (
                    <li key={`${nodeId}-${option.label}`}>
                      <button
                        type="button"
                        onClick={() => choose(option)}
                        className="w-full border border-stone bg-paper px-4 py-3 text-left transition-colors hover:border-ink"
                      >
                        <span className="block text-[15px] text-ink">{option.label}</span>
                        {option.hint ? (
                          <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                            {option.hint}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
