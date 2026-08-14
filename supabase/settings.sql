-- ============================================================
-- JZL CLOSET — 사이트 설정 테이블
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists).
--
-- 지금은 관리자 > 설정 > 브랜딩 의 파비콘이 여기에 저장됩니다.
-- 앞으로 늘어날 설정(로고, 배송비, 문구 등)도 key 하나씩 나눠 담습니다.
-- ============================================================

create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);

comment on table  public.site_settings       is '사이트 전역 설정. key 하나에 jsonb 값 하나';
comment on column public.site_settings.key   is '설정 이름. 예: branding';
comment on column public.site_settings.value is '설정 값(jsonb). 구조는 key 마다 다릅니다';

-- ── updated_at 자동 갱신 ──────────────────────────────────
-- schema.sql 에서 이미 만든 함수를 재사용합니다.
-- (settings.sql 만 단독 실행해도 되도록 여기서도 정의해 둡니다)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────
-- products 와 마찬가지로 아직 켜지 않습니다. service_role 로만 읽고 씁니다.
-- alter table public.site_settings enable row level security;
