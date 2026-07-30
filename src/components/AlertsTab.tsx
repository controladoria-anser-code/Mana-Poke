import type { FormEvent } from 'react'
import { AlertTriangle, Archive, Eye, Plus, Undo2 } from 'lucide-react'
import {
  BUSINESS_TIME_ZONE,
  averageYield,
  buildAlerts,
  daysSince,
  fmtBRL,
  fmtPct,
  lastBatch,
  rendStatus,
  statusLabel,
} from '../lib/metrics'
import type { Batch, Protein } from '../types'

export function AlertsTab({
  alerts,
  canCreate,
  canEdit,
  latestBatches,
  metricBatches,
  newProtein,
  onCreateProtein,
  onOpenBatch,
  onSetNewProtein,
  onThresholdChange,
  onToggleProtein,
  onUpdateProtein,
  onYieldWindowChange,
  proteins,
  showCosts,
  showTargets,
  threshold,
  yieldWindowDays,
}: {
  alerts: ReturnType<typeof buildAlerts>
  canCreate: boolean
  canEdit: boolean
  latestBatches: Batch[]
  metricBatches: Batch[]
  newProtein: { name: string; cost: string; target: string }
  onCreateProtein: (event: FormEvent) => void
  onOpenBatch: (proteinId?: string) => void
  onSetNewProtein: (value: { name: string; cost: string; target: string }) => void
  onThresholdChange: (value: number) => void
  onToggleProtein: (protein: Protein) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  onYieldWindowChange: (value: number) => void
  proteins: Protein[]
  showCosts: boolean
  showTargets: boolean
  threshold: number
  yieldWindowDays: number
}) {
  return (
    <section className="alerts-layout">
      <div className="alerts-column">
        <div className="alerts-header">
          <h2>Alertas ativos</h2>
          <label>
            Sem produção há
            <input
              disabled={!canEdit}
              min={1}
              onBlur={(event) => onThresholdChange(Number(event.target.value))}
              type="number"
              defaultValue={threshold}
            />
            dia(s)
          </label>
          <label>
            Rendimento dos últimos
            <input
              disabled={!canEdit}
              max={365}
              min={1}
              onBlur={(event) => onYieldWindowChange(Number(event.target.value))}
              type="number"
              defaultValue={yieldWindowDays}
            />
            dia(s)
          </label>
        </div>
        <div className="alerts-list">
          {alerts.length === 0 && (
            <div className="empty-alerts">
              <Eye size={28} />
              Tudo em ordem no momento.
            </div>
          )}
          {alerts.map((alert) => (
            <article className={`alert-card ${alert.severity}`} key={`${alert.proteinId}-${alert.title}`}>
              <AlertTriangle size={22} />
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.desc}</p>
                {canCreate && (
                  <button type="button" onClick={() => onOpenBatch(alert.proteinId)}>
                    <Plus size={14} />
                    Registrar produção
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="overview-column">
        <div className="section-title">Tabela geral</div>
        <section className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Proteína</th>
                <th>Último lote</th>
                <th>Dias</th>
                <th>Rend. ponderado</th>
                {showTargets && <th>Meta</th>}
                {showCosts && <th>Custo bruto</th>}
                {showCosts && <th>Custo estimado atual</th>}
                {showTargets && <th>Status</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {proteins.map((protein) => {
                const average = averageYield(metricBatches, protein.id)
                const latest = lastBatch(latestBatches, protein.id)
                const days = daysSince(latest?.recorded_at)
                const status = showTargets ? rendStatus(average, protein.target_yield) : 'virgin'
                const estimatedCost = showCosts && protein.cost && average ? protein.cost / (average / 100) : null

                return (
                  <tr className={protein.active ? '' : 'inactive-row'} key={protein.id}>
                    <td className="strong-cell">
                      {protein.name}
                      {!protein.active && <span className="inactive-badge">Inativa</span>}
                    </td>
                    <td>
                      {latest
                        ? new Date(latest.recorded_at).toLocaleString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })
                        : '-'}
                    </td>
                    <td>{days === null ? 'Nunca' : days === 0 ? 'Hoje' : `${days}d`}</td>
                    <td>
                      <span className={`rend-cell ${status}`}>{fmtPct(average)}</span>
                    </td>
                    {showTargets && (
                      <td>
                        <input
                          className="table-input"
                          disabled={!canEdit}
                          max={100}
                          min={1}
                          onBlur={(event) => onUpdateProtein(protein.id, { target_yield: Number(event.target.value) })}
                          type="number"
                          defaultValue={protein.target_yield ?? ''}
                        />
                      </td>
                    )}
                    {showCosts && (
                      <td>
                        <input
                          className="table-input"
                          disabled={!canEdit}
                          min={0.01}
                          onBlur={(event) => onUpdateProtein(protein.id, { cost: Number(event.target.value) })}
                          type="number"
                          step="0.01"
                          defaultValue={protein.cost ?? ''}
                        />
                      </td>
                    )}
                    {showCosts && <td>{estimatedCost ? `${fmtBRL(estimatedCost)}/kg líq.` : '-'}</td>}
                    {showTargets && (
                      <td>
                        <span className={`status-pill ${status}`}>{statusLabel(status)}</span>
                      </td>
                    )}
                    <td className="row-actions">
                      {canCreate && protein.active && (
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() => onOpenBatch(protein.id)}
                          title="Nova produção"
                        >
                          <Plus size={15} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className={`icon-btn ${protein.active ? 'danger' : ''}`}
                          type="button"
                          onClick={() => onToggleProtein(protein)}
                          title={protein.active ? 'Desativar proteína' : 'Reativar proteína'}
                        >
                          {protein.active ? <Archive size={15} /> : <Undo2 size={15} />}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {canEdit && (
          <form className="add-protein-form" onSubmit={onCreateProtein}>
            <input
              placeholder="Nova proteína"
              value={newProtein.name}
              onChange={(event) => onSetNewProtein({ ...newProtein, name: event.target.value })}
            />
            <input
              placeholder="Custo R$/kg"
              min="0.01"
              type="number"
              step="0.01"
              value={newProtein.cost}
              onChange={(event) => onSetNewProtein({ ...newProtein, cost: event.target.value })}
            />
            <input
              max="100"
              min="1"
              placeholder="Meta %"
              type="number"
              value={newProtein.target}
              onChange={(event) => onSetNewProtein({ ...newProtein, target: event.target.value })}
            />
            <button className="small-action" type="submit">
              <Plus size={15} />
              Adicionar
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
