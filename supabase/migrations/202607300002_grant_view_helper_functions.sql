-- Corrige as permissões das funções auxiliares chamadas pelas views da aplicação.
-- As funções expõem apenas decisões booleanas baseadas no perfil autenticado.

reset role;

begin;

revoke all on function public.current_user_can_view_costs() from public, anon;
revoke all on function public.current_user_can_view_targets() from public, anon;

grant execute on function public.current_user_can_view_costs() to authenticated;
grant execute on function public.current_user_can_view_targets() to authenticated;

commit;
