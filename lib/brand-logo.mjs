import sharp from 'sharp';

/**
 * ============================================================
 * 브랜드 로고 균일화 — 계산과 이미지 처리
 * ============================================================
 *
 * ★★ 왜 CSS 가 아니라 이미지에 구워 넣는가
 *   원본 파일 15개가 이미 세로 400~420px 로 통일되어 있습니다.
 *   화면 CSS 도 높이 기준이면 높이만 같아지고 가로 비율 차이가 그대로 남습니다.
 *   꼼데가르송은 가로로 9배 뻗고, 아크테릭스는 새 그림과 글자가 위아래로
 *   쌓여 있어 글자가 전체 높이의 3분의 1밖에 못 씁니다.
 *   사람 눈은 높이가 아니라 "차지하는 면적" 으로 크기를 느낍니다.
 *
 *   그래서 면적 기준으로 맞춘 뒤 같은 크기의 투명 캔버스에 얹어 저장합니다.
 *   화면은 그냥 같은 비율의 상자에 object-contain 으로 넣기만 하면 되고,
 *   브랜드별 예외 CSS 가 필요 없어집니다.
 *
 * ★★ 왜 .mjs 인가
 *   이 계산은 두 곳에서 똑같이 돌아야 합니다.
 *     ① 관리자가 로고를 올릴 때 (Next 앱 — TypeScript)
 *     ② 기존 로고를 한 번에 다시 처리할 때 (scripts/ — plain node)
 *   이 저장소에는 TypeScript 를 바로 실행하는 도구(tsx·ts-node)가 없고,
 *   기존 스크립트도 전부 .mjs 입니다. 알고리즘을 양쪽에 복사해 두면
 *   언젠가 한쪽만 고쳐져 업로드한 로고와 일괄 처리한 로고의 크기가 달라집니다.
 *   .mjs 로 두면 Next(webpack)도 plain node 도 같은 파일을 그대로 씁니다.
 *   타입이 필요한 쪽은 lib/brand-logo.ts 가 감싸 줍니다.
 */

/* ------------------------------------------------------------------
 * 상수 — 실제 15개 파일로 계산해 상한에 걸리는 로고가 하나도 없는 조합입니다.
 * ------------------------------------------------------------------ */

/** 캔버스 가로 */
export const CANVAS_W = 800;
/** 캔버스 세로 */
export const CANVAS_H = 360;
/** 로고가 차지할 목표 면적 (px²) */
export const TARGET_AREA = 55000;
/** 캔버스 가로의 92% 를 넘지 않습니다 */
export const MAX_W_RATIO = 0.92;
/** 캔버스 세로의 85% 를 넘지 않습니다 */
export const MAX_H_RATIO = 0.85;
/** 잉크 밀도 기준값 */
export const F_REF = 0.3;
/** 잉크 밀도 보정의 아래·위 한계 */
export const K_MIN = 0.55;
export const K_MAX = 1.9;
/** 알파값이 이 값을 넘으면 "칠해진 픽셀" 로 봅니다 */
const INK_ALPHA = 25;
/** 브랜드별 미세 조정 배율의 허용 범위 */
export const LOGO_SCALE_MIN = 0.7;
export const LOGO_SCALE_MAX = 1.5;

/** 캔버스 비율 — 화면 상자도 이 비율이어야 합니다 (약 2.22:1) */
export const CANVAS_ASPECT = `${CANVAS_W} / ${CANVAS_H}`;

/* ------------------------------------------------------------------
 * ① 여백 트리밍
 * ------------------------------------------------------------------ */

/**
 * 투명 여백을 잘라 냅니다.
 *
 * ★★ 알파가 없는 파일은 절대 건드리지 않습니다.
 *   sharp 의 trim() 은 알파가 없으면 모서리 "색" 을 배경으로 보고 자릅니다.
 *   파타고니아 로고는 산 실루엣이 들어간 사각형 자체가 정식 로고라
 *   배경이 아닙니다. 모서리 기준으로 자르면 로고를 잘라 내게 됩니다.
 *
 * ★ 지금 등록된 로고에는 잘라낼 여백이 거의 없습니다.
 *   앞으로 올라올 파일을 위한 안전망입니다. 그래서 "자르다 망가뜨리지 않는 것" 이
 *   "조금 더 자르는 것" 보다 중요합니다.
 *
 * ★ 결과가 원본 면적의 5% 미만이면 실패로 봅니다.
 *   거의 다 잘려 나갔다는 뜻이라 원본을 그대로 씁니다.
 */
export async function trimTransparent(input) {
  const meta = await sharp(input).metadata();
  const before = { width: meta.width ?? 0, height: meta.height ?? 0 };

  if (!meta.hasAlpha) {
    return { buffer: input, before, after: before, trimmed: false, reason: '알파 채널 없음' };
  }

  try {
    const out = await sharp(input).trim().toBuffer({ resolveWithObject: true });
    const after = { width: out.info.width, height: out.info.height };

    const beforeArea = before.width * before.height;
    const afterArea = after.width * after.height;
    if (beforeArea > 0 && afterArea / beforeArea < 0.05) {
      return { buffer: input, before, after: before, trimmed: false, reason: '트리밍 결과가 5% 미만' };
    }

    return { buffer: out.data, before, after, trimmed: true, reason: '' };
  } catch (error) {
    // 잘라낼 것이 없으면 sharp 가 던지는 경우가 있습니다. 원본을 그대로 씁니다.
    return {
      buffer: input,
      before,
      after: before,
      trimmed: false,
      reason: error instanceof Error ? error.message : '트리밍 실패',
    };
  }
}

