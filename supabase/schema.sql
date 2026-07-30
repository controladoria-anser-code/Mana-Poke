create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'operador' check (role in ('admin', 'gestor', 'operador', 'viewer')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.proteins (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  cost numeric(10, 2) not null check (cost > 0),
  target_yield numeric(5, 2) not null check (target_yield > 0 and target_yield <= 100),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  protein_id uuid not null references public.proteins(id) on delete restrict,
  gross_kg numeric(10, 3) not null check (gross_kg > 0),
  net_kg numeric(10, 3) not null check (net_kg > 0 and net_kg <= gross_kg),
  yield_pct numeric(6, 3) not null check (yield_pct > 0 and yield_pct <= 100),
  protein_cost_snapshot numeric(10, 2) not null check (protein_cost_snapshot > 0),
  real_cost_kg numeric(10, 2) not null check (real_cost_kg > 0),
  shift text not null check (shift in ('manha', 'tarde')),
  responsible text not null check (length(btrim(responsible)) > 0),
  notes text,
  recorded_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  updated_at timestamptz not null default now(),
  constraint batches_void_state_check check (
    (voided_at is null and void_reason is null)
    or
    (voided_at is not null and length(btrim(void_reason)) >= 3)
  )
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.production_responsibles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists production_responsibles_name_unique
  on public.production_responsibles (lower(btrim(name)));
create index if not exists batches_recorded_at_idx
  on public.batches (recorded_at desc);
create index if not exists batches_protein_recorded_at_idx
  on public.batches (protein_id, recorded_at desc)
  where voided_at is null;
create index if not exists proteins_active_name_idx
  on public.proteins (active, name);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and enabled = true
$$;

create or replace function public.current_user_can_view_costs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('admin', 'gestor'), false)
$$;

create or replace function public.current_user_can_view_targets()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('admin', 'gestor'), false)
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, enabled)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    'operador',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_batch_calculated_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protein_cost numeric(10, 2);
begin
  select cost
  into protein_cost
  from public.proteins
  where id = new.protein_id
    and active = true;

  if protein_cost is null then
    raise exception 'Proteína não encontrada ou inativa.';
  end if;

  new.responsible = btrim(new.responsible);
  if lower(new.responsible) = 'outro' then
    if new.notes is null or length(btrim(new.notes)) < 3 then
      raise exception 'Informe o responsável nas observações.';
    end if;
  elsif not exists (
    select 1
    from public.production_responsibles
    where lower(btrim(name)) = lower(new.responsible)
  ) then
    raise exception 'Responsável não cadastrado.';
  end if;

  new.yield_pct = (new.net_kg / new.gross_kg) * 100;
  new.protein_cost_snapshot = protein_cost;
  new.real_cost_kg = protein_cost / (new.yield_pct / 100);
  new.created_by = auth.uid();
  new.updated_at = now();

  return new;
end;
$$;

drop trigger if exists set_batch_calculated_fields on public.batches;
create trigger set_batch_calculated_fields
  before insert on public.batches
  for each row execute function public.set_batch_calculated_fields();

drop trigger if exists refresh_batch_costs_after_protein_update on public.proteins;
drop function if exists public.refresh_batch_costs_after_protein_update();

create or replace function public.protect_batch_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.id,
    new.protein_id,
    new.gross_kg,
    new.net_kg,
    new.yield_pct,
    new.protein_cost_snapshot,
    new.real_cost_kg,
    new.shift,
    new.responsible,
    new.notes,
    new.recorded_at,
    new.created_by
  ) is distinct from row(
    old.id,
    old.protein_id,
    old.gross_kg,
    old.net_kg,
    old.yield_pct,
    old.protein_cost_snapshot,
    old.real_cost_kg,
    old.shift,
    old.responsible,
    old.notes,
    old.recorded_at,
    old.created_by
  ) then
    raise exception 'Lotes são imutáveis. Anule o lote e registre outro.';
  end if;

  if old.voided_at is not null and row(new.voided_at, new.voided_by, new.void_reason)
    is distinct from row(old.voided_at, old.voided_by, old.void_reason) then
    raise exception 'Uma anulação não pode ser alterada.';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists protect_batch_immutable_fields on public.batches;
