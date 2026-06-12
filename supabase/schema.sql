create extension if not exists pgcrypto;

create table if not exists public.month_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null check (year between 1900 and 3000),
  month integer not null check (month between 1 and 12),
  created_at timestamptz not null default now(),
  import_source_id text,
  unique (user_id, year, month),
  unique (id, user_id),
  unique (user_id, import_source_id)
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_plan_id uuid not null,
  name text not null check (char_length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  import_source_id text,
  unique (id, user_id),
  unique (user_id, import_source_id),
  constraint habits_month_plan_owner_fk
    foreign key (month_plan_id, user_id)
    references public.month_plans (id, user_id)
    on delete cascade
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_source_id text,
  unique (user_id, habit_id, date),
  unique (user_id, import_source_id),
  constraint habit_logs_habit_owner_fk
    foreign key (habit_id, user_id)
    references public.habits (id, user_id)
    on delete cascade
);

create index if not exists month_plans_user_month_idx
  on public.month_plans (user_id, year desc, month desc);

create index if not exists habits_user_plan_idx
  on public.habits (user_id, month_plan_id, sort_order);

create index if not exists habit_logs_user_habit_date_idx
  on public.habit_logs (user_id, habit_id, date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_habit_logs_updated_at on public.habit_logs;
create trigger set_habit_logs_updated_at
  before update on public.habit_logs
  for each row
  execute function public.set_updated_at();

alter table public.month_plans enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

alter table public.month_plans force row level security;
alter table public.habits force row level security;
alter table public.habit_logs force row level security;

drop policy if exists "Users can manage own month plans" on public.month_plans;
drop policy if exists "Users can manage own habits" on public.habits;
drop policy if exists "Users can manage own habit logs" on public.habit_logs;

create policy "Users can manage own month plans"
  on public.month_plans
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can manage own habits"
  on public.habits
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can manage own habit logs"
  on public.habit_logs
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
