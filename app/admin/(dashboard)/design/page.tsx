import Link from 'next/link';
import BannerManager from '@/components/admin/BannerManager';
import AboutImageForm from '@/components/admin/AboutImageForm';
import CopyManager from '@/components/admin/CopyManager';
import HeroButtonsForm from '@/components/admin/HeroButtonsForm';
import MainSectionsForm from '@/components/admin/MainSectionsForm';
import {
  getAboutPageSettings,
  getCopySettings,
  getDesignSettings,
  getHeroButtons,
} from '@/lib/settings';

export const dynamic = 'force-dynamic';

export const metadata = { title: '디자인 관리' };

const TABS = [
  { key: 'banner', label: '메인 배너' },
  { key: 'sections', label: '메인 섹션 노출' },
  { key: 'copy', label: '사이트 문구' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function isTab(value: string | undefined): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default async function AdminDesignPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const tab: TabKey = isTab(searchParams.tab) ? searchParams.tab : 'banner';
  const [design, copy, aboutPage, heroButtons] = await Promise.all([
    getDesignSettings(),
    getCopySettings(),
    getAboutPageSettings(),
    getHeroButtons(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <h1 className="text-[22px] font-semibold text-slate-900">디자인 관리</h1>
      <p className="mt-1 text-[14px] text-slate-600">
        첫 화면 배너와 사이트 곳곳의 문구를 여기서 고칩니다.
      </p>

      <nav aria-label="디자인 항목" className="mt-5 border-b border-slate-200">
        <ul className="-mb-px flex flex-wrap gap-1">
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <li key={item.key}>
                <Link
                  href={`/admin/design?tab=${item.key}`}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-[40px] items-center border-b-2 px-3 py-2 text-[15px] transition-colors ${
                    active
                      ? 'border-blue-700 font-semibold text-blue-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5">
        {tab === 'banner' ? <BannerManager initial={design} /> : null}
        {tab === 'sections' ? (
          <>
            <p className="mb-4 text-[14px] leading-relaxed text-slate-600">
              메인 화면의 섹션을 하나씩 켜고 끕니다. 끄면 그 자리가 통째로 사라지고 빈
              여백도 남지 않습니다. 준비가 덜 된 섹션을 잠시 감출 때 쓰세요.
            </p>
            <MainSectionsForm initial={design.sections} />
          </>
        ) : null}
        {tab === 'copy' ? (
          <>
            <p className="mb-4 text-[14px] leading-relaxed text-slate-600">
              항목을 펼쳐 문단을 고치고 저장하면 해당 페이지가 바로 갱신됩니다. 잘못
              지웠다면 [기본값으로 되돌리기] 로 원래 문구를 되살릴 수 있습니다.
            </p>
            <CopyManager
              copy={copy}
              aboutImage={<AboutImageForm imageUrl={aboutPage.imageUrl} />}
              heroButtons={<HeroButtonsForm initial={heroButtons} />}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