create trigger protect_batch_immutable_fields
  before update on public.batches
  for each row execute function public.protect_batch_immutable_fields();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

create or replace function public.void_batch(p_batch_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('admin', 'gestor') then
    raise exception 'Sem permissão para anular lotes.' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Informe um motivo com pelo menos 3 caracteres.' using errcode = '22023';
  end if;

  update public.batches
  set
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = btrim(p_reason)
  where id = p_batch_id
    and voided_at is null;

  if not found then
    raise exception 'Lote não encontrado ou já anulado.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Somente administradores podem alterar níveis.' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'O administrador não pode alterar o próprio nível.' using errcode = '22023';
  end if;

  if p_role not in ('admin', 'gestor', 'operador', 'viewer') then
    raise exception 'Nível inválido.' using errcode = '22023';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_user_enabled(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Somente administradores podem habilitar usuários.' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() and p_enabled = false then
    raise exception 'O administrador não pode bloquear o próprio acesso.' using errcode = '22023';
  end if;

  update public.profiles
  set enabled = p_enabled
  where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.proteins enable row level security;
alter table public.batches enable row level security;
alter table public.app_settings enable row level security;
alter table public.production_responsibles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.current_user_role() = 'admin');

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

drop policy if exists "responsibles_select_authenticated" on public.production_responsibles;
create policy "responsibles_select_authenticated"
on public.production_responsibles for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists "responsibles_insert_admin" on public.production_responsibles;
create policy "responsibles_insert_admin"
on public.production_responsibles for insert
to authenticated
with check (public.current_user_role() = 'admin' and created_by = auth.uid());

drop policy if exists "responsibles_delete_admin" on public.production_responsibles;
create policy "responsibles_delete_admin"
on public.production_responsibles for delete
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "proteins_select_authenticated" on public.proteins;
create policy "proteins_select_authenticated"
on public.proteins for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists "proteins_insert_managers" on public.proteins;
create policy "proteins_insert_managers"
on public.proteins for insert
to authenticated
with check (
  public.current_user_role() in ('admin', 'gestor')
  and created_by = auth.uid()
);

drop policy if exists "proteins_update_managers" on public.proteins;
create policy "proteins_update_managers"
on public.proteins for update
to authenticated
using (public.current_user_role() in ('admin', 'gestor'))
with check (public.current_user_role() in ('admin', 'gestor'));

drop policy if exists "proteins_delete_managers" on public.proteins;

drop policy if exists "batches_select_authenticated" on public.batches;
create policy "batches_select_authenticated"
on public.batches for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists "batches_insert_operation" on public.batches;
create policy "batches_insert_operation"
on public.batches for insert
to authenticated
with check (
  public.current_user_role() in ('admin', 'gestor', 'operador')
  and created_by = auth.uid()
);

drop policy if exists "batches_update_managers" on public.batches;
drop policy if exists "batches_delete_managers" on public.batches;

drop policy if exists "settings_select_authenticated" on public.app_settings;
create policy "settings_select_authenticated"
on public.app_settings for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists "settings_write_managers" on public.app_settings;
create policy "settings_write_managers"
on public.app_settings for all
to authenticated
using (public.current_user_role() in ('admin', 'gestor'))
with check (public.current_user_role() in ('admin', 'gestor'));

create or replace view public.proteins_for_current_user
with (security_barrier = true)
as
select
  id,
  slug,
  name,
  case
    when public.current_user_can_view_costs() then cost
    else null::numeric(10, 2)
  end as cost,
  case
    when public.current_user_can_view_targets() then target_yield
    else null::numeric(5, 2)
  end as target_yield,
  active,
  created_at
from public.proteins
where public.current_user_role() is not null;

create or replace view public.batches_for_current_user
with (security_barrier = true)
as
select
  id,
  protein_id,
  gross_kg,
  net_kg,
  yield_pct,
  case
    when public.current_user_can_view_costs() then protein_cost_snapshot
    else null::numeric(10, 2)
  end as protein_cost_snapshot,
  case
    when public.current_user_can_view_costs() then real_cost_kg
    else null::numeric(10, 2)
  end as real_cost_kg,
  shift,
  responsible,
  notes,
  recorded_at,
  created_by,
  voided_at,
  voided_by,
  void_reason,
  updated_at
from public.batches
where public.current_user_role() is not null;

create or replace view public.latest_batches_for_current_user
with (security_barrier = true)
as
select distinct on (protein_id)
  id,
  protein_id,
  gross_kg,
  net_kg,
  yield_pct,
  case
    when public.current_user_can_view_costs() then protein_cost_snapshot
    else null::numeric(10, 2)
  end as protein_cost_snapshot,
  case
    when public.current_user_can_view_costs() then real_cost_kg
    else null::numeric(10, 2)
  end as real_cost_kg,
  shift,
  responsible,
  notes,
  recorded_at,
  created_by,
  voided_at,
  voided_by,
  void_reason,
  updated_at
from public.batches
where voided_at is null
  and public.current_user_role() is not null
order by protein_id, recorded_at desc;

revoke all on public.profiles from anon, authenticated;
revoke all on public.proteins from anon, authenticated;
revoke all on public.batches from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.production_responsibles from anon, authenticated;
revoke all on public.proteins_for_current_user from anon, authenticated;
revoke all on public.batches_for_current_user from anon, authenticated;
revoke all on public.latest_batches_for_current_user from anon, authenticated;

grant select on public.profiles to authenticated;

grant select (id, slug, name, active, created_at) on public.proteins to authenticated;
grant insert (slug, name, cost, target_yield) on public.proteins to authenticated;
grant update (cost, target_yield, active) on public.proteins to authenticated;

grant select (
  id,
  protein_id,
  gross_kg,
  net_kg,
  yield_pct,
  shift,
  responsible,
  notes,
  recorded_at,
  created_by,
  voided_at,
  voided_by,
  void_reason,
  updated_at
) on public.batches to authenticated;
grant insert (protein_id, gross_kg, net_kg, shift, responsible, notes) on public.batches to authenticated;

grant select on public.app_settings to authenticated;
grant insert (key, value) on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;

grant select on public.production_responsibles to authenticated;
grant insert (name) on public.production_responsibles to authenticated;
grant delete on public.production_responsibles to authenticated;

grant select on public.proteins_for_current_user to authenticated;
grant select on public.batches_for_current_user to authenticated;
grant select on public.latest_batches_for_current_user to authenticated;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.current_user_can_view_costs() from public, anon, authenticated;
revoke all on function public.current_user_can_view_targets() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_batch_calculated_fields() from public, anon, authenticated;
revoke all on function public.protect_batch_immutable_fields() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.void_batch(uuid, text) from public, anon;
revoke all on function public.set_user_role(uuid, text) from public, anon;
revoke all on function public.set_user_enabled(uuid, boolean) from public, anon;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_can_view_costs() to authenticated;
grant execute on function public.current_user_can_view_targets() to authenticated;
grant execute on function public.void_batch(uuid, text) to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.set_user_enabled(uuid, boolean) to authenticated;

insert into public.app_settings (key, value)
values
  ('alert_threshold', '1'),
  ('yield_window_days', '30')
on conflict (key) do nothing;

insert into public.production_responsibles (name)
select name
from (values ('Cássia'), ('Adriano'), ('Edelmara')) as seed(name)
where not exists (
  select 1
  from public.production_responsibles
  where lower(btrim(production_responsibles.name)) = lower(btrim(seed.name))
);

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
