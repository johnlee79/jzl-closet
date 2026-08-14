'use client';

import { createContext, useContext } from 'react';
import { FALLBACK_BRANDS, type Brand } from '@/lib/brands';
import { FALLBACK_CATEGORIES, type Category } from '@/lib/categories';
import {
  DEFAULT_SHIPPING,
  DEFAULT_STORE,
  type ShippingSettings,
  type StoreSettings,
} from '@/lib/site-config';

/**
 * 분류·브랜드·스토어 정보를 클라이언트 컴포넌트에 내려 줍니다.
 *
 * 1-B 부터 이 값들은 DB 에서 옵니다. 서버 컴포넌트는 직접 읽으면 되지만
 * 깊이 들어 있는 클라이언트 컴포넌트(상품 카드·목록·장바구니 버튼)까지
 * props 로 계속 넘기면 지저분해져서 컨텍스트로 한 번에 내려 줍니다.
 *
 * 값은 app/(shop)/layout.tsx 에서 한 번만 읽어 넣습니다.
 * 서버에서 렌더된 HTML 에 이미 반영되어 나가므로 SEO 에 영향이 없습니다.
 */
export type SiteData = {
  categories: Category[];
  brands: Brand[];
  store: StoreSettings;
  shipping: ShippingSettings;
};

const FALLBACK: SiteData = {
  categories: FALLBACK_CATEGORIES,
  brands: FALLBACK_BRANDS,
  store: DEFAULT_STORE,
  shipping: DEFAULT_SHIPPING,
};

const SiteContext = createContext<SiteData>(FALLBACK);

export default function SiteProvider({
  value,
  children,
}: {
  value: SiteData;
  children: React.ReactNode;
}) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteData {
  return useContext(SiteContext);
}
