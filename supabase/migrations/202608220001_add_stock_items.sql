-- Generaliza o estoque para aceitar itens não-proteicos (hortifruti, secos e
-- grãos, laticínios, bebidas e insumos, outros), além das proteínas já
-- monitoradas. O livro-razão (stock_movements) passa a aceitar um item de
-- QUALQUER uma das duas origens por linha (nunca as duas, nunca nenhuma),
-- mantendo o mesmo princípio já usado para proteínas: saldo é sempre soma
-- dos movimentos, nunca um contador separado que pode dessincronizar.

reset role;

begin;

-- 1. Itens de estoque não-proteicos -----------------------------------------

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade
    default public.current_user_account_id(),
  name text not null check (length(btrim(name)) > 0),
  category text not null default 'outros'
    check (category in ('hortifruti', 'secos_graos', 'laticinios', 'bebidas_insumos', 'outros')),
  unit text not null default 'kg' check (unit in ('kg', 'g', 'l', 'ml', 'un')),
  min_stock numeric(10, 3) check (min_stock is null or min_stock >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- 2. Generaliza o livro-razão de movimentos ----------------------------------

alter table public.stock_movements
  alter column protein_id drop not null;

alter table public.stock_movements
  add column if not exists stock_item_id uuid references public.stock_items(id) on delete restrict;

alter table public.stock_movements rename column quantity_kg to quantity;

alter table public.stock_movements
  drop constraint if exists stock_movements_item_ref_check;
alter table public.stock_movements
  add constraint stock_movements_item_ref_check check (
    (protein_id is not null and stock_item_id is null)
    or (protein_id is null and stock_item_id is not null)
  );

create index if not exists stock_movements_stock_item_id_idx
  on public.stock_movements (stock_item_id, created_at desc);

alter table public.stock_items alter column account_id set default public.current_user_account_id();

-- 3. RLS ---------------------------------------------------------------------

alter table public.stock_items enable row level security;

drop policy if exists "stock_items_select_authenticated" on public.stock_items;
create policy "stock_items_select_authenticated"
on public.stock_items for select
to authenticated
using (account_id = public.current_user_account_id() and public.current_user_role() is not null);

drop policy if exists "stock_items_insert_managers" on public.stock_items;
create policy "stock_items_insert_managers"
on public.stock_items for insert
to authenticated
with check (
  public.current_user_role() in ('admin', 'gestor')
  and created_by = auth.uid()
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

drop policy if exists "stock_items_update_managers" on public.stock_items;
create policy "stock_items_update_managers"
on public.stock_items for update
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id())
with check (
  public.current_user_role() in ('admin', 'gestor')
  and account_id = public.current_user_account_id()
  and public.account_has_access(account_id)
);

-- 4. Views ---------------------------------------------------------------
-- stock_levels_for_current_user e stock_movements_for_current_user mudam de
-- formato (colunas unificadas item_type/item_id/name/category/unit no lugar
-- de protein_id/protein_name), então precisam de drop antes do recreate —
-- create or replace view só aceita adicionar colunas, nunca renomear.

drop view if exists public.stock_levels_for_current_user;
drop view if exists public.stock_movements_for_current_user;

create or replace view public.stock_items_for_current_user
with (security_barrier = true)
as
select id, name, category, unit, min_stock, active, created_at
from public.stock_items
where account_id = public.current_user_account_id();

create view public.stock_levels_for_current_user
with (security_barrier = true)
as
select
  'protein'::text as item_type,
  p.id as item_id,
  p.name,
  'proteinas'::text as category,
  'kg'::text as unit,
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
  where account_id = public.current_user_account_id() and protein_id is not null
  group by protein_id
) m on m.protein_id = p.id
where p.account_id = public.current_user_account_id()
  and p.active = true
  and public.current_user_role() is not null
union all
select
  'item'::text as item_type,
  si.id as item_id,
  si.name,
  si.category,
  si.unit,
  si.min_stock,
  coalesce(m.on_hand, 0) as on_hand,
  case
    when si.min_stock is null then 'sem_meta'
    when coalesce(m.on_hand, 0) <= 0 then 'out'
    when coalesce(m.on_hand, 0) < si.min_stock then 'low'
    else 'ok'
  end as status
from public.stock_items si
left join (
  select stock_item_id, sum(quantity) as on_hand
  from public.stock_movements
  where account_id = public.current_user_account_id() and stock_item_id is not null
  group by stock_item_id
) m on m.stock_item_id = si.id
where si.account_id = public.current_user_account_id()
  and si.active = true
  and public.current_user_role() is not null;

create view public.stock_movements_for_current_user
with (security_barrier = true)
as
select
  sm.id,
  coalesce(p.id, si.id) as item_id,
  case when sm.protein_id is not null then 'protein' else 'item' end as item_type,
  coalesce(p.name, si.name) as item_name,
  coalesce(si.category, 'proteinas') as category,
  coalesce(si.unit, 'kg') as unit,
  sm.movement_type,
  sm.quantity,
  sm.note,
  sm.created_by,
  sm.created_at
from public.stock_movements sm
left join public.proteins p on p.id = sm.protein_id
left join public.stock_items si on si.id = sm.stock_item_id
where sm.account_id = public.current_user_account_id()
  and public.current_user_role() is not null
order by sm.created_at desc;

-- 5. Privilégios -------------------------------------------------------------

revoke all on public.stock_items from anon, authenticated;
revoke all on public.stock_items_for_current_user from anon, authenticated;
revoke all on public.stock_levels_for_current_user from anon, authenticated;
revoke all on public.stock_movements_for_current_user from anon, authenticated;

grant select (id, name, category, unit, min_stock, active, created_at) on public.stock_items to authenticated;
grant insert (name, category, unit, min_stock) on public.stock_items to authenticated;
grant update (name, category, unit, min_stock, active) on public.stock_items to authenticated;

grant select (id, protein_id, stock_item_id, movement_type, quantity, note, created_at) on public.stock_movements to authenticated;
grant insert (protein_id, stock_item_id, movement_type, quantity, note) on public.stock_movements to authenticated;

grant select on public.stock_items_for_current_user to authenticated;
grant select on public.stock_levels_for_current_user to authenticated;
grant select on public.stock_movements_for_current_user to authenticated;

commit;
