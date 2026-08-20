'use client';

import { useMemo, useState } from 'react';
import {
  COMBINATION_WARN_COUNT,
  MAX_COMBINATIONS,
  buildCombinationKeys,
  cleanOptionValue,
  isCombinationAvailable,
  rebuildCombinations,
} from '@/lib/product-utils';
import type { OptionCombination, OptionGroup } from '@/lib/types';

type OptionEditorProps = {
  groups: OptionGroup[];
  combinations: OptionCombination[];
  onChange: (next: { groups: OptionGroup[]; combinations: OptionCombination[] }) => void;
};

/**
 * 옵션 그룹(컬러·사이즈) 입력 + 조합 표.
 *
 * 그룹은 값을 콤마로 한 번에 받아 칩으로 바꿉니다.
 * [조합 생성] 을 누르면 모든 그룹의 값을 곱집합으로 조합해 표를 만듭니다.
 * ★ 다시 생성해도 같은 이름의 조합은 판매상태·재고·추가금액을 그대로 살립니다.
 */
export default function OptionEditor({
  groups,
  combinations,
  onChange,
}: OptionEditorProps) {
  /** 아직 칩으로 바꾸지 않은 입력 중인 텍스트 (그룹별) */
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const expectedKeys = useMemo(() => buildCombinationKeys(groups), [groups]);

  /** 표가 지금 옵션값과 어긋나 있는지 — 어긋나면 [조합 생성] 을 눌러야 합니다. */
  const stale = useMemo(() => {
    if (expectedKeys.length !== combinations.length) return true;
    const current = new Set(combinations.map((item) => item.key));
    return expectedKeys.some((key) => !current.has(key));
  }, [expectedKeys, combinations]);

  const setGroups = (next: OptionGroup[]) => onChange({ groups: next, combinations });

  const setCombination = (key: string, patch: Partial<OptionCombination>) => {
    onChange({
      groups,
      combinations: combinations.map((item) =>
        item.key === key ? { ...item, ...patch } : item
      ),
    });
  };

  const updateGroup = (index: number, patch: Partial<OptionGroup>) => {
    setGroups(groups.map((group, position) => (position === index ? { ...group, ...patch } : group)));
  };

  /** 콤마로 구분된 텍스트를 칩으로 바꿉니다. 이미 있는 값과 빈 값은 버립니다. */
  const commitDraft = (index: number) => {
    const text = drafts[index] ?? '';
    if (!text.trim()) return;

    const group = groups[index];
    if (!group) return;

    const added = text
      .split(',')
      .map((piece) => cleanOptionValue(piece))
      .filter(Boolean);

    const merged = [...group.values];
    for (const value of added) {
      if (!merged.includes(value)) merged.push(value);
    }

    updateGroup(index, { values: merged });
    setDrafts((prev) => ({ ...prev, [index]: '' }));
  };

  const removeValue = (index: number, value: string) => {
    const group = groups[index];
    if (!group) return;
    updateGroup(index, { values: group.values.filter((item) => item !== value) });
  };

  const addGroup = () => {
    onChange({ groups: [...groups, { name: '', values: [] }], combinations });
  };

  const removeGroup = (index: number) => {
    onChange({
      groups: groups.filter((_, position) => position !== index),
      // 그룹이 사라지면 기존 조합 키는 더 이상 맞지 않습니다. 표를 비우고 다시 만들게 합니다.
      combinations: [],
    });
    setDrafts((prev) => ({ ...prev, [index]: '' }));
  };

  const generate = () => {
    onChange({ groups, combinations: rebuildCombinations(groups, combinations) });
  };

  /** 재고 0 도 품절로 셉니다. (판매상태만 켜져 있어도 살 수 없습니다) */
  const activeCount = combinations.filter(isCombinationAvailable).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── 옵션 그룹 ──────────────────────────────────── */}
      {groups.map((group, index) => (
        <div key={index} className="rounded-md border border-slate-200 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[200px] flex-none">
              <label className="admin-label" htmlFor={`option-name-${index}`}>
                옵션명
              </label>
              <input
                id={`option-name-${index}`}
                type="text"
                value={group.name}
                onChange={(event) => updateGroup(index, { name: event.target.value })}
                placeholder="예: 컬러"
                className="admin-input"
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="admin-label" htmlFor={`option-values-${index}`}>
                옵션값 — 콤마(,)로 구분해 한 번에 입력, Enter
              </label>
              <input
                id={`option-values-${index}`}
                type="text"
                value={drafts[index] ?? ''}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [index]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault(); // 폼이 통째로 제출되지 않게 막습니다
                  commitDraft(index);
                }}
                onBlur={() => commitDraft(index)}
                placeholder="예: 화이트,블랙"
                className="admin-input"
              />
            </div>

            <button
              type="button"
              onClick={() => removeGroup(index)}
              className="admin-btn-danger"
            >
              그룹 삭제
            </button>
          </div>

          {group.values.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {group.values.map((value) => (
                <li
                  key={value}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 py-1 pl-3 pr-1.5 text-[15px] text-slate-800"
                >
                  {value}
                  <button
                    type="button"
                    onClick={() => removeValue(index, value)}
                    aria-label={`${value} 삭제`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[15px] text-slate-500">
              옵션값을 입력한 뒤 Enter 를 누르면 칩으로 바뀝니다.
            </p>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={addGroup} className="admin-btn">
          + 옵션 추가
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={expectedKeys.length === 0}
          className={stale && expectedKeys.length > 0 ? 'admin-btn-primary' : 'admin-btn'}
        >
          조합 생성
        </button>
      </div>

      {expectedKeys.length === 0 && groups.length > 0 ? (
        <p className="text-[15px] text-slate-500">
          모든 옵션 그룹에 값이 하나 이상 있어야 조합을 만들 수 있습니다.
        </p>
      ) : null}

      {stale && expectedKeys.length > 0 ? (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-[15px] text-amber-800">
          옵션값이 바뀌었습니다. [조합 생성] 을 눌러 표를 갱신해 주세요. 이미 입력한
          판매상태·재고·추가금액은 그대로 유지됩니다.
        </p>
      ) : null}

      {expectedKeys.length >= COMBINATION_WARN_COUNT ? (
        <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-[15px] text-amber-800">
          조합이 {expectedKeys.length}개입니다. 재고를 하나하나 관리하기 번거로울 수 있으니
          옵션 그룹을 줄이는 편이 편합니다.
          {expectedKeys.length >= MAX_COMBINATIONS
            ? ` (최대 ${MAX_COMBINATIONS}개까지만 만듭니다)`
            : ''}
        </p>
      ) : null}

      {/* ── 조합 표 ────────────────────────────────────── */}
      {combinations.length > 0 ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[16px] font-semibold text-slate-900">
              조합 {combinations.length}개
            </h3>
            <span className="text-[15px] text-slate-500">
              판매중 {activeCount}개 · 품절 {combinations.length - activeCount}개
            </span>
          </div>

          {/* 빈칸과 0 이 헷갈리지 않도록 표 바로 위에 한 줄로 알려 줍니다. */}
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[15px] leading-relaxed text-slate-700">
            재고수량을 비워 두면 재고를 세지 않습니다. 0을 넣으면 품절 처리됩니다.
            <br />
            <span className="text-slate-600">
              재고를 직접 보유하지 않는 경우 수량은 비워 두고 품절 체크만 사용하세요.
            </span>
          </p>

          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[560px] border-collapse text-[16px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[15px] text-slate-600">
                  <th scope="col" className="px-3 py-2 font-medium">
                    조합
                  </th>
                  <th scope="col" className="w-[110px] px-3 py-2 font-medium">
                    판매상태
                  </th>
                  <th scope="col" className="w-[140px] px-3 py-2 font-medium">
                    재고수량
                  </th>
                  <th scope="col" className="w-[150px] px-3 py-2 font-medium">
                    추가금액
                  </th>
                </tr>
              </thead>
              <tbody>
                {combinations.map((combination) => {
                  /** 재고 0 = 품절. 빈칸(null)은 재고 미관리이므로 품절이 아닙니다. */
                  const outOfStock = combination.stock === 0;

                  return (
                  <tr
                    key={combination.key}
                    className={`border-t border-slate-200 ${
                      outOfStock ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        {combination.key}
                        {outOfStock ? (
                          <span className="admin-badge bg-red-100 text-red-700">품절</span>
                        ) : null}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={combination.isActive}
                        aria-label={`${combination.key} 판매상태`}
                        onClick={() =>
                          setCombination(combination.key, { isActive: !combination.isActive })
                        }
                        className="inline-flex items-center gap-2"
                      >
                        <span
                          className={`relative block h-5 w-9 shrink-0 rounded-full transition-colors ${
                            combination.isActive ? 'bg-blue-700' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                              combination.isActive ? 'left-[18px]' : 'left-0.5'
                            }`}
                          />
                        </span>
                        <span
                          className={`text-[15px] ${
                            combination.isActive ? 'text-slate-800' : 'text-red-700'
                          }`}
                        >
                          {combination.isActive ? '판매중' : '품절'}
                        </span>
                      </button>
                    </td>

                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={combination.stock ?? ''}
                        onChange={(event) =>
                          setCombination(combination.key, {
                            stock:
                              event.target.value === ''
                                ? null
                                : Math.max(0, Number(event.target.value)),
                          })
                        }
                        aria-label={`${combination.key} 재고수량`}
                        placeholder="미관리"
                        className="admin-input tabular-nums placeholder:text-slate-400"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step={100}
                        value={combination.extraPrice}
                        onChange={(event) =>
                          setCombination(combination.key, {
                            extraPrice: Number(event.target.value) || 0,
                          })
                        }
                        aria-label={`${combination.key} 추가금액`}
                        className="admin-input tabular-nums"
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
            판매상태를 끄면 그 조합만 품절로 표시됩니다. 빈칸은 재고 미관리(항상 판매),
            0은 품절입니다. 추가금액은 판매가에 더해집니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
