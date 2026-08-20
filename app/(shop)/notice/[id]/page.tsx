import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { getNoticeById, getVisibleNotices, increaseViewCount } from '@/lib/notices';
import { sanitizeRichText } from '@/lib/product-utils';
import {
  getCachedStore,
  getOgImage,
} from '@/lib/settings';

type PageProps = { params: { id: string } };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ id: string }[]> {
  const notices = await getVisibleNotices();
  return notices.map((notice) => ({ id: notice.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [notice, store] = await Promise.all([getNoticeById(params.id), getCachedStore()]);
  if (!notice || !notice.isVisible) return { title: '공지사항을 찾을 수 없습니다' };

  // 본문에서 태그를 걷어내 설명으로 씁니다.
  const description = notice.content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return {
    title: notice.title,
    description,
    alternates: { canonical: `/notice/${notice.id}` },
    openGraph: {
      title: `${notice.title} | ${store.name}`,
      description,
      url: `/notice/${notice.id}`,
      images: [await getOgImage()],
    },
  };
}

export default async function NoticeDetailPage({ params }: PageProps) {
  const notice = await getNoticeById(params.id);
  if (!notice || !notice.isVisible) notFound();

  // 조회수는 세는 데 실패해도 화면은 그대로 보여 줍니다.
  await increaseViewCount(notice.id, notice.viewCount);

  return (
    <div className="shell py-14 md:py-20">
      <nav aria-label="현재 위치" className="text-[14px] tracking-[0.14em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-ink">
              HOME
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/notice" className="hover:text-ink">
              공지사항
            </Link>
          </li>
        </ol>
      </nav>

      <article className="mx-auto mt-8 w-full max-w-[820px]">
        <header className="border-b border-stone pb-6">
          {notice.isPinned ? (
            <span className="inline-block border border-wine px-2 py-0.5 text-[13px] tracking-[0.14em] text-wine">
              공지
            </span>
          ) : null}
          <h1 className="mt-3 font-serif text-[26px] leading-snug text-ink md:text-[32px]">
            {notice.title}
          </h1>
          <p className="mt-3 text-[14px] text-muted">{formatDate(notice.createdAt)}</p>
        </header>

        <div
          className="detail-body mt-10 text-[17px] leading-[2] text-ink md:text-[18px]"
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(notice.content) }}
        />

        <div className="mt-14 border-t border-stone pt-8">
          <Link href="/notice" className="btn-secondary">
            목록으로
          </Link>
        </div>
      </article>
    </div>
  );
}
