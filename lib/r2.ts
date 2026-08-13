import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 는 S3 호환 API 를 씁니다.
 * 키가 없으면 null 을 돌려주어 빌드가 죽지 않게 하고,
 * 실제 업로드 시점에 requireR2() 가 명확한 한국어 에러를 던집니다.
 */
export type R2Config = {
  client: S3Client;
  bucket: string;
  publicUrl: string;
};

let cached: R2Config | null = null;

export function getR2(): R2Config | null {
  if (cached) return cached;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }

  cached = {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
    publicUrl: publicUrl.replace(/\/+$/, ''),
  };
  return cached;
}

export function requireR2(): R2Config {
  const config = getR2();
  if (!config) {
    throw new Error(
      'R2 설정이 없습니다. .env.local 에 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, NEXT_PUBLIC_R2_PUBLIC_URL 을 채운 뒤 서버를 다시 시작해 주세요.'
    );
  }
  return config;
}

export function isR2Configured(): boolean {
  return getR2() !== null;
}

/** 저장 키 → 공개 URL */
export function toPublicUrl(key: string): string {
  return `${requireR2().publicUrl}/${key}`;
}

/** 공개 URL → 저장 키. 우리 버킷의 URL 이 아니면 null. */
export function toObjectKey(url: string): string | null {
  const config = getR2();
  if (!config) return null;
  const prefix = `${config.publicUrl}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key.length > 0 ? key : null;
}
