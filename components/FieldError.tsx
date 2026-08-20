'use client';

/**
 * 입력 칸 아래에 붙는 안내 한 줄.
 *
 * ★ 안내가 없으면 아무것도 그리지 않습니다. 빈 자리를 미리 잡아 두지 않아
 *   안내가 뜰 때 칸이 살짝 밀립니다. 그 움직임이 오히려 눈에 띄어 도움이 됩니다.
 *
 * ★ role="alert" 로 두어 화면을 읽어 주는 프로그램에도 즉시 전달됩니다.
 * ★ 이모지를 쓰지 않습니다.
 */
export default function FieldError({
  message,
  /** 관리자 화면이면 true */
  admin = false,
}: {
  message: string;
  admin?: boolean;
}) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className={`mt-1.5 text-[13px] leading-relaxed ${admin ? 'text-red-600' : 'text-wine'}`}
    >
      {message}
    </p>
  );
}
