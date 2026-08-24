import { type CSSProperties, type MouseEvent as ReactMouseEvent, useId, useMemo, useRef, useState } from 'react'
import { Award, BarChart3, Boxes, DollarSign, Inbox, Layers, LineChart, TrendingDown, TrendingUp, Weight } from 'lucide-react'
import { pickAxisTicks, smoothPath, trimLeadingAndTrailingGaps, type Point, type TrendPoint } from '../lib/charts'
import { averageYield, fmtBRL, fmtKg, fmtPct, weightedYield } from '../lib/metrics'
import { buildRangeSeries, isWithinRange, periodPhrase, periodShortLabel, type Granularity, type PeriodMode } from '../lib/period'
import type { Batch, Protein } from '../types'

type PerfRow = { id: string; name: string; average: number; target: number; delta: number }

function buildYieldSeries(batches: Batch[], fromMs: number, toMs: number, granularity: Granularity): TrendPoint[] {
  const validBatches = batches.filter((batch) => !batch.voided_at)
  return buildRangeSeries(validBatches, fromMs, toMs, granularity, (batch) => batch.recorded_at, (items) => weightedYield(items))
}

function buildLast30DaysTrend(trendBatches: Batch[]): TrendPoint[] {
  const now = Date.now()
  return buildYieldSeries(trendBatches, now - 29 * 86_400_000, now, 'day')
}

