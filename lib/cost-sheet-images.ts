import JSZip from 'jszip';

/**
 * 뉴욕트렌딕 단가표 엑셀의 **상품 사진**을 브라우저에서 뽑아내는 모듈.
 *
 * ★ 왜 JSZip 을 따로 쓰나
 *   xlsx 는 zip 파일입니다. 사진은 /xl/media/image*.png|jpg|jpeg 로 들어 있고,
 *   그걸 어느 셀에 꽂혔는지는 /xl/drawings/drawingN.xml 과 그 .rels 파일이 알려줍니다.
 *   SheetJS Community Edition 은 이미지에 직접 접근하는 API 가 없어 JSZip 으로 직접
 *   파일을 꺼냅니다. exceljs 는 500KB 넘고 무거워 아낍니다.
 *
 * ★ 결과 — Map<"시트명:행번호", Blob> 로 돌려줍니다. 매칭 UI 가 상품의 (sheet, rowStart)
 *   로 조회해 사진을 꺼냅니다.
 *
 * ★ 리사이즈
 *   Canvas 로 가로 300px 로 줄입니다 (명세: "작게 줄여서 R2 에 올려"). 원본은 안 올립니다.
 *   리사이즈 결과는 WebP 로 뽑아 크기도 작게.
 */

export type ExtractedImage = {
  /** 원래 파일 안 경로 (디버그용) */
  path: string;
  /** 어느 시트의 어느 행 (1-indexed row in cell anchor) */
  sheet: string;
  row: number;
  col: number;
  /** 원본 바이트. 리사이즈 전에 그대로 */
  bytes: Uint8Array;
  mime: string;
};

/** key = `${sheet}:${rowStart}` — matcher 가 이 키로 찾습니다 */
export type ImageMap = Map<string, ExtractedImage>;

export async function extractImagesFromXlsx(file: File | ArrayBuffer): Promise<ImageMap> {
  const buf = file instanceof File ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(buf);

  // 1) 모든 미디어(이미지) 바이트 모으기
  const media = new Map<string, { bytes: Uint8Array; mime: string }>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!path.startsWith('xl/media/')) continue;
    if (entry.dir) continue;
    const bytes = new Uint8Array(await entry.async('uint8array'));
    const ext = (path.split('.').pop() ?? '').toLowerCase();
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'gif'
            ? 'image/gif'
            : 'application/octet-stream';
    // path 는 "xl/media/image1.png" — 파일명만 보관
    media.set(path.replace(/^xl\//, ''), { bytes, mime });
  }
  if (media.size === 0) return new Map();

  // 2) 시트 이름 ↔ 시트 파일 경로 매핑 — xl/workbook.xml 과 그 .rels
  const workbookXml = await readText(zip, 'xl/workbook.xml');
  const workbookRels = await readText(zip, 'xl/_rels/workbook.xml.rels');
  const sheetByRid = parseRelationships(workbookRels); // rId → target
  const sheetNames = parseWorkbookSheets(workbookXml); // [{rId, name}]

  const result: ImageMap = new Map();

  for (const sheet of sheetNames) {
    const sheetTarget = sheetByRid.get(sheet.rId);
    if (!sheetTarget) continue;
    // sheetTarget 예: "worksheets/sheet1.xml" (xl/ 상대 경로)
    const sheetPath = `xl/${sheetTarget}`;
    const sheetRelsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
    const sheetRelsXml = await readTextOrEmpty(zip, sheetRelsPath);
    if (!sheetRelsXml) continue;
    const sheetRels = parseRelationships(sheetRelsXml);

    // 시트의 drawings 관계 찾기 — Target 이 "../drawings/drawingN.xml" 식
    const drawingRel = Array.from(sheetRels.values()).find((t) => /drawings\/drawing\d+\.xml$/.test(t));
    if (!drawingRel) continue;

    const drawingPath = resolveZipPath(sheetPath, drawingRel);
    const drawingXml = await readTextOrEmpty(zip, drawingPath);
    if (!drawingXml) continue;
    const drawingRelsPath = drawingPath.replace(/([^/]+)$/, '_rels/$1.rels');
    const drawingRelsXml = await readTextOrEmpty(zip, drawingRelsPath);
    const drawingRels = parseRelationships(drawingRelsXml);

    // drawingN.xml 안의 각 picture: <xdr:oneCellAnchor> 또는 <xdr:twoCellAnchor> → 행/열 + rId
    const anchors = parseDrawingAnchors(drawingXml);
    for (const anchor of anchors) {
      const target = drawingRels.get(anchor.rId);
      if (!target) continue;
      // target 예: "../media/image1.png" — 리졸브해서 "media/image1.png" 로
      const mediaKey = resolveZipPath(drawingPath, target).replace(/^xl\//, '');
      const img = media.get(mediaKey);
      if (!img) continue;
      // sheet-level 저장. 같은 셀에 사진이 여러 장이면 첫 장만 보관 (상품 사진은 1개).
      const key = `${sheet.name}:${anchor.row}`;
      if (result.has(key)) continue;
      result.set(key, {
        path: mediaKey,
        sheet: sheet.name,
        row: anchor.row,
        col: anchor.col,
        bytes: img.bytes,
        mime: img.mime,
      });
    }
  }

  return result;
}

/**
 * 가로 300px 로 리사이즈 → WebP Blob. 브라우저 Canvas 로 돕니다.
 */
export async function resizeImageToWebp(
  bytes: Uint8Array,
  mime: string,
  maxWidth = 300
): Promise<Blob> {
  const bufferCopy = new Uint8Array(bytes.length);
  bufferCopy.set(bytes);
  const blob = new Blob([bufferCopy.buffer], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스 2d 컨텍스트를 못 얻었습니다.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지 리사이즈 실패'))),
      'image/webp',
      0.85
    );
  });
}

