import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(
  new URL('../supabase/migrations/202607300001_harden_history_and_access.sql', import.meta.url),
  'utf8',
)
const auditedEditMigration = readFileSync(
  new URL('../supabase/migrations/202608030001_enable_audited_batch_edits.sql', import.meta.url),
  'utf8',
)
const billingMigration = readFileSync(
  new URL('../supabase/migrations/202608030002_add_multi_tenant_billing.sql', import.meta.url),
  'utf8',
)

describe('contratos de segurança do schema', () => {
  it('cadastro público só vira admin da própria conta nova, nunca de uma conta existente', () => {
    // Sem account_id no metadata (cadastro público): cria uma conta nova e um trial, nunca reaproveita uma conta existente.
    expect(schema).toContain('insert into public.accounts (name, slug, trial_ends_at)')
    expect(schema).toContain("now() + interval '7 days'")
    // Só essa conta nova recebe o papel admin — quem é convidado (com account_id no metadata) não vira admin por padrão.
    expect(schema).toContain("meta_role := coalesce(new.raw_user_meta_data ->> 'role', 'operador');")
    expect(schema).toContain('and enabled = true')
    expect(schema).not.toContain('create policy "profiles_insert_own"')
  })

  it('isola dados por conta nas políticas, views e funções administrativas', () => {
    expect(schema).toContain('function public.current_user_account_id()')
    expect(schema).toContain('function public.account_has_access(p_account_id uuid)')
    // profiles: um admin só pode listar usuários da própria conta, nunca de outra.
    expect(schema).toContain(
      "auth.uid() = id\n  or (public.current_user_role() = 'admin' and account_id = public.current_user_account_id())",
    )
    // edit_batch/void_batch são security definer e bypassam RLS: precisam checar a conta manualmente.
    expect(schema).toContain('where id = p_batch_id\n    and account_id = public.current_user_account_id()')
    expect(schema).toContain('and account_id = public.current_user_account_id();\n\n  if not found then\n    raise exception \'Lote não encontrado ou já anulado.\'')
    // set_user_role/set_user_enabled: um admin não pode alterar usuário de outra conta.
    expect(schema).toContain('where id = p_user_id\n    and account_id = public.current_user_account_id();')
  })

  it('protege lotes contra edição direta e mantém proteínas sem cascade', () => {
    expect(schema).toContain('references public.proteins(id) on delete restrict')
    expect(schema).toContain('function public.protect_batch_immutable_fields()')
    expect(schema).toContain("current_setting('app.batch_edit_authorized', true)")
    expect(schema).toContain('function public.void_batch(p_batch_id uuid, p_reason text)')
    expect(schema).not.toContain('function public.refresh_batch_costs_after_protein_update()')
  })

  it('edita lotes apenas por RPC e registra antes/depois em log', () => {
    expect(schema).toContain('create table if not exists public.batch_edit_logs')
    expect(schema).toContain('function public.edit_batch(')
    expect(schema).toContain("public.current_user_role() not in ('admin', 'gestor')")
    expect(schema).toContain('insert into public.batch_edit_logs')
    expect(schema).toContain('before_snapshot')
    expect(schema).toContain('after_snapshot')
    expect(schema).toContain('grant execute on function public.edit_batch(')
  })

  it('limita colunas graváveis pelo cliente', () => {
    expect(schema).toContain(
      'grant insert (protein_id, gross_qty, net_qty, shift, responsible, notes) on public.batches to authenticated;',
    )
    expect(schema).not.toContain('grant update (yield_pct')
    expect(schema).not.toContain('grant delete on public.batches')
  })

  it('permite executar as funções auxiliares usadas pelas views', () => {
    expect(schema).toContain(
      'grant execute on function public.current_user_can_view_costs() to authenticated;',
    )
    expect(schema).toContain(
      'grant execute on function public.current_user_can_view_targets() to authenticated;',
    )
  })
})

describe('migração da instalação existente', () => {
  it('preenche o custo congelado antes de torná-lo obrigatório', () => {
    const backfillPosition = migration.indexOf('protein_cost_snapshot = protein.cost')
    const notNullPosition = migration.indexOf('alter column protein_cost_snapshot set not null')

    expect(backfillPosition).toBeGreaterThan(-1)
    expect(notNullPosition).toBeGreaterThan(backfillPosition)
  })


  it('inclui a edição auditável sem liberar update direto', () => {
    expect(auditedEditMigration).toContain('create table if not exists public.batch_edit_logs')
    expect(auditedEditMigration).toContain('create or replace function public.edit_batch(')
    expect(auditedEditMigration).toContain('insert into public.batch_edit_logs')
    expect(auditedEditMigration).not.toContain('grant update on public.batches')
  })

  it('migra a conta existente para uma conta legada nunca bloqueada antes de exigir account_id', () => {
    const legacyInsertPosition = billingMigration.indexOf(
      "values ('Mana Poke', 'mana-poke-legacy', null)",
    )
    const backfillPosition = billingMigration.indexOf(
      "update public.profiles\nset account_id = (select id from public.accounts where slug = 'mana-poke-legacy')",
    )
    const notNullPosition = billingMigration.indexOf('alter table public.profiles alter column account_id set not null')

    expect(legacyInsertPosition).toBeGreaterThan(-1)
    expect(backfillPosition).toBeGreaterThan(legacyInsertPosition)
    expect(notNullPosition).toBeGreaterThan(backfillPosition)
  })

  it('reescopa unicidade global (slug, responsável, app_settings) por conta', () => {
    expect(billingMigration).toContain('add constraint proteins_account_slug_unique unique (account_id, slug)')
    expect(billingMigration).toContain(
      'create unique index if not exists production_responsibles_account_name_unique',
    )
    expect(billingMigration).toContain('add constraint app_settings_pkey primary key (account_id, key)')
  })
})
