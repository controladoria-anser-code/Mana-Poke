import { type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  Edit3,
  History,
  Inbox,
  LayoutGrid,
  MessageSquare,
  Package,
  Plus,
  Search,
  Table2,
  Trash2,
  Wallet,
  Weight,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { categoryMeta, categoryOrder, resolveCategoryMeta } from '../lib/categories'
import { BUSINESS_TIME_ZONE, businessDateKey, fmtBRL, fmtQty } from '../lib/metrics'
import type { MovementType, Protein, StockCategory, StockLevel, StockMovement } from '../types'
import { Metric } from './ProductionViews'
import { Select } from './Select'

function handleCardSpotlight(event: ReactMouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--x', `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty('--y', `${event.clientY - rect.top}px`)
}

type StockView = 'overview' | 'table' | 'dashboard'

const movementLabels: Record<MovementType, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
}

const movementTypeOptions: { value: MovementType; label: string }[] = [
  { value: 'entrada', label: movementLabels.entrada },
  { value: 'saida', label: movementLabels.saida },
  { value: 'ajuste', label: movementLabels.ajuste },
]

const movementTone: Record<MovementType, string> = {
  entrada: 'ok',
  saida: 'danger',
  ajuste: 'virgin',
}

const stockStatusLabel: Record<StockLevel['status'], string> = {
  ok: 'Em dia',
  low: 'Abaixo do mínimo',
  out: 'Zerado',
  sem_meta: 'Sem meta definida',
}

const stockStatusClass: Record<StockLevel['status'], string> = {
  ok: 'ok',
  low: 'warn',
  out: 'danger',
  sem_meta: 'virgin',
}

const viewOptions: { value: StockView; icon: LucideIcon; label: string }[] = [
  { value: 'overview', icon: LayoutGrid, label: 'Visão geral' },
  { value: 'table', icon: Table2, label: 'Tabela' },
  { value: 'dashboard', icon: Wallet, label: 'Dashboard' },
]

function stockGauge(level: StockLevel) {
  if (level.min_stock && level.min_stock > 0) {
    const scaleMax = level.min_stock * 2
    return { fillPct: Math.min((level.on_hand / scaleMax) * 100, 100), scaleMax, targetPct: 50 as number | null }
  }
  return { fillPct: level.on_hand > 0 ? 100 : 0, scaleMax: level.on_hand, targetPct: null as number | null }
}

function buildMovementTrend(movements: StockMovement[]) {
  const now = Date.now()
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now - (13 - index) * 86_400_000)
    return {
      entradas: 0,
      key: businessDateKey(date.toISOString()),
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: BUSINESS_TIME_ZONE }),
      saidas: 0,
    }
  })
  const byKey = new Map(days.map((day) => [day.key, day]))
  movements.forEach((movement) => {
    const day = byKey.get(businessDateKey(movement.created_at))
    if (!day) return
    if (movement.movement_type === 'entrada') day.entradas += 1
    else if (movement.movement_type === 'saida') day.saidas += 1
  })
  return days
}

