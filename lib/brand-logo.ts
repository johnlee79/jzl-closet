import 'server-only';

/**
 * 브랜드 로고 균일화 — 앱(TypeScript)에서 쓰는 얇은 껍데기.
 *
 * ★★ 계산과 이미지 처리는 lib/brand-logo.mjs 에 있습니다. 여기서 다시 쓰지 않습니다.
 *   같은 계산이 두 곳에서 돌아야 하기 때문입니다.
 *     ① 관리자가 로고를 올릴 때 (이 앱)
 *     ② 기존 로고를 한 번에 다시 처리할 때 (scripts/normalize-brand-logos.mjs)
 *   이 저장소에는 TypeScript 를 바로 실행하는 도구가 없어 스크립트는 plain node 로
 *   돌아갑니다. 알고리즘을 양쪽에 복사해 두면 언젠가 한쪽만 고쳐져,
 *   새로 올린 로고와 일괄 처리한 로고의 크기가 달라집니다.
 */

/* ★ .mjs 라 타입이 없습니다. 반환값은 아래 BrandLogoReport 로 감싸 씁니다. */
import * as impl from '@/lib/brand-logo.mjs';

export type BrandLogoReport = {
  label: string;
  before: { width: number; height: number };
  after: { width: number; height: number };
  trimmed: boolean;
  trimReason: string;
  ratio: number;
  inkRatio: number;
  k: number;
  logoScale: number;
  scale: number;
  rawScale: number;
  clampedByCanvas: boolean;
  finalW: number;
  finalH: number;
  warnings: string[];
  bytes: number;
};

/** 캔버스 크기 — 화면 상자도 이 비율(800:360)이어야 합니다. */
export const CANVAS_W: number = impl.CANVAS_W;
export const CANVAS_H: number = impl.CANVAS_H;
export const LOGO_SCALE_MIN: number = impl.LOGO_SCALE_MIN;
export const LOGO_SCALE_MAX: number = impl.LOGO_SCALE_MAX;

/**
 * 로고 하나를 균일한 캔버스에 얹어 WebP 로 돌려줍니다.
 *
 * @param inputBuffer 원본 파일 그대로. ★ 이미 균일화된 이미지를 다시 넣지 마세요.
 *                    축소된 것을 또 키우면 화질이 깨집니다. 언제나 원본에서 시작합니다.
 */
export async function normalizeBrandLogo(
  inputBuffer: Buffer,
  options: { logoScale?: number; label?: string } = {}
): Promise<{ buffer: Buffer; report: BrandLogoReport }> {
  return impl.normalizeBrandLogo(inputBuffer, options) as unknown as Promise<{
    buffer: Buffer;
    report: BrandLogoReport;
  }>;
}
