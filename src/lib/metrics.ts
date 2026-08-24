import type { Batch, Protein, RecipeItem } from '../types'

export const BUSINESS_TIME_ZONE = 'America/Fortaleza'

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE })

export function businessDateKey(iso: string) {
  return businessDateFormatter.format(new Date(iso))
}

export function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtKg(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
}

export function fmtQty(value: number, unit: string) {
  const maximumFractionDigits = unit === 'un' ? 0 : 3
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits })} ${unit}`
}

export function fmtPct(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${value.toFixed(1)}%`
}

export function rendStatus(rend: number | null | undefined, target: number | null | undefined) {
  if (rend === null || rend === undefined || target === null || target === undefined) return 'virgin'
  if (rend >= target) return 'ok'
  if (rend >= target * 0.93) return 'warn'
  return 'danger'
}

export function statusLabel(status: string) {
  if (status === 'ok') return 'Acima meta'
  if (status === 'warn') return 'Abaixo meta'
  if (status === 'danger') return 'Crítico'
  return 'Sem dados'
}

export function batchesForProtein(batches: Batch[], proteinId: string) {
  return batches.filter((batch) => batch.protein_id === proteinId && !batch.voided_at)
}

export function weightedYield(batches: Batch[]) {
  const validBatches = batches.filter((batch) => !batch.voided_at)
  const grossQty = validBatches.reduce((sum, batch) => sum + batch.gross_qty, 0)
  if (grossQty <= 0) return null
  const netQty = validBatches.reduce((sum, batch) => sum + batch.net_qty, 0)
  return (netQty / grossQty) * 100
}

export function averageYield(batches: Batch[], proteinId: string) {
  return weightedYield(batchesForProtein(batches, proteinId))
}

export function lastBatch(batches: Batch[], proteinId: string) {
  return batchesForProtein(batches, proteinId).sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )[0]
}

function dateParts(date: Date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { day: value('day'), month: value('month'), year: value('year') }
}

export function isSameDay(dateA: Date, dateB: Date, timeZone = BUSINESS_TIME_ZONE) {
  const a = dateParts(dateA, timeZone)
  const b = dateParts(dateB, timeZone)
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export function daysSince(dateIso?: string, now = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  if (!dateIso) return null
  const then = dateParts(new Date(dateIso), timeZone)
  const today = dateParts(now, timeZone)
  const thenDay = Date.UTC(then.year, then.month - 1, then.day)
  const todayDay = Date.UTC(today.year, today.month - 1, today.day)
  return Math.floor((todayDay - thenDay) / 86_400_000)
}

export function recipeItemCost(item: RecipeItem, metricBatches: Batch[]) {
  if (item.protein_cost === null) return null
  // Nem todo ingrediente tem lote registrado (bebida, outros nunca vão ter) —
  // sem rendimento resolvível, assume 100% em vez de deixar o custo em branco.
  const yieldPct = averageYield(metricBatches, item.protein_id) ?? item.protein_target_yield ?? 100
  return (item.protein_cost / (yieldPct / 100)) * item.quantity
}

export function recipeTotalCost(items: RecipeItem[], metricBatches: Batch[]) {
  const resolvedCosts = items.map((item) => recipeItemCost(item, metricBatches)).filter((cost) => cost !== null)
  if (resolvedCosts.length === 0) return null
  return resolvedCosts.reduce((sum, cost) => sum + cost, 0)
}

export function startOfMetricWindow(windowDays: number, now = new Date()) {
  const start = new Date(now)
  start.setDate(start.getDate() - Math.max(1, Math.floor(windowDays)))
  return start
}

export function buildAlerts(
  proteins: Protein[],
  metricBatches: Batch[],
  latestBatches: Batch[],
  thresholdDays: number,
  includeTargetAlerts = true,
  now = new Date(),
) {
  return proteins.flatMap((protein) => {
    const alerts: Array<{ severity: 'danger' | 'warn'; title: string; desc: string; proteinId: string }> = []
    const avg = averageYield(metricBatches, protein.id)
    const last = lastBatch(latestBatches, protein.id)
    const days = daysSince(last?.recorded_at, now)

    // Item sem meta de rendimento nunca "opta" por rastreio de produção
    // (bebida, outros) — não faz sentido alertar que "parou de produzir"
    // algo que nunca teve lote registrado por design.
    if (protein.target_yield !== null) {
      if (days === null) {
        alerts.push({
          severity: 'danger',
          title: `${protein.name} sem lançamento`,
          desc: 'Nenhum lote foi registrado para este item.',
          proteinId: protein.id,
        })
      } else if (days >= thresholdDays) {
        alerts.push({
          severity: 'danger',
          title: `${protein.name} parado há ${days} dia${days > 1 ? 's' : ''}`,
          desc: `Último lote atingiu o limite configurado de ${thresholdDays} dia${thresholdDays > 1 ? 's' : ''}.`,
          proteinId: protein.id,
        })
      }
    }

    if (includeTargetAlerts && avg !== null && protein.target_yield !== null && avg < protein.target_yield) {
      const delta = avg - protein.target_yield
      alerts.push({
        severity: delta < -(protein.target_yield * 0.07) ? 'danger' : 'warn',
        title: `${protein.name} abaixo da meta`,
        desc: `Média ${fmtPct(avg)} contra meta de ${fmtPct(protein.target_yield)}.`,
        proteinId: protein.id,
      })
    }

    return alerts
  })
}
