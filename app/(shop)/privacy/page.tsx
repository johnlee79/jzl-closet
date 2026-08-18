import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/store';
import CopyBlocks from '@/components/CopyBlocks';
import { resolveCopy } from '@/lib/copy';
import { getCachedCopy, getCachedStore } from '@/lib/settings';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '개인정보처리방침',
    description: `${store.name} 개인정보처리방침입니다. 수집 항목과 이용 목적, 보유 기간, 이용자의 권리와 문의처를 안내합니다.`,
    alternates: { canonical: '/privacy' },
    openGraph: {
      title: `개인정보처리방침 | ${store.name}`,
      description: '개인정보 수집 항목과 이용 목적, 보유 기간을 안내합니다.',
      url: '/privacy',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function PrivacyPage() {
  const [copy, store] = await Promise.all([getCachedCopy(), getCachedStore()]);
  const blocks = resolveCopy(copy.privacy, store);

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[720px]">
        <p className="label-xs">PRIVACY</p>
        <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[34px]">
          개인정보처리방침
        </h1>
        <p className="mt-4 text-[16px] leading-[1.9] text-ink md:text-[17px]">
          {store.name}은 이용자의 개인정보를 소중히 다루며, 관련 법령에 따라 아래와 같이
          처리합니다.
        </p>
      </header>

      <div className="mt-14">
        <CopyBlocks blocks={blocks} />
      </div>
    </div>
  );
}
