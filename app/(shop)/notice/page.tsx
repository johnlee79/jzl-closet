import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE } from '@/lib/store';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { getVisibleNotices } from '@/lib/notices';
import { getCachedStore } from '@/lib/settings';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCachedStore();
  return {
    title: '공지사항',
    description: `${store.name} 공지사항입니다. 배송·이벤트·운영 안내를 확인하세요.`,
    alternates: { canonical: '/notice' },
    openGraph: {
      title: `공지사항 | ${store.name}`,
      description: `${store.name}의 공지사항입니다.`,
      url: '/notice',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function NoticeListPage() {
  const notices = await getVisibleNotices();

  return (
    <div className="shell py-14 md:py-20">
      <header className="max-w-[680px]">
        <p className="label-xs">NOTICE</p>
        <h1 className="mt-3 font-serif text-[28px] leading-snug text-ink md:text-[36px]">
          공지사항
        </h1>
        <p className="mt-4 text-[17px] leading-[1.9] text-ink md:text-[18px]">
          배송과 운영에 관한 안내를 올립니다.
        </p>
      </header>

      {notices.length === 0 ? (
        <p className="mt-14 border-t border-stone py-16 text-[17px] leading-relaxed text-ink">
          등록된 공지사항이 없습니다.
        </p>
      ) : (
        <ul className="mt-14 border-t border-stone">
          {notices.map((notice) => (
            <li key={notice.id} className="border-b border-stone">
              <Link
                href={`/notice/${notice.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-6 transition-opacity duration-200 hover:opacity-60"
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  {notice.isPinned ? (
                    <span className="shrink-0 border border-wine px-2 py-0.5 text-[13px] tracking-[0.14em] text-wine">
                      공지
                    </span>
                  ) : null}
                  <span className="font-serif text-[18px] leading-snug text-ink md:text-[19px]">
                    {notice.title}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] text-muted">
                  {formatDate(notice.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
