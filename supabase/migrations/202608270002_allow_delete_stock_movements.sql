-- Permite excluir um movimento de estoque lançado por engano. Nada mais
-- referencia stock_movements como pai (é uma folha no schema), então a
-- exclusão não tem risco de quebrar histórico de outra tabela — o saldo
-- em estoque é sempre recalculado a partir da soma dos movimentos que
-- ainda existirem.

begin;

drop policy if exists "stock_movements_delete_managers" on public.stock_movements;
create policy "stock_movements_delete_managers"
on public.stock_movements for delete
to authenticated
using (public.current_user_role() in ('admin', 'gestor') and account_id = public.current_user_account_id());

grant delete on public.stock_movements to authenticated;

commit;
