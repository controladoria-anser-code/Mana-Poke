-- Funde `stock_items` dentro de `proteins`, transformando a tabela num
-- cadastro de QUALQUER ingrediente de cozinha (não só proteína). Como
-- `batches.protein_id` e `recipe_items.protein_id` já são FKs pra
-- `proteins(id)`, a fusão dá de graça o maior ganho pedido: registrar lote
-- de produção (peso bruto/líquido, rendimento) e usar como ingrediente de
-- ficha técnica pra QUALQUER categoria, não só proteína.
--
-- `gross_kg`/`net_kg` (lotes) e `quantity_kg` (itens de ficha técnica) são
-- renomeados pra `gross_qty`/`net_qty`/`quantity` porque "kg" deixa de ser
-- verdade pra um item medido em litro ou unidade.

reset role;

begin;

-- 0. Derruba as views que dependem das colunas/tabelas que vamos alterar
-- (elas são recriadas no passo 6). Sem isso, o Postgres recusa o drop de
-- stock_item_id e da tabela stock_items mais abaixo.

drop view if exists public.stock_items_for_current_user;
drop view if exists public.stock_levels_for_current_user;
drop view if exists public.stock_movements_for_current_user;
drop view if exists public.recipe_items_for_current_user;
drop view if exists public.proteins_for_current_user;

-- 1. Relaxa proteins e adiciona categoria/unidade -----------------------

alter table public.proteins
  alter column cost drop not null,
  alter column target_yield drop not null;

alter table public.proteins
  drop constraint if exists proteins_cost_check;
alter table public.proteins
  add constraint proteins_cost_check check (cost is null or cost > 0);

alter table public.proteins
  drop constraint if exists proteins_target_yield_check;
alter table public.proteins
  add constraint proteins_target_yield_check check (
    target_yield is null or (target_yield > 0 and target_yield <= 100)
  );

alter table public.proteins
  add column if not exists category text not null default 'proteinas'
    check (category in ('proteinas', 'carboidrato', 'hortifruti', 'secos_graos', 'laticinios', 'bebidas_insumos', 'outros')),
  add column if not exists unit text not null default 'kg'
    check (unit in ('kg', 'g', 'l', 'ml', 'un'));

-- 2. Renomeia colunas que agora podem ser não-kg -------------------------

alter table public.batches rename column gross_kg to gross_qty;
alter table public.batches rename column net_kg to net_qty;
alter table public.recipe_items rename column quantity_kg to quantity;

-- 3. Migra stock_items para dentro de proteins ---------------------------
-- Preserva o id de propósito: assim o update de stock_movements abaixo não
-- precisa de um mapa de id antigo -> novo.

insert into public.proteins (
  id, account_id, slug, name, category, unit, min_stock_kg, active, created_by, created_at
)
select
  si.id, si.account_id, si.id::text, si.name, si.category, si.unit, si.min_stock, si.active, si.created_by, si.created_at
from public.stock_items si
where not exists (select 1 from public.proteins p where p.id = si.id);

-- 4. Generaliza stock_movements de volta pra uma única FK ----------------

update public.stock_movements
set protein_id = stock_item_id
where stock_item_id is not null;

alter table public.stock_movements
  drop constraint if exists stock_movements_item_ref_check;
alter table public.stock_movements
  drop column if exists stock_item_id;
alter table public.stock_movements
  alter column protein_id set not null;

drop index if exists public.stock_movements_stock_item_id_idx;

-- 5. Remove stock_items -----------------------------------------------

drop table if exists public.stock_items;

-- 6. Views ---------------------------------------------------------------
-- stock_levels_for_current_user, stock_movements_for_current_user e
-- recipe_items_for_current_user mudam de formato (sem mais union/coalesce
-- de duas origens; recipe_items ganha protein_unit) — já foram derrubadas
-- no passo 0, só falta recriar.

create view public.proteins_for_current_user
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

create view public.recipe_items_for_current_user
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

create view public.stock_levels_for_current_user
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

create view public.stock_movements_for_current_user
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

-- 7. Funções: gross_qty/net_qty no lugar de gross_kg/net_kg --------------

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

drop function if exists public.edit_batch(uuid, uuid, numeric, numeric, text, text, text, text);

create function public.edit_batch(
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

-- 8. Privilégios -------------------------------------------------------------
-- (stock_items e stock_items_for_current_user já foram removidos no passo 5
-- — dropar a tabela/view já revoga tudo, não precisa de revoke explícito.)

revoke all on public.proteins_for_current_user from anon, authenticated;
revoke all on public.recipe_items_for_current_user from anon, authenticated;
revoke all on public.stock_levels_for_current_user from anon, authenticated;
revoke all on public.stock_movements_for_current_user from anon, authenticated;

grant select (id, slug, name, category, unit, active, created_at, min_stock_kg) on public.proteins to authenticated;
grant insert (slug, name, category, unit, cost, target_yield, min_stock_kg) on public.proteins to authenticated;
grant update (cost, target_yield, active, category, unit, min_stock_kg) on public.proteins to authenticated;

grant select (id, protein_id, gross_qty, net_qty, yield_pct, shift, responsible, notes, recorded_at, created_by, voided_at, voided_by, void_reason, updated_at) on public.batches to authenticated;
grant insert (protein_id, gross_qty, net_qty, shift, responsible, notes) on public.batches to authenticated;

grant select (id, recipe_id, protein_id, quantity) on public.recipe_items to authenticated;
grant insert (recipe_id, protein_id, quantity) on public.recipe_items to authenticated;
grant update (quantity) on public.recipe_items to authenticated;

grant select (id, protein_id, movement_type, quantity, note, created_at) on public.stock_movements to authenticated;
grant insert (protein_id, movement_type, quantity, note) on public.stock_movements to authenticated;

grant select on public.proteins_for_current_user to authenticated;
grant select on public.recipe_items_for_current_user to authenticated;
grant select on public.stock_levels_for_current_user to authenticated;
grant select on public.stock_movements_for_current_user to authenticated;

revoke all on function public.edit_batch(uuid, uuid, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.edit_batch(uuid, uuid, numeric, numeric, text, text, text, text) to authenticated;

commit;
