import FaviconUploader from '@/components/admin/FaviconUploader';
import { getBranding } from '@/lib/settings';

/** 설정 화면은 항상 최신 DB 값을 봐야 하므로 캐시하지 않습니다. */
export const dynamic = 'force-dynamic';

export const metadata = { title: '브랜딩' };

export default async function BrandingSettingsPage() {
  const branding = await getBranding();

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <h1 className="text-[20px] font-semibold text-slate-900">브랜딩</h1>
      <p className="mt-1 text-[13px] text-slate-500">
        브라우저 탭과 휴대폰 홈 화면에 보이는 아이콘을 바꿉니다.
      </p>

      <div className="mt-5">
        <FaviconUploader initial={branding} />
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-slate-500">
        설정은 site_settings 테이블에 저장됩니다. 테이블이 없다는 안내가 나오면{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5">supabase/settings.sql</code> 을
        Supabase SQL Editor 에서 한 번 실행해 주세요.
      </p>
    </div>
  );
}
