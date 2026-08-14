/**
 * 별점 표시. 훅을 쓰지 않아 서버·클라이언트 어디서든 씁니다.
 * 반 개는 쓰지 않고 채운 별 / 빈 별로만 그립니다.
 */
export default function StarRating({
  value,
  size = 16,
  label,
}: {
  value: number;
  size?: number;
  /** 화면 낭독기용 설명. 없으면 "5점 만점에 N점" */
  label?: string;
}) {
  const filled = Math.round(Math.min(5, Math.max(0, value)));

  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      role="img"
      aria-label={label ?? `5점 만점에 ${value}점`}
    >
      {[1, 2, 3, 4, 5].map((index) => (
        <svg
          key={index}
          width={size}
          height={size}
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={index <= filled ? 'text-wine' : 'text-stone'}
        >
          <path
            fill="currentColor"
            d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z"
          />
        </svg>
      ))}
    </span>
  );
}
