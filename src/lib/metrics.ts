import type { Batch, Protein } from '../types'

export function fmtBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtKg(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
}

export function fmtPct(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${value.toFixed(1)}%`
}

export function rendStatus(rend: number | null | undefined, target: number) {
  if (rend === null || rend === undefined) return 'virgin'
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
  return batches.filter((batch) => batch.protein_id === proteinId)
}

export function averageYield(batches: Batch[], proteinId: string) {
  const rows = batchesForProtein(batches, proteinId)
  if (!rows.length) return null
  return rows.reduce((sum, batch) => sum + batch.yield_pct, 0) / rows.length
}

export function lastBatch(batches: Batch[], proteinId: string) {
  return batchesForProtein(batches, proteinId).sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )[0]
}

export function isSameDay(dateA: Date, dateB: Date) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

export function daysSince(dateIso?: string) {
  if (!dateIso) return null
  const then = new Date(dateIso)
  const today = new Date()
  then.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - then.getTime()) / 86_400_000)
}

export function buildAlerts(proteins: Protein[], batches: Batch[], thresholdDays: number) {
  return proteins.flatMap((protein) => {
    const alerts: Array<{ severity: 'danger' | 'warn'; title: string; desc: string; proteinId: string }> = []
    const avg = averageYield(batches, protein.id)
    const last = lastBatch(batches, protein.id)
    const days = daysSince(last?.recorded_at)

    if (days === null) {
      alerts.push({
        severity: 'danger',
        title: `${protein.name} sem lançamento`,
        desc: 'Nenhum lote foi registrado para esta proteína.',
        proteinId: protein.id,
      })
    } else if (days >= thresholdDays) {
      alerts.push({
        severity: 'danger',
        title: `${protein.name} parado há ${days} dia${days > 1 ? 's' : ''}`,
        desc: `Último lote acima do limite configurado de ${thresholdDays} dia${thresholdDays > 1 ? 's' : ''}.`,
        proteinId: protein.id,
      })
    }

    if (avg !== null && avg < protein.target_yield) {
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
