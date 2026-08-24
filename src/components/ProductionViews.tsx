import { type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  History,
  Inbox,
  Layers,
  type LucideIcon,
  MessageSquare,
  Package,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  TrendingDown,
  TrendingUp,
  User,
  Weight,
  X,
  XCircle,
} from 'lucide-react'
import { categoryOrder, resolveCategoryMeta } from '../lib/categories'
import {
  BUSINESS_TIME_ZONE,
  averageYield,
  batchesForProtein,
  businessDateKey,
  fmtBRL,
  fmtKg,
  fmtPct,
  fmtQty,
  isSameDay,
  lastBatch,
  rendStatus,
  statusLabel,
} from '../lib/metrics'
import type { Batch, BatchEditLog, BatchForm, Protein, StockCategory } from '../types'
import { DateField } from './DateField'
import { Select } from './Select'

function handleCardSpotlight(event: ReactMouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--x', `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty('--y', `${event.clientY - rect.top}px`)
}

export function Metric({
  icon: Icon,
  iconMotion,
  label,
  sub,
  tone = '',
  value,
}: {
  icon?: LucideIcon
  iconMotion?: 'rise' | 'fall' | 'stack' | 'balance'
  label: string
  sub?: string
  tone?: string
  value: string
}) {
  return (
    <div className="strip-item">
      <div className="strip-item-top">
        <span className="strip-item-label">{label}</span>
        {Icon && (
          <span className={`strip-icon ${tone} ${iconMotion ? `motion-${iconMotion}` : ''}`}>
            <Icon size={20} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <strong className={tone} key={value}>
        {value}
      </strong>
      {sub && <small className="strip-item-sub">{sub}</small>}
    </div>
  )
}

function ProductionCategoryChips({
  categoryFilter,
  presentCategories,
  setCategoryFilter,
}: {
  categoryFilter: StockCategory | 'all'
  presentCategories: StockCategory[]
  setCategoryFilter: (value: StockCategory | 'all') => void
}) {
  if (presentCategories.length <= 1) return null

  return (
    <div className="chart-period-filter stock-category-filter">
      <button className={categoryFilter === 'all' ? 'active' : ''} onClick={() => setCategoryFilter('all')} type="button">
        Todas
      </button>
      {presentCategories.map((category) => (
        <button
          className={categoryFilter === category ? 'active' : ''}
          key={category}
          onClick={() => setCategoryFilter(category)}
          type="button"
        >
          {resolveCategoryMeta(category).label}
        </button>
      ))}
    </div>
  )
}

export function ProductionTab({
  activeProteins,
  canCreate,
  canEdit,
  latestBatches,
  metricBatches,
  onOpenBatch,
  onUpdateProtein,
  showCosts,
  showTargets,
  yieldWindowDays,
}: {
  activeProteins: Protein[]
  canCreate: boolean
  canEdit: boolean
  latestBatches: Batch[]
  metricBatches: Batch[]
  onOpenBatch: (proteinId?: string) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  showCosts: boolean
  showTargets: boolean
  yieldWindowDays: number
}) {
  const [selectedProtein, setSelectedProtein] = useState<Protein | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<StockCategory | 'all'>('all')

  const presentCategories = categoryOrder.filter((category) => activeProteins.some((protein) => protein.category === category))
  const filteredProteins =
    categoryFilter === 'all' ? activeProteins : activeProteins.filter((protein) => protein.category === categoryFilter)

  return (
    <>
      <div className="section-header-row">
        <div className="section-title">
          <Layers size={13} />
          Ingredientes ativos
        </div>
        <ProductionCategoryChips
          categoryFilter={categoryFilter}
          presentCategories={presentCategories}
          setCategoryFilter={setCategoryFilter}
        />
      </div>
      <section className="proteins-grid">
        {filteredProteins.map((protein) => (
          <ProteinCard
            canCreate={canCreate}
            canEdit={canEdit}
            key={protein.id}
            latestBatches={latestBatches}
            metricBatches={metricBatches}
            onOpenBatch={onOpenBatch}
            onSelect={setSelectedProtein}
            onUpdateProtein={onUpdateProtein}
            protein={protein}
            showCosts={showCosts}
            showTargets={showTargets}
            yieldWindowDays={yieldWindowDays}
          />
        ))}
      </section>
      {selectedProtein && (
        <ProteinDetailModal
          canCreate={canCreate}
          latestBatches={latestBatches}
          metricBatches={metricBatches}
          onClose={() => setSelectedProtein(null)}
          onOpenBatch={onOpenBatch}
          protein={selectedProtein}
          showCosts={showCosts}
          showTargets={showTargets}
          yieldWindowDays={yieldWindowDays}
        />
      )}
    </>
  )
}

export function BatchHistoryTab({
  canEditBatch,
  canVoid,
  historyBatches,
  onEditBatch,
  onShowBatchHistory,
  onVoidBatch,
  proteinCatalog,
  showCosts,
  showTargets,
}: {
  canEditBatch: boolean
  canVoid: boolean
  historyBatches: Batch[]
  onEditBatch: (batch: Batch) => void
  onShowBatchHistory: (batch: Batch) => void
  onVoidBatch: (batchId: string) => void
  proteinCatalog: Protein[]
  showCosts: boolean
  showTargets: boolean
}) {
  return (
    <>
      <div className="section-title">
        <History size={13} />
        Histórico geral de lotes
      </div>
      <LogTable
        batches={historyBatches}
        canEdit={canEditBatch}
        canVoid={canVoid}
        onEditBatch={onEditBatch}
        onShowBatchHistory={onShowBatchHistory}
        onVoidBatch={onVoidBatch}
        proteins={proteinCatalog}
        showCosts={showCosts}
        showTargets={showTargets}
      />
    </>
  )
}

function ProteinCard({
  canCreate,
  canEdit,
  latestBatches,
  metricBatches,
  onOpenBatch,
  onSelect,
  onUpdateProtein,
  protein,
  showCosts,
  showTargets,
  yieldWindowDays,
}: {
  canCreate: boolean
  canEdit: boolean
  latestBatches: Batch[]
  metricBatches: Batch[]
  onOpenBatch: (proteinId?: string) => void
  onSelect: (protein: Protein) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  protein: Protein
  showCosts: boolean
  showTargets: boolean
  yieldWindowDays: number
}) {
  const rows = batchesForProtein(metricBatches, protein.id)
  const average = averageYield(metricBatches, protein.id)
  const latest = lastBatch(latestBatches, protein.id)
  const status = showTargets ? rendStatus(average, protein.target_yield) : 'virgin'
  const producedToday = rows
    .filter((batch) => isSameDay(new Date(batch.recorded_at), new Date()))
    .reduce((sum, batch) => sum + batch.net_qty, 0)
  const estimatedCost = showCosts && protein.cost && average ? protein.cost / (average / 100) : null
  const CategoryIcon = resolveCategoryMeta(protein.category).icon

  return (
    <article
      className={`protein-card clickable ${status}`}
      onClick={() => onSelect(protein)}
      onMouseMove={handleCardSpotlight}
    >
      <div className="card-accent" />
      <div className="card-body">
        <div className="card-header">
          <div className="card-header-main">
            <div className={`protein-icon ${status}`}>
              <CategoryIcon size={18} />
            </div>
            <div>
              <h2>{protein.name}</h2>
              <span>
                {rows.length} lote{rows.length === 1 ? '' : 's'} nos últimos {yieldWindowDays} dias
              </span>
            </div>
          </div>
          {showTargets && <span className={`status-pill ${status}`}>{statusLabel(status)}</span>}
        </div>

        <div className={`metrics-grid ${showTargets ? '' : 'two'}`}>
          <MiniMetric label="Rend. ponderado" value={fmtPct(average)} tone={status} />
          {showTargets && <MiniMetric label="Meta" value={fmtPct(protein.target_yield)} />}
          <MiniMetric label="Hoje" value={fmtQty(producedToday, protein.unit)} />
        </div>

        <div className="gauge">
          <div className="gauge-labels">
            <span>0%</span>
            {showTargets && <span>Meta {fmtPct(protein.target_yield)}</span>}
            <span>100%</span>
          </div>
          <div className="gauge-track">
            <div className={`gauge-fill ${status}`} style={{ width: `${Math.min(average ?? 0, 100)}%` }} />
            {showTargets && protein.target_yield !== null && (
              <div className="gauge-target" style={{ left: `${Math.min(protein.target_yield, 100)}%` }} />
            )}
          </div>
        </div>

        {showTargets && (
          <div className="target-row" onClick={(event) => event.stopPropagation()}>
            <span>Meta de rendimento</span>
            <input
              disabled={!canEdit}
              max={100}
              min={1}
              onBlur={(event) => onUpdateProtein(protein.id, { target_yield: Number(event.target.value) })}
              type="number"
              defaultValue={protein.target_yield ?? ''}
            />
            <span>%</span>
          </div>
        )}

        <footer className="card-footer">
          <div>
            {showCosts && (
              <>
                <span>Custo bruto {protein.cost ? `${fmtBRL(protein.cost)}/${protein.unit}` : '-'}</span>
                <strong>Custo estimado atual {estimatedCost ? `${fmtBRL(estimatedCost)}/${protein.unit} líquido` : '-'}</strong>
              </>
            )}
            {latest && (
              <small>
                Último lote:{' '}
                {new Date(latest.recorded_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}
              </small>
            )}
          </div>
          {canCreate && (
            <button
              className="small-action"
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpenBatch(protein.id)
              }}
            >
              <Plus size={15} />
              Produção
            </button>
          )}
        </footer>
      </div>
    </article>
  )
}

function MiniMetric({
  icon: Icon,
  label,
  value,
  tone = '',
}: {
  icon?: LucideIcon
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="mini-metric">
      <div className="mini-metric-top">
        <span className="mini-metric-label">{label}</span>
        {Icon && (
          <span className={`mini-metric-icon ${tone}`}>
            <Icon size={12} />
          </span>
        )}
      </div>
      <strong className={tone} key={value}>
        {value}
      </strong>
    </div>
  )
}

function ProteinDetailModal({
  canCreate,
  latestBatches,
  metricBatches,
  onClose,
  onOpenBatch,
  protein,
  showCosts,
  showTargets,
  yieldWindowDays,
}: {
  canCreate: boolean
  latestBatches: Batch[]
  metricBatches: Batch[]
  onClose: () => void
  onOpenBatch: (proteinId?: string) => void
  protein: Protein
  showCosts: boolean
  showTargets: boolean
  yieldWindowDays: number
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const rows = batchesForProtein(metricBatches, protein.id).sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )
  const average = averageYield(metricBatches, protein.id)
  const latest = lastBatch(latestBatches, protein.id)
  const status = showTargets ? rendStatus(average, protein.target_yield) : 'virgin'
  const producedToday = rows
    .filter((batch) => isSameDay(new Date(batch.recorded_at), new Date()))
    .reduce((sum, batch) => sum + batch.net_qty, 0)
  const estimatedCost = showCosts && protein.cost && average ? protein.cost / (average / 100) : null

  const byYield = [...rows].sort((a, b) => a.yield_pct - b.yield_pct)
  const worstBatch = byYield[0] ?? null
  const bestBatch = byYield[byYield.length - 1] ?? null
  const delta = showTargets && average !== null && protein.target_yield !== null ? average - protein.target_yield : null
  const CategoryIcon = resolveCategoryMeta(protein.category).icon

  function formatBatchDay(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: BUSINESS_TIME_ZONE })
  }

  let explanation: string
  if (!showTargets || protein.target_yield === null || average === null || delta === null) {
    explanation = 'Ainda não há meta configurada ou dados suficientes para avaliar o desempenho desta proteína no período.'
  } else if (rows.length === 0) {
    explanation = 'Nenhum lote foi registrado nesta janela, por isso não há rendimento para comparar com a meta.'
  } else if (status === 'ok') {
    explanation = `O rendimento ponderado está ${Math.abs(delta).toFixed(1)}pp acima da meta de ${fmtPct(protein.target_yield)}.${
      bestBatch ? ` O lote de ${formatBatchDay(bestBatch.recorded_at)} teve o melhor resultado do período, com ${fmtPct(bestBatch.yield_pct)} de rendimento.` : ''
    }`
  } else {
    const severity = status === 'danger' ? 'criticamente' : 'levemente'
    explanation = `O rendimento ponderado está ${severity} abaixo da meta, ${Math.abs(delta).toFixed(1)}pp a menos que os ${fmtPct(protein.target_yield)} configurados.${
      worstBatch ? ` O lote de ${formatBatchDay(worstBatch.recorded_at)} puxou a média para baixo, com apenas ${fmtPct(worstBatch.yield_pct)} de rendimento.` : ''
    }`
  }

  return (
    <div
      aria-labelledby="protein-detail-title"
      aria-modal="true"
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
    >
      <section className="modal protein-detail-modal">
        <header className="modal-header">
          <div className="card-header-main">
            <div className={`protein-icon ${status}`}>
              <CategoryIcon size={20} />
            </div>
            <div>
              <h2 id="protein-detail-title">{protein.name}</h2>
              <span>
                {rows.length} lote{rows.length === 1 ? '' : 's'} nos últimos {yieldWindowDays} dias
              </span>
            </div>
          </div>
          <div className="modal-header-actions">
            {showTargets && <span className={`status-pill ${status}`}>{statusLabel(status)}</span>}
            <button className="icon-btn ghost" type="button" onClick={onClose} title="Fechar">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="modal-body">
          <div className="metrics-grid">
            <MiniMetric label="Rend. ponderado" value={fmtPct(average)} tone={status} />
            {showTargets && <MiniMetric label="Meta" value={fmtPct(protein.target_yield)} />}
            <MiniMetric label="Hoje" value={fmtQty(producedToday, protein.unit)} />
            {showCosts && <MiniMetric label="Custo bruto" value={protein.cost ? `${fmtBRL(protein.cost)}/${protein.unit}` : '-'} />}
            {showCosts && (
              <MiniMetric
                label="Custo estimado"
                value={estimatedCost ? `${fmtBRL(estimatedCost)}/${protein.unit} líq.` : '-'}
                tone={estimatedCost ? 'danger' : ''}
              />
            )}
          </div>

          <div className="gauge large">
            <div className="gauge-labels">
              <span>0%</span>
              {showTargets && <span>Meta {fmtPct(protein.target_yield)}</span>}
              <span>100%</span>
            </div>
            <div className="gauge-track">
              <div className={`gauge-fill ${status}`} style={{ width: `${Math.min(average ?? 0, 100)}%` }} />
              {showTargets && protein.target_yield !== null && (
                <div className="gauge-target" style={{ left: `${Math.min(protein.target_yield, 100)}%` }} />
              )}
            </div>
          </div>

          <div className={`explanation-card ${status}`}>
            <span className="explanation-icon">
              {status === 'ok' ? (
                <TrendingUp size={16} />
              ) : status === 'virgin' ? (
                <AlertCircle size={16} />
              ) : (
                <TrendingDown size={16} />
              )}
            </span>
            <p>{explanation}</p>
          </div>

          {latest && (
            <p className="protein-detail-latest">
              <History size={13} />
              Último lote: {new Date(latest.recorded_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}
            </p>
          )}

          <div className="section-title">
            <History size={13} />
            Lotes no período
          </div>
          <section className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Data / hora</th>
                  <th>Turno</th>
                  <th>Bruto</th>
                  <th>Líquido</th>
                  <th>Rendimento</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td className="empty-state" colSpan={6}>
                      <span className="empty-state-icon">
                        <Inbox size={16} />
                        Nenhum lote registrado nesta janela.
                      </span>
                    </td>
                  </tr>
                )}
                {rows.map((batch) => {
                  const batchStatus = showTargets ? rendStatus(batch.yield_pct, protein.target_yield) : 'virgin'
                  return (
                    <tr className={batch.voided_at ? 'voided-row' : ''} key={batch.id}>
                      <td>{new Date(batch.recorded_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}</td>
                      <td>{batch.shift}</td>
                      <td>{fmtQty(batch.gross_qty, protein.unit)}</td>
                      <td>{fmtQty(batch.net_qty, protein.unit)}</td>
                      <td>
                        <span className={`rend-cell ${batchStatus}`}>
                          {batchStatus === 'ok' ? (
                            <TrendingUp size={12} />
                          ) : batchStatus === 'virgin' ? null : (
                            <TrendingDown size={12} />
                          )}
                          {fmtPct(batch.yield_pct)}
                        </span>
                      </td>
                      <td>
                        {batch.voided_at ? (
                          <span className="voided-badge">
                            <XCircle size={11} />
                            Anulado
                          </span>
                        ) : (
                          <span className="active-badge">
                            <CheckCircle2 size={11} />
                            Válido
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>

        <footer className="modal-footer">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Fechar
          </button>
          {canCreate && (
            <button
              className="primary-btn"
              type="button"
              onClick={() => {
                onOpenBatch(protein.id)
                onClose()
              }}
            >
              <Plus size={16} />
              Nova produção
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}

type SortColumn = 'date' | 'protein' | 'gross' | 'net' | 'yield' | 'cost' | 'shift' | 'notes' | 'status'
type SortDirection = 'asc' | 'desc'

const diacriticsPattern = new RegExp('[̀-ͯ]', 'g')

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(diacriticsPattern, '').toLowerCase().trim()
}

const shiftOptions = [
  { value: '', label: 'Todos os turnos' },
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
] as const

const shiftFieldOptions: readonly { value: Batch['shift']; label: string }[] = [
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
]

const situationOptions = [
  { value: '', label: 'Todas as situações' },
  { value: 'valid', label: 'Válido' },
  { value: 'voided', label: 'Anulado' },
] as const

const yieldStatusOptions = [
  { value: '', label: 'Todos os rendimentos' },
  { value: 'ok', label: statusLabel('ok') },
  { value: 'warn', label: statusLabel('warn') },
  { value: 'danger', label: statusLabel('danger') },
] as const

type Filters = {
  costMax: string
  costMin: string
  dateFrom: string
  dateTo: string
  grossMax: string
  grossMin: string
  netMax: string
  netMin: string
  notes: string
  proteinId: string
  shift: (typeof shiftOptions)[number]['value']
  status: (typeof situationOptions)[number]['value']
  yieldStatus: (typeof yieldStatusOptions)[number]['value']
}

const emptyFilters: Filters = {
  costMax: '',
  costMin: '',
  dateFrom: '',
  dateTo: '',
  grossMax: '',
  grossMin: '',
  netMax: '',
  netMin: '',
  notes: '',
  proteinId: '',
  shift: '',
  status: '',
  yieldStatus: '',
}

function LogTable({
  batches,
  canEdit,
  canVoid,
  onEditBatch,
  onShowBatchHistory,
  onVoidBatch,
  proteins,
  showCosts,
  showTargets,
}: {
  batches: Batch[]
  canEdit: boolean
  canVoid: boolean
  onEditBatch: (batch: Batch) => void
  onShowBatchHistory: (batch: Batch) => void
  onVoidBatch: (batchId: string) => void
  proteins: Protein[]
  showCosts: boolean
  showTargets: boolean
}) {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sortColumn, setSortColumn] = useState<SortColumn>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection(column === 'date' ? 'desc' : 'asc')
    }
  }
  const byId = useMemo(() => new Map(proteins.map((protein) => [protein.id, protein])), [proteins])
  const proteinOptions = useMemo(() => {
    const sorted = [...proteins].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    return [{ value: '', label: 'Todas as proteínas' }, ...sorted.map((protein) => ({ value: protein.id, label: protein.name }))]
  }, [proteins])
  const columnCount = 8 + (showCosts ? 1 : 0) + (canEdit || canVoid ? 1 : 0)
  const activeFilterCount = useMemo(() => Object.values(filters).filter((value) => value !== '').length, [filters])
  const hasActiveFilters = activeFilterCount > 0

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const visibleBatches = useMemo(() => {
    const notesNeedle = normalizeSearch(filters.notes)
    const filtered = batches.filter((batch) => {
      if (filters.proteinId && batch.protein_id !== filters.proteinId) return false
      if (filters.shift && batch.shift !== filters.shift) return false
      if (filters.status === 'valid' && batch.voided_at) return false
      if (filters.status === 'voided' && !batch.voided_at) return false
      if (filters.yieldStatus) {
        const protein = byId.get(batch.protein_id)
        if (rendStatus(batch.yield_pct, protein?.target_yield) !== filters.yieldStatus) return false
      }
      if (filters.dateFrom && businessDateKey(batch.recorded_at) < filters.dateFrom) return false
      if (filters.dateTo && businessDateKey(batch.recorded_at) > filters.dateTo) return false
      if (filters.grossMin && batch.gross_qty < Number(filters.grossMin)) return false
      if (filters.grossMax && batch.gross_qty > Number(filters.grossMax)) return false
      if (filters.netMin && batch.net_qty < Number(filters.netMin)) return false
      if (filters.netMax && batch.net_qty > Number(filters.netMax)) return false
      if (filters.costMin && (batch.real_cost_kg ?? -Infinity) < Number(filters.costMin)) return false
      if (filters.costMax && (batch.real_cost_kg ?? Infinity) > Number(filters.costMax)) return false
      if (notesNeedle && !normalizeSearch(batch.notes ?? '').includes(notesNeedle)) return false
      return true
    })

    const sorted = [...filtered]
    const direction = sortDirection === 'asc' ? 1 : -1
    switch (sortColumn) {
      case 'protein':
        sorted.sort(
          (a, b) => direction * (byId.get(a.protein_id)?.name ?? '').localeCompare(byId.get(b.protein_id)?.name ?? '', 'pt-BR'),
        )
        break
      case 'gross':
        sorted.sort((a, b) => direction * (a.gross_qty - b.gross_qty))
        break
      case 'net':
        sorted.sort((a, b) => direction * (a.net_qty - b.net_qty))
        break
      case 'yield':
        sorted.sort((a, b) => direction * (a.yield_pct - b.yield_pct))
        break
      case 'cost':
        sorted.sort((a, b) => direction * ((a.real_cost_kg ?? -Infinity) - (b.real_cost_kg ?? -Infinity)))
        break
      case 'shift':
        sorted.sort((a, b) => direction * a.shift.localeCompare(b.shift, 'pt-BR'))
        break
      case 'notes':
        sorted.sort((a, b) => direction * (a.notes ?? '').localeCompare(b.notes ?? '', 'pt-BR'))
        break
      case 'status':
        sorted.sort((a, b) => direction * (Number(Boolean(a.voided_at)) - Number(Boolean(b.voided_at))))
        break
      default:
        sorted.sort((a, b) => direction * (new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()))
    }
    return sorted
  }, [batches, byId, filters, sortColumn, sortDirection])

  const summary = useMemo(() => {
    const count = visibleBatches.length
    const voidedCount = visibleBatches.filter((batch) => batch.voided_at).length
    return {
      count,
      voidedCount,
      totalGross: visibleBatches.reduce((sum, batch) => sum + batch.gross_qty, 0),
      totalNet: visibleBatches.reduce((sum, batch) => sum + batch.net_qty, 0),
      totalCost: visibleBatches.reduce((sum, batch) => sum + (batch.real_cost_kg ?? 0), 0),
      avgYield: count > 0 ? visibleBatches.reduce((sum, batch) => sum + batch.yield_pct, 0) / count : null,
    }
  }, [visibleBatches])

  return (
    <>
      <div className="filter-bar">
        <div className="filter-bar-row">
          <label className="filter-field">
            <span className="field-label-text">
              <Layers size={13} />
              Proteína
            </span>
            <Select onChange={(value) => updateFilter('proteinId', value)} options={proteinOptions} value={filters.proteinId} />
          </label>
          <label className="filter-field">
            <span className="field-label-text">
              <Activity size={13} />
              Situação
            </span>
            <Select onChange={(value) => updateFilter('status', value)} options={situationOptions} value={filters.status} />
          </label>
          {showTargets && (
            <label className="filter-field">
              <span className="field-label-text">
                <TrendingUp size={13} />
                Rendimento
              </span>
              <Select onChange={(value) => updateFilter('yieldStatus', value)} options={yieldStatusOptions} value={filters.yieldStatus} />
            </label>
          )}
          <label className="filter-field">
            <span className="field-label-text">
              <Clock size={13} />
              Turno
            </span>
            <Select onChange={(value) => updateFilter('shift', value)} options={shiftOptions} value={filters.shift} />
          </label>
          <label className="filter-field">
            <span className="field-label-text">
              <MessageSquare size={13} />
              Observação
            </span>
            <div className="search-field">
              <Search size={15} />
              <input
                onChange={(event) => updateFilter('notes', event.target.value)}
                placeholder="Buscar na observação"
                type="search"
                value={filters.notes}
              />
            </div>
          </label>
          {hasActiveFilters && (
            <div className="filter-bar-actions">
              <button
                className="filter-clear-btn"
                onClick={() => setFilters(emptyFilters)}
                title="Limpar filtros"
                type="button"
              >
                <XCircle size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="filter-bar-row">
          <label className="filter-field">
            <span className="field-label-text">
              <Calendar size={13} />
              Período
            </span>
            <div className="range-inputs">
              <DateField onChange={(value) => updateFilter('dateFrom', value)} value={filters.dateFrom} />
              <span>–</span>
              <DateField onChange={(value) => updateFilter('dateTo', value)} value={filters.dateTo} />
            </div>
          </label>
          <label className="filter-field">
            <span className="field-label-text">
              <Package size={13} />
              Peso bruto (kg)
            </span>
            <div className="range-inputs">
              <input
                min={0}
                onChange={(event) => updateFilter('grossMin', event.target.value)}
                placeholder="Mín."
                step="0.001"
                type="number"
                value={filters.grossMin}
              />
              <span>–</span>
              <input
                min={0}
                onChange={(event) => updateFilter('grossMax', event.target.value)}
                placeholder="Máx."
                step="0.001"
                type="number"
                value={filters.grossMax}
              />
            </div>
          </label>
          <label className="filter-field">
            <span className="field-label-text">
              <Weight size={13} />
              Peso líquido (kg)
            </span>
            <div className="range-inputs">
              <input
                min={0}
                onChange={(event) => updateFilter('netMin', event.target.value)}
                placeholder="Mín."
                step="0.001"
                type="number"
                value={filters.netMin}
              />
              <span>–</span>
              <input
                min={0}
                onChange={(event) => updateFilter('netMax', event.target.value)}
                placeholder="Máx."
                step="0.001"
                type="number"
                value={filters.netMax}
              />
            </div>
          </label>
          {showCosts && (
            <label className="filter-field">
              <span className="field-label-text">
                <DollarSign size={13} />
                Custo do lote (R$)
              </span>
              <div className="range-inputs">
                <input
                  min={0}
                  onChange={(event) => updateFilter('costMin', event.target.value)}
                  placeholder="Mín."
                  step="0.01"
                  type="number"
                  value={filters.costMin}
                />
                <span>–</span>
                <input
                  min={0}
                  onChange={(event) => updateFilter('costMax', event.target.value)}
                  placeholder="Máx."
                  step="0.01"
                  type="number"
                  value={filters.costMax}
                />
              </div>
            </label>
          )}
        </div>
      </div>
      <section className="table-shell log-table">
      <table>
        <thead>
          <tr>
            <th>
              <button className="sortable-header" onClick={() => toggleSort('date')} type="button">
                Data / hora
                {sortColumn === 'date' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            <th>
              <button className="sortable-header" onClick={() => toggleSort('protein')} type="button">
                Proteína
                {sortColumn === 'protein' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            <th>
              <button className="sortable-header" onClick={() => toggleSort('gross')} type="button">
                Bruto
                {sortColumn === 'gross' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            <th>
              <button className="sortable-header" onClick={() => toggleSort('net')} type="button">
                Líquido
                {sortColumn === 'net' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            <th>
              <button className="sortable-header" onClick={() => toggleSort('yield')} type="button">
                Rendimento
                {sortColumn === 'yield' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            {showCosts && (
              <th>
                <button className="sortable-header" onClick={() => toggleSort('cost')} type="button">
                  Custo do lote
                  {sortColumn === 'cost' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                </button>
              </th>
            )}
            <th>
              <button className="sortable-header" onClick={() => toggleSort('shift')} type="button">
                Turno
                {sortColumn === 'shift' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            <th>
              <button className="sortable-header" onClick={() => toggleSort('notes')} type="button">
                Obs.
                {sortColumn === 'notes' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            <th>
              <button className="sortable-header" onClick={() => toggleSort('status')} type="button">
                Situação
                {sortColumn === 'status' && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
            </th>
            {(canEdit || canVoid) && <th className="action-cell">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {visibleBatches.length === 0 && (
            <tr>
              <td className="empty-state" colSpan={columnCount}>
                <span className="empty-state-icon">
                  {batches.length === 0 ? <Inbox size={16} /> : <Search size={16} />}
                  {batches.length === 0 ? 'Nenhum lote registrado ainda.' : 'Nenhum lote encontrado para esses filtros.'}
                </span>
              </td>
            </tr>
          )}
          {visibleBatches.map((batch) => {
            const protein = byId.get(batch.protein_id)
            const status = showTargets ? rendStatus(batch.yield_pct, protein?.target_yield) : 'virgin'
            return (
              <tr className={batch.voided_at ? 'voided-row' : ''} key={batch.id}>
                <td>
                  {new Date(batch.recorded_at).toLocaleString('pt-BR', {
                    timeZone: BUSINESS_TIME_ZONE,
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="protein-cell" title={protein?.name ?? 'Cadastro indisponível'}>
                  {protein?.name ?? 'Cadastro indisponível'}
                </td>
                <td>{fmtQty(batch.gross_qty, protein?.unit ?? 'kg')}</td>
                <td>{fmtQty(batch.net_qty, protein?.unit ?? 'kg')}</td>
                <td>
                  <span className={`rend-cell ${status}`}>
                    {status === 'ok' ? <TrendingUp size={12} /> : status === 'virgin' ? null : <TrendingDown size={12} />}
                    {fmtPct(batch.yield_pct)}
                  </span>
                </td>
                {showCosts && <td>{batch.real_cost_kg ? fmtBRL(batch.real_cost_kg) : '-'}</td>}
                <td>{batch.shift}</td>
                <td className="notes-cell" title={batch.notes || undefined}>
                  {batch.notes || '-'}
                </td>
                <td>
                  {batch.voided_at ? (
                    <span className="voided-badge" title={batch.void_reason ?? undefined}>
                      <XCircle size={11} />
                      Anulado
                    </span>
                  ) : (
                    <span className="active-badge">
                      <CheckCircle2 size={11} />
                      Válido
                    </span>
                  )}
                </td>
                {(canEdit || canVoid) && (
                  <td className="action-cell">
                    <div className="row-actions">
                      {canEdit && !batch.voided_at && (
                        <button className="icon-btn edit" type="button" onClick={() => onEditBatch(batch)} title="Editar lote">
                          <Pencil size={15} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="icon-btn history"
                          type="button"
                          onClick={() => onShowBatchHistory(batch)}
                          title="Ver log de alterações"
                        >
                          <History size={15} />
                        </button>
                      )}
                      {canVoid && !batch.voided_at && (
                        <button
                          className="icon-btn danger"
                          type="button"
                          onClick={() => onVoidBatch(batch.id)}
                          title="Anular lote"
                        >
                          <Archive size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="summary-row">
            <td className="summary-label">Resumo ({summary.count})</td>
            <td>-</td>
            <td>
              <strong className="summary-value">{fmtKg(summary.totalGross)}</strong>
            </td>
            <td>
              <strong className="summary-value">{fmtKg(summary.totalNet)}</strong>
            </td>
            <td>{summary.avgYield === null ? '-' : <strong className="summary-value">{fmtPct(summary.avgYield)}</strong>}</td>
            {showCosts && (
              <td>
                <strong className="summary-value">{fmtBRL(summary.totalCost)}</strong>
              </td>
            )}
            <td>-</td>
            <td>-</td>
            <td>
              {summary.count === 0 ? (
                '-'
              ) : (
                <span className="summary-status">
                  <CheckCircle2 size={11} />
                  {summary.count - summary.voidedCount}
                  <XCircle size={11} />
                  {summary.voidedCount}
                </span>
              )}
            </td>
            {(canEdit || canVoid) && <td className="action-cell">-</td>}
          </tr>
        </tfoot>
      </table>
      </section>
    </>
  )
}

export function BatchModal({
  editReason,
  editingBatch,
  form,
  onChange,
  onClose,
  onEditReasonChange,
  onSubmit,
  proteins,
  responsibleNames,
  showCosts,
  showTargets,
}: {
  editReason: string
  editingBatch: Batch | null
  form: BatchForm
  onChange: (form: BatchForm) => void
  onClose: () => void
  onEditReasonChange: (reason: string) => void
  onSubmit: (event: FormEvent) => void
  proteins: Protein[]
  responsibleNames: string[]
  showCosts: boolean
  showTargets: boolean
}) {
  const protein = proteins.find((item) => item.id === form.proteinId)
  const gross = Number(form.grossQty)
  const net = Number(form.netQty)
  const yieldPct = gross > 0 && net > 0 && net <= gross ? (net / gross) * 100 : null
  const costSnapshot =
    editingBatch && editingBatch.protein_id === protein?.id ? editingBatch.protein_cost_snapshot : protein?.cost
  const estimatedCost = showCosts && costSnapshot && yieldPct ? costSnapshot / (yieldPct / 100) : null
  const selectableResponsibleNames =
    editingBatch &&
    form.responsible &&
    form.responsible !== 'Outro' &&
    !responsibleNames.includes(form.responsible)
      ? [form.responsible, ...responsibleNames]
      : responsibleNames
  const responsibleOptions = [
    { value: '', label: 'Selecione' },
    ...selectableResponsibleNames.map((name) => ({ value: name, label: name })),
    { value: 'Outro', label: 'Outro (colocar na observação)' },
  ]

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div
      aria-labelledby="batch-modal-title"
      aria-modal="true"
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
    >
      <form className="modal" onSubmit={onSubmit}>
        <header className="modal-header">
          <div>
            <h2 id="batch-modal-title">{editingBatch ? 'Editar lançamento' : 'Nova produção'}</h2>
            <span>
              {protein
                ? showCosts && costSnapshot
                  ? `${protein.name} · ${fmtBRL(costSnapshot)}/${protein.unit} bruto`
                  : protein.name
                : 'Selecione o ingrediente'}
            </span>
          </div>
          <button className="icon-btn ghost" type="button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <div className="field-label">
            <Layers size={13} />
            Ingrediente
          </div>
          <div className="protein-chips">
            {proteins.map((item) => (
              <button
                autoFocus={!form.proteinId && item.id === proteins[0]?.id}
                className={form.proteinId === item.id ? 'active' : ''}
                key={item.id}
                type="button"
                disabled={Boolean(editingBatch && !item.active && item.id !== editingBatch.protein_id)}
                onClick={() => onChange({ ...form, proteinId: item.id })}
              >
                {item.name}{!item.active && ' (inativa)'}
              </button>
            ))}
          </div>

          <div className="form-grid two">
            <label>
              <span className="field-label-text">
                <Package size={13} />
                Bruto ({protein?.unit ?? 'kg'})
              </span>
              <input
                min={0.001}
                onChange={(event) => onChange({ ...form, grossQty: event.target.value })}
                required
                step="0.001"
                type="number"
                value={form.grossQty}
              />
            </label>
            <label>
              <span className="field-label-text">
                <Weight size={13} />
                Líquido ({protein?.unit ?? 'kg'})
              </span>
              <input
                min={0.001}
                onChange={(event) => onChange({ ...form, netQty: event.target.value })}
                required
                step="0.001"
                type="number"
                value={form.netQty}
              />
            </label>
          </div>

          <div className={`live-calc ${showCosts ? '' : 'two'}`}>
            <MiniMetric
              icon={Percent}
              label="Rendimento"
              value={fmtPct(yieldPct)}
              tone={showTargets ? rendStatus(yieldPct, protein?.target_yield) : 'virgin'}
            />
            <MiniMetric
              icon={TrendingDown}
              label="Perda"
              tone={yieldPct ? 'danger' : ''}
              value={yieldPct ? fmtQty(gross - net, protein?.unit ?? 'kg') : '-'}
            />
            {showCosts && (
              <MiniMetric
                icon={DollarSign}
                label={`Custo estimado/${protein?.unit ?? 'kg'} líquido`}
                value={estimatedCost ? fmtBRL(estimatedCost) : '-'}
              />
            )}
          </div>

          <div className="form-grid two">
            <label>
              <span className="field-label-text">
                <Clock size={13} />
                Turno
              </span>
              <Select
                onChange={(value) => onChange({ ...form, shift: value })}
                options={shiftFieldOptions}
                value={form.shift}
              />
            </label>
            <label>
              <span className="field-label-text">
                <User size={13} />
                Responsável
              </span>
              <Select
                onChange={(value) => onChange({ ...form, responsible: value })}
                options={responsibleOptions}
                value={form.responsible}
              />
            </label>
          </div>

          <label>
            <span className="field-label-text">
              <MessageSquare size={13} />
              Observações
            </span>
            <textarea value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} rows={3} />
          </label>

          {editingBatch && (
            <label className="justification-field">
              <span className="field-label-text">
                <AlertCircle size={13} />
                Justificativa da alteração
              </span>
              <textarea
                autoFocus
                minLength={3}
                onChange={(event) => onEditReasonChange(event.target.value)}
                placeholder="Explique por que este lançamento precisa ser corrigido"
                required
                rows={3}
                value={editReason}
              />
              <small>Obrigatória. Será registrada no log de auditoria.</small>
            </label>
          )}
        </div>

        <footer className="modal-footer">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn" type="submit">
            <Save size={18} />
            {editingBatch ? 'Salvar alteração' : 'Salvar produção'}
          </button>
        </footer>
      </form>
    </div>
  )
}

const auditFieldLabels: Record<string, string> = {
  protein_id: 'Proteína',
  gross_qty: 'Peso bruto',
  net_qty: 'Peso líquido',
  yield_pct: 'Rendimento',
  protein_cost_snapshot: 'Custo bruto congelado',
  real_cost_kg: 'Custo real/kg',
  shift: 'Turno',
  responsible: 'Responsável',
  notes: 'Observações',
}

function formatAuditValue(field: string, value: unknown, proteins: Protein[]) {
  if (value === null || value === undefined || value === '') return '-'
  if (field === 'protein_id') return proteins.find((protein) => protein.id === value)?.name ?? String(value)
  if (field === 'gross_qty' || field === 'net_qty') return fmtKg(Number(value))
  if (field === 'yield_pct') return fmtPct(Number(value))
  if (field === 'protein_cost_snapshot' || field === 'real_cost_kg') return fmtBRL(Number(value))
  if (field === 'shift') return value === 'manha' ? 'Manhã' : 'Tarde'
  return String(value)
}

export function BatchHistoryModal({
  batch,
  loading,
  logs,
  onClose,
  proteins,
}: {
  batch: Batch
  loading: boolean
  logs: BatchEditLog[]
  onClose: () => void
  proteins: Protein[]
}) {
  const proteinName = proteins.find((protein) => protein.id === batch.protein_id)?.name ?? 'Proteína indisponível'

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div
      aria-labelledby="batch-history-title"
      aria-modal="true"
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
    >
      <section className="modal audit-modal">
        <header className="modal-header">
          <div>
            <h2 id="batch-history-title">Log de alterações</h2>
            <span>{proteinName} · {new Date(batch.recorded_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}</span>
          </div>
          <button className="icon-btn ghost" type="button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body audit-list">
          {loading && (
            <div className="empty-state">
              <span className="empty-state-icon">
                <RefreshCw className="spin" size={16} />
                Carregando alterações...
              </span>
            </div>
          )}
          {!loading && logs.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-icon">
                <History size={16} />
                Este lote ainda não foi editado.
              </span>
            </div>
          )}
          {!loading && logs.map((log) => (
            <article className="audit-entry" key={log.id}>
              <header>
                <strong>{log.editor_name || 'Usuário removido'}</strong>
                <time>{new Date(log.edited_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}</time>
              </header>
              <p><strong>Justificativa:</strong> {log.reason}</p>
              <div className="audit-changes">
                {log.changed_fields.map((field) => (
                  <div className="audit-change" key={field}>
                    <span>{auditFieldLabels[field] ?? field}</span>
                    <del>{formatAuditValue(field, log.before_data[field], proteins)}</del>
                    <strong>{formatAuditValue(field, log.after_data[field], proteins)}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <footer className="modal-footer">
          <button className="secondary-btn" type="button" onClick={onClose}>Fechar</button>
        </footer>
      </section>
    </div>
  )
}
