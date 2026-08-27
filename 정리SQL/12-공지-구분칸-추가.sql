-- ============================================================
--  12. 공지에 「구분」 칸을 더하고, 자주 묻는 질문 8개를 넣습니다
--  2026-08-27
-- ============================================================
--
--  ★ 이 파일은 제가 실행하지 않았습니다. 사장님이 돌려 주세요.
--    Supabase → SQL Editor → 붙여넣기 → Run
--
--  무엇을 하나요
--    ① notices 표에 kind 칸을 더합니다 (공지 / 자주 묻는 질문)
--    ② 지금 있는 공지는 전부 '공지' 로 채웁니다
--    ③ 자주 묻는 질문 8개를 **답변을 비운 채로** 넣습니다
--
--  ★ 이 SQL 을 돌리기 전에도 화면은 그대로 돕니다.
--    칸이 없으면 전부 '공지' 로 봅니다. 손님 공지 목록도 그대로입니다.
--    다만 관리자에서 「자주 묻는 질문」으로 골라 저장해도 공지로 잡힙니다.
--    (그때는 서버 기록에 왜 그런지 남습니다)
--
--  ★ 두 번 돌려도 안전합니다. 같은 질문이 두 번 들어가지 않습니다.
-- ============================================================


-- ── ① 구분 칸 ────────────────────────────────────────────────
-- notice = 공지사항 (지금까지 쓰던 것)
-- faq    = 자주 묻는 질문 (채팅 상담창에만 보입니다)

alter table public.notices
  add column if not exists kind text not null default 'notice';

-- 엉뚱한 값이 들어가지 않게 막습니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notices_kind_check'
  ) then
    alter table public.notices
      add constraint notices_kind_check check (kind in ('notice', 'faq'));
  end if;
end $$;

comment on column public.notices.kind is
  'notice = 공지사항(손님 공지 목록에 보임) / faq = 자주 묻는 질문(채팅 상담창에만 보임)';

-- 목록을 구분별로 뽑을 때 씁니다.
create index if not exists notices_kind_visible_idx
  on public.notices (kind, is_visible, is_pinned);


-- ── ② 지금 있는 공지를 전부 '공지' 로 ────────────────────────
-- default 가 있어서 이미 채워져 있지만, 혹시 비어 있는 줄이 있으면 채웁니다.

update public.notices
   set kind = 'notice'
 where kind is null or kind not in ('notice', 'faq');


-- ── ③ 자주 묻는 질문 8개 (답변은 비어 있습니다) ──────────────
--
--  ★ 답변은 일부러 비워 두었습니다. 사장님이 직접 쓰실 것입니다.
--    답이 비어 있는 동안에는 채팅에 **아예 안 보입니다.**
--    관리자 → 공지 관리 → 「자주 묻는 질문」 칸에서 하나씩 답을 써서
--    저장하시면, 그때부터 채팅에 그 질문이 나타납니다.
--
--  ★ is_visible 은 true 입니다. 답만 쓰면 바로 보이게 하려는 것입니다.
--    특정 질문을 아예 안 쓰시려면 관리자에서 「노출」을 끄시면 됩니다.
--
--  ★ 순서는 created_at 역순입니다. 그래서 1번이 맨 위에 오도록
--    8번부터 거꾸로 넣습니다. 순서를 바꾸시려면 관리자에서 「상단 고정」을
--    쓰시면 됩니다.

insert into public.notices (title, content, kind, is_pinned, is_visible, created_at)
select v.title, '', 'faq', false, true, now() - (v.seq || ' seconds')::interval
  from (values
    (1, '배송은 얼마나 걸리나요?'),
    (2, '무통장 입금 확인은 언제 되나요?'),
    (3, '배송비는 얼마인가요?'),
    (4, '교환·반품이 되나요? 언제까지 가능한가요?'),
    (5, '주문을 취소하고 싶어요.'),
    (6, '포인트는 언제 적립되나요? 어떻게 쓰나요?'),
    (7, '비회원으로 주문할 수 있나요?'),
    (8, '입금자명을 다르게 넣었어요. 어떻게 하나요?')
  ) as v(seq, title)
 where not exists (
   select 1 from public.notices n
    where n.kind = 'faq' and n.title = v.title
 );


-- ── ④ 확인 ──────────────────────────────────────────────────
-- 돌린 뒤 아래를 실행해서 결과를 보내 주세요.

select kind,
       count(*)                                    as 건수,
       count(*) filter (where is_visible)          as 노출중,
       count(*) filter (where btrim(content) = '') as 답변빈것
  from public.notices
 group by kind
 order by kind;
