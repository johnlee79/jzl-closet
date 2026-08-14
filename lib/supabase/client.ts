'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 브라우저용 Supabase 클라이언트. ANON_KEY 만 사용합니다.
 * 서비스 롤 키는 절대 여기에 들어오면 안 됩니다.
 *
 * ★ 지금은 어디에서도 쓰지 않습니다.
 *   이 사이트는 모든 DB 접근을 서버(lib/supabase/server.ts, service_role)에서 합니다.
 *   덕분에 supabase/rls-2a.sql 로 RLS 를 켜도 화면이 그대로 동작합니다.
 *
 * ★ 앞으로 이 클라이언트를 쓰게 되면 RLS 정책 안에서만 움직입니다.
 *   읽을 수 있는 것: 전시 중인 상품 · 노출 중인 분류·브랜드 ·
 *                   site_settings 중 store/shipping/design/copy/analytics/branding
 *   읽을 수 없는 것: 주문 3종 · 문구 템플릿 · site_settings 의 payment(입금 계좌)
 */
let cached: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 넣어 주세요.'
    );
  }

  cached = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cached;
}