function computeWeightedTargetMeta(proteins: Protein[], batches: Batch[]) {
  let weightedSum = 0
  let totalWeight = 0
  for (const protein of proteins) {
    if (protein.target_yield === null) continue
    const weight = batches
      .filter((batch) => batch.protein_id === protein.id && !batch.voided_at)
      .reduce((sum, batch) => sum + batch.net_qty, 0)
    if (weight <= 0) continue
    weightedSum += protein.target_yield * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null
}

export function HeroStatCard({
  periodMode,
  proteins,
  range,
  showCosts,
  showTargets,
  stockValue,
  todayCost,
  todayCostPerKg,
  todayCount,
  totalNet,
  trendBatches,
  weightedAverage,
}: {
  periodMode: PeriodMode
  proteins: Protein[]
  range: { fromMs: number; toMs: number; granularity: Granularity } | null
  showCosts: boolean
  showTargets: boolean
  stockValue: number
  todayCost: number
  todayCostPerKg: number | null
  todayCount: number
  totalNet: number
  trendBatches: Batch[]
  weightedAverage: number | null
}) {
  const periodLabel = periodPhrase(periodMode)
  const rawPoints = useMemo(() => {
    if (!range) return []
    return buildYieldSeries(trendBatches, range.fromMs, range.toMs, range.granularity)
  }, [trendBatches, range])
  const points = useMemo(() => trimLeadingAndTrailingGaps(rawPoints), [rawPoints])
  const metaValue = useMemo(
    () => (showTargets ? computeWeightedTargetMeta(proteins, trendBatches) : null),
    [proteins, trendBatches, showTargets],
  )
  const gradientOkId = useId()
  const gradientDangerId = useId()
  const fadeId = useId()
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [tooltipLeft, setTooltipLeft] = useState(0)

  const width = 640
  const height = 260
  const padding = { top: 30, right: 6, bottom: 16, left: 6 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const values = points.map((point) => point.value).filter((value): value is number => value !== null)
  const hasChart = values.length >= 2
  const rangeValues = metaValue !== null ? [...values, metaValue] : values
  const maxV = hasChart ? Math.max(100, ...rangeValues) : 100
  const minV = hasChart ? Math.min(...rangeValues, maxV - 15) : 0

  function xFor(index: number) {
    return padding.left + (index / Math.max(1, points.length - 1)) * innerW
  }
  function yFor(value: number) {
    return padding.top + innerH - ((value - minV) / (maxV - minV)) * innerH
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
  const metaY = metaValue !== null ? yFor(metaValue) : null

  function handleMove(event: ReactMouseEvent<SVGSVGElement>) {
    if (!hasChart) return
    const svg = svgRef.current
    if (!svg) return
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
  const hoveredStatus =
    metaValue !== null && hoveredPoint?.value !== null && hoveredPoint !== null
      ? hoveredPoint.value >= metaValue
        ? 'ok'
        : 'danger'
      : null
  const delta = hasChart ? values[values.length - 1] - values[0] : null
  const positive = (delta ?? 0) >= 0
  const axisTicks = hasChart ? pickAxisTicks(points, 5) : []

  return (
    <div className="hero-stat-primary">
      <div className="hero-stat-text">
        <span className="hero-stat-label">Rendimento ponderado ({periodShortLabel(periodMode)})</span>
        <strong className="hero-stat-value" key={fmtPct(weightedAverage)}>
          {fmtPct(weightedAverage)}
        </strong>
        <ul className="hero-stat-facts">
          {showCosts ? (
            <>
              <li>
                <span className="hero-stat-fact-icon">
                  <DollarSign size={13} />
                </span>
                <span>
                  <strong>{fmtBRL(todayCost)}</strong> de custo {periodLabel}
                </span>
              </li>
              <li>
                <span className="hero-stat-fact-icon">
                  <TrendingUp size={13} />
                </span>
                <span>
                  <strong>{todayCostPerKg !== null ? fmtBRL(todayCostPerKg) : '-'}</strong> por kg líquido {periodLabel}
                </span>
              </li>
              <li>
                <span className="hero-stat-fact-icon">
                  <Boxes size={13} />
                </span>
                <span>
                  <strong>{fmtBRL(stockValue)}</strong> em estoque
                </span>
              </li>
            </>
          ) : (
            <>
              <li>
                <span className="hero-stat-fact-icon">
                  <Layers size={13} />
                </span>
                <span>
                  <strong>{todayCount}</strong> lote{todayCount === 1 ? '' : 's'} {periodLabel}
                </span>
              </li>
              <li>
                <span className="hero-stat-fact-icon">
                  <Weight size={13} />
                </span>
                <span>
                  <strong>{fmtKg(totalNet)}</strong> produzidos {periodLabel}
                </span>
              </li>
            </>
          )}
        </ul>
      </div>
      <div className="hero-chart-zone">
        {hasChart ? (
          <>
            <div className="hero-chart-plot-area">
              <svg
                onMouseLeave={() => setHover(null)}
                onMouseMove={handleMove}
                preserveAspectRatio="none"
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
              >
                <defs>
                  <linearGradient id={gradientOkId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id={gradientDangerId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="var(--danger)" stopOpacity="0" />
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
                  {metaY !== null && (
                    <>
                      <clipPath id={`${clipId}-above`}>
                        <rect height={Math.max(0, metaY)} width={width} x="0" y="0" />
                      </clipPath>
                      <clipPath id={`${clipId}-below`}>
                        <rect height={Math.max(0, height - metaY)} width={width} x="0" y={metaY} />
                      </clipPath>
                    </>
                  )}
                </defs>
                <g mask={`url(#${fadeId})`}>
                  {metaY !== null ? (
                    <>
                      <g clipPath={`url(#${clipId}-above)`}>
                        {areaPaths.map((d, index) => (
                          <path d={d} fill={`url(#${gradientOkId})`} key={`area-ok-${index}`} stroke="none" />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="hero-chart-line-glow ok" d={d} key={`glow-ok-${index}`} />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="hero-chart-line ok" d={d} key={`line-ok-${index}`} />
                        ))}
                      </g>
                      <g clipPath={`url(#${clipId}-below)`}>
                        {areaPaths.map((d, index) => (
                          <path d={d} fill={`url(#${gradientDangerId})`} key={`area-danger-${index}`} stroke="none" />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="hero-chart-line-glow danger" d={d} key={`glow-danger-${index}`} />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="hero-chart-line danger" d={d} key={`line-danger-${index}`} />
                        ))}
                      </g>
                    </>
                  ) : (
                    <>
                      {areaPaths.map((d, index) => (
                        <path d={d} fill={`url(#${gradientOkId})`} key={`area-${index}`} stroke="none" />
                      ))}
                      {linePaths.map((d, index) => (
                        <path className="hero-chart-line-glow" d={d} key={`glow-${index}`} />
                      ))}
                      {linePaths.map((d, index) => (
                        <path className="hero-chart-line" d={d} key={`line-${index}`} />
                      ))}
                    </>
                  )}
                </g>
                {metaY !== null && (
                  <line className="hero-chart-meta-line" x1={padding.left} x2={width - padding.right} y1={metaY} y2={metaY} />
                )}
                {hover !== null && (
                  <line
                    className="hero-chart-crosshair"
                    x1={xFor(hover)}
                    x2={xFor(hover)}
                    y1={padding.top}
                    y2={padding.top + innerH}
                  />
                )}
                {hoveredPoint?.value !== null && hoveredPoint !== null && hover !== null && hover !== lastValueIndex && (
                  <circle className="hero-chart-hover-dot" cx={xFor(hover)} cy={yFor(hoveredPoint.value)} r="4" />
                )}
                {endPoint && <circle className="hero-chart-end-dot" cx={endPoint.x} cy={endPoint.y} r="4" />}
              </svg>
              {hoveredPoint && (
                <div
                  className={`hero-chart-tooltip${hoveredStatus ? ` ${hoveredStatus}` : ''}`}
                  style={{ left: `${tooltipLeft}px` }}
                >
                  <strong>{hoveredPoint.value !== null ? fmtPct(hoveredPoint.value) : 'Sem produção'}</strong>
                  <span>{hoveredPoint.label}</span>
                </div>
              )}
            </div>
            <div className="hero-chart-axis">
              {axisTicks.map((index) => (
                <span key={points[index].key}>{points[index].label}</span>
              ))}
            </div>
            <div className="hero-chart-legend">
              {metaY !== null ? (
                <>
                  <span className="hero-chart-legend-item">
                    <span className="hero-chart-legend-dot ok" />
                    Acima da meta
                  </span>
                  <span className="hero-chart-legend-item">
                    <span className="hero-chart-legend-dot danger" />
                    Abaixo da meta
                  </span>
                </>
              ) : (
                <span className="hero-chart-legend-item">
                  <span className="hero-chart-legend-dot" />
                  {range?.granularity === 'hour'
                    ? 'Rendimento por hora'
                    : range?.granularity === 'month'
                      ? 'Rendimento mensal ponderado'
                      : 'Rendimento diário ponderado'}
                </span>
              )}
              {delta !== null && (
                <span className={`hero-chart-delta ${positive ? 'ok' : 'danger'}`}>
                  {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {positive ? '+' : ''}
                  {delta.toFixed(1)}pp no período
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="hero-chart-empty">Sem dados suficientes para o gráfico ainda.</div>
        )}
      </div>
    </div>
  )
}

function TrendChart({
  proteins,
  showTargets,
  trendBatches,
}: {
  proteins: Protein[]
  showTargets: boolean
  trendBatches: Batch[]
}) {
  const points = useMemo(() => trimLeadingAndTrailingGaps(buildLast30DaysTrend(trendBatches)), [trendBatches])

  const metaValue = useMemo(
    () => (showTargets ? computeWeightedTargetMeta(proteins, trendBatches) : null),
    [proteins, trendBatches, showTargets],
  )

  const gradientOkId = useId()
  const gradientDangerId = useId()
  const fadeId = useId()
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [tooltipLeft, setTooltipLeft] = useState(0)
  const [chartType, setChartType] = useState<'bar' | 'line'>('line')

  const width = 680
  const height = 200
  const padding = { top: 20, right: 8, bottom: 12, left: 8 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const values = points.map((point) => point.value).filter((value): value is number => value !== null)
  const hasData = values.length >= 2
  const rangeValues = metaValue !== null ? [...values, metaValue] : values
  const maxV = hasData ? Math.max(100, ...rangeValues) : 100
  const minV = hasData ? Math.min(...rangeValues, maxV - 15) : 0

  function xFor(index: number) {
    return padding.left + (index / Math.max(1, points.length - 1)) * innerW
  }
  function yFor(value: number) {
    return padding.top + innerH - ((value - minV) / (maxV - minV)) * innerH
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

  const metaY = metaValue !== null ? yFor(metaValue) : null

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
  const hoveredStatus =
    metaValue !== null && hoveredPoint?.value !== null && hoveredPoint !== null
      ? hoveredPoint.value >= metaValue
        ? 'ok'
        : 'danger'
      : null
  const axisTicks = hasData ? pickAxisTicks(points, 6) : []
  const trendDelta = hasData ? values[values.length - 1] - values[0] : null
  const trendPositive = (trendDelta ?? 0) >= 0
  const minValue = hasData ? Math.min(...values) : null
  const maxValue = hasData ? Math.max(...values) : null
  const avgValue = hasData ? values.reduce((sum, value) => sum + value, 0) / values.length : null

  return (
    <div className="chart-card">
      <div className="chart-card-header chart-card-header-filterable">
        <div>
          <h3>Rendimento ao longo do tempo</h3>
          <span>Média diária ponderada · últimos 30 dias</span>
        </div>
        <div className="chart-period-filter">
          <button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')} title="Ver como linha" type="button">
            <LineChart size={14} />
          </button>
          <button className={chartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')} title="Ver como barras" type="button">
            <BarChart3 size={14} />
          </button>
        </div>
      </div>
      <div className="chart-card-body">
        {!hasData ? (
          <p className="empty-state">
            <span className="empty-state-icon">
              <Inbox size={16} />
              Sem produção registrada no período.
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
                <linearGradient id={gradientOkId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={gradientDangerId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--danger)" stopOpacity="0" />
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
                {metaY !== null && (
                  <>
                    <clipPath id={`${clipId}-above`}>
                      <rect height={Math.max(0, metaY)} width={width} x="0" y="0" />
                    </clipPath>
                    <clipPath id={`${clipId}-below`}>
                      <rect height={Math.max(0, height - metaY)} width={width} x="0" y={metaY} />
                    </clipPath>
                  </>
                )}
              </defs>
              {chartType === 'bar' ? (
                <g>
                  {points.map((point, index) => {
                    if (point.value === null) return null
                    const barWidth = Math.max(4, (innerW / points.length) * 0.55)
                    const rawHeight = padding.top + innerH - yFor(point.value)
                    // O valor mínimo do período define a base da escala (minV), então a
                    // barra dele fica com altura ~0 e nunca aparece — força um piso
                    // visível sem alterar a escala nem a posição das outras barras.
                    const barHeight = Math.max(3, rawHeight)
                    const y = padding.top + innerH - barHeight
                    const tone = metaValue !== null ? (point.value >= metaValue ? 'ok' : 'danger') : ''
                    return (
                      <rect
                        className={`chart-bar ${tone}${hover === index ? ' hovered' : ''}`}
                        height={barHeight}
                        key={`bar-${point.key}`}
                        rx={3}
                        width={barWidth}
                        x={xFor(index) - barWidth / 2}
                        y={y}
                      />
                    )
                  })}
                </g>
              ) : (
                <g mask={`url(#${fadeId})`}>
                  {metaY !== null ? (
                    <>
                      <g clipPath={`url(#${clipId}-above)`}>
                        {areaPaths.map((d, index) => (
                          <path d={d} fill={`url(#${gradientOkId})`} key={`area-ok-${index}`} stroke="none" />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="chart-line-glow ok" d={d} key={`glow-ok-${index}`} />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="chart-line ok" d={d} key={`line-ok-${index}`} />
                        ))}
                      </g>
                      <g clipPath={`url(#${clipId}-below)`}>
                        {areaPaths.map((d, index) => (
                          <path d={d} fill={`url(#${gradientDangerId})`} key={`area-danger-${index}`} stroke="none" />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="chart-line-glow danger" d={d} key={`glow-danger-${index}`} />
                        ))}
                        {linePaths.map((d, index) => (
                          <path className="chart-line danger" d={d} key={`line-danger-${index}`} />
                        ))}
                      </g>
                    </>
                  ) : (
                    <>
                      {areaPaths.map((d, index) => (
                        <path d={d} fill={`url(#${gradientOkId})`} key={`area-${index}`} stroke="none" />
                      ))}
                      {linePaths.map((d, index) => (
                        <path className="chart-line-glow" d={d} key={`glow-${index}`} />
                      ))}
                      {linePaths.map((d, index) => (
                        <path className="chart-line" d={d} key={`line-${index}`} />
                      ))}
                    </>
                  )}
                </g>
              )}
              {metaY !== null && (
                <line className="chart-meta-line" x1={padding.left} x2={width - padding.right} y1={metaY} y2={metaY} />
              )}
              {chartType === 'line' && hover !== null && (
                <line className="chart-crosshair" x1={xFor(hover)} x2={xFor(hover)} y1={padding.top} y2={padding.top + innerH} />
              )}
              {chartType === 'line' && hoveredPoint?.value !== null && hoveredPoint !== null && hover !== null && hover !== lastValueIndex && (
                <circle className="chart-dot" cx={xFor(hover)} cy={yFor(hoveredPoint.value)} r="4" />
              )}
              {chartType === 'line' && endPoint && <circle className="chart-end-dot" cx={endPoint.x} cy={endPoint.y} r="4" />}
            </svg>
            {hoveredPoint && (
              <div
                className={`chart-tooltip${hoveredStatus ? ` ${hoveredStatus}` : ''}`}
                style={{ left: `${tooltipLeft}px` }}
              >
                <strong>{hoveredPoint.value !== null ? fmtPct(hoveredPoint.value) : 'Sem produção'}</strong>
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
              {metaY !== null ? (
                <>
                  <span className="chart-legend-item">
                    <span className="chart-legend-dot ok" />
                    Acima da meta
                  </span>
                  <span className="chart-legend-item">
                    <span className="chart-legend-dot danger" />
                    Abaixo da meta
                  </span>
                </>
              ) : (
                <span className="chart-legend-item">
                  <span className="chart-legend-dot ok" />
                  Rendimento diário ponderado
                </span>
              )}
              {trendDelta !== null && (
                <span className={`hero-chart-delta ${trendPositive ? 'ok' : 'danger'}`}>
                  {trendPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {trendPositive ? '+' : ''}
                  {trendDelta.toFixed(1)}pp no período
                </span>
              )}
            </div>
            <div className="chart-stats-row">
              {metaValue !== null && (
                <div className="chart-stat">
                  <span>Meta</span>
                  <strong>{fmtPct(metaValue)}</strong>
                </div>
              )}
              <div className="chart-stat">
                <span>Mínimo</span>
                <strong>{fmtPct(minValue)}</strong>
              </div>
              <div className="chart-stat">
                <span>Médio</span>
                <strong>{fmtPct(avgValue)}</strong>
              </div>
              <div className="chart-stat">
                <span>Máximo</span>
                <strong>{fmtPct(maxValue)}</strong>
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function PerformanceChart({ rows }: { rows: PerfRow[] }) {
  const maxAbs = Math.max(5, ...rows.map((row) => Math.abs(row.delta)))
  const avgDelta = rows.length ? rows.reduce((sum, row) => sum + row.delta, 0) / rows.length : null

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>Performance por proteína</h3>
        <span>Distância da meta de rendimento</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">
          <span className="empty-state-icon">
            <Inbox size={16} />
            Defina metas de rendimento para ver o comparativo.
          </span>
        </p>
      ) : (
        <>
          <div className="perf-chart">
            {rows.map((row, index) => {
              const positive = row.delta >= 0
              const pct = Math.min(100, (Math.abs(row.delta) / maxAbs) * 100) / 2
              const barStyle: CSSProperties = positive
                ? { width: `${pct}%`, left: '50%' }
                : { width: `${pct}%`, right: '50%' }
              return (
                <div className="perf-row" key={row.id} style={{ animationDelay: `${index * 35}ms` }}>
                  <span className="perf-label">{row.name}</span>
                  <div className="perf-track">
                    <div className="perf-zero" />
                    <div className={`perf-bar ${positive ? 'ok' : 'danger'}`} style={barStyle} />
                  </div>
                  <span className={`perf-value ${positive ? 'ok' : 'danger'}`}>
                    {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {positive ? '+' : ''}
                    {row.delta.toFixed(1)}pp
                  </span>
                </div>
              )
            })}
          </div>
          <div className="perf-footer">
            <span className="perf-legend-item">
              <span className="perf-legend-dot ok" />
              Acima da meta
            </span>
            <span className="perf-legend-item">
              <span className="perf-legend-dot danger" />
              Abaixo da meta
            </span>
            {avgDelta !== null && (
              <span className={`perf-avg ${avgDelta >= 0 ? 'ok' : 'danger'}`}>
                Média {avgDelta >= 0 ? '+' : ''}
                {avgDelta.toFixed(1)}pp
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function DashboardInsights({ rows, trendDelta }: { rows: PerfRow[]; trendDelta: number | null }) {
  const best = rows.length ? rows.reduce((a, b) => (b.delta > a.delta ? b : a)) : null
  const worst = rows.length ? rows.reduce((a, b) => (b.delta < a.delta ? b : a)) : null

  const showWorst = worst !== null && worst.delta < 0
  const showTrend = trendDelta !== null

  if (!best && !showWorst && !showTrend) return null

  return (
    <div className="insights-row">
      {best && (
        <div className="insight-card ok">
          <span className="insight-icon ok motion-award">
            <Award size={18} />
          </span>
          <div className="insight-body">
            <span className="insight-label">Melhor desempenho</span>
            <strong>{best.name}</strong>
            <small>
              {best.delta >= 0 ? '+' : ''}
              {best.delta.toFixed(1)}pp da meta
            </small>
          </div>
        </div>
      )}
      {showWorst && worst && (
        <div className="insight-card danger">
          <span className="insight-icon danger motion-fall">
            <TrendingDown size={18} />
          </span>
          <div className="insight-body">
            <span className="insight-label">Precisa de atenção</span>
            <strong>{worst.name}</strong>
            <small>{worst.delta.toFixed(1)}pp abaixo da meta</small>
          </div>
        </div>
      )}
      {showTrend && trendDelta !== null && (
        <div className={`insight-card ${trendDelta >= 0 ? 'ok' : 'warn'}`}>
          <span className={`insight-icon ${trendDelta >= 0 ? 'ok motion-rise' : 'warn motion-fall'}`}>
            {trendDelta >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </span>
          <div className="insight-body">
            <span className="insight-label">Tendência</span>
            <strong>
              {trendDelta >= 0 ? '+' : ''}
              {trendDelta.toFixed(1)}pp
            </strong>
            <small>vs. o período anterior equivalente</small>
          </div>
        </div>
      )}
    </div>
  )
}

export function DashboardTab({
  periodBatches,
  proteins,
  range,
  showTargets,
  trendBatches,
}: {
  periodBatches: Batch[]
  proteins: Protein[]
  range: { fromMs: number; toMs: number; granularity: Granularity } | null
  showTargets: boolean
  trendBatches: Batch[]
}) {
  const perfRows = useMemo(() => {
    if (!showTargets) return []
    return proteins
      .filter((protein) => protein.active && protein.target_yield !== null)
      .map((protein) => {
        const avg = averageYield(periodBatches, protein.id)
        if (avg === null) return null
        const target = protein.target_yield as number
        return { id: protein.id, name: protein.name, average: avg, target, delta: avg - target }
      })
      .filter((row): row is PerfRow => row !== null)
      .sort((a, b) => b.delta - a.delta)
  }, [periodBatches, proteins, showTargets])

  const trendDelta = useMemo(() => {
    if (!range) return null
    const spanMs = range.toMs - range.fromMs
    const previousBatches = trendBatches.filter(
      (batch) => !batch.voided_at && isWithinRange(batch.recorded_at, range.fromMs - spanMs, range.fromMs - 1),
    )
    const currentAvg = weightedYield(periodBatches)
    const previousAvg = weightedYield(previousBatches)
    return currentAvg !== null && previousAvg !== null ? currentAvg - previousAvg : null
  }, [periodBatches, range, trendBatches])

  return (
    <>
      <div className="charts-grid">
        <TrendChart proteins={proteins} showTargets={showTargets} trendBatches={trendBatches} />
        {showTargets && <PerformanceChart rows={perfRows} />}
      </div>
      <DashboardInsights rows={perfRows} trendDelta={trendDelta} />
    </>
  )
}
