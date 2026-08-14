/**
 * 폼 하나만 있는 단독 화면(로그인·회원가입·비밀번호 찾기·주문 조회·문의 조회)의
 * 공통 껍데기입니다.
 *
 * 규칙
 *   · 가로는 화면 가운데, 카드 최대폭 420px (회원가입처럼 항목이 많으면 520px)
 *   · 세로는 화면 높이의 위쪽 1/4 지점에서 시작합니다.
 *     완전한 수직 중앙에 두면 모바일에서 키보드가 올라올 때 화면이 어색해집니다.
 *   · 카드는 paper 배경 · 1px stone 테두리 · 그림자 없음
 *   · 모바일(sm 미만)에서는 테두리를 없애고 화면 폭을 그대로 씁니다.
 *   · 제목·라벨·버튼·하단 안내까지 모두 카드 폭에 맞춰 가운데 정렬합니다.
 */
export default function AuthCard({
  /** 상단 영문 라벨 (LOGIN 등) */
  eyebrow,
  title,
  description,
  /** 회원가입처럼 항목이 많은 화면은 'wide' */
  width = 'default',
  children,
  /** 카드 아래에 놓는 안내 (회원가입 링크, 비회원 주문 안내 등) */
  footer,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  width?: 'default' | 'wide';
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const maxWidth = width === 'wide' ? 'max-w-[520px]' : 'max-w-[420px]';

  return (
    // 위쪽 1/4 지점에서 시작 — 화면이 짧으면 여백이 알아서 줄어듭니다.
    <div className="flex min-h-[70vh] justify-center px-5 pb-20 pt-[12vh] md:pt-[16vh]">
      <div className={`w-full ${maxWidth}`}>
        {/* 모바일에서는 테두리 없이 화면 폭을 그대로 씁니다. */}
        <div className="border-stone bg-paper px-0 py-2 sm:border sm:px-8 sm:py-10">
          <header className="text-center">
            {eyebrow ? <p className="label-xs">{eyebrow}</p> : null}
            <h1 className="mt-3 font-serif text-[24px] leading-snug text-ink md:text-[28px]">
              {title}
            </h1>
            {description ? (
              <div className="mt-4 text-[15px] leading-[1.9] text-ink">{description}</div>
            ) : null}
          </header>

          <div className="mt-8">{children}</div>
        </div>

        {footer ? (
          <div className="mt-8 text-center text-[14px] leading-relaxed text-ink">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 카드 안에서 공통으로 쓰는 입력칸 클래스 (높이 48px 이상) */
export const authInputClass =
  'mt-2 w-full min-h-[48px] border border-stone bg-transparent px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink';

/** 카드 안에서 공통으로 쓰는 주 버튼 클래스 (높이 52px 이상) */
export const authButtonClass =
  'inline-flex min-h-[52px] w-full items-center justify-center rounded-sm bg-ink px-6 text-[15px] tracking-[0.14em] text-paper transition-opacity duration-200 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30';
