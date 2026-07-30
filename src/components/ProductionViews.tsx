import { type FormEvent, useEffect } from 'react'
import { Archive, Plus, RefreshCw, Save, X } from 'lucide-react'
import {
  BUSINESS_TIME_ZONE,
  averageYield,
  batchesForProtein,
  fmtBRL,
  fmtKg,
  fmtPct,
  isSameDay,
  lastBatch,
  rendStatus,
  statusLabel,
} from '../lib/metrics'
import type { Batch, BatchForm, Protein } from '../types'

export function Metric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="strip-item">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  )
}

export function ProductionTab({
  activeProteins,
  canCreate,
  canEdit,
  canVoid,
  hasMoreBatches,
  historyBatches,
  latestBatches,
  loadingMoreBatches,
  metricBatches,
  onLoadMoreBatches,
  onOpenBatch,
  onVoidBatch,
  onUpdateProtein,
  proteinCatalog,
  showCosts,
  showTargets,
  yieldWindowDays,
}: {
  activeProteins: Protein[]
  canCreate: boolean
  canEdit: boolean
  canVoid: boolean
  hasMoreBatches: boolean
  historyBatches: Batch[]
  latestBatches: Batch[]
  loadingMoreBatches: boolean
  metricBatches: Batch[]
  onLoadMoreBatches: () => void
  onOpenBatch: (proteinId?: string) => void
  onVoidBatch: (batchId: string) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  proteinCatalog: Protein[]
  showCosts: boolean
  showTargets: boolean
  yieldWindowDays: number
}) {
  return (
    <>
      <div className="section-title">Proteínas ativas</div>
      <section className="proteins-grid">
        {activeProteins.map((protein) => (
          <ProteinCard
            canCreate={canCreate}
            canEdit={canEdit}
            key={protein.id}
            latestBatches={latestBatches}
            metricBatches={metricBatches}
            onOpenBatch={onOpenBatch}
            onUpdateProtein={onUpdateProtein}
            protein={protein}
            showCosts={showCosts}
            showTargets={showTargets}
            yieldWindowDays={yieldWindowDays}
          />
        ))}
      </section>

      <div className="section-title">Histórico geral de lotes</div>
      <LogTable
        batches={historyBatches}
        canVoid={canVoid}
        onVoidBatch={onVoidBatch}
        proteins={proteinCatalog}
        showCosts={showCosts}
        showTargets={showTargets}
      />
      {hasMoreBatches && (
        <div className="load-more-row">
          <button className="secondary-btn" disabled={loadingMoreBatches} type="button" onClick={onLoadMoreBatches}>
            <RefreshCw className={loadingMoreBatches ? 'spin' : ''} size={16} />
            {loadingMoreBatches ? 'Carregando...' : 'Carregar lotes anteriores'}
          </button>
        </div>
      )}
    </>
  )
}

function ProteinCard({
  canCreate,
  canEdit,
  latestBatches,
  metricBatches,
  onOpenBatch,
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
    .reduce((sum, batch) => sum + batch.net_kg, 0)
  const estimatedCost = showCosts && protein.cost && average ? protein.cost / (average / 100) : null

  return (
    <article className={`protein-card ${status}`}>
      <div className="card-accent" />
      <div className="card-body">
        <div className="card-header">
          <div>
            <h2>{protein.name}</h2>
            <span>
              {rows.length} lote{rows.length === 1 ? '' : 's'} nos últimos {yieldWindowDays} dias
            </span>
          </div>
          {showTargets && <span className={`status-pill ${status}`}>{statusLabel(status)}</span>}
        </div>

        <div className={`metrics-grid ${showTargets ? '' : 'two'}`}>
          <MiniMetric label="Rend. ponderado" value={fmtPct(average)} tone={status} />
          {showTargets && <MiniMetric label="Meta" value={fmtPct(protein.target_yield)} />}
          <MiniMetric label="Hoje" value={fmtKg(producedToday)} />
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
          <div className="target-row">
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
                <span>Custo bruto {protein.cost ? `${fmtBRL(protein.cost)}/kg` : '-'}</span>
                <strong>Custo estimado atual {estimatedCost ? `${fmtBRL(estimatedCost)}/kg líquido` : '-'}</strong>
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
            <button className="small-action" type="button" onClick={() => onOpenBatch(protein.id)}>
              <Plus size={15} />
              Produção
            </button>
          )}
        </footer>
      </div>
    </article>
  )
}

function MiniMetric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  )
}

