-- Converte o sistema de single-tenant para multi-tenant (uma conta por cliente
-- pagante) e adiciona o estado de assinatura usado pelo checkout do Stripe.
--
-- Todos os dados existentes são migrados para uma conta "legada" com
-- trial_ends_at nulo (nunca bloqueada), preservando o acesso de quem já usa
-- o sistema hoje.

reset role;

begin;

-- 1. Tabelas novas -----------------------------------------------------

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  plan_slug text not null check (plan_slug in ('chefe-controle', 'chefe-cozinha', 'chefe-executivo')),
  status text not null check (
    status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')
  ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_account_id_unique on public.subscriptions (account_id);
create unique index if not exists subscriptions_stripe_subscription_id_unique
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- 2. profiles.account_id precisa existir antes de current_user_account_id(),
--    porque funções "language sql" validam o corpo contra o catálogo já na
--    criação (diferente de plpgsql, que só valida na primeira execução) ----

alter table public.profiles
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;

-- 3. Funções auxiliares de tenant (precisam existir antes dos defaults) -

create or replace function public.current_user_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select account_id
  from public.profiles
  where id = auth.uid()
    and enabled = true
$$;

create or replace function public.account_has_access(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts a
    where a.id = p_account_id
      and (
        a.trial_ends_at is null
        or a.trial_ends_at > now()
        or exists (
          select 1
          from public.subscriptions s
          where s.account_id = a.id
            and s.status in ('trialing', 'active', 'past_due')
        )
      )
  )
$$;

revoke all on function public.current_user_account_id() from public, anon;
revoke all on function public.account_has_access(uuid) from public, anon;
grant execute on function public.current_user_account_id() to authenticated;
grant execute on function public.account_has_access(uuid) to authenticated;

-- 4. Coluna account_id nas demais tabelas (com default, igual created_by) --

alter table public.proteins
  add column if not exists account_id uuid references public.accounts(id) on delete cascade
    default public.current_user_account_id();

alter table public.batches
  add column if not exists account_id uuid references public.accounts(id) on delete cascade
    default public.current_user_account_id();

alter table public.batch_edit_logs
  add column if not exists account_id uuid references public.accounts(id) on delete cascade
    default public.current_user_account_id();

alter table public.production_responsibles
  add column if not exists account_id uuid references public.accounts(id) on delete cascade
    default public.current_user_account_id();

alter table public.app_settings
  add column if not exists account_id uuid references public.accounts(id) on delete cascade
    default public.current_user_account_id();

-- 5. Conta legada + backfill --------------------------------------------

insert into public.accounts (name, slug, trial_ends_at)
values ('Mana Poke', 'mana-poke-legacy', null)
on conflict (slug) do nothing;

update public.profiles
set account_id = (select id from public.accounts where slug = 'mana-poke-legacy')
where account_id is null;

update public.proteins
set account_id = (select id from public.accounts where slug = 'mana-poke-legacy')
where account_id is null;

update public.batches
set account_id = (select id from public.accounts where slug = 'mana-poke-legacy')
where account_id is null;

update public.batch_edit_logs
set account_id = (select id from public.accounts where slug = 'mana-poke-legacy')
where account_id is null;

update public.production_responsibles
set account_id = (select id from public.accounts where slug = 'mana-poke-legacy')
where account_id is null;

update public.app_settings
set account_id = (select id from public.accounts where slug = 'mana-poke-legacy')
where account_id is null;

-- 6. NOT NULL + chaves/índices re-escopados por conta --------------------

alter table public.profiles alter column account_id set not null;
alter table public.proteins alter column account_id set not null;
alter table public.batches alter column account_id set not null;
alter table public.batch_edit_logs alter column account_id set not null;
alter table public.production_responsibles alter column account_id set not null;
alter table public.app_settings alter column account_id set not null;

alter table public.proteins drop constraint if exists proteins_slug_key;
alter table public.proteins drop constraint if exists proteins_account_slug_unique;
alter table public.proteins add constraint proteins_account_slug_unique unique (account_id, slug);

drop index if exists production_responsibles_name_unique;
create unique index if not exists production_responsibles_account_name_unique
  on public.production_responsibles (account_id, lower(btrim(name)));

alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (account_id, key);

create index if not exists batches_account_recorded_at_idx
  on public.batches (account_id, recorded_at desc);

-- 7. handle_new_user: cria conta nova em cadastro público, ou anexa à conta
--    de quem convidou (admin-create-user já manda account_id no metadata) --

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_account_id uuid;
  meta_role text;
  new_account_id uuid;
  business_name text;
begin
  meta_account_id := nullif(new.raw_user_meta_data ->> 'account_id', '')::uuid;

  if meta_account_id is not null then
    meta_role := coalesce(new.raw_user_meta_data ->> 'role', 'operador');

    insert into public.profiles (id, email, full_name, role, enabled, account_id)
    values (
      new.id,
      coalesce(new.email, ''),
      new.raw_user_meta_data ->> 'full_name',
      meta_role,
      true,
      meta_account_id
    )
    on conflict (id) do nothing;
  else
    business_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), '');

    insert into public.accounts (name, slug, trial_ends_at)
    values (
      coalesce(business_name, 'Minha cozinha'),
      'acc-' || replace(new.id::text, '-', ''),
      now() + interval '7 days'
    )
    returning id into new_account_id;

    insert into public.profiles (id, email, full_name, role, enabled, account_id)
    values (
      new.id,
      coalesce(new.email, ''),
      new.raw_user_meta_data ->> 'full_name',
      'admin',
      true,
      new_account_id
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

-- 8. set_batch_calculated_fields: fixa account_id (mesmo padrão de created_by)
--    e escopa as validações de proteína/responsável pela conta do lote -----

create or replace function public.set_batch_calculated_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protein_cost numeric(10, 2);
begin
  new.account_id = public.current_user_account_id();

  select cost
  into protein_cost
  from public.proteins
  where id = new.protein_id
    and active = true
    and account_id = new.account_id;

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
      and account_id = new.account_id
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

-- 9. edit_batch / void_batch: só operam em lotes da própria conta ---------

create or replace function public.edit_batch(
  p_batch_id uuid,
  p_protein_id uuid,
  p_gross_kg numeric,
  p_net_kg numeric,
  p_shift text,
  p_responsible text,
  p_notes text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_batch public.batches%rowtype;
  next_cost numeric(10, 2);
  next_yield numeric(6, 3);
  next_real_cost numeric(10, 2);
  clean_responsible text;
  clean_notes text;
  clean_reason text;
  before_snapshot jsonb;
  after_snapshot jsonb;
  fields_changed text[];
begin
  if public.current_user_role() not in ('admin', 'gestor') then
    raise exception 'Sem permissão para editar lotes.' using errcode = '42501';
  end if;

  clean_reason := btrim(coalesce(p_reason, ''));
  if length(clean_reason) < 3 then
    raise exception 'Informe uma justificativa com pelo menos 3 caracteres.' using errcode = '22023';
  end if;

  select *
  into previous_batch
  from public.batches
  where id = p_batch_id
    and account_id = public.current_user_account_id()
  for update;

  if not found then
    raise exception 'Lote não encontrado.' using errcode = 'P0002';
  end if;

  if previous_batch.voided_at is not null then
    raise exception 'Um lote anulado não pode ser editado.' using errcode = '22023';
  end if;

  if p_gross_kg is null or p_gross_kg <= 0
    or p_net_kg is null or p_net_kg <= 0 or p_net_kg > p_gross_kg then
    raise exception 'Confira o peso bruto e o peso líquido.' using errcode = '22023';
  end if;

  if p_shift not in ('manha', 'tarde') then
    raise exception 'Turno inválido.' using errcode = '22023';
  end if;

  clean_responsible := btrim(coalesce(p_responsible, ''));
  clean_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if length(clean_responsible) = 0 then
    raise exception 'Informe o responsável.' using errcode = '22023';
  elsif lower(clean_responsible) = 'outro' then
    if clean_notes is null or length(clean_notes) < 3 then
      raise exception 'Informe o responsável nas observações.' using errcode = '22023';
    end if;
  elsif clean_responsible <> previous_batch.responsible and not exists (
    select 1
    from public.production_responsibles
    where lower(btrim(name)) = lower(clean_responsible)
      and account_id = previous_batch.account_id
  ) then
    raise exception 'Responsável não cadastrado.' using errcode = '22023';
  end if;

  if p_protein_id = previous_batch.protein_id then
    next_cost := previous_batch.protein_cost_snapshot;
  else
    select cost
    into next_cost
    from public.proteins
    where id = p_protein_id
      and active = true
      and account_id = previous_batch.account_id;

    if next_cost is null then
      raise exception 'Proteína não encontrada ou inativa.' using errcode = '22023';
    end if;
  end if;

  next_yield := (p_net_kg / p_gross_kg) * 100;
  if next_yield <= 0 then
    raise exception 'O rendimento calculado é menor que a precisão permitida.' using errcode = '22023';
  end if;
  next_real_cost := next_cost / (next_yield / 100);

  before_snapshot := jsonb_build_object(
    'protein_id', previous_batch.protein_id,
    'gross_kg', previous_batch.gross_kg,
    'net_kg', previous_batch.net_kg,
    'yield_pct', previous_batch.yield_pct,
    'protein_cost_snapshot', previous_batch.protein_cost_snapshot,
    'real_cost_kg', previous_batch.real_cost_kg,
    'shift', previous_batch.shift,
    'responsible', previous_batch.responsible,
    'notes', previous_batch.notes
  );
  after_snapshot := jsonb_build_object(
    'protein_id', p_protein_id,
    'gross_kg', p_gross_kg,
    'net_kg', p_net_kg,
    'yield_pct', next_yield,
    'protein_cost_snapshot', next_cost,
    'real_cost_kg', next_real_cost,
    'shift', p_shift,
    'responsible', clean_responsible,
    'notes', clean_notes
  );

  select coalesce(array_agg(entry.key order by entry.key), array[]::text[])
  into fields_changed
  from jsonb_each(before_snapshot) as entry
  where entry.value is distinct from after_snapshot -> entry.key;

  if cardinality(fields_changed) = 0 then
    raise exception 'Nenhuma alteração foi informada.' using errcode = '22023';
  end if;

  perform pg_catalog.set_config('app.batch_edit_authorized', 'true', true);

  update public.batches
  set
    protein_id = p_protein_id,
    gross_kg = p_gross_kg,
    net_kg = p_net_kg,
    yield_pct = next_yield,
    protein_cost_snapshot = next_cost,
    real_cost_kg = next_real_cost,
    shift = p_shift,
    responsible = clean_responsible,
    notes = clean_notes
  where id = p_batch_id;

  insert into public.batch_edit_logs (
    batch_id,
    edited_by,
    reason,
    changed_fields,
    before_data,
    after_data,
    account_id
  ) values (
    p_batch_id,
    auth.uid(),
    clean_reason,
    fields_changed,
    before_snapshot,
    after_snapshot,
    previous_batch.account_id
  );
end;
$$;

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
    and voided_at is null
    and account_id = public.current_user_account_id();

  if not found then
    raise exception 'Lote não encontrado ou já anulado.' using errcode = 'P0002';
  end if;
end;
$$;

-- 10. set_user_role / set_user_enabled: só afetam usuários da própria conta -

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
  where id = p_user_id
    and account_id = public.current_user_account_id();

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
  where id = p_user_id
    and account_id = public.current_user_account_id();

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

-- 11. RLS: accounts / subscriptions ---------------------------------------

alter table public.accounts enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own"
on public.accounts for select
to authenticated
using (id = public.current_user_account_id());

drop policy if exists "subscriptions_select_own_account" on public.subscriptions;
create policy "subscriptions_select_own_account"
on public.subscriptions for select
to authenticated
using (account_id = public.current_user_account_id());

revoke all on public.accounts from anon, authenticated;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.accounts to authenticated;
grant select on public.subscriptions to authenticated;

-- 12. RLS: re-escopa as políticas existentes por conta --------------------

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (
  auth.uid() = id
  or (public.current_user_role() = 'admin' and account_id = public.current_user_account_id())
);

drop policy if exists "responsibles_select_authenticated" on public.production_responsibles;
create policy "responsibles_select_authenticated"
on public.production_responsibles for select
to authenticated
using (public.current_user_role() is not null and account_id = public.current_user_account_id());

drop policy if exists "responsibles_insert_admin" on public.production_responsibles;
create policy "responsibles_insert_admin"
on public.production_responsibles for insert
to authenticated
with check (
  public.current_user_role() = 'admin'
  and created_by = auth.uid()
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "responsibles_delete_admin" on public.production_responsibles;
create policy "responsibles_delete_admin"
on public.production_responsibles for delete
to authenticated
using (public.current_user_role() = 'admin' and account_id = public.current_user_account_id());

drop policy if exists "proteins_select_authenticated" on public.proteins;
create policy "proteins_select_authenticated"
on public.proteins for select
to authenticated
using (public.current_user_role() is not null and account_id = public.current_user_account_id());

drop policy if exists "proteins_insert_managers" on public.proteins;
create policy "proteins_insert_managers"
on public.proteins for insert
to authenticated
with check (
  public.current_user_role() in ('admin', 'gestor')
  and created_by = auth.uid()
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "proteins_update_managers" on public.proteins;
create policy "proteins_update_managers"
on public.proteins for update
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id())
with check (
  public.current_user_role() in ('admin', 'gestor')
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "batches_select_authenticated" on public.batches;
create policy "batches_select_authenticated"
on public.batches for select
to authenticated
using (public.current_user_role() is not null and account_id = public.current_user_account_id());

drop policy if exists "batches_insert_operation" on public.batches;
create policy "batches_insert_operation"
on public.batches for insert
to authenticated
with check (
  public.current_user_role() in ('admin', 'gestor', 'operador')
  and created_by = auth.uid()
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "batch_edit_logs_select_managers" on public.batch_edit_logs;
create policy "batch_edit_logs_select_managers"
on public.batch_edit_logs for select
to authenticated
using (
  public.current_user_role() in ('admin', 'gestor')
  and account_id = public.current_user_account_id()
);

drop policy if exists "settings_select_authenticated" on public.app_settings;
create policy "settings_select_authenticated"
on public.app_settings for select
to authenticated
using (public.current_user_role() is not null and account_id = public.current_user_account_id());

drop policy if exists "settings_write_managers" on public.app_settings;
create policy "settings_write_managers"
on public.app_settings for all
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id())
with check (
  public.current_user_role() in ('admin', 'gestor')
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

-- 13. Views: filtram pela conta do usuário atual ---------------------------

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
where public.current_user_role() is not null
  and account_id = public.current_user_account_id();

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
where public.current_user_role() is not null
  and account_id = public.current_user_account_id();

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
  and account_id = public.current_user_account_id()
order by protein_id, recorded_at desc;

create or replace view public.batch_edit_logs_for_current_user
with (security_barrier = true)
as
select
  log.id,
  log.batch_id,
  log.edited_by,
  coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    'Usuário removido'
  ) as editor_name,
  log.reason,
  log.changed_fields,
  log.before_data,
  log.after_data,
  log.edited_at
from public.batch_edit_logs as log
left join public.profiles as profile on profile.id = log.edited_by
where public.current_user_role() in ('admin', 'gestor')
  and log.account_id = public.current_user_account_id();

commit;
