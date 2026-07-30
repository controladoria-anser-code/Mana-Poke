-- Migração segura para instalações criadas pelo schema anterior.
-- Preserva lotes existentes e congela neles o custo atual disponível no momento da migração.

-- O SQL Editor pode estar configurado para simular o papel "authenticated".
-- Retorna ao papel da conexão antes de executar alterações de estrutura.
reset role;

begin;

drop view if exists public.latest_batches_for_current_user;
drop view if exists public.batches_for_current_user;
drop view if exists public.proteins_for_current_user;

drop trigger if exists refresh_batch_costs_after_protein_update on public.proteins;
drop function if exists public.refresh_batch_costs_after_protein_update();

alter table public.profiles
  add column if not exists enabled boolean not null default true;
alter table public.profiles
  alter column enabled set default false;

alter table public.batches
  add column if not exists protein_cost_snapshot numeric(10, 2),
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text,
  add column if not exists updated_at timestamptz not null default now();

update public.batches as batch
set
  protein_cost_snapshot = protein.cost,
  real_cost_kg = protein.cost / (batch.yield_pct / 100)
from public.proteins as protein
where protein.id = batch.protein_id
  and batch.protein_cost_snapshot is null;

update public.batches
set responsible = 'Não informado'
where responsible is null
  or length(btrim(responsible)) = 0;

alter table public.batches
  alter column protein_cost_snapshot set not null,
  alter column responsible set not null;

alter table public.batches drop constraint if exists batches_protein_cost_snapshot_check;
alter table public.batches
  add constraint batches_protein_cost_snapshot_check check (protein_cost_snapshot > 0);

alter table public.batches drop constraint if exists batches_responsible_check;
alter table public.batches
  add constraint batches_responsible_check check (length(btrim(responsible)) > 0);

alter table public.batches drop constraint if exists batches_void_state_check;
alter table public.batches
  add constraint batches_void_state_check check (
    (voided_at is null and void_reason is null)
    or
    (voided_at is not null and length(btrim(void_reason)) >= 3)
  );

alter table public.batches drop constraint if exists batches_protein_id_fkey;
alter table public.batches
  add constraint batches_protein_id_fkey
  foreign key (protein_id) references public.proteins(id) on delete restrict;

alter table public.proteins drop constraint if exists proteins_created_by_fkey;
alter table public.proteins
  add constraint proteins_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.batches drop constraint if exists batches_created_by_fkey;
alter table public.batches
  add constraint batches_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.batches drop constraint if exists batches_voided_by_fkey;
alter table public.batches
  add constraint batches_voided_by_fkey
  foreign key (voided_by) references auth.users(id) on delete set null;

alter table public.production_responsibles drop constraint if exists production_responsibles_created_by_fkey;
alter table public.production_responsibles
  add constraint production_responsibles_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.production_responsibles drop constraint if exists production_responsibles_name_check;
alter table public.production_responsibles
  add constraint production_responsibles_name_check check (length(btrim(name)) > 0);

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

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.current_user_role() = 'admin');

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

create view public.proteins_for_current_user
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

create view public.batches_for_current_user
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

create view public.latest_batches_for_current_user
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
values ('yield_window_days', '30')
on conflict (key) do nothing;

commit;