/* ------------------------------------------------------------------
 * XML 파싱 보조
 * ------------------------------------------------------------------ */

async function readText(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`${path} 가 엑셀 안에 없습니다.`);
  return entry.async('string');
}

async function readTextOrEmpty(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) return '';
  return entry.async('string');
}

/**
 * Relationships XML 을 Map<Id, Target> 로.
 *   <Relationship Id="rId1" Target="../media/image1.png" .../>
 */
function parseRelationships(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;
  const re = /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.set(m[1], m[2]);
  }
  return out;
}

/**
 * workbook.xml 의 시트 이름들을 뽑습니다.
 *   <sheet name="긴팔재고" sheetId="1" r:id="rId3"/>
 */
function parseWorkbookSheets(xml: string): { name: string; rId: string }[] {
  const out: { name: string; rId: string }[] = [];
  const re = /<sheet\s+[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push({ name: m[1], rId: m[2] });
  }
  return out;
}

/**
 * drawingN.xml 에서 picture 앵커 정보를 뽑습니다. 셀 좌표(row/col, 0-indexed) 와 그림의 rId.
 *
 *   <xdr:oneCellAnchor>
 *     <xdr:from><xdr:col>2</xdr:col><xdr:row>5</xdr:row>...</xdr:from>
 *     <xdr:pic>...<a:blip r:embed="rId1"/>...
 *   </xdr:oneCellAnchor>
 */
function parseDrawingAnchors(xml: string): { row: number; col: number; rId: string }[] {
  if (!xml) return [];
  const out: { row: number; col: number; rId: string }[] = [];
  // oneCellAnchor · twoCellAnchor · absoluteAnchor 전부 포함
  const anchorRe = /<xdr:(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/xdr:(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(xml)) !== null) {
    const inner = m[1];
    const colMatch = /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/.exec(inner);
    const rowMatch = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(inner);
    const blipMatch = /<a:blip[^>]*r:embed="([^"]+)"/.exec(inner);
    if (!rowMatch || !blipMatch) continue;
    out.push({
      row: Number(rowMatch[1]),
      col: colMatch ? Number(colMatch[1]) : 0,
      rId: blipMatch[1],
    });
  }
  return out;
}

/**
 * zip 경로 리졸버 — "xl/drawings/drawing1.xml" 안의 "../media/image1.png" →
 * "xl/media/image1.png"
 */
function resolveZipPath(basePath: string, relative: string): string {
  const baseDir = basePath.substring(0, basePath.lastIndexOf('/'));
  const parts = `${baseDir}/${relative}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}
