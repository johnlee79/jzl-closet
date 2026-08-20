import Link from 'next/link';
import AnalyticsForm from '@/components/admin/AnalyticsForm';
import EventForm from '@/components/admin/EventForm';
import ImportSettingsForm from '@/components/admin/ImportSettingsForm';
import FaviconUploader from '@/components/admin/FaviconUploader';
import LogoUploader from '@/components/admin/LogoUploader';
import PaymentForm from '@/components/admin/PaymentForm';
import RewardForm from '@/components/admin/RewardForm';
import SalesInfoForm from '@/components/admin/SalesInfoForm';
import ShippingForm from '@/components/admin/ShippingForm';
import SnsForm from '@/components/admin/SnsForm';
import StoreSettingsForm from '@/components/admin/StoreSettingsForm';
import {
  getAnalyticsSettings,
  getBranding,
  getEventSettings,
  getImportSettings,
  getPaymentSettings,
  getPointSettings,
  getReviewSettings,
  getSalesSettings,
  getShippingSettings,
  getSnsSettings,
  getStoreSettings,
} from '@/lib/settings';
import { ksnetModeLabel } from '@/lib/payments/ksnet';
import { ksnetConfigProblem, ksnetMid, ksnetMode } from '@/lib/payments/ksnet/config';
import { isTelegramConfigured } from '@/lib/telegram';

/** 설정 화면은 항상 최신 DB 값을 봐야 하므로 캐시하지 않습니다. */
export const dynamic = 'force-dynamic';

export const metadata = { title: '설정' };

const TABS = [
  { key: 'store', label: '스토어 정보' },
  { key: 'branding', label: '브랜딩' },
  { key: 'shipping', label: '배송·반품' },
  { key: 'payment', label: '결제·주문' },
  { key: 'reward', label: '리뷰·포인트' },
  { key: 'sales', label: '판매정보' },
  { key: 'event', label: '문구·이벤트' },
  { key: 'sns', label: 'SNS' },
  { key: 'import', label: '가져오기' },
  { key: 'export', label: '데이터 내보내기' },
  { key: 'analytics', label: '분석 (GA4)' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function isTab(value: string | undefined): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const tab: TabKey = isTab(searchParams.tab) ? searchParams.tab : 'store';

  const [store, branding, shipping, analytics, payment, points, review, sales, event, importSettings, sns] =
    await Promise.all([
      getStoreSettings(),
      getBranding(),
      getShippingSettings(),
      getAnalyticsSettings(),
      getPaymentSettings(),
      getPointSettings(),
      getReviewSettings(),
      getSalesSettings(),
      getEventSettings(),
      getImportSettings(),
      getSnsSettings(),
    ]);

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <h1 className="text-[20px] font-semibold text-slate-900">설정</h1>
      <p className="mt-1 text-[13px] text-slate-600">
        여기서 고친 값은 푸터·법정 페이지·메타데이터에 바로 반영됩니다.
      </p>

      <nav aria-label="설정 항목" className="mt-5 border-b border-slate-200">
        <ul className="-mb-px flex flex-wrap gap-1">
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <li key={item.key}>
                <Link
                  href={`/admin/settings?tab=${item.key}`}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-[40px] items-center border-b-2 px-3 py-2 text-[14px] transition-colors ${
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
        {tab === 'store' ? <StoreSettingsForm initial={store} /> : null}

        {tab === 'branding' ? (
          <div className="flex flex-col gap-5">
            <FaviconUploader initial={branding} />
            <LogoUploader initialUrl={branding.logo?.url ?? ''} storeName={store.name} />
            <p className="text-[12px] leading-relaxed text-slate-500">
              설정은 site_settings 테이블에 저장됩니다. 테이블이 없다는 안내가 나오면{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">supabase/settings.sql</code>{' '}
              을 Supabase SQL Editor 에서 한 번 실행해 주세요.
            </p>
          </div>
        ) : null}

        {tab === 'shipping' ? <ShippingForm initial={shipping} /> : null}

        {tab === 'reward' ? (
          <RewardForm
            initialPoints={points}
            initialReview={review}
            telegramConfigured={isTelegramConfigured()}
          />
        ) : null}

        {tab === 'sales' ? (
          <SalesInfoForm initial={sales} shipping={shipping} store={store} />
        ) : null}

        {tab === 'event' ? <EventForm initial={event} points={points} /> : null}

        {tab === 'import' ? <ImportSettingsForm initial={importSettings} /> : null}

        {tab === 'sns' ? <SnsForm initial={sns} /> : null}

        {tab === 'payment' ? (
          <PaymentForm
            initial={payment}
            telegramConfigured={isTelegramConfigured()}
            ksnet={{
              mode: ksnetMode(),
              modeLabel: ksnetModeLabel(),
              mid: ksnetMid(),
              problem: ksnetConfigProblem(),
            }}
          />
        ) : null}

        {tab === 'export' ? (
          <section className="admin-card p-4 md:p-5">
            <h2 className="text-[16px] font-semibold text-slate-900">상품 전체 내려받기</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              숨김 상품을 포함한 전체 상품을 CSV 파일로 받습니다. 엑셀에서 바로 열 수 있도록
              UTF-8 BOM 을 넣어 한글이 깨지지 않습니다.
            </p>

            <a
              href="/api/admin/export/products"
              download
              className="admin-btn-primary mt-4"
            >
              상품 CSV 내려받기
            </a>

            <div className="mt-5 rounded-md bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700">
              <p className="font-semibold text-slate-900">들어 있는 항목</p>
              <p className="mt-1">
                slug · 상품명 · 브랜드 · 대분류 · 소분류 · 판매가 · 정상가 · 성별 · 시즌 ·
                원산지 · 제조사 · 노출 · 품절 · 신상품 · 세일 · 무료배송 · 진열순서 ·
                옵션조합수 · 재고합계 · 이미지수 · 요약 · 등록일 · 수정일
              </p>
              <p className="mt-3">
                엑셀에서 한글이 깨져 보이면 파일을 “텍스트 마법사”로 열지 말고 그냥 더블클릭해
                열어 주세요.
              </p>
              <p className="mt-3">
                주문 내보내기(택배사 일괄등록 양식 포함)는{' '}
                <Link href="/admin/orders" className="text-blue-700 underline">
                  주문 관리
                </Link>{' '}
                화면에 있습니다. 필터를 걸어 둔 상태 그대로 받을 수 있습니다.
              </p>
            </div>
          </section>
        ) : null}

        {tab === 'analytics' ? <AnalyticsForm initial={analytics} /> : null}
      </div>
    </div>
  );
}
