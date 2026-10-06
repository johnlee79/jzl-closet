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
/**
 * 브랜드별 미세 조정 배율의 허용 범위.
 * ★ 0.5~2.0 (사장님 지시 2026-10-06).
 *   TOMMY HILFIGER 처럼 가로로 길고 가는 로고는 1.5 로도 부족했습니다.
 *   그 대신 가로 상한(MAX_W_RATIO)에 걸리면 더 커지지 않습니다. UI 에서 알려 줍니다.
 */
export const LOGO_SCALE_MIN = 0.5;
export const LOGO_SCALE_MAX = 2.0;

/** 캔버스 비율 — 화면 상자도 이 비율이어야 합니다 (약 2.22:1) */
export const CANVAS_ASPECT = `${CANVAS_W} / ${CANVAS_H}`;

/* ------------------------------------------------------------------
 * ① 여백 트리밍
 * ------------------------------------------------------------------ */

/**
 * 네 모서리가 **밝은 단색**이고 테두리 한 줄이 전부 그 색일 때만 그 색을 돌려 줍니다.
 * 파타고니아처럼 사각형 자체가 로고인 건 모서리가 어두워서 자연스럽게 걸러집니다.
 *
 * ★ "밝은" 기준은 RGB 각 채널이 전부 200 이상. 중간 톤의 파랑·빨강은 어느 한 채널이
 *   낮아 걸러집니다. 흰·연회색·크림·연노랑처럼 "로고 뒤에 깔아 둔 종이색" 만 통과합니다.
 */
async function detectUniformLightBackground(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (width < 10 || height < 10) return null;

  const px = (x, y) => {
    const i = (y * width + x) * channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };

  const corners = [
    px(0, 0),
    px(width - 1, 0),
    px(0, height - 1),
    px(width - 1, height - 1),
  ];

  // 전부 불투명
  for (const c of corners) if (c.a < 240) return null;

  // 전부 밝은 색 — RGB 셋 다 200 이상이어야 "종이색" 으로 봅니다
  const LIGHT_MIN = 200;
  for (const c of corners) {
    if (Math.min(c.r, c.g, c.b) < LIGHT_MIN) return null;
  }

  // 네 모서리 색이 서로 거의 같아야 (채널당 10 이내)
  const close = (a, b) =>
    Math.abs(a.r - b.r) < 10 && Math.abs(a.g - b.g) < 10 && Math.abs(a.b - b.b) < 10;
  for (let i = 1; i < 4; i++) if (!close(corners[0], corners[i])) return null;

  // 네 모서리 평균을 배경색으로 봅니다
  const bg = {
    r: Math.round((corners[0].r + corners[1].r + corners[2].r + corners[3].r) / 4),
    g: Math.round((corners[0].g + corners[1].g + corners[2].g + corners[3].g) / 4),
    b: Math.round((corners[0].b + corners[1].b + corners[2].b + corners[3].b) / 4),
  };

  // 테두리 네 줄 중 **한 줄이라도** 전부 그 색이면 통과 (JPG 노이즈 15 허용)
  const matchesBg = (c) =>
    Math.abs(c.r - bg.r) < 15 &&
    Math.abs(c.g - bg.g) < 15 &&
    Math.abs(c.b - bg.b) < 15 &&
    c.a > 240;

  let topAll = true;
  for (let x = 0; x < width && topAll; x++) if (!matchesBg(px(x, 0))) topAll = false;
  let bottomAll = true;
  for (let x = 0; x < width && bottomAll; x++)
    if (!matchesBg(px(x, height - 1))) bottomAll = false;
  let leftAll = true;
  for (let y = 0; y < height && leftAll; y++) if (!matchesBg(px(0, y))) leftAll = false;
  let rightAll = true;
  for (let y = 0; y < height && rightAll; y++)
    if (!matchesBg(px(width - 1, y))) rightAll = false;

  if (!topAll && !bottomAll && !leftAll && !rightAll) return null;

  return bg;
}

/**
 * 여백을 잘라 냅니다.
 *
 * ★★ 파타고니아 금지선 (사각형 자체가 로고)
 *   sharp 의 trim() 은 알파가 없거나 모서리가 불투명하면 모서리 색을 배경으로 봅니다.
 *   파타고니아는 파란 사각형이 정식 로고라, 모서리 기준으로 자르면 로고를 잘라 냅니다.
 *   그래서 두 가지 안전망을 둡니다.
 *     ① 알파가 있고 투명 여백이 있을 때만 투명 기준으로 자른다
 *     ② 그 다음, 네 모서리가 "밝은 단색" 이고 테두리 한 줄이 전부 그 색일 때만
 *        그 색을 배경으로 자른다 (TOMMY·DIESEL·EMIS·ISABEL MARANT 같은 흰 배경 로고용)
 *   밝은 단색 조건 덕분에 파타고니아의 파란 사각형은 자동으로 걸러집니다.
 *
 * ★ 결과가 원본 면적의 5% 미만이면 실패로 봅니다.
 *   거의 다 잘려 나갔다는 뜻이라 원본을 그대로 씁니다.
 */
