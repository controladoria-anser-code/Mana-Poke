create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'operador' check (role in ('admin', 'gestor', 'operador', 'viewer')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.proteins (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  slug text not null,
  name text not null,
  category text not null default 'proteinas'
    check (category in ('proteinas', 'carboidrato', 'hortifruti', 'secos_graos', 'laticinios', 'bebidas_insumos', 'outros')),
  unit text not null default 'kg' check (unit in ('kg', 'g', 'l', 'ml', 'un')),
  cost numeric(10, 2) check (cost is null or cost > 0),
  target_yield numeric(5, 2) check (target_yield is null or (target_yield > 0 and target_yield <= 100)),
  min_stock_kg numeric(10, 3),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint proteins_account_slug_unique unique (account_id, slug)
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  protein_id uuid not null references public.proteins(id) on delete restrict,
  gross_qty numeric(10, 3) not null check (gross_qty > 0),
  net_qty numeric(10, 3) not null check (net_qty > 0 and net_qty <= gross_qty),
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

create table if not exists public.batch_edit_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete restrict,
  edited_by uuid references auth.users(id) on delete set null,
  reason text not null check (length(btrim(reason)) >= 3),
  changed_fields text[] not null check (cardinality(changed_fields) > 0),
  before_data jsonb not null,
  after_data jsonb not null,
  edited_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  account_id uuid not null references public.accounts(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, key)
);

create table if not exists public.production_responsibles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
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

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  target_markup numeric(5, 2) not null default 3 check (target_markup > 0),
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  protein_id uuid not null references public.proteins(id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity > 0)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  protein_id uuid not null references public.proteins(id) on delete restrict,
  movement_type text not null check (movement_type in ('entrada', 'saida', 'ajuste')),
  quantity numeric(10, 3) not null check (quantity <> 0),
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists production_responsibles_account_name_unique
  on public.production_responsibles (account_id, lower(btrim(name)));
create index if not exists recipe_items_recipe_id_idx
  on public.recipe_items (recipe_id);
create index if not exists stock_movements_protein_id_idx
  on public.stock_movements (protein_id, created_at desc);
create index if not exists batches_recorded_at_idx
  on public.batches (recorded_at desc);
create index if not exists batches_account_recorded_at_idx
  on public.batches (account_id, recorded_at desc);
create index if not exists batches_protein_recorded_at_idx
  on public.batches (protein_id, recorded_at desc)
  where voided_at is null;
create index if not exists batch_edit_logs_batch_edited_at_idx
  on public.batch_edit_logs (batch_id, edited_at desc);
create index if not exists proteins_active_name_idx
  on public.proteins (active, name);
create unique index if not exists subscriptions_account_id_unique on public.subscriptions (account_id);
create unique index if not exists subscriptions_stripe_subscription_id_unique
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

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

-- Os defaults abaixo só podem ser criados depois que current_user_account_id()
-- existe; é isso que faz `insert` do cliente preencher account_id sozinho,
-- no mesmo padrão de `created_by default auth.uid()`.
alter table public.proteins alter column account_id set default public.current_user_account_id();
alter table public.batches alter column account_id set default public.current_user_account_id();
alter table public.batch_edit_logs alter column account_id set default public.current_user_account_id();
alter table public.production_responsibles alter column account_id set default public.current_user_account_id();
alter table public.app_settings alter column account_id set default public.current_user_account_id();
alter table public.recipes alter column account_id set default public.current_user_account_id();
alter table public.recipe_items alter column account_id set default public.current_user_account_id();
alter table public.stock_movements alter column account_id set default public.current_user_account_id();

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
  new.account_id = public.current_user_account_id();

  select cost
  into protein_cost
  from public.proteins
  where id = new.protein_id
    and active = true
    and account_id = new.account_id;

  if protein_cost is null then
    raise exception 'Item não encontrado, inativo ou sem custo definido.';
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

  new.yield_pct = (new.net_qty / new.gross_qty) * 100;
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
    new.recorded_at,
    new.created_by
  ) is distinct from row(
    old.id,
    old.recorded_at,
    old.created_by
  ) then
    raise exception 'Identificação, data e autor original do lote não podem ser alterados.';
  end if;

  if row(
    new.protein_id,
    new.gross_qty,
    new.net_qty,
    new.yield_pct,
    new.protein_cost_snapshot,
    new.real_cost_kg,
    new.shift,
    new.responsible,
    new.notes
  ) is distinct from row(
    old.protein_id,
    old.gross_qty,
    old.net_qty,
    old.yield_pct,
    old.protein_cost_snapshot,
    old.real_cost_kg,
    old.shift,
    old.responsible,
    old.notes
  ) and (
    coalesce(pg_catalog.current_setting('app.batch_edit_authorized', true), '') <> 'true'
    or public.current_user_role() not in ('admin', 'gestor')
  ) then
    raise exception 'Lotes somente podem ser editados pela operação auditável.' using errcode = '42501';
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

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists set_recipes_updated_at on public.recipes;
create trigger set_recipes_updated_at
  before update on public.recipes
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
    and voided_at is null
    and account_id = public.current_user_account_id();

  if not found then
    raise exception 'Lote não encontrado ou já anulado.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.edit_batch(
  p_batch_id uuid,
  p_protein_id uuid,
  p_gross_qty numeric,
  p_net_qty numeric,
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

  if p_gross_qty is null or p_gross_qty <= 0
    or p_net_qty is null or p_net_qty <= 0 or p_net_qty > p_gross_qty then
    raise exception 'Confira a quantidade bruta e a quantidade líquida.' using errcode = '22023';
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
      raise exception 'Item não encontrado, inativo ou sem custo definido.' using errcode = '22023';
    end if;
  end if;

  next_yield := (p_net_qty / p_gross_qty) * 100;
  if next_yield <= 0 then
    raise exception 'O rendimento calculado é menor que a precisão permitida.' using errcode = '22023';
  end if;
  next_real_cost := next_cost / (next_yield / 100);

  before_snapshot := jsonb_build_object(
    'protein_id', previous_batch.protein_id,
    'gross_qty', previous_batch.gross_qty,
    'net_qty', previous_batch.net_qty,
    'yield_pct', previous_batch.yield_pct,
    'protein_cost_snapshot', previous_batch.protein_cost_snapshot,
    'real_cost_kg', previous_batch.real_cost_kg,
    'shift', previous_batch.shift,
    'responsible', previous_batch.responsible,
    'notes', previous_batch.notes
  );
  after_snapshot := jsonb_build_object(
    'protein_id', p_protein_id,
    'gross_qty', p_gross_qty,
    'net_qty', p_net_qty,
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
    gross_qty = p_gross_qty,
    net_qty = p_net_qty,
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

alter table public.accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.profiles enable row level security;
alter table public.proteins enable row level security;
alter table public.batches enable row level security;
alter table public.batch_edit_logs enable row level security;
alter table public.app_settings enable row level security;
alter table public.production_responsibles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.stock_movements enable row level security;

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

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (
  auth.uid() = id
  or (public.current_user_role() = 'admin' and account_id = public.current_user_account_id())
);

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

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

drop policy if exists "proteins_delete_managers" on public.proteins;
create policy "proteins_delete_managers"
on public.proteins for delete
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id());

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

