import { useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Award, Boxes, DollarSign, Inbox, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { pickAxisTicks, smoothPath, trimLeadingAndTrailingGaps, type Point, type TrendPoint } from '../lib/charts'
import { averageYield, fmtBRL, fmtPct } from '../lib/metrics'
import {
  buildRangeSeries,
  formatRangeLabel,
  isWithinRange,
  usePeriodFilter,
  type Granularity,
  type PeriodMode,
} from '../lib/period'
import { PeriodFilterBar } from './PeriodFilter'
import { Metric } from './ProductionViews'
import type { Batch, Protein, Recipe, StockLevel } from '../types'

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function describePeriod(periodMode: PeriodMode, customFrom: string, customTo: string) {
  if (periodMode === 'today') return 'Hoje'
  if (periodMode === '7d') return 'Últimos 7 dias'
  if (periodMode === '30d') return 'Últimos 30 dias'
  if (periodMode === '12m') return 'Últimos 12 meses'
  return formatRangeLabel(customFrom, customTo)
}

type Range = { fromMs: number; toMs: number; granularity: Granularity }

function buildCostSeries(batches: Batch[], range: Range): TrendPoint[] {
  const validBatches = batches.filter((batch) => !batch.voided_at)
  return buildRangeSeries(
    validBatches,
    range.fromMs,
    range.toMs,
    range.granularity,
    (batch) => batch.recorded_at,
    (items) => items.reduce((sum, batch) => sum + (batch.protein_cost_snapshot ?? 0) * batch.gross_qty, 0),
  )
}

function buildRecentCostSeries(batches: Batch[]): TrendPoint[] {
  const now = Date.now()
  return buildCostSeries(batches, { fromMs: now - 29 * 86_400_000, toMs: now, granularity: 'day' })
}

function CostTrendChart({ range, trendBatches }: { range: Range | null; trendBatches: Batch[] }) {
  const rawPoints = useMemo(() => (range ? buildCostSeries(trendBatches, range) : []), [trendBatches, range])
  const points = useMemo(() => trimLeadingAndTrailingGaps(rawPoints), [rawPoints])

  const gradientId = useId()
  const fadeId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [tooltipLeft, setTooltipLeft] = useState(0)

  const width = 680
  const height = 200
  const padding = { top: 20, right: 8, bottom: 12, left: 8 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const values = points.map((point) => point.value).filter((value): value is number => value !== null)
  const hasData = values.length >= 2
  const maxV = hasData ? Math.max(1, ...values) : 1
  const minV = hasData ? Math.min(0, ...values) : 0

  function xFor(index: number) {
    return padding.left + (index / Math.max(1, points.length - 1)) * innerW
  }
  function yFor(value: number) {
    return padding.top + innerH - ((value - minV) / (maxV - minV || 1)) * innerH
  }

  const segments: Point[][] = []
  let current: Point[] = []
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) segments.push(current)
      current = []
      return
    }
    current.push({ x: xFor(index), y: yFor(point.value) })
  })
  if (current.length) segments.push(current)

  const linePaths = segments.map((segment) => smoothPath(segment))
  const areaPaths = segments.map((segment) => {
    const line = smoothPath(segment)
    const first = segment[0]
    const last = segment[segment.length - 1]
    return `${line} L ${last.x.toFixed(2)} ${padding.top + innerH} L ${first.x.toFixed(2)} ${padding.top + innerH} Z`
  })
  const lastSegment = segments[segments.length - 1]
  const endPoint = lastSegment?.[lastSegment.length - 1]
  let lastValueIndex = -1
  points.forEach((point, index) => {
    if (point.value !== null) lastValueIndex = index
  })

  function handleMove(event: ReactMouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || points.length === 0) return
    const rect = svg.getBoundingClientRect()
    const relX = ((event.clientX - rect.left) / rect.width) * width
    let nearest = 0
    let nearestDist = Infinity
    points.forEach((_, index) => {
      const dist = Math.abs(xFor(index) - relX)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = index
      }
    })
    setHover(nearest)
    const pxOnScreen = (xFor(nearest) / width) * rect.width
    setTooltipLeft(Math.min(Math.max(pxOnScreen, 72), rect.width - 72))
  }

  const hoveredPoint = hover !== null ? points[hover] : null
  const axisTicks = hasData ? pickAxisTicks(points, 6) : []
  const trendDelta = hasData ? values[values.length - 1] - values[0] : null
  const trendUp = (trendDelta ?? 0) >= 0
  const minValue = hasData ? Math.min(...values) : null
  const maxValue = hasData ? Math.max(...values) : null
  const avgValue = average(values)

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3>Custo de produção ao longo do tempo</h3>
          <span>
            {range?.granularity === 'month'
              ? 'Gasto mensal com matéria-prima'
              : range?.granularity === 'hour'
                ? 'Gasto por hora com matéria-prima'
                : 'Gasto diário com matéria-prima'}
          </span>
        </div>
      </div>
      <div className="chart-card-body">
        {!hasData ? (
          <p className="empty-state">
            <span className="empty-state-icon">
              <Inbox size={16} />
              {!range ? 'Selecione um período válido.' : 'Sem custos registrados no período.'}
            </span>
          </p>
        ) : (
          <>
            <div className="line-chart-wrap">
              <svg
                onMouseLeave={() => setHover(null)}
                onMouseMove={handleMove}
                preserveAspectRatio="none"
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--coral)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--coral)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id={`${fadeId}-gradient`} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="white" stopOpacity="0" />
                    <stop offset="2.5%" stopColor="white" stopOpacity="1" />
                    <stop offset="98%" stopColor="white" stopOpacity="1" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.35" />
                  </linearGradient>
                  <mask id={fadeId}>
                    <rect fill={`url(#${fadeId}-gradient)`} height={height} width={width} x="0" y="0" />
                  </mask>
                </defs>
                <g mask={`url(#${fadeId})`}>
                  {areaPaths.map((d, index) => (
                    <path d={d} fill={`url(#${gradientId})`} key={`area-${index}`} stroke="none" />
                  ))}
                  {linePaths.map((d, index) => (
                    <path className="chart-line-glow" d={d} key={`glow-${index}`} />
                  ))}
                  {linePaths.map((d, index) => (
                    <path className="chart-line" d={d} key={`line-${index}`} />
                  ))}
                </g>
                {hover !== null && (
                  <line className="chart-crosshair" x1={xFor(hover)} x2={xFor(hover)} y1={padding.top} y2={padding.top + innerH} />
                )}
                {hoveredPoint?.value !== null && hoveredPoint !== null && hover !== null && hover !== lastValueIndex && (
                  <circle className="chart-dot" cx={xFor(hover)} cy={yFor(hoveredPoint.value)} r="4" />
                )}
                {endPoint && <circle className="chart-end-dot" cx={endPoint.x} cy={endPoint.y} r="4" />}
              </svg>
              {hoveredPoint && (
                <div className="chart-tooltip" style={{ left: `${tooltipLeft}px` }}>
                  <strong>{hoveredPoint.value !== null ? fmtBRL(hoveredPoint.value) : 'Sem produção'}</strong>
                  <span>{hoveredPoint.label}</span>
                </div>
              )}
            </div>
            <div className="chart-axis-labels">
              {axisTicks.map((index) => (
                <span key={points[index].key}>{points[index].label}</span>
              ))}
            </div>
            <div className="chart-footer">
              <div className="chart-legend">
                <span className="chart-legend-item">
                  <span className="chart-legend-dot" />
                  {range?.granularity === 'month'
                    ? 'Custo mensal com matéria-prima'
                    : range?.granularity === 'hour'
                      ? 'Custo por hora com matéria-prima'
                      : 'Custo diário com matéria-prima'}
                </span>
                {trendDelta !== null && (
                  <span className={`hero-chart-delta ${trendUp ? 'danger' : 'ok'}`}>
                    {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {trendUp ? '+' : ''}
                    {fmtBRL(trendDelta)} no período
                  </span>
                )}
              </div>
              <div className="chart-stats-row">
                <div className="chart-stat">
                  <span>Mínimo</span>
                  <strong>{minValue !== null ? fmtBRL(minValue) : '-'}</strong>
                </div>
                <div className="chart-stat">
                  <span>Médio</span>
                  <strong>{avgValue !== null ? fmtBRL(avgValue) : '-'}</strong>
                </div>
                <div className="chart-stat">
                  <span>Máximo</span>
                  <strong>{maxValue !== null ? fmtBRL(maxValue) : '-'}</strong>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

type CostRow = { id: string; name: string; costPerKg: number }

function CostByProteinChart({ rows }: { rows: CostRow[] }) {
  const maxCost = Math.max(1, ...rows.map((row) => row.costPerKg))

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>Custo real por proteína</h3>
        <span>Custo estimado por kg líquido</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">
          <span className="empty-state-icon">
            <Inbox size={16} />
            Cadastre custo e rendimento para ver o comparativo.
          </span>
        </p>
      ) : (
        <div className="perf-chart">
          {rows.map((row, index) => (
            <div className="perf-row" key={row.id} style={{ animationDelay: `${index * 35}ms` }}>
              <span className="perf-label">{row.name}</span>
              <div className="cost-bar-track">
                <div className="cost-bar-fill" style={{ width: `${(row.costPerKg / maxCost) * 100}%` }} />
              </div>
              <span className="perf-value">{fmtBRL(row.costPerKg)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FinanceInsights({
  costRows,
  costTrendDelta,
  mostValuableStock,
}: {
  costRows: CostRow[]
  costTrendDelta: number | null
  mostValuableStock: { name: string; value: number } | null
}) {
  const priciest = costRows[0] ?? null
  const showTrend = costTrendDelta !== null
  const trendUp = (costTrendDelta ?? 0) >= 0

  if (!priciest && !mostValuableStock && !showTrend) return null

  return (
    <div className="insights-row">
      {priciest && (
        <div className="insight-card warn">
          <span className="insight-icon warn motion-fall">
            <DollarSign size={18} />
          </span>
          <div className="insight-body">
            <span className="insight-label">Proteína mais cara</span>
            <strong>{priciest.name}</strong>
            <small>{fmtBRL(priciest.costPerKg)}/kg líquido</small>
          </div>
        </div>
      )}
      {mostValuableStock && (
        <div className="insight-card ok">
          <span className="insight-icon ok motion-award">
            <Boxes size={18} />
          </span>
          <div className="insight-body">
            <span className="insight-label">Maior valor em estoque</span>
            <strong>{mostValuableStock.name}</strong>
            <small>{fmtBRL(mostValuableStock.value)} parados</small>
          </div>
        </div>
      )}
      {showTrend && costTrendDelta !== null && (
        <div className={`insight-card ${trendUp ? 'warn' : 'ok'}`}>
          <span className={`insight-icon ${trendUp ? 'warn motion-fall' : 'ok motion-rise'}`}>
            {trendUp ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </span>
          <div className="insight-body">
            <span className="insight-label">Tendência de custo (7 dias)</span>
            <strong>
              {trendUp ? '+' : ''}
              {fmtBRL(costTrendDelta)}
            </strong>
            <small>vs. os 7 dias anteriores</small>
          </div>
        </div>
      )}
    </div>
  )
}

export function CustosTab({
  proteins,
  recipes,
  stockLevels,
  trendBatches,
}: {
  proteins: Protein[]
  recipes: Recipe[]
  stockLevels: StockLevel[]
  trendBatches: Batch[]
}) {
  const { customFrom, customTo, periodMode, range, setCustomFrom, setCustomTo, setPeriodMode } = usePeriodFilter('30d')

  const periodBatches = useMemo(() => {
    if (!range) return []
    return trendBatches.filter((batch) => !batch.voided_at && isWithinRange(batch.recorded_at, range.fromMs, range.toMs))
  }, [trendBatches, range])

  const periodDays = range ? Math.max(1, Math.round((range.toMs - range.fromMs) / 86_400_000) + 1) : 30
  const periodDescription = describePeriod(periodMode, customFrom, customTo)

  const rows = proteins
    .map((protein) => {
      const avg = averageYield(periodBatches, protein.id)
      const estimatedCost = protein.cost && avg ? protein.cost / (avg / 100) : null
      return { protein, average: avg, estimatedCost }
    })
    .sort((a, b) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0))

  const costRows: CostRow[] = rows
    .filter((row) => row.protein.active && row.estimatedCost !== null)
    .map((row) => ({ id: row.protein.id, name: row.protein.name, costPerKg: row.estimatedCost as number }))

  const validPeriodBatches = periodBatches.filter((batch) => !batch.voided_at)
  const totalCost = validPeriodBatches.reduce((sum, batch) => sum + (batch.protein_cost_snapshot ?? 0) * batch.gross_qty, 0)
  const totalNetKg = validPeriodBatches.reduce((sum, batch) => sum + batch.net_qty, 0)
  const avgCostPerKg = totalNetKg > 0 ? totalCost / totalNetKg : null
  const avgCostPerDay = totalCost / periodDays

  const stockValueRows = stockLevels
    .map((level) => {
      const protein = proteins.find((item) => item.id === level.item_id)
      const value = protein?.cost ? protein.cost * level.on_hand : null
      return { name: level.name, value }
    })
    .filter((row): row is { name: string; value: number } => row.value !== null && row.value > 0)
    .sort((a, b) => b.value - a.value)
  const stockValue = stockValueRows.reduce((sum, row) => sum + row.value, 0)
  const mostValuableStock = stockValueRows[0] ?? null

  const activeRecipes = recipes.filter((recipe) => recipe.active)
  const avgMarkup = average(activeRecipes.map((recipe) => recipe.target_markup))

  const rawTrendPoints = useMemo(() => buildRecentCostSeries(trendBatches), [trendBatches])
  const trendPoints = trimLeadingAndTrailingGaps(rawTrendPoints)
  const recentValues = trendPoints.filter((point): point is TrendPoint & { value: number } => point.value !== null)
  const last7Avg = average(recentValues.slice(-7).map((point) => point.value))
  const prev7Avg = average(recentValues.slice(-14, -7).map((point) => point.value))
  const costTrendDelta = last7Avg !== null && prev7Avg !== null ? last7Avg - prev7Avg : null
  const costTotalTone = costTrendDelta === null ? 'accent' : costTrendDelta > 0 ? 'warn' : 'ok'
  const markupTone = avgMarkup !== null ? 'ok' : 'accent'

  const stockValueSub =
    stockValueRows.length === 0
      ? 'Nenhuma proteína com saldo em estoque'
      : `${stockValueRows.length} proteína${stockValueRows.length === 1 ? '' : 's'} com saldo em estoque`
  const markupSub =
    activeRecipes.length === 0
      ? 'Nenhuma ficha técnica ativa'
      : `${activeRecipes.length} ficha${activeRecipes.length === 1 ? '' : 's'} técnica${activeRecipes.length === 1 ? '' : 's'} ativa${activeRecipes.length === 1 ? '' : 's'}`

  return (
    <>
      <div className="section-header-row">
        <div className="section-title">
          <Wallet size={13} />
          Visão financeira
        </div>
        <PeriodFilterBar
          customFrom={customFrom}
          customTo={customTo}
          periodMode={periodMode}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
          setPeriodMode={setPeriodMode}
        />
      </div>
      <div className="finance-metrics-row">
        <Metric
          icon={DollarSign}
          iconMotion="stack"
          label="Custo total"
          sub={periodDescription}
          tone={costTotalTone}
          value={fmtBRL(totalCost)}
        />
        <Metric
          icon={TrendingUp}
          iconMotion="balance"
          label="Custo médio/kg líquido"
          sub={`Média de ${fmtBRL(avgCostPerDay)}/dia`}
          tone="accent"
          value={avgCostPerKg !== null ? fmtBRL(avgCostPerKg) : '-'}
        />
        <Metric
          icon={Boxes}
          iconMotion="stack"
          label="Valor em estoque"
          sub={stockValueSub}
          tone="accent"
          value={fmtBRL(stockValue)}
        />
        <Metric
          icon={Award}
          iconMotion="rise"
          label="Markup médio (fichas)"
          sub={markupSub}
          tone={markupTone}
          value={avgMarkup !== null ? `${avgMarkup.toFixed(1)}x` : '-'}
        />
      </div>

      <div className="charts-grid">
        <CostTrendChart range={range} trendBatches={trendBatches} />
        <CostByProteinChart rows={costRows} />
      </div>

      <FinanceInsights costRows={costRows} costTrendDelta={costTrendDelta} mostValuableStock={mostValuableStock} />

      <div className="section-title">
        <DollarSign size={13} />
        Custo por ingrediente
      </div>
      <section className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th>Situação</th>
              <th>Custo bruto/kg</th>
              <th>Rend. ponderado (período)</th>
              <th>Custo real estimado/kg líquido</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="empty-state" colSpan={5}>
                  <span className="empty-state-icon">
                    <Inbox size={16} />
                    Nenhuma proteína cadastrada ainda.
                  </span>
                </td>
              </tr>
            )}
            {rows.map(({ protein, average: avg, estimatedCost }) => (
              <tr className={protein.active ? '' : 'inactive-row'} key={protein.id}>
                <td>{protein.name}</td>
                <td>
                  <span className={protein.active ? 'active-badge' : 'inactive-badge'}>
                    {protein.active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td>{protein.cost ? fmtBRL(protein.cost) : '-'}</td>
                <td>{fmtPct(avg)}</td>
                <td className="strong-cell">{estimatedCost ? fmtBRL(estimatedCost) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
