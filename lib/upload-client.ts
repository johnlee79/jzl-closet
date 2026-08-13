/**
 * 브라우저에서 /api/upload 를 부르는 헬퍼.
 * 진행률을 받아야 해서 fetch 대신 XMLHttpRequest 를 씁니다.
 * (fetch 는 업로드 진행률을 알려주지 않습니다)
 */
import type { UploadedImage } from '@/lib/types';

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
