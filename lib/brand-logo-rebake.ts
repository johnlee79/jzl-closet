import 'server-only';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { normalizeBrandLogo } from '@/lib/brand-logo';
import { requireR2, toPublicUrl } from '@/lib/r2';

/**
 * 배율을 바꿔 원본에서 로고를 다시 굽는 공통 자리.
 *
 * ★ 두 곳에서 씁니다.
 *   ① /api/admin/brand-logo  — 관리자가 손으로 「이 배율로 다시 만들기」를 눌렀을 때
 *   ② saveBrandAction        — 배율만 바꾸고 저장을 눌렀을 때 자동으로
 *
 * ★ 언제나 **원본에서** 시작합니다. 이미 축소된 logoUrl 을 또 키우면 화질이 깨집니다.
 */
export async function rebakeBrandLogo(params: {
  originalUrl: string;
  slug: string;
  logoScale: number;
}): Promise<{ logoUrl: string }> {
  const { originalUrl, slug, logoScale } = params;
  if (!originalUrl) throw new Error('원본 주소가 없습니다.');

  const r2 = requireR2();

  let input: Buffer;
  try {
    const res = await fetch(originalUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    input = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`원본 이미지를 읽지 못했습니다: ${reason}`);
  }

  const { buffer } = await normalizeBrandLogo(input, { logoScale, label: slug });

  const key = `brands/normalized/${slug}-${Date.now()}.webp`;
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return { logoUrl: toPublicUrl(key) };
}
