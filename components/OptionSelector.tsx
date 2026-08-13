'use client';

type OptionSelectorProps = {
  options: { name: string; values: string[] }[];
  selected: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** 옵션 값이 품절인지 판단합니다. 재고를 관리하지 않는 상품이면 생략하세요. */
  isSoldOut?: (optionIndex: number, value: string) => boolean;
  disabled?: boolean;
};

export default function OptionSelector({
  options,
  selected,
  onChange,
  isSoldOut,
  disabled = false,
}: OptionSelectorProps) {
  return (
    <div className="flex flex-col gap-4">
      {options.map((option, optionIndex) => {
        const id = `option-${optionIndex}`;
        return (
          <div key={option.name} className="flex flex-col gap-2">
            <label htmlFor={id} className="text-[13px] tracking-[0.14em] text-muted">
              {option.name}
            </label>
            <div className="relative">
              <select
                id={id}
                name={option.name}
                value={selected[option.name] ?? ''}
                disabled={disabled}
                onChange={(event) => onChange(option.name, event.target.value)}
                className="w-full appearance-none rounded-none border border-stone bg-transparent px-4 py-3.5 pr-10 text-[15px] text-ink outline-none transition-colors duration-200 focus:border-ink disabled:cursor-not-allowed disabled:text-muted"
              >
                <option value="">{option.name}을(를) 선택해 주세요</option>
                {option.values.map((value) => {
                  const soldOut = isSoldOut ? isSoldOut(optionIndex, value) : false;
                  return (
                    <option key={value} value={value} disabled={soldOut}>
                      {soldOut ? `${value} (품절)` : value}
                    </option>
                  );
                })}
              </select>
              <svg
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                width="11"
                height="7"
                viewBox="0 0 11 7"
                fill="none"
                stroke="#14141A"
                strokeWidth="1"
                aria-hidden="true"
              >
                <path d="M1 1l4.5 4.5L10 1" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
