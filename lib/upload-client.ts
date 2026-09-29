/**
 * 브라우저에서 /api/upload 를 부르는 헬퍼.
 * 진행률을 받아야 해서 fetch 대신 XMLHttpRequest 를 씁니다.
 * (fetch 는 업로드 진행률을 알려주지 않습니다)
 */
import type { UploadedImage } from '@/lib/types';
import { reportUiError } from '@/lib/ui-error';

export const ACCEPT_IMAGE = 'image/jpeg,image/png,image/webp,image/gif';

export function uploadImages(
  files: File[],
  slug: string,
  onProgress?: (percent: number) => void
): Promise<UploadedImage[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('slug', slug || 'untitled');
    for (const file of files) form.append('files', file);

    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload');

    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      let payload: { images?: UploadedImage[]; error?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        reject(new Error('서버 응답을 읽지 못했습니다.'));
        return;
      }
      if (request.status >= 200 && request.status < 300 && payload.images) {
        resolve(payload.images);
      } else {
        reject(new Error(payload.error ?? '업로드에 실패했습니다.'));
      }
    };

    request.onerror = () => reject(new Error('업로드 중 연결이 끊겼습니다.'));
    request.send(form);
  });
}

/** 저장소에서 이미지를 지웁니다. 실패해도 화면 편집은 계속 진행합니다. */
export async function deleteImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await fetch('/api/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
  } catch {
    // 저장소 삭제 실패는 치명적이지 않습니다. (고아 파일만 남습니다)
  }
}

/* ================================================================
 * ★★ 손님용 — 리뷰·문의 사진 (2026-09-29)
 * ================================================================
 *
 * ★★ 관리자용 uploadImages 와 왜 따로 두는가
 *   운영 서버(Vercel)는 요청 하나를 4.5MB 에서 끊습니다. 우리 코드가 받기도
 *   전에 끊어서, 화면에는 「서버 응답을 읽지 못했습니다」만 뜨고 서버 로그에는
 *   아무것도 남지 않았습니다. 휴대폰 사진 한두 장이면 넘습니다.
 *   그래서 손님 사진은
 *     ① 브라우저에서 먼저 긴 변 1600px 로 줄이고 (어차피 서버도 1600px 로 줄입니다)
 *     ② 한 요청에 한 장씩 보냅니다.
 *   관리자 업로드는 지금 잘 되고 있어 건드리지 않습니다.
 *
 * ★ 한 장이 실패해도 나머지는 계속 올립니다. 끝나면 실패한 장만 알려 줍니다.
 */

export type MemberUploadFolder = 'reviews' | 'inquiries';

export type MemberUploadProgress = {
  /** 지금 올리는 사진이 몇 번째인지 (1부터) */
  index: number;
  total: number;
  /** 이 사진의 전송 진행률 */
  percent: number;
};

export type MemberUploadResult = {
  urls: string[];
  /** 실패한 사진마다 손님에게 보여 줄 한 줄 */
  errors: string[];
};

/** 브라우저에서 줄인 뒤 한 장이 이보다 크면 보내지 않습니다. (Vercel 4.5MB 벽 아래로) */
const MEMBER_MAX_SEND_BYTES = 4 * 1024 * 1024;
const RESIZE_LONG_EDGE = 1600;
const RESIZE_QUALITY = 0.88;

const TOO_BIG = '사진이 너무 큽니다. 다른 사진을 골라 주세요.';

/** 사진 파일을 브라우저에서 그림으로 읽습니다. 읽을 수 없는 형식이면 null. */
function decodeImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/**
 * 보낼 수 있는 모양으로 바꿉니다.
 *   · gif  — 움직임이 사라지지 않게 그대로 보냅니다. (크면 거절)
 *   · 그 밖 — 긴 변 1600px 이하 jpeg 로 다시 그립니다.
 *            아이폰 Safari 는 HEIC 도 그림으로 읽을 수 있어서 여기서 jpeg 가 됩니다.
 *            사진 방향(EXIF)은 브라우저가 그릴 때 이미 반영합니다.
 * @throws 손님에게 그대로 보여 줄 문장
 */