function LogTable({
  batches,
  canVoid,
  onVoidBatch,
  proteins,
  showCosts,
  showTargets,
}: {
  batches: Batch[]
  canVoid: boolean
  onVoidBatch: (batchId: string) => void
  proteins: Protein[]
  showCosts: boolean
  showTargets: boolean
}) {
  const byId = new Map(proteins.map((protein) => [protein.id, protein]))
  const columnCount = 8 + (showCosts ? 1 : 0) + (canVoid ? 1 : 0)

  return (
    <section className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Data / hora</th>
            <th>Proteína</th>
            <th>Bruto</th>
            <th>Líquido</th>
            <th>Rendimento</th>
            {showCosts && <th>Custo do lote</th>}
            <th>Turno</th>
            <th>Obs.</th>
            <th>Situação</th>
            {canVoid && <th />}
          </tr>
        </thead>
        <tbody>
          {batches.length === 0 && (
            <tr>
              <td className="empty-state" colSpan={columnCount}>
                Nenhum lote registrado ainda.
              </td>
            </tr>
          )}
          {batches.map((batch) => {
            const protein = byId.get(batch.protein_id)
            const status = showTargets ? rendStatus(batch.yield_pct, protein?.target_yield) : 'virgin'
            return (
              <tr className={batch.voided_at ? 'voided-row' : ''} key={batch.id}>
                <td>{new Date(batch.recorded_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}</td>
                <td>{protein?.name ?? 'Cadastro indisponível'}</td>
                <td>{fmtKg(batch.gross_kg)}</td>
                <td>{fmtKg(batch.net_kg)}</td>
                <td>
                  <span className={`rend-cell ${status}`}>{fmtPct(batch.yield_pct)}</span>
                </td>
                {showCosts && <td>{batch.real_cost_kg ? fmtBRL(batch.real_cost_kg) : '-'}</td>}
                <td>{batch.shift}</td>
                <td>{batch.notes || '-'}</td>
                <td>
                  {batch.voided_at ? (
                    <span className="voided-badge" title={batch.void_reason ?? undefined}>
                      Anulado
                    </span>
                  ) : (
                    <span className="active-badge">Válido</span>
                  )}
                </td>
                {canVoid && (
                  <td>
                    {!batch.voided_at && (
                      <button
                        className="icon-btn danger"
                        type="button"
                        onClick={() => onVoidBatch(batch.id)}
                        title="Anular lote"
                      >
                        <Archive size={15} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export function BatchModal({
  form,
  onChange,
  onClose,
  onSubmit,
  proteins,
  responsibleNames,
  showCosts,
  showTargets,
}: {
  form: BatchForm
  onChange: (form: BatchForm) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  proteins: Protein[]
  responsibleNames: string[]
  showCosts: boolean
  showTargets: boolean
}) {
  const protein = proteins.find((item) => item.id === form.proteinId)
  const gross = Number(form.grossKg)
  const net = Number(form.netKg)
  const yieldPct = gross > 0 && net > 0 && net <= gross ? (net / gross) * 100 : null
  const estimatedCost = showCosts && protein?.cost && yieldPct ? protein.cost / (yieldPct / 100) : null

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
            <h2 id="batch-modal-title">Nova produção</h2>
            <span>
              {protein
                ? showCosts && protein.cost
                  ? `${protein.name} · ${fmtBRL(protein.cost)}/kg bruto`
                  : protein.name
                : 'Selecione a proteína'}
            </span>
          </div>
          <button className="icon-btn ghost" type="button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <div className="field-label">Proteína</div>
          <div className="protein-chips">
            {proteins.map((item) => (
              <button
                autoFocus={!form.proteinId && item.id === proteins[0]?.id}
                className={form.proteinId === item.id ? 'active' : ''}
                key={item.id}
                type="button"
                onClick={() => onChange({ ...form, proteinId: item.id })}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="form-grid two">
            <label>
              Bruto (kg)
              <input
                min={0.001}
                onChange={(event) => onChange({ ...form, grossKg: event.target.value })}
                required
                step="0.001"
                type="number"
                value={form.grossKg}
              />
            </label>
            <label>
              Líquido (kg)
              <input
                min={0.001}
                onChange={(event) => onChange({ ...form, netKg: event.target.value })}
                required
                step="0.001"
                type="number"
                value={form.netKg}
              />
            </label>
          </div>

          <div className={`live-calc ${showCosts ? '' : 'two'}`}>
            <MiniMetric
              label="Rendimento"
              value={fmtPct(yieldPct)}
              tone={showTargets ? rendStatus(yieldPct, protein?.target_yield) : 'virgin'}
            />
            <MiniMetric label="Perda" value={yieldPct ? fmtKg(gross - net) : '-'} />
            {showCosts && (
              <MiniMetric label="Custo estimado/kg líquido" value={estimatedCost ? fmtBRL(estimatedCost) : '-'} />
            )}
          </div>

          <div className="form-grid two">
            <label>
              Turno
              <select
                value={form.shift}
                onChange={(event) => onChange({ ...form, shift: event.target.value as Batch['shift'] })}
              >
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
              </select>
            </label>
            <label>
              Responsável
              <select
                required
                value={form.responsible}
                onChange={(event) => onChange({ ...form, responsible: event.target.value })}
              >
                <option value="">Selecione</option>
                {responsibleNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="Outro">Outro (colocar na observação)</option>
              </select>
            </label>
          </div>

          <label>
            Observações
            <textarea value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} rows={3} />
          </label>
        </div>

        <footer className="modal-footer">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn" type="submit">
            <Save size={18} />
            Salvar produção
          </button>
        </footer>
      </form>
    </div>
  )
}