export async function trimTransparent(input) {
  const meta = await sharp(input).metadata();
  const before = { width: meta.width ?? 0, height: meta.height ?? 0 };

  const beforeArea = before.width * before.height;
  const tooSmall = (w, h) =>
    beforeArea > 0 && (w * h) / beforeArea < 0.05;

  // ── ① 투명 여백 먼저 ─────────────────────────────────────
  let current = input;
  let currentWidth = before.width;
  let currentHeight = before.height;
  let trimmed = false;
  let reasons = [];

  if (meta.hasAlpha) {
    try {
      const out = await sharp(current).trim().toBuffer({ resolveWithObject: true });
      const after = { width: out.info.width, height: out.info.height };
      if (after.width < currentWidth || after.height < currentHeight) {
        if (tooSmall(after.width, after.height)) {
          return { buffer: input, before, after: before, trimmed: false, reason: '트리밍 결과가 5% 미만' };
        }
        current = out.data;
        currentWidth = after.width;
        currentHeight = after.height;
        trimmed = true;
        reasons.push('투명 여백');
      }
    } catch {
      // 잘라낼 것이 없으면 sharp 가 던지기도 합니다. 다음 단계로.
    }
  }

  // ── ② 밝은 단색 테두리 ─────────────────────────────────
  //  투명 트리밍을 거친 결과에 아직 흰 배경이 남아 있는 경우에도 한 번 더 걸러 냅니다.
  //  (알파가 있는 PNG 지만 전부 불투명인 경우도 여기서 처리됨)
  try {
    const bg = await detectUniformLightBackground(current);
    if (bg) {
      const out = await sharp(current)
        .trim({ background: bg, threshold: 15 })
        .toBuffer({ resolveWithObject: true });
      const after = { width: out.info.width, height: out.info.height };
      if (after.width < currentWidth || after.height < currentHeight) {
        if (tooSmall(after.width, after.height)) {
          return { buffer: input, before, after: before, trimmed: false, reason: '트리밍 결과가 5% 미만' };
        }
        current = out.data;
        currentWidth = after.width;
        currentHeight = after.height;
        trimmed = true;
        reasons.push(`단색 배경 rgb(${bg.r},${bg.g},${bg.b})`);
      }
    }
  } catch {
    // 단색 체크 실패는 조용히 넘깁니다 — 원본을 그대로 쓰면 됩니다.
  }

  if (!trimmed) {
    return {
      buffer: input,
      before,
      after: before,
      trimmed: false,
      reason: meta.hasAlpha ? '잘라낼 투명·단색 여백 없음' : '알파·단색 테두리 없음',
    };
  }

  return {
    buffer: current,
    before,
    after: { width: currentWidth, height: currentHeight },
    trimmed: true,
    reason: reasons.join(' + '),
  };
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

  // 어느 쪽에 걸렸는지 — 가로/세로 중 더 작은 쪽이 실질 한계입니다
  let clampedBy = null;
  if (scale < rawScale - 1e-9) {
    clampedBy = maxByWidth <= maxByHeight ? 'width' : 'height';
  }

  return {
    k: Number(k.toFixed(4)),
    scale,
    rawScale,
    /** 캔버스 상한에 걸려 목표 면적에 못 미쳤는지 */
    clampedByCanvas: clampedBy !== null,
    /** 'width' | 'height' | null — UI 가 구분해 안내할 때 씁니다 */
    clampedBy,
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
  if (size.clampedBy === 'width') {
    // ★ 가로 상한(MAX_W_RATIO) 에 걸림 — 배율을 더 높여도 커지지 않습니다.
    //   사장님 지시 2026-10-06: 관리자에 그대로 띄워 주기.
    warnings.push('가로 폭이 이미 최대입니다 — 로고 배율을 더 높여도 커지지 않습니다');
  } else if (size.clampedBy === 'height') {
    warnings.push('세로 높이가 이미 최대입니다 — 로고 배율을 더 높여도 커지지 않습니다');
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
      clampedBy: size.clampedBy,
      finalW: size.finalW,
      finalH: size.finalH,
      warnings,
      bytes: buffer.byteLength,
    },
  };
}
