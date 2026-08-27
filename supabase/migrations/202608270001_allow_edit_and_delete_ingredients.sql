-- Permite editar o nome de um ingrediente (antes só cost/target_yield/
-- active/category/unit/min_stock_kg eram graváveis) e restaura a
-- permissão de excluir, removida em algum momento anterior. A exclusão
-- continua protegida pelas foreign keys `on delete restrict` em
-- batches, recipe_items e stock_movements: só é possível excluir um
-- ingrediente que nunca teve lote, ficha técnica ou movimentação
-- registrados contra ele.

begin;

grant update (name, cost, target_yield, active, category, unit, min_stock_kg) on public.proteins to authenticated;

drop policy if exists "proteins_delete_managers" on public.proteins;
create policy "proteins_delete_managers"
on public.proteins for delete
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id());

grant delete on public.proteins to authenticated;

commit;