/* ------------------------------------------------------------------
 * ② 잉크 밀도
 * ------------------------------------------------------------------ */

/**
 * 실제로 칠해진 픽셀의 비율.
 *
 * ★★ 왜 면적만으로는 부족한가
 *   파타고니아는 속이 꽉 찬 사각형(100%), 폴로랄프로렌은 가는 선뿐(9%)입니다.
 *   같은 면적으로 맞추면 파타고니아가 11배 무겁게 보입니다.
 *
 * ★ 알파가 없는 파일은 1.0(꽉 참)으로 봅니다.
 *   불투명 사각형이므로 실제로 전부 칠해진 것이 맞습니다.
 */
export async function measureInkRatio(input) {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return 1;

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const total = info.width * info.height;
  if (total === 0) return 1;

  let ink = 0;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i + channels - 1] > INK_ALPHA) ink += 1;
  }
  return ink / total;
}

/* ------------------------------------------------------------------
 * ③ 크기 계산
 * ------------------------------------------------------------------ */

/**
 * 면적과 잉크 밀도로 최종 크기를 계산합니다.
 *
 * ★ 측정값을 하드코딩하지 않습니다. 앞으로 올라올 로고도 자동으로 보정됩니다.
 */
export function computeSize({ width, height, inkRatio, logoScale = 1 }) {
  const safeInk = inkRatio > 0 ? inkRatio : 1;

  // 잉크가 옅으면 크게, 진하면 작게
  let k = Math.sqrt(F_REF / safeInk);
  k = Math.min(Math.max(k, K_MIN), K_MAX);

  const clampedScale = Math.min(Math.max(logoScale, LOGO_SCALE_MIN), LOGO_SCALE_MAX);

  let scale = Math.sqrt((TARGET_AREA * k * clampedScale) / (width * height));
  const rawScale = scale;

  // 캔버스를 넘지 않도록 보정
  const maxByWidth = (CANVAS_W * MAX_W_RATIO) / width;
  const maxByHeight = (CANVAS_H * MAX_H_RATIO) / height;
  scale = Math.min(scale, maxByWidth, maxByHeight);

  return {
    k: Number(k.toFixed(4)),
    scale,
    rawScale,
    /** 캔버스 상한에 걸려 목표 면적에 못 미쳤는지 */
    clampedByCanvas: scale < rawScale - 1e-9,
    finalW: Math.max(1, Math.round(width * scale)),
    finalH: Math.max(1, Math.round(height * scale)),
  };
}

/* ------------------------------------------------------------------
 * ④ 캔버스 배치 + 저장
 * ------------------------------------------------------------------ */

/**
 * 로고 하나를 균일한 캔버스에 얹어 WebP 로 돌려줍니다.
 *
 * ★ 배경을 칠하지 않습니다. 완전 투명 캔버스입니다.
 *   흰 배경을 깔면 다크모드에서 흰 박스가 튑니다.
 * ★ 알파 채널을 반드시 유지합니다.
 *
 * @returns { buffer, report } — report 는 화면·로그에 그대로 쓸 수 있는 계산 내역
 */
export async function normalizeBrandLogo(inputBuffer, options = {}) {
  const logoScale = options.logoScale ?? 1;
  const label = options.label ?? '';

  const trim = await trimTransparent(inputBuffer);
  const inkRatio = await measureInkRatio(trim.buffer);

  const size = computeSize({
    width: trim.after.width,
    height: trim.after.height,
    inkRatio,
    logoScale,
  });

  const warnings = [];
  if (size.rawScale > 3) {
    warnings.push('원본 해상도가 너무 낮습니다 (확대 배율 ' + size.rawScale.toFixed(2) + '배)');
  }
  if (size.clampedByCanvas) {
    warnings.push('캔버스 상한에 걸려 목표 면적에 못 미쳤습니다');
  }
  if (!trim.trimmed && trim.reason) {
    warnings.push('트리밍 안 함 — ' + trim.reason);
  }

  for (const message of warnings) {
    console.warn(`[brand-logo] ${label || '(이름 없음)'}: ${message}`);
  }

  const resized = await sharp(trim.buffer)
    .resize(size.finalW, size.finalH, { fit: 'fill' })
    .toBuffer();

  const buffer = await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      // 완전 투명 — 흰 배경을 깔지 않습니다.
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resized,
        left: Math.round((CANVAS_W - size.finalW) / 2),
        top: Math.round((CANVAS_H - size.finalH) / 2),
      },
    ])
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();

  return {
    buffer,
    report: {
      label,
      before: trim.before,
      after: trim.after,
      trimmed: trim.trimmed,
      trimReason: trim.reason,
      ratio: trim.after.height > 0 ? trim.after.width / trim.after.height : 0,
      inkRatio,
      k: size.k,
      logoScale,
      scale: size.scale,
      rawScale: size.rawScale,
      clampedByCanvas: size.clampedByCanvas,
      finalW: size.finalW,
      finalH: size.finalH,
      warnings,
      bytes: buffer.byteLength,
    },
  };
}
