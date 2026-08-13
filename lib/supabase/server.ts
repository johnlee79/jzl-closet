import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 서버 전용 Supabase 클라이언트. SERVICE_ROLE_KEY 를 사용하므로
 * 클라이언트 컴포넌트에서 import 하면 안 됩니다.
 * 최상단 import 'server-only' 가 실수로 섞이는 것을 빌드 단계에서 막아 줍니다.
 */
let cached: SupabaseClient | null = null;

/** 환경변수가 없으면 null 을 돌려줍니다. (빌드가 죽지 않게) */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** 반드시 연결이 필요한 곳(관리자 저장 등)에서 사용합니다. */
export function requireSupabaseAdmin(): SupabaseClient {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error(
      'Supabase 연결 정보가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 설정한 뒤 서버를 다시 시작해 주세요.'
    );
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
