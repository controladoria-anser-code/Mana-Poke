-- Corrige um esquecimento da migração anterior (202608230002): o rename de
-- `batches.gross_kg`/`net_kg` para `gross_qty`/`net_qty` foi feito na tabela,
-- mas `batches_for_current_user` e `latest_batches_for_current_user` nunca
-- foram recriadas. O Postgres preserva o nome de saída antigo como um alias
-- implícito quando uma coluna referenciada por uma view é renomeada — ou
-- seja, essas duas views continuavam devolvendo `gross_kg`/`net_kg` (com o
-- valor certo, mas o NOME errado), fazendo o frontend receber `undefined`
-- nesses campos e todo cálculo de rendimento virar NaN.

reset role;

begin;

drop view if exists public.batches_for_current_user;
drop view if exists public.latest_batches_for_current_user;

create view public.batches_for_current_user
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

create view public.latest_batches_for_current_user
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

revoke all on public.batches_for_current_user from anon, authenticated;
revoke all on public.latest_batches_for_current_user from anon, authenticated;

grant select on public.batches_for_current_user to authenticated;
grant select on public.latest_batches_for_current_user to authenticated;

commit;
