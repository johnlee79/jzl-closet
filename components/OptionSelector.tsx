'use client';

import type { OptionGroup } from '@/lib/types';

type OptionSelectorProps = {
  groups: OptionGroup[];
  selected: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** 이 값을 지금 고를 수 있는지. 남은 조합이 하나도 없으면 false 입니다. */
  isSelectable?: (groupIndex: number, value: string) => boolean;
  disabled?: boolean;
};

export default function OptionSelector({
  groups,
  selected,
  onChange,
  isSelectable,
  disabled = false,
}: OptionSelectorProps) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, groupIndex) => {
        const id = `option-${groupIndex}`;
        return (
          <div key={group.name} className="flex flex-col gap-2">
            <label htmlFor={id} className="text-[14px] tracking-[0.14em] text-muted">
              {group.name}
            </label>
            <div className="relative">
              <select
                id={id}
                name={group.name}
                value={selected[group.name] ?? ''}
                disabled={disabled}
                onChange={(event) => onChange(group.name, event.target.value)}
                className="w-full appearance-none rounded-none border border-stone bg-transparent px-4 py-3.5 pr-10 text-[16px] text-ink outline-none transition-colors duration-200 focus:border-ink disabled:cursor-not-allowed disabled:text-muted"
              >
                <option value="">{group.name}을(를) 선택해 주세요</option>
                {group.values.map((value) => {
                  const selectable = isSelectable ? isSelectable(groupIndex, value) : true;
                  return (
                    <option key={value} value={value} disabled={!selectable}>
                      {selectable ? value : `${value} (품절)`}
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