async function prepareForUpload(file: File): Promise<File> {
  if (file.type === 'image/gif') {
    if (file.size > MEMBER_MAX_SEND_BYTES) throw new Error(TOO_BIG);
    return file;
  }

  const image = await decodeImage(file);
  if (!image) {
    if (isHeic(file)) {
      throw new Error(
        '이 브라우저에서는 HEIC 사진을 읽지 못했습니다. 아이폰 Safari 로 올리시거나, jpg 사진으로 골라 주세요.'
      );
    }
    throw new Error('사진을 읽지 못했습니다. jpg·png 사진으로 골라 주세요.');
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const scale = Math.min(1, RESIZE_LONG_EDGE / Math.max(width, height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('사진을 준비하지 못했습니다. 다시 시도해 주세요.');
  // 투명한 png 가 jpeg 로 바뀌며 검게 되지 않도록 흰 바탕을 먼저 깝니다.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', RESIZE_QUALITY)
  );
  if (!blob) throw new Error('사진을 준비하지 못했습니다. 다시 시도해 주세요.');
  if (blob.size > MEMBER_MAX_SEND_BYTES) throw new Error(TOO_BIG);

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

/** 한 장을 보냅니다. @throws 손님에게 그대로 보여 줄 문장 (+ 로그용 status) */
function sendOne(
  file: File,
  folder: MemberUploadFolder,
  onPercent: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('files', file);

    const request = new XMLHttpRequest();
    request.open('POST', `/api/upload?folder=${folder}`);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onPercent(Math.round((event.loaded / event.total) * 100));
    };

    request.onload = () => {
      type Payload = { images?: UploadedImage[]; error?: string };
      let payload: Payload;
      try {
        payload = JSON.parse(request.responseText) as Payload;
      } catch {
        // ★ JSON 이 아니면 우리 코드까지 오지 못한 것입니다. 대개 Vercel 의 413(너무 큼)입니다.
        reject(Object.assign(new Error(TOO_BIG), { status: request.status }));
        return;
      }
      const url = payload.images?.[0]?.url;
      if (request.status >= 200 && request.status < 300 && url) {
        resolve(url);
      } else {
        reject(
          Object.assign(new Error(payload.error ?? '사진을 올리지 못했습니다.'), {
            status: request.status,
          })
        );
      }
    };

    request.onerror = () =>
      reject(Object.assign(new Error('인터넷 연결이 끊겨 사진을 올리지 못했습니다.'), { status: 0 }));
    request.send(form);
  });
}

/**
 * 손님 사진을 한 장씩 줄여서 올립니다.
 * 실패한 장은 건너뛰고 계속하며, 실패마다 서버 로그(/api/client-error)에 한 줄 남깁니다.
 */
export async function uploadMemberImages(
  files: File[],
  folder: MemberUploadFolder,
  onProgress: (progress: MemberUploadProgress) => void
): Promise<MemberUploadResult> {
  const urls: string[] = [];
  const errors: string[] = [];
  const total = files.length;

  for (let i = 0; i < total; i += 1) {
    const original = files[i];
    const index = i + 1;
    onProgress({ index, total, percent: 0 });

    let prepared: File | null = null;
    try {
      prepared = await prepareForUpload(original);
      urls.push(await sendOne(prepared, folder, (percent) => onProgress({ index, total, percent })));
    } catch (error) {
      const message = error instanceof Error ? error.message : '사진을 올리지 못했습니다.';
      const status = (error as { status?: number }).status;
      errors.push(total > 1 ? `${index}번째 사진: ${message}` : message);

      /*
       * ★ 조용히 넘어가지 않습니다. 손님 화면의 실패는 우리 눈에 안 보이므로
       *   서버 로그로 한 줄 보냅니다. 파일 이름은 보내지 않습니다.
       */
      reportUiError(
        new Error(
          `[upload] ${folder} ${index}/${total} 실패 — ${message} | ` +
            `상태: ${status ?? '보내기 전'} | 원본: ${original.type || '형식 없음'} ${Math.round(original.size / 1024)}KB` +
            (prepared ? ` | 보낸 것: ${prepared.type} ${Math.round(prepared.size / 1024)}KB` : '')
        ),
        `upload-${folder}`
      );
    }
  }

  return { urls, errors };
}

/** 손님이 올린 사진 지우기. 서버가 자기 폴더 안의 것만 지웁니다. */
export async function deleteMemberImages(urls: string[], folder: MemberUploadFolder): Promise<void> {
  if (urls.length === 0) return;
  try {
    const response = await fetch(`/api/upload?folder=${folder}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    if (!response.ok) console.warn(`[upload] 사진 지우기 실패 (${response.status}) — 저장소에 파일만 남습니다.`);
  } catch {
    console.warn('[upload] 사진 지우기 요청을 보내지 못했습니다 — 저장소에 파일만 남습니다.');
  }
}
