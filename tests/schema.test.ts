import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(
  new URL('../supabase/migrations/202607300001_harden_history_and_access.sql', import.meta.url),
  'utf8',
)

describe('contratos de segurança do schema', () => {
  it('não promove automaticamente o primeiro cadastro', () => {
    expect(schema).toContain("new.raw_user_meta_data ->> 'full_name',\n    'operador'")
    expect(schema).toContain("'operador',\n    false")
    expect(schema).toContain('and enabled = true')
    expect(schema).not.toContain("then 'admin' else 'operador'")
    expect(schema).not.toContain('create policy "profiles_insert_own"')
  })

  it('mantém lotes imutáveis e proteínas sem cascade', () => {
    expect(schema).toContain('references public.proteins(id) on delete restrict')
    expect(schema).toContain('function public.protect_batch_immutable_fields()')
    expect(schema).toContain('function public.void_batch(p_batch_id uuid, p_reason text)')
    expect(schema).not.toContain('function public.refresh_batch_costs_after_protein_update()')
  })

  it('limita colunas graváveis pelo cliente', () => {
    expect(schema).toContain(
      'grant insert (protein_id, gross_kg, net_kg, shift, responsible, notes) on public.batches to authenticated;',
    )
    expect(schema).not.toContain('grant update (yield_pct')
    expect(schema).not.toContain('grant delete on public.batches')
  })
})

describe('migração da instalação existente', () => {
  it('preenche o custo congelado antes de torná-lo obrigatório', () => {
    const backfillPosition = migration.indexOf('protein_cost_snapshot = protein.cost')
    const notNullPosition = migration.indexOf('alter column protein_cost_snapshot set not null')

    expect(backfillPosition).toBeGreaterThan(-1)
    expect(notNullPosition).toBeGreaterThan(backfillPosition)
  })
})
