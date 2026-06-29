-- ============================================================
-- 배틀플레이스: 생존 — Supabase 설정 SQL
-- ------------------------------------------------------------
-- 실시간 멀티플레이는 기본적으로 Realtime "Broadcast" 채널을 쓰므로
-- 테이블이 없어도 동작합니다. 아래는 선택사항(세이브/리더보드)입니다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 RUN 하세요.
-- ============================================================

-- 1) 플레이어 저장(선택): 자원/시대/킬 수 보관
create table if not exists players (
  id          text primary key,             -- 클라이언트가 만든 플레이어 id
  nick        text not null,
  country     text default '🌍',
  age         int  default 0,
  kills       int  default 0,
  inventory   jsonb default '{}'::jsonb,
  last_x      double precision default 0,
  last_z      double precision default 0,
  updated_at  timestamptz default now()
);

-- 2) 리더보드 뷰
create or replace view leaderboard as
  select nick, country, kills, age
  from players
  order by kills desc
  limit 100;

-- 3) RLS: 익명 키로 읽기/쓰기 허용 (간단한 게임용. 운영시엔 강화 권장)
alter table players enable row level security;

drop policy if exists "read all" on players;
create policy "read all" on players for select using (true);

drop policy if exists "upsert own" on players;
create policy "upsert own" on players for insert with check (true);

drop policy if exists "update own" on players;
create policy "update own" on players for update using (true) with check (true);

-- 4) Realtime: broadcast 채널만 쓰면 추가 설정 불필요.
--    (테이블 변경 구독까지 쓰려면 아래 실행)
-- alter publication supabase_realtime add table players;
