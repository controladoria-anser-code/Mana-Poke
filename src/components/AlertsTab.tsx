import { AlertTriangle, Archive, Clock, ClipboardList, Eye, History, Layers, Plus, TrendingDown, Undo2 } from 'lucide-react'
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
import { Metric } from './ProductionViews'

export function AlertsTab({
  alerts,
  canCreate,
  canEdit,
  latestBatches,
  metricBatches,
  onOpenBatch,
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
  onOpenBatch: (proteinId?: string) => void
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
  const activeProteins = proteins.filter((protein) => protein.active)
  const stalledAlerts = alerts.filter((alert) => !alert.title.includes('abaixo da meta'))
  const targetAlerts = alerts.filter((alert) => alert.title.includes('abaixo da meta'))

  return (
    <>
      <div className="finance-metrics-row">
        <Metric
          icon={Layers}
          iconMotion="stack"
          label="Ingredientes monitorados"
          sub="ativas no cardápio"
          tone="accent"
          value={String(activeProteins.length)}
        />
        <Metric
          icon={AlertTriangle}
          iconMotion={alerts.length > 0 ? 'fall' : 'rise'}
          label="Alertas ativos"
          sub={alerts.length > 0 ? 'Requer atenção' : 'Tudo certo'}
          tone={alerts.length > 0 ? 'danger' : 'ok'}
          value={String(alerts.length)}
        />
        <Metric
          icon={Clock}
          iconMotion={stalledAlerts.length > 0 ? 'fall' : 'rise'}
          label="Paradas"
          sub="sem produção recente"
          tone={stalledAlerts.length > 0 ? 'danger' : 'ok'}
          value={String(stalledAlerts.length)}
        />
        <Metric
          icon={TrendingDown}
          iconMotion={targetAlerts.length > 0 ? 'fall' : 'rise'}
          label="Abaixo da meta"
          sub="rendimento abaixo do alvo"
          tone={targetAlerts.length > 0 ? 'warn' : 'ok'}
          value={String(targetAlerts.length)}
        />
      </div>

      <div className="section-header-row">
        <div className="section-title">
          <AlertTriangle size={13} />
          Alertas ativos
        </div>
        <div className="alert-settings-panel">
          <label className="alert-setting">
            <span className="field-label-text">
              <Clock size={13} />
              Sem produção há
            </span>
            <span className="alert-setting-input">
              <input
                disabled={!canEdit}
                min={1}
                onBlur={(event) => onThresholdChange(Number(event.target.value))}
                type="number"
                defaultValue={threshold}
              />
              <span>dia(s)</span>
            </span>
          </label>
          <span className="alert-settings-divider" />
          <label className="alert-setting">
            <span className="field-label-text">
              <History size={13} />
              Rendimento dos últimos
            </span>
            <span className="alert-setting-input">
              <input
                disabled={!canEdit}
                max={365}
                min={1}
                onBlur={(event) => onYieldWindowChange(Number(event.target.value))}
                type="number"
                defaultValue={yieldWindowDays}
              />
              <span>dia(s)</span>
            </span>
          </label>
        </div>
      </div>

      <div className="alerts-grid stacked-section">
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

      <div className="section-title">
        <ClipboardList size={13} />
        Visão geral dos ingredientes
      </div>
      <section className="table-shell compact-table stacked-section">
        <table>
          <thead>
            <tr>
              <th>Ingrediente</th>
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
                    {latest ? new Date(latest.recorded_at).toLocaleDateString('pt-BR', { timeZone: BUSINESS_TIME_ZONE }) : '-'}
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
                        title={protein.active ? 'Desativar ingrediente' : 'Reativar ingrediente'}
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
    </>
  )
}