drop policy if exists "batches_update_managers" on public.batches;
drop policy if exists "batches_delete_managers" on public.batches;

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

drop policy if exists "recipes_select_managers" on public.recipes;
create policy "recipes_select_managers"
on public.recipes for select
to authenticated
using (account_id = public.current_user_account_id() and public.current_user_can_view_costs());

drop policy if exists "recipes_insert_managers" on public.recipes;
create policy "recipes_insert_managers"
on public.recipes for insert
to authenticated
with check (
  public.current_user_role() in ('admin', 'gestor')
  and created_by = auth.uid()
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "recipes_update_managers" on public.recipes;
create policy "recipes_update_managers"
on public.recipes for update
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id())
with check (
  public.current_user_role() in ('admin', 'gestor')
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "recipes_delete_managers" on public.recipes;
create policy "recipes_delete_managers"
on public.recipes for delete
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id());

drop policy if exists "recipe_items_select_managers" on public.recipe_items;
create policy "recipe_items_select_managers"
on public.recipe_items for select
to authenticated
using (account_id = public.current_user_account_id() and public.current_user_can_view_costs());

drop policy if exists "recipe_items_write_managers" on public.recipe_items;
create policy "recipe_items_write_managers"
on public.recipe_items for all
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id())
with check (
  public.current_user_role() in ('admin', 'gestor')
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "stock_movements_select_authenticated" on public.stock_movements;
create policy "stock_movements_select_authenticated"
on public.stock_movements for select
to authenticated
using (account_id = public.current_user_account_id() and public.current_user_role() is not null);

drop policy if exists "stock_movements_insert_managers" on public.stock_movements;
create policy "stock_movements_insert_managers"
on public.stock_movements for insert
to authenticated
with check (
  public.current_user_role() in ('admin', 'gestor')
  and created_by = auth.uid()
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "stock_movements_delete_managers" on public.stock_movements;
create policy "stock_movements_delete_managers"
on public.stock_movements for delete
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id());

create or replace view public.proteins_for_current_user
with (security_barrier = true)
as
select
  id,
  slug,
  name,
  category,
  unit,
  min_stock_kg,
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
  gross_qty,
  net_qty,
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
  gross_qty,
  net_qty,
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

create or replace view public.recipes_for_current_user
with (security_barrier = true)
as
select id, name, target_markup, notes, active, created_at
from public.recipes
where account_id = public.current_user_account_id()
  and public.current_user_can_view_costs();

create or replace view public.recipe_items_for_current_user
with (security_barrier = true)
as
select
  ri.id,
  ri.recipe_id,
  ri.protein_id,
  p.name as protein_name,
  p.unit as protein_unit,
  ri.quantity,
  p.cost as protein_cost,
  p.target_yield as protein_target_yield
from public.recipe_items ri
join public.proteins p on p.id = ri.protein_id
where ri.account_id = public.current_user_account_id()
  and public.current_user_can_view_costs();

create or replace view public.stock_levels_for_current_user
with (security_barrier = true)
as
select
  p.id as item_id,
  p.name,
  p.category,
  p.unit,
  p.min_stock_kg as min_stock,
  coalesce(m.on_hand, 0) as on_hand,
  case
    when p.min_stock_kg is null then 'sem_meta'
    when coalesce(m.on_hand, 0) <= 0 then 'out'
    when coalesce(m.on_hand, 0) < p.min_stock_kg then 'low'
    else 'ok'
  end as status
from public.proteins p
left join (
  select protein_id, sum(quantity) as on_hand
  from public.stock_movements
  where account_id = public.current_user_account_id()
  group by protein_id
) m on m.protein_id = p.id
where p.account_id = public.current_user_account_id()
  and p.active = true
  and public.current_user_role() is not null;

create or replace view public.stock_movements_for_current_user
with (security_barrier = true)
as
select
  sm.id,
  p.id as item_id,
  p.name as item_name,
  p.category,
  p.unit,
  sm.movement_type,
  sm.quantity,
  sm.note,
  sm.created_by,
  sm.created_at
from public.stock_movements sm
join public.proteins p on p.id = sm.protein_id
where sm.account_id = public.current_user_account_id()
  and public.current_user_role() is not null
order by sm.created_at desc;

revoke all on public.accounts from anon, authenticated;
revoke all on public.subscriptions from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.proteins from anon, authenticated;
revoke all on public.batches from anon, authenticated;
revoke all on public.batch_edit_logs from public, anon, authenticated;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.production_responsibles from anon, authenticated;
revoke all on public.proteins_for_current_user from anon, authenticated;
revoke all on public.batches_for_current_user from anon, authenticated;
revoke all on public.latest_batches_for_current_user from anon, authenticated;
revoke all on public.batch_edit_logs_for_current_user from public, anon, authenticated;
revoke all on public.recipes from anon, authenticated;
revoke all on public.recipe_items from anon, authenticated;
revoke all on public.stock_movements from anon, authenticated;
revoke all on public.recipes_for_current_user from anon, authenticated;
revoke all on public.recipe_items_for_current_user from anon, authenticated;
revoke all on public.stock_levels_for_current_user from anon, authenticated;
revoke all on public.stock_movements_for_current_user from anon, authenticated;

grant select on public.accounts to authenticated;
grant select on public.subscriptions to authenticated;

grant select on public.profiles to authenticated;

grant select (id, slug, name, category, unit, active, created_at, min_stock_kg) on public.proteins to authenticated;
grant insert (slug, name, category, unit, cost, target_yield, min_stock_kg) on public.proteins to authenticated;
grant update (name, cost, target_yield, active, category, unit, min_stock_kg) on public.proteins to authenticated;
grant delete on public.proteins to authenticated;

grant select (
  id,
  protein_id,
  gross_qty,
  net_qty,
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
grant insert (protein_id, gross_qty, net_qty, shift, responsible, notes) on public.batches to authenticated;

grant select on public.app_settings to authenticated;
grant insert (key, value) on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;

grant select on public.production_responsibles to authenticated;
grant insert (name) on public.production_responsibles to authenticated;
grant delete on public.production_responsibles to authenticated;

grant select on public.proteins_for_current_user to authenticated;
grant select on public.batches_for_current_user to authenticated;
grant select on public.latest_batches_for_current_user to authenticated;
grant select on public.batch_edit_logs_for_current_user to authenticated;

grant select (id, name, target_markup, notes, active, created_at) on public.recipes to authenticated;
grant insert (name, target_markup, notes) on public.recipes to authenticated;
grant update (name, target_markup, notes, active) on public.recipes to authenticated;
grant delete on public.recipes to authenticated;

grant select (id, recipe_id, protein_id, quantity) on public.recipe_items to authenticated;
grant insert (recipe_id, protein_id, quantity) on public.recipe_items to authenticated;
grant update (quantity) on public.recipe_items to authenticated;
grant delete on public.recipe_items to authenticated;

grant select (id, protein_id, movement_type, quantity, note, created_at) on public.stock_movements to authenticated;
grant insert (protein_id, movement_type, quantity, note) on public.stock_movements to authenticated;
grant delete on public.stock_movements to authenticated;

grant select on public.recipes_for_current_user to authenticated;
grant select on public.recipe_items_for_current_user to authenticated;
grant select on public.stock_levels_for_current_user to authenticated;
grant select on public.stock_movements_for_current_user to authenticated;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.current_user_account_id() from public, anon;
revoke all on function public.account_has_access(uuid) from public, anon;
revoke all on function public.current_user_can_view_costs() from public, anon, authenticated;
revoke all on function public.current_user_can_view_targets() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_batch_calculated_fields() from public, anon, authenticated;
revoke all on function public.protect_batch_immutable_fields() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.void_batch(uuid, text) from public, anon;
revoke all on function public.edit_batch(uuid, uuid, numeric, numeric, text, text, text, text) from public, anon;
revoke all on function public.set_user_role(uuid, text) from public, anon;
revoke all on function public.set_user_enabled(uuid, boolean) from public, anon;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_account_id() to authenticated;
grant execute on function public.account_has_access(uuid) to authenticated;
grant execute on function public.current_user_can_view_costs() to authenticated;
grant execute on function public.current_user_can_view_targets() to authenticated;
grant execute on function public.void_batch(uuid, text) to authenticated;
grant execute on function public.edit_batch(uuid, uuid, numeric, numeric, text, text, text, text) to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.set_user_enabled(uuid, boolean) to authenticated;
