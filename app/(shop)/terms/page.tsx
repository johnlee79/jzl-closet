import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/store';
import CopyBlocks from '@/components/CopyBlocks';
import { resolveCopy } from '@/lib/copy';
import { getCachedCopy, getCachedStore } from '@/lib/settings';

/** 문구는 관리자 > 디자인 관리 > 사이트 문구 에서 고칩니다. */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '이용약관',
    description: `${store.name} 이용약관입니다. 서비스 이용 조건, 주문과 계약 성립, 청약철회 및 환불에 관한 사항을 안내합니다.`,
    alternates: { canonical: '/terms' },
    openGraph: {
      title: `이용약관 | ${store.name}`,
      description: '서비스 이용 조건과 주문·환불에 관한 약관입니다.',
      url: '/terms',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function TermsPage() {
  const [copy, store] = await Promise.all([getCachedCopy(), getCachedStore()]);
  const blocks = resolveCopy(copy.terms, store);

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[720px]">
        <p className="label-xs">TERMS</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          이용약관
        </h1>
        <p className="mt-4 text-[17px] leading-[1.9] text-ink md:text-[18px]">
          {store.business.company}가 운영하는 {store.name}의 서비스 이용에 관한 사항을
          정합니다.
        </p>
      </header>

      <div className="mt-14">
        <CopyBlocks blocks={blocks} />
      </div>
    </div>
  );
}
