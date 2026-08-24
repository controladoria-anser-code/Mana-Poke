import { describe, expect, it } from 'vitest'
import type { Batch, Protein } from '../types'
import {
  averageYield,
  buildAlerts,
  daysSince,
  isSameDay,
  lastBatch,
  weightedYield,
} from './metrics'

function batch(overrides: Partial<Batch> = {}): Batch {
  return {
    created_by: 'user-1',
    gross_qty: 10,
    id: crypto.randomUUID(),
    net_qty: 8,
    notes: null,
    protein_cost_snapshot: 50,
    protein_id: 'protein-1',
    real_cost_kg: 62.5,
    recorded_at: '2026-07-30T12:00:00.000Z',
    responsible: 'Cássia',
    shift: 'manha',
    updated_at: '2026-07-30T12:00:00.000Z',
    void_reason: null,
    voided_at: null,
    voided_by: null,
    yield_pct: 80,
    ...overrides,
  }
}

const protein: Protein = {
  active: true,
  category: 'proteinas',
  cost: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  id: 'protein-1',
  min_stock_kg: null,
  name: 'Atum',
  slug: 'atum',
  target_yield: 85,
  unit: 'kg',
}

describe('métricas de rendimento', () => {
  it('pondera o rendimento pelo peso bruto', () => {
    const rows = [
      batch({ gross_qty: 1, net_qty: 0.5, yield_pct: 50 }),
      batch({ gross_qty: 100, net_qty: 90, yield_pct: 90 }),
    ]

    expect(weightedYield(rows)).toBeCloseTo(89.60396, 4)
    expect(averageYield(rows, protein.id)).toBeCloseTo(89.60396, 4)
  })

  it('ignora lotes anulados em métricas e último lote válido', () => {
    const valid = batch({ id: 'valid', recorded_at: '2026-07-28T12:00:00.000Z' })
    const voided = batch({
      id: 'voided',
      net_qty: 1,
      recorded_at: '2026-07-30T12:00:00.000Z',
      void_reason: 'Lançamento duplicado',
      voided_at: '2026-07-30T13:00:00.000Z',
      voided_by: 'manager-1',
      yield_pct: 10,
    })

    expect(weightedYield([valid, voided])).toBe(80)
    expect(lastBatch([valid, voided], protein.id)?.id).toBe('valid')
  })
})

describe('datas operacionais', () => {
  it('calcula virada do dia em America/Fortaleza', () => {
    const beforeMidnight = new Date('2026-07-30T01:00:00.000Z')
    const afterMidnight = new Date('2026-07-30T04:00:00.000Z')

    expect(isSameDay(beforeMidnight, afterMidnight)).toBe(false)
    expect(daysSince(beforeMidnight.toISOString(), afterMidnight)).toBe(1)
  })
})

describe('alertas', () => {
  it('usa a janela de métricas e o último lote válido separadamente', () => {
    const metricRows = [batch({ net_qty: 8, yield_pct: 80 })]
    const latestRows = [batch({ recorded_at: '2026-07-28T12:00:00.000Z' })]
    const now = new Date('2026-07-30T15:00:00.000Z')

    const alerts = buildAlerts([protein], metricRows, latestRows, 2, true, now)

    expect(alerts.map((alert) => alert.title)).toEqual([
      'Atum parado há 2 dias',
      'Atum abaixo da meta',
    ])
  })
})
