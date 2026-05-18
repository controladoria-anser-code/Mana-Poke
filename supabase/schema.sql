create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'operador' check (role in ('admin', 'gestor', 'operador', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.proteins (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  cost numeric(10, 2) not null check (cost > 0),
  target_yield numeric(5, 2) not null check (target_yield > 0 and target_yield <= 100),
  active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  protein_id uuid not null references public.proteins(id) on delete cascade,
  gross_kg numeric(10, 3) not null check (gross_kg > 0),
  net_kg numeric(10, 3) not null check (net_kg > 0 and net_kg <= gross_kg),
  yield_pct numeric(6, 3) not null check (yield_pct > 0 and yield_pct <= 100),
  real_cost_kg numeric(10, 2) not null check (real_cost_kg > 0),
  shift text not null check (shift in ('manha', 'tarde', 'noite')),
  responsible text,
  notes text,
  recorded_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    case when not exists (select 1 from public.profiles) then 'admin' else 'operador' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.proteins enable row level security;
alter table public.batches enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.current_user_role() = 'admin');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "proteins_select_authenticated" on public.proteins;
create policy "proteins_select_authenticated"
on public.proteins for select
to authenticated
using (true);

drop policy if exists "proteins_insert_managers" on public.proteins;
create policy "proteins_insert_managers"
on public.proteins for insert
to authenticated
with check (public.current_user_role() in ('admin', 'gestor'));

drop policy if exists "proteins_update_managers" on public.proteins;
create policy "proteins_update_managers"
on public.proteins for update
to authenticated
using (public.current_user_role() in ('admin', 'gestor'))
with check (public.current_user_role() in ('admin', 'gestor'));

drop policy if exists "proteins_delete_managers" on public.proteins;
create policy "proteins_delete_managers"
on public.proteins for delete
to authenticated
using (public.current_user_role() in ('admin', 'gestor'));

drop policy if exists "batches_select_authenticated" on public.batches;
create policy "batches_select_authenticated"
on public.batches for select
to authenticated
using (true);

drop policy if exists "batches_insert_operation" on public.batches;
create policy "batches_insert_operation"
on public.batches for insert
to authenticated
with check (public.current_user_role() in ('admin', 'gestor', 'operador') and created_by = auth.uid());

drop policy if exists "batches_update_managers" on public.batches;
create policy "batches_update_managers"
on public.batches for update
to authenticated
using (public.current_user_role() in ('admin', 'gestor'))
with check (public.current_user_role() in ('admin', 'gestor'));

drop policy if exists "batches_delete_managers" on public.batches;
create policy "batches_delete_managers"
on public.batches for delete
to authenticated
using (public.current_user_role() in ('admin', 'gestor'));

drop policy if exists "settings_select_authenticated" on public.app_settings;
create policy "settings_select_authenticated"
on public.app_settings for select
to authenticated
using (true);

drop policy if exists "settings_write_managers" on public.app_settings;
create policy "settings_write_managers"
on public.app_settings for all
to authenticated
using (public.current_user_role() in ('admin', 'gestor'))
with check (public.current_user_role() in ('admin', 'gestor'));

insert into public.app_settings (key, value)
values ('alert_threshold', '1')
on conflict (key) do nothing;

insert into public.proteins (slug, name, cost, target_yield)
values
  ('atum', 'Atum Frozen', 67.70, 85),
  ('salmao', 'Salmão c/ pele congelado', 74.00, 75),
  ('stpeter', 'St Peter sem pele resfriado', 42.70, 90),
  ('camarao', 'Camarão', 70.00, 65),
  ('frango', 'Frango', 16.58, 80),
  ('tofu', 'Tofu', 32.00, 95),
  ('kani', 'Kani Kama', 35.90, 95),
  ('edamame', 'Edamame em grãos', 32.50, 88),
  ('shimeji', 'Shimeji Branco', 50.00, 82)
on conflict (slug) do nothing;