function StockInsights({ stockLevels }: { stockLevels: StockLevel[] }) {
  if (stockLevels.length === 0) return null

  const outLevels = stockLevels.filter((level) => level.status === 'out')
  const lowLevels = stockLevels.filter((level) => level.status === 'low')
  const okCount = stockLevels.filter((level) => level.status === 'ok').length

  if (outLevels.length === 0 && lowLevels.length === 0) {
    return (
      <div className="insights-row">
        <div className="insight-card ok">
          <span className="insight-icon ok motion-rise">
            <CheckCircle2 size={18} />
          </span>
          <div className="insight-body">
            <span className="insight-label">Estoque sob controle</span>
            <strong>Tudo em dia</strong>
            <small>
              {okCount} de {stockLevels.length} ite{stockLevels.length === 1 ? 'm' : 'ns'} dentro do mínimo
            </small>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="insights-row">
      {outLevels.length > 0 && (
        <div className="insight-card danger">
          <span className="insight-icon danger motion-fall">
            <XCircle size={18} />
          </span>
          <div className="insight-body">
            <span className="insight-label">Sem estoque</span>
            <strong>
              {outLevels[0].name}
              {outLevels.length > 1 ? ` e mais ${outLevels.length - 1}` : ''}
            </strong>
            <small>Repor com urgência</small>
          </div>
        </div>
      )}
      {lowLevels.length > 0 && (
        <div className="insight-card warn">
          <span className="insight-icon warn motion-fall">
            <AlertTriangle size={18} />
          </span>
          <div className="insight-body">
            <span className="insight-label">Abaixo do mínimo</span>
            <strong>
              {lowLevels[0].name}
              {lowLevels.length > 1 ? ` e mais ${lowLevels.length - 1}` : ''}
            </strong>
            <small>Programar reposição</small>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryStatusChart({ stockLevels }: { stockLevels: StockLevel[] }) {
  const rows = categoryOrder
    .map((category) => stockLevels.filter((level) => level.category === category))
    .filter((rows) => rows.length > 0)

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>Situação por categoria</h3>
        <span>Distribuição de itens em dia, abaixo do mínimo e zerados</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">
          <span className="empty-state-icon">
            <Inbox size={16} />
            Nenhum item cadastrado ainda.
          </span>
        </p>
      ) : (
        <div className="perf-chart">
          {rows.map((items) => {
            const category = items[0].category
            const CategoryIcon = categoryMeta[category].icon
            const ok = items.filter((item) => item.status === 'ok').length
            const warn = items.filter((item) => item.status === 'low').length
            const danger = items.filter((item) => item.status === 'out').length
            const virgin = items.length - ok - warn - danger
            const total = items.length
            return (
              <div className="perf-row" key={category}>
                <span className="perf-label">
                  <CategoryIcon size={13} />
                  {categoryMeta[category].label}
                </span>
                <div className="stock-status-track">
                  {ok > 0 && <div className="stock-status-segment ok" style={{ width: `${(ok / total) * 100}%` }} />}
                  {warn > 0 && <div className="stock-status-segment warn" style={{ width: `${(warn / total) * 100}%` }} />}
                  {danger > 0 && <div className="stock-status-segment danger" style={{ width: `${(danger / total) * 100}%` }} />}
                  {virgin > 0 && <div className="stock-status-segment virgin" style={{ width: `${(virgin / total) * 100}%` }} />}
                </div>
                <span className="perf-value">
                  {total} ite{total === 1 ? 'm' : 'ns'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MovementTrendChart({ movements }: { movements: StockMovement[] }) {
  const days = useMemo(() => buildMovementTrend(movements), [movements])
  const maxCount = Math.max(1, ...days.map((day) => Math.max(day.entradas, day.saidas)))
  const barMaxHeight = 64

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>Movimentações (14 dias)</h3>
        <span>Entradas e saídas registradas por dia</span>
      </div>
      <div className="chart-card-body">
        <div className="stock-movement-chart">
          {days.map((day) => (
            <div className="stock-movement-bar-col" key={day.key} title={`${day.label}: ${day.entradas} entrada(s), ${day.saidas} saída(s)`}>
              <div className="stock-movement-bar-up-wrap">
                {day.entradas > 0 && (
                  <div className="stock-movement-bar-up" style={{ height: `${(day.entradas / maxCount) * barMaxHeight}px` }} />
                )}
              </div>
              <div className="stock-movement-bar-axis" />
              <div className="stock-movement-bar-down-wrap">
                {day.saidas > 0 && (
                  <div className="stock-movement-bar-down" style={{ height: `${(day.saidas / maxCount) * barMaxHeight}px` }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="chart-axis-labels">
          {days
            .filter((_, index) => index % 3 === 0)
            .map((day) => (
              <span key={day.key}>{day.label}</span>
            ))}
        </div>
        <div className="chart-legend">
          <span className="chart-legend-item">
            <span className="chart-legend-dot ok" />
            Entradas
          </span>
          <span className="chart-legend-item">
            <span className="chart-legend-dot danger" />
            Saídas
          </span>
        </div>
      </div>
    </div>
  )
}

function StockCard({
  canManage,
  lastMovement,
  level,
  movementCount,
  onSelect,
  onUpdateProtein,
  protein,
}: {
  canManage: boolean
  lastMovement: StockMovement | undefined
  level: StockLevel
  movementCount: number
  onSelect: (level: StockLevel) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'min_stock_kg'>>) => void
  protein: Protein | undefined
}) {
  const statusClass = stockStatusClass[level.status]
  const { fillPct, scaleMax, targetPct } = stockGauge(level)
  const { icon: CategoryIcon, label: categoryLabel } = resolveCategoryMeta(level.category)
  const estimatedValue = protein?.cost ? protein.cost * level.on_hand : null

  return (
    <article className={`protein-card clickable ${statusClass}`} onClick={() => onSelect(level)} onMouseMove={handleCardSpotlight}>
      <div className="card-accent" />
      <div className="card-body">
        <div className="card-header">
          <div className="card-header-main">
            <div className={`protein-icon ${statusClass}`}>
              <CategoryIcon size={18} />
            </div>
            <div>
              <h2>{level.name}</h2>
              <span>
                {categoryLabel} · {movementCount} movimentaç{movementCount === 1 ? 'ão' : 'ões'}
              </span>
            </div>
          </div>
          <span className={`status-pill ${statusClass}`}>{stockStatusLabel[level.status]}</span>
        </div>

        <div className="metrics-grid two">
          <div className="mini-metric">
            <div className="mini-metric-top">
              <span className="mini-metric-label">Em estoque</span>
            </div>
            <strong className={statusClass}>{fmtQty(level.on_hand, level.unit)}</strong>
          </div>
          <div className="mini-metric">
            <div className="mini-metric-top">
              <span className="mini-metric-label">Mínimo</span>
            </div>
            <strong>{level.min_stock ? fmtQty(level.min_stock, level.unit) : '-'}</strong>
          </div>
        </div>

        <div className="gauge">
          <div className="gauge-labels">
            <span>0 {level.unit}</span>
            {targetPct !== null && <span>Mínimo {fmtQty(level.min_stock ?? 0, level.unit)}</span>}
            <span>{fmtQty(scaleMax, level.unit)}</span>
          </div>
          <div className="gauge-track">
            <div className={`gauge-fill ${statusClass}`} style={{ width: `${fillPct}%` }} />
            {targetPct !== null && <div className="gauge-target" style={{ left: `${targetPct}%` }} />}
          </div>
        </div>

        {canManage && (
          <div className="target-row" onClick={(event) => event.stopPropagation()}>
            <span>Estoque mínimo</span>
            <input
              defaultValue={level.min_stock ?? ''}
              min={0}
              onBlur={(event) =>
                onUpdateProtein(level.item_id, { min_stock_kg: event.target.value ? Number(event.target.value) : null })
              }
              placeholder={level.unit}
              step="0.001"
              type="number"
            />
            <span>{level.unit}</span>
          </div>
        )}

        <footer className="card-footer stock-card-footer">
          <div className="stock-card-footer-info">
            {estimatedValue !== null && <strong>{fmtBRL(estimatedValue)} em estoque</strong>}
            {!lastMovement && <small>Nenhum movimento registrado ainda.</small>}
          </div>
          {lastMovement && (
            <span
              className={`stock-signal-dot ${movementTone[lastMovement.movement_type]}`}
              title={`${movementLabels[lastMovement.movement_type]} · clique para ver detalhes`}
            />
          )}
        </footer>
      </div>
    </article>
  )
}

function StockDetailModal({
  canManage,
  itemMovements,
  level,
  onClose,
  onDeleteItem,
  onEditItem,
  onUpdateProtein,
  protein,
}: {
  canManage: boolean
  itemMovements: StockMovement[]
  level: StockLevel
  onClose: () => void
  onDeleteItem: (id: string) => Promise<boolean>
  onEditItem: (id: string) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'min_stock_kg'>>) => void
  protein: Protein | undefined
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

  const statusClass = stockStatusClass[level.status]
  const { fillPct, scaleMax, targetPct } = stockGauge(level)
  const { icon: CategoryIcon, label: categoryLabel } = resolveCategoryMeta(level.category)
  const estimatedValue = protein?.cost ? protein.cost * level.on_hand : null

  async function handleDelete() {
    if (!window.confirm(`Excluir "${level.name}"? Isso só funciona se ele nunca teve lote, movimentação ou ficha técnica.`)) return
    const ok = await onDeleteItem(level.item_id)
    if (ok) onClose()
  }

  return (
    <div
      aria-labelledby="stock-detail-title"
      aria-modal="true"
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
    >
      <section className="modal protein-detail-modal">
        <header className="modal-header">
          <div className="card-header-main">
            <div className={`protein-icon ${statusClass}`}>
              <CategoryIcon size={20} />
            </div>
            <div>
              <h2 id="stock-detail-title">{level.name}</h2>
              <span>
                {categoryLabel} · {itemMovements.length} movimentaç{itemMovements.length === 1 ? 'ão' : 'ões'}
              </span>
            </div>
          </div>
          <div className="modal-header-actions">
            <span className={`status-pill ${statusClass}`}>{stockStatusLabel[level.status]}</span>
            <button className="icon-btn ghost" onClick={onClose} title="Fechar" type="button">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="modal-body">
          <div className="metrics-grid">
            <div className="mini-metric">
              <div className="mini-metric-top">
                <span className="mini-metric-label">Em estoque</span>
              </div>
              <strong className={statusClass}>{fmtQty(level.on_hand, level.unit)}</strong>
            </div>
            <div className="mini-metric">
              <div className="mini-metric-top">
                <span className="mini-metric-label">Mínimo</span>
              </div>
              <strong>{level.min_stock ? fmtQty(level.min_stock, level.unit) : '-'}</strong>
            </div>
            {estimatedValue !== null && (
              <div className="mini-metric">
                <div className="mini-metric-top">
                  <span className="mini-metric-label">Valor em estoque</span>
                </div>
                <strong>{fmtBRL(estimatedValue)}</strong>
              </div>
            )}
          </div>

          <div className="gauge large">
            <div className="gauge-labels">
              <span>0 {level.unit}</span>
              {targetPct !== null && <span>Mínimo {fmtQty(level.min_stock ?? 0, level.unit)}</span>}
              <span>{fmtQty(scaleMax, level.unit)}</span>
            </div>
            <div className="gauge-track">
              <div className={`gauge-fill ${statusClass}`} style={{ width: `${fillPct}%` }} />
              {targetPct !== null && <div className="gauge-target" style={{ left: `${targetPct}%` }} />}
            </div>
          </div>

          {canManage && (
            <div className="target-row">
              <span>Estoque mínimo</span>
              <input
                defaultValue={level.min_stock ?? ''}
                min={0}
                onBlur={(event) =>
                  onUpdateProtein(level.item_id, { min_stock_kg: event.target.value ? Number(event.target.value) : null })
                }
                placeholder={level.unit}
                step="0.001"
                type="number"
              />
              <span>{level.unit}</span>
            </div>
          )}

          <div className="section-title">
            <History size={13} />
            Histórico de movimentos
          </div>
          <section className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {itemMovements.length === 0 && (
                  <tr>
                    <td className="empty-state" colSpan={4}>
                      <span className="empty-state-icon">
                        <Inbox size={16} />
                        Nenhum movimento registrado ainda.
                      </span>
                    </td>
                  </tr>
                )}
                {itemMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.created_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}</td>
                    <td>
                      <span className={`status-pill ${movementTone[movement.movement_type]}`}>
                        {movementLabels[movement.movement_type]}
                      </span>
                    </td>
                    <td>
                      <span className={`rend-cell ${movement.quantity < 0 ? 'danger' : 'ok'}`}>
                        {movement.quantity > 0 ? '+' : ''}
                        {fmtQty(movement.quantity, movement.unit)}
                      </span>
                    </td>
                    <td>{movement.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <footer className="modal-footer">
          <button className="secondary-btn" onClick={onClose} type="button">
            Fechar
          </button>
          {canManage && (
            <>
              <button className="icon-btn" onClick={() => onEditItem(level.item_id)} title="Editar" type="button">
                <Edit3 size={15} />
              </button>
              <button className="icon-btn danger" onClick={handleDelete} title="Excluir" type="button">
                <Trash2 size={15} />
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

function CategoryFilterChips({
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
          {categoryMeta[category].label}
        </button>
      ))}
    </div>
  )
}

export function StockTab({
  canManage,
  movements,
  onDeleteItem,
  onEditItem,
  onRecordMovement,
  onUpdateProtein,
  proteins,
  stockLevels,
}: {
  canManage: boolean
  movements: StockMovement[]
  onDeleteItem: (id: string) => Promise<boolean>
  onEditItem: (id: string) => void
  onRecordMovement: (itemId: string, type: MovementType, quantity: number, note: string) => Promise<boolean>
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'min_stock_kg'>>) => void
  proteins: Protein[]
  stockLevels: StockLevel[]
}) {
  const [view, setView] = useState<StockView>('overview')
  const [categoryFilter, setCategoryFilter] = useState<StockCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<StockLevel | null>(null)

  const [showMovementForm, setShowMovementForm] = useState(false)
  const [movementForm, setMovementForm] = useState({ itemId: '', type: 'entrada' as MovementType, quantity: '', note: '' })
  const [savingMovement, setSavingMovement] = useState(false)

  const itemOptions = [
    { label: 'Selecione', value: '' },
    ...stockLevels.map((level) => ({
      label: level.category === 'proteinas' ? level.name : `${level.name} · ${resolveCategoryMeta(level.category).label}`,
      value: level.item_id,
    })),
  ]
  const selectedLevel = stockLevels.find((level) => level.item_id === movementForm.itemId)

  const okCount = stockLevels.filter((level) => level.status === 'ok').length
  const lowCount = stockLevels.filter((level) => level.status === 'low').length
  const outCount = stockLevels.filter((level) => level.status === 'out').length

  const presentCategories = categoryOrder.filter((category) => stockLevels.some((level) => level.category === category))
  const categoryFiltered = categoryFilter === 'all' ? stockLevels : stockLevels.filter((level) => level.category === categoryFilter)
  const searchedLevels = search.trim()
    ? categoryFiltered.filter((level) => level.name.toLowerCase().includes(search.trim().toLowerCase()))
    : categoryFiltered

  function movementsFor(itemId: string) {
    return movements.filter((movement) => movement.item_id === itemId)
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault()
    const quantity = Number(movementForm.quantity)
    if (!movementForm.itemId || !Number.isFinite(quantity) || quantity <= 0) return

    setSavingMovement(true)
    const signedQuantity = movementForm.type === 'saida' ? -quantity : quantity
    const ok = await onRecordMovement(movementForm.itemId, movementForm.type, signedQuantity, movementForm.note.trim())
    if (ok) {
      setMovementForm({ itemId: '', type: 'entrada', quantity: '', note: '' })
      setShowMovementForm(false)
    }
    setSavingMovement(false)
  }

  return (
    <>
      <div className="section-header-row">
        <div className="stock-toolbar-filters">
          <div className="chart-period-filter">
            {viewOptions.map((option) => (
              <button
                className={view === option.value ? 'active' : ''}
                key={option.value}
                onClick={() => setView(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {view !== 'dashboard' && (
            <CategoryFilterChips categoryFilter={categoryFilter} presentCategories={presentCategories} setCategoryFilter={setCategoryFilter} />
          )}
          {view === 'table' && (
            <label className="stock-search-field">
              <Search size={14} />
              <input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar item..." value={search} />
              {search && (
                <button onClick={() => setSearch('')} type="button">
                  <X size={13} />
                </button>
              )}
            </label>
          )}
        </div>
        {canManage && (
          <button className="secondary-btn" onClick={() => setShowMovementForm((value) => !value)} type="button">
            <ArrowLeftRight size={15} />
            {showMovementForm ? 'Fechar' : 'Registrar movimento'}
          </button>
        )}
      </div>

      {canManage && showMovementForm && (
        <form className="stock-movement-form stacked-section" onSubmit={submitMovement}>
          <label>
            <span className="field-label-text">
              <Package size={13} />
              Item
            </span>
            <Select
              onChange={(value) => setMovementForm({ ...movementForm, itemId: value })}
              options={itemOptions}
              value={movementForm.itemId}
            />
          </label>
          <label>
            <span className="field-label-text">
              <ArrowLeftRight size={13} />
              Tipo
            </span>
            <Select
              onChange={(value) => setMovementForm({ ...movementForm, type: value as MovementType })}
              options={movementTypeOptions}
              value={movementForm.type}
            />
          </label>
          <label>
            <span className="field-label-text">
              <Weight size={13} />
              Quantidade{selectedLevel ? ` (${selectedLevel.unit})` : ''}
            </span>
            <input
              min={0.001}
              onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })}
              required
              step="0.001"
              type="number"
              value={movementForm.quantity}
            />
          </label>
          <label>
            <span className="field-label-text">
              <MessageSquare size={13} />
              Observação
            </span>
            <input onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} value={movementForm.note} />
          </label>
          <button className="small-action" disabled={savingMovement} type="submit">
            <Plus size={15} />
            {savingMovement ? 'Salvando...' : 'Registrar'}
          </button>
        </form>
      )}

      {view === 'overview' && (
        <>
          {searchedLevels.length === 0 ? (
            <div className="empty-state stacked-section">
              <span className="empty-state-icon">
                <Inbox size={16} />
                Nenhum item cadastrado ainda.
              </span>
            </div>
          ) : (
            <section className="proteins-grid stacked-section">
              {searchedLevels.map((level) => {
                const itemMovements = movementsFor(level.item_id)
                return (
                  <StockCard
                    canManage={canManage}
                    key={level.item_id}
                    lastMovement={itemMovements[0]}
                    level={level}
                    movementCount={itemMovements.length}
                    onSelect={setSelectedItem}
                    onUpdateProtein={onUpdateProtein}
                    protein={proteins.find((item) => item.id === level.item_id)}
                  />
                )
              })}
            </section>
          )}
        </>
      )}

      {selectedItem && (
        <StockDetailModal
          canManage={canManage}
          itemMovements={movementsFor(selectedItem.item_id)}
          level={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDeleteItem={onDeleteItem}
          onEditItem={onEditItem}
          onUpdateProtein={onUpdateProtein}
          protein={proteins.find((item) => item.id === selectedItem.item_id)}
        />
      )}

      {view === 'table' && (
        <>
          <section className="table-shell stacked-section">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Categoria</th>
                  <th>Em estoque</th>
                  <th>Mínimo</th>
                  <th>Situação</th>
                  {canManage && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {searchedLevels.length === 0 && (
                  <tr>
                    <td className="empty-state" colSpan={canManage ? 6 : 5}>
                      <span className="empty-state-icon">
                        <Inbox size={16} />
                        Nenhum item encontrado.
                      </span>
                    </td>
                  </tr>
                )}
                {searchedLevels.map((level) => {
                  const statusClass = stockStatusClass[level.status]
                  const { icon: CategoryIcon, label: categoryLabel } = resolveCategoryMeta(level.category)
                  return (
                    <tr key={level.item_id}>
                      <td>{level.name}</td>
                      <td>
                        <span className="status-pill virgin">
                          <CategoryIcon size={11} />
                          {categoryLabel}
                        </span>
                      </td>
                      <td>
                        <span className={`rend-cell ${statusClass}`}>{fmtQty(level.on_hand, level.unit)}</span>
                      </td>
                      <td>{level.min_stock ? fmtQty(level.min_stock, level.unit) : '-'}</td>
                      <td>
                        <span className={`status-pill ${statusClass}`}>{stockStatusLabel[level.status]}</span>
                      </td>
                      {canManage && (
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => onEditItem(level.item_id)} title="Editar" type="button">
                              <Edit3 size={14} />
                            </button>
                            <button
                              className="icon-btn danger"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Excluir "${level.name}"? Isso só funciona se ele nunca teve lote, movimentação ou ficha técnica.`,
                                  )
                                ) {
                                  void onDeleteItem(level.item_id)
                                }
                              }}
                              title="Excluir"
                              type="button"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {view === 'dashboard' && (
        <>
          <div className="finance-metrics-row">
            <Metric icon={Boxes} iconMotion="stack" label="Itens monitorados" sub="com estoque ativo" tone="accent" value={String(stockLevels.length)} />
            <Metric icon={CheckCircle2} iconMotion="rise" label="Em dia" sub="dentro do mínimo" tone="ok" value={String(okCount)} />
            <Metric
              icon={AlertTriangle}
              iconMotion="fall"
              label="Abaixo do mínimo"
              sub={lowCount > 0 ? 'Programar reposição' : 'Nenhuma'}
              tone="warn"
              value={String(lowCount)}
            />
            <Metric icon={XCircle} iconMotion="fall" label="Zerado" sub={outCount > 0 ? 'Ação necessária' : 'Nenhuma'} tone="danger" value={String(outCount)} />
          </div>

          <StockInsights stockLevels={stockLevels} />

          <div className="charts-grid">
            <CategoryStatusChart stockLevels={stockLevels} />
            <MovementTrendChart movements={movements} />
          </div>
        </>
      )}

    </>
  )
}
