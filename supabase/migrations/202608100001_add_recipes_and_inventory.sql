-- Adiciona fichas técnicas (receitas com custo calculado) e controle de
-- estoque. Segue exatamente o mesmo padrão de isolamento por conta e RLS
-- já usado em proteins/batches: account_id com default via
-- current_user_account_id(), políticas escopadas por conta, escrita
-- condicionada a account_has_access(). Estoque é um livro-razão
-- (stock_movements) somente-inserção — o saldo é sempre a soma dos
-- movimentos, nunca um contador separado que pode dessincronizar.

reset role;

begin;

-- 1. Meta de estoque mínimo por proteína ----------------------------------

alter table public.proteins
  add column if not exists min_stock_kg numeric(10, 3);

-- 2. Fichas técnicas --------------------------------------------------------

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade
    default public.current_user_account_id(),
  name text not null check (length(btrim(name)) > 0),
  target_markup numeric(5, 2) not null default 3 check (target_markup > 0),
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_recipes_updated_at on public.recipes;
create trigger set_recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade
    default public.current_user_account_id(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  protein_id uuid not null references public.proteins(id) on delete restrict,
  quantity_kg numeric(10, 3) not null check (quantity_kg > 0)
);

create index if not exists recipe_items_recipe_id_idx on public.recipe_items (recipe_id);

-- 3. Estoque (livro-razão de movimentos) ------------------------------------

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade
    default public.current_user_account_id(),
  protein_id uuid not null references public.proteins(id) on delete restrict,
  movement_type text not null check (movement_type in ('entrada', 'saida', 'ajuste')),
  quantity_kg numeric(10, 3) not null check (quantity_kg <> 0),
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_protein_id_idx on public.stock_movements (protein_id, created_at desc);

-- 4. RLS ---------------------------------------------------------------------

alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.stock_movements enable row level security;

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

-- 5. Views ---------------------------------------------------------------

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
  ri.quantity_kg,
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
  p.id as protein_id,
  p.name as protein_name,
  p.min_stock_kg,
  coalesce(m.on_hand_kg, 0) as on_hand_kg,
  case
    when p.min_stock_kg is null then 'sem_meta'
    when coalesce(m.on_hand_kg, 0) <= 0 then 'out'
    when coalesce(m.on_hand_kg, 0) < p.min_stock_kg then 'low'
    else 'ok'
  end as status
from public.proteins p
left join (
  select protein_id, sum(quantity_kg) as on_hand_kg
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
  sm.protein_id,
  p.name as protein_name,
  sm.movement_type,
  sm.quantity_kg,
  sm.note,
  sm.created_by,
  sm.created_at
from public.stock_movements sm
join public.proteins p on p.id = sm.protein_id
where sm.account_id = public.current_user_account_id()
  and public.current_user_role() is not null
order by sm.created_at desc;

-- 6. Privilégios -----------------------------------------------------------

revoke all on public.recipes from anon, authenticated;
revoke all on public.recipe_items from anon, authenticated;
revoke all on public.stock_movements from anon, authenticated;
revoke all on public.recipes_for_current_user from anon, authenticated;
revoke all on public.recipe_items_for_current_user from anon, authenticated;
revoke all on public.stock_levels_for_current_user from anon, authenticated;
revoke all on public.stock_movements_for_current_user from anon, authenticated;

grant select (id, name, target_markup, notes, active, created_at) on public.recipes to authenticated;
grant insert (name, target_markup, notes) on public.recipes to authenticated;
grant update (name, target_markup, notes, active) on public.recipes to authenticated;
grant delete on public.recipes to authenticated;

grant select (id, recipe_id, protein_id, quantity_kg) on public.recipe_items to authenticated;
grant insert (recipe_id, protein_id, quantity_kg) on public.recipe_items to authenticated;
grant update (quantity_kg) on public.recipe_items to authenticated;
grant delete on public.recipe_items to authenticated;

grant select (id, protein_id, movement_type, quantity_kg, note, created_at) on public.stock_movements to authenticated;
grant insert (protein_id, movement_type, quantity_kg, note) on public.stock_movements to authenticated;

grant select (min_stock_kg) on public.proteins to authenticated;
grant update (min_stock_kg) on public.proteins to authenticated;

grant select on public.recipes_for_current_user to authenticated;
grant select on public.recipe_items_for_current_user to authenticated;
grant select on public.stock_levels_for_current_user to authenticated;
grant select on public.stock_movements_for_current_user to authenticated;

commit;
