import { useState } from 'react'
import { BUSINESS_TIME_ZONE, businessDateKey } from './metrics'
import type { TrendPoint } from './charts'

export type PeriodMode = 'today' | '7d' | '30d' | '12m' | 'custom'
export type Granularity = 'hour' | 'day' | 'month'

export const hourLabelFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: BUSINESS_TIME_ZONE,
})

export const dayLabelFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: BUSINESS_TIME_ZONE,
})

export const monthLabelFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  year: '2-digit',
  timeZone: BUSINESS_TIME_ZONE,
})

export const calendarDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function businessHourKey(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: BUSINESS_TIME_ZONE,
  }).formatToParts(new Date(iso))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  const hour = parts.find((part) => part.type === 'hour')?.value
  return `${year}-${month}-${day}T${hour}`
}

export function businessMonthKey(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).formatToParts(new Date(iso))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}`
}

export function resolvePeriodRange(mode: PeriodMode, customFrom: string, customTo: string) {
  const now = Date.now()
  if (mode === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return { fromMs: startOfDay.getTime(), toMs: now, granularity: 'hour' as Granularity }
  }
  if (mode === '7d') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 6)
    return { fromMs: start.getTime(), toMs: now, granularity: 'day' as Granularity }
  }
  if (mode === '30d') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 29)
    return { fromMs: start.getTime(), toMs: now, granularity: 'day' as Granularity }
  }
  if (mode === '12m') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setFullYear(start.getFullYear() - 1)
    start.setDate(start.getDate() + 1)
    return { fromMs: start.getTime(), toMs: now, granularity: 'month' as Granularity }
  }
  if (!customFrom || !customTo) return null
  const fromMs = new Date(`${customFrom}T00:00:00`).getTime()
  const toMs = new Date(`${customTo}T23:59:59`).getTime()
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) return null
  const spanDays = (toMs - fromMs) / 86_400_000
  return { fromMs, toMs, granularity: (spanDays > 62 ? 'month' : 'day') as Granularity }
}

export function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatRangeLabel(from: string, to: string) {
  if (from && to) {
    return `${calendarDateFormatter.format(parseDateKey(from))} – ${calendarDateFormatter.format(parseDateKey(to))}`
  }
  if (from) return `${calendarDateFormatter.format(parseDateKey(from))} – selecione o fim`
  return 'Selecione um período'
}

export function isWithinRange(iso: string, fromMs: number, toMs: number) {
  const t = new Date(iso).getTime()
  return t >= fromMs && t <= toMs
}

export function periodPhrase(mode: PeriodMode) {
  if (mode === 'today') return 'hoje'
  if (mode === '7d') return 'na semana'
  if (mode === '30d') return 'no mês'
  if (mode === '12m') return 'no ano'
  return 'no período'
}

export function periodShortLabel(mode: PeriodMode) {
  if (mode === 'today') return 'Hoje'
  if (mode === '7d') return 'Semana'
  if (mode === '30d') return 'Mês'
  if (mode === '12m') return 'Ano'
  return 'Período'
}

export function usePeriodFilter(initialMode: PeriodMode = '30d') {
  const [periodMode, setPeriodMode] = useState<PeriodMode>(initialMode)
  const [customFrom, setCustomFrom] = useState(() => dateKey(new Date(Date.now() - 29 * 86_400_000)))
  const [customTo, setCustomTo] = useState(() => dateKey(new Date()))
  const range = resolvePeriodRange(periodMode, customFrom, customTo)
  return { customFrom, customTo, periodMode, range, setCustomFrom, setCustomTo, setPeriodMode }
}

export function buildRangeSeries<T>(
  items: T[],
  fromMs: number,
  toMs: number,
  granularity: Granularity,
  getDate: (item: T) => string,
  aggregate: (items: T[]) => number | null,
): TrendPoint[] {
  const points: TrendPoint[] = []

  if (granularity === 'hour') {
    const byHour = new Map<string, T[]>()
    for (const item of items) {
      const key = businessHourKey(getDate(item))
      const list = byHour.get(key) ?? []
      list.push(item)
      byHour.set(key, list)
    }
    const hourMs = 3_600_000
    const startHour = new Date(fromMs)
    startHour.setMinutes(0, 0, 0)
    for (let t = startHour.getTime(); t <= toMs; t += hourMs) {
      const date = new Date(t)
      const key = businessHourKey(date.toISOString())
      const hourItems = byHour.get(key) ?? []
      points.push({ key, label: hourLabelFormatter.format(date), value: hourItems.length > 0 ? aggregate(hourItems) : null })
    }
    return points
  }

  if (granularity === 'day') {
    const byDay = new Map<string, T[]>()
    for (const item of items) {
      const key = businessDateKey(getDate(item))
      const list = byDay.get(key) ?? []
      list.push(item)
      byDay.set(key, list)
    }
    const dayMs = 86_400_000
    for (let t = fromMs; t <= toMs; t += dayMs) {
      const date = new Date(t)
      const key = businessDateKey(date.toISOString())
      const dayItems = byDay.get(key) ?? []
      points.push({ key, label: dayLabelFormatter.format(date), value: dayItems.length > 0 ? aggregate(dayItems) : null })
    }
    return points
  }

  const byMonth = new Map<string, T[]>()
  for (const item of items) {
    const key = businessMonthKey(getDate(item))
    const list = byMonth.get(key) ?? []
    list.push(item)
    byMonth.set(key, list)
  }
  const cursor = new Date(fromMs)
  cursor.setDate(1)
  const end = new Date(toMs)
  end.setDate(1)
  while (cursor.getTime() <= end.getTime()) {
    const key = businessMonthKey(cursor.toISOString())
    const monthItems = byMonth.get(key) ?? []
    points.push({ key, label: monthLabelFormatter.format(cursor), value: monthItems.length > 0 ? aggregate(monthItems) : null })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return points
}
