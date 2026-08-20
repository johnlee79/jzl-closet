'use client';

import { looksLikeCountry, toKoreanCountry } from '@/lib/origin';
import type { Brand } from '@/lib/brands';

/**
 * ============================================================
 * 상품 기본 정보 입력칸 — 상품 등록/수정과 셀스타 가져오기가 함께 씁니다
 * ============================================================
 *
 * ★ 두 화면에 같은 칸이 따로 있었습니다. 한 줄 설명 도움말이나 원산지 규칙을
 *   고칠 때 한쪽만 고치고 다른 쪽을 빠뜨리기 쉬워 여기로 모았습니다.
 *   상태는 각 화면이 들고 있고, 이 파일은 모양과 안내 문구만 맡습니다.
 */

/* ================================================================
   한 줄 설명
   ================================================================ */

/** 권장 길이. 목록 카드에서 두 줄을 넘지 않으면서 정보가 담기는 구간입니다. */
const SUMMARY_MIN = 20;
const SUMMARY_MAX = 40;

/**
 * 한 줄 설명 입력칸 + 도움말 + 글자 수.
 *
 * ★ 글자 수는 막지 않고 알려만 줍니다. 40자를 넘겨야 할 상품이 분명히 있습니다.
 *   권장 구간을 벗어나면 색만 바뀝니다. 저장은 그대로 됩니다.
 * ★ 상품명에 이미 있는 말을 여기 또 쓰면 목록에서 같은 말이 두 번 보입니다.
 *   그래서 도움말에 "상품명에 없는 정보" 를 못박아 두었습니다.
 */
export function SummaryField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const length = value.trim().length;
  const inRange = length >= SUMMARY_MIN && length <= SUMMARY_MAX;

  return (
    <div>
      <label className="admin-label" htmlFor={id}>
        한 줄 설명
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="admin-input"
        placeholder="예: 도톰한 코튼 100%, 여유 있는 핏으로 데일리 출근룩에"
        aria-describedby={`${id}-help`}
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        <p id={`${id}-help`} className="text-[14px] leading-relaxed text-slate-500">
          목록과 검색 결과에 노출됩니다. 상품명에 없는 정보를 {SUMMARY_MIN}~{SUMMARY_MAX}자로
          (소재·핏·어울리는 상황 등)
        </p>
        <span
          className={`shrink-0 text-[14px] tabular-nums ${
            length === 0 ? 'text-slate-400' : inRange ? 'text-green-700' : 'text-amber-700'
          }`}
        >
          {length}자
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   원산지 · 제조사
   ================================================================ */

/** 브랜드에 적힌 원산지. 없으면 빈 문자열입니다. */
export function brandOrigin(brands: Brand[], slug: string | null | undefined): string {
  if (!slug) return '';
  return brands.find((brand) => brand.slug === slug)?.origin?.trim() ?? '';
}

/**
 * 원산지 칸.
 *
 * ★ 브랜드를 고르면 그 브랜드의 원산지가 자동으로 들어옵니다. 다만 안내를 붙입니다.
 *   브랜드 원산지는 "그 브랜드가 보통 어디서 만드는가" 이고,
 *   상품 원산지는 "이 옷이 실제로 어디서 만들어졌는가" 입니다. 다를 수 있습니다.
 *   표시광고법상 원산지는 사실이어야 하므로 확인 없이 그대로 두면 안 됩니다.
 * ★ 이미 값이 있으면 덮어쓰지 않습니다. 손으로 고쳐 둔 값이 더 정확합니다.
 */
export function OriginField({
  id,
  value,
  onChange,
  fromBrand,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 방금 브랜드에서 자동으로 채워졌는지 */
  fromBrand: boolean;
}) {
  return (
    <div>
      <label className="admin-label" htmlFor={id}>
        원산지
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="admin-input"
        placeholder="예: 대한민국"
        aria-describedby={fromBrand ? `${id}-auto` : undefined}
      />
      {fromBrand ? (
        <p id={`${id}-auto`} className="mt-1 text-[14px] leading-relaxed text-amber-700">
          브랜드에서 가져옴 · 확인 후 수정하세요
        </p>
      ) : null}
    </div>
  );
}

/**
 * 제조사 칸.
 *
 * ★ 제조사는 회사명 칸입니다. 여기에 "중국" 같은 나라 이름이 들어가 있으면
 *   원산지 칸으로 옮겨야 합니다. 두 항목은 따로 적게 되어 있습니다.
 * ★ 자동으로 옮기지 않고 물어봅니다. 사람이 일부러 적어 둔 값을 말없이 옮기면
 *   저장하고 나서야 알게 됩니다. 버튼을 누를 때만 옮깁니다.
 *   (가져오기처럼 기계가 넣는 값은 lib/origin.ts 가 알아서 갈라 놓습니다)
 */
export function ManufacturerField({
  id,
  value,
  onChange,
  onMoveToOrigin,
  originFilled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 나라 이름을 원산지로 옮길 때 부릅니다. 한글 국가명이 넘어갑니다. */
  onMoveToOrigin: (koreanCountry: string) => void;
  /** 원산지 칸에 이미 값이 있는지 — 안내 문구를 다르게 냅니다. */
  originFilled: boolean;
}) {
  const country = looksLikeCountry(value) ? toKoreanCountry(value) : null;

  return (
    <div>
      <label className="admin-label" htmlFor={id}>
        제조사
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="admin-input"
        placeholder="예: ○○어패럴 (회사명)"
        aria-describedby={country ? `${id}-warn` : undefined}
      />
      {country ? (
        <div
          id={`${id}-warn`}
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-relaxed text-amber-700"
        >
          <span>
            &lsquo;{value.trim()}&rsquo; 은 나라 이름입니다. 제조사는 회사명 칸입니다.
          </span>
          <button
            type="button"
            onClick={() => onMoveToOrigin(country)}
            className="admin-btn min-h-0 px-2 py-0.5 text-[14px]"
          >
            {originFilled ? `원산지를 '${country}' 로 바꾸기` : `원산지로 옮기기`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
