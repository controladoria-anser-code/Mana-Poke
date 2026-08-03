-- Permite correções auditáveis de lotes por gestores e administradores.
-- A edição continua bloqueada diretamente: o cliente usa apenas a RPC edit_batch.

reset role;

begin;

create table if not exists public.batch_edit_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete restrict,
  edited_by uuid references auth.users(id) on delete set null,
  reason text not null check (length(btrim(reason)) >= 3),
  changed_fields text[] not null check (cardinality(changed_fields) > 0),
  before_data jsonb not null,
  after_data jsonb not null,
  edited_at timestamptz not null default now()
);

create index if not exists batch_edit_logs_batch_edited_at_idx
  on public.batch_edit_logs (batch_id, edited_at desc);

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
    new.gross_kg,
    new.net_kg,
    new.yield_pct,
    new.protein_cost_snapshot,
    new.real_cost_kg,
    new.shift,
    new.responsible,
    new.notes
  ) is distinct from row(
    old.protein_id,
    old.gross_kg,
    old.net_kg,
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
      and active = true;

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
    after_data
  ) values (
    p_batch_id,
    auth.uid(),
    clean_reason,
    fields_changed,
    before_snapshot,
    after_snapshot
  );
end;
$$;

alter table public.batch_edit_logs enable row level security;

drop policy if exists "batch_edit_logs_select_managers" on public.batch_edit_logs;
create policy "batch_edit_logs_select_managers"
on public.batch_edit_logs for select
to authenticated
using (public.current_user_role() in ('admin', 'gestor'));

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
where public.current_user_role() in ('admin', 'gestor');

revoke all on public.batch_edit_logs from public, anon, authenticated;
revoke all on public.batch_edit_logs_for_current_user from public, anon, authenticated;
grant select on public.batch_edit_logs_for_current_user to authenticated;

revoke all on function public.edit_batch(uuid, uuid, numeric, numeric, text, text, text, text)
  from public, anon;
grant execute on function public.edit_batch(uuid, uuid, numeric, numeric, text, text, text, text)
  to authenticated;

commit;
