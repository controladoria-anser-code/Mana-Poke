import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Edit3,
  Eye,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import type { AppSetting, Batch, Profile, Protein, Role } from './types'
import {
  averageYield,
  batchesForProtein,
  buildAlerts,
  daysSince,
  fmtBRL,
  fmtKg,
  fmtPct,
  isSameDay,
  lastBatch,
  rendStatus,
  statusLabel,
} from './lib/metrics'
import {
  canCreateBatch,
  canDeleteBatch,
  canManageProteins,
  canManageUsers,
  roleLabel,
} from './lib/permissions'

type Tab = 'producao' | 'alertas' | 'acessos'

type BatchForm = {
  proteinId: string
  grossKg: string
  netKg: string
  shift: Batch['shift']
  responsible: string
  notes: string
}

const emptyBatchForm: BatchForm = {
  proteinId: '',
  grossKg: '',
  netKg: '',
  shift: 'manha',
  responsible: '',
  notes: '',
}

const roles: Role[] = ['admin', 'gestor', 'operador', 'viewer']

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setBooting(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return <SetupRequired />
  if (booting) return <Splash text="Carregando sessão..." />
  if (!session) return <AuthPanel />

  return <Workspace session={session} />
}

function SetupRequired() {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <div className="logo-lock">
          <Shield size={28} />
        </div>
        <h1>Conectar o Supabase</h1>
        <p>
          Configure na Vercel <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, ou use <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> localmente. O SQL de criação está em <code>supabase/schema.sql</code>.
        </p>
      </section>
    </main>
  )
}

function Splash({ text }: { text: string }) {
  return (
    <main className="setup-screen">
      <section className="setup-panel compact">
        <RefreshCw className="spin" size={24} />
        <p>{text}</p>
      </section>
    </main>
  )
}

function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setMessage('')

    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          })

    if (result.error) {
      setMessage(result.error.message)
    } else if (mode === 'signup') {
      setMessage('Cadastro criado. Verifique o e-mail se a confirmação estiver ativa no Supabase.')
    }

    setLoading(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="logo-mark">MP</div>
          <div>
            <strong>Mana Poke</strong>
            <span>Controle de rendimento online</span>
          </div>
        </div>

        <div className="mode-switch" role="tablist" aria-label="Modo de acesso">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>
            Entrar
          </button>
          <button className={mode === 'signup' ? 'active' : ''} type="button" onClick={() => setMode('signup')}>
            Cadastrar
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              Nome
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            E-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={6}
              required
            />
          </label>

          <button className="primary-btn" type="submit" disabled={loading}>
            <KeyRound size={18} />
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar acesso'}
          </button>
          {message && <p className="form-message">{message}</p>}
        </form>
      </section>
    </main>
  )
}

function Workspace({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [proteins, setProteins] = useState<Protein[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [threshold, setThreshold] = useState(1)
  const [tab, setTab] = useState<Tab>('producao')
  const [batchForm, setBatchForm] = useState<BatchForm>(emptyBatchForm)
  const [modalOpen, setModalOpen] = useState(false)
  const [newProtein, setNewProtein] = useState({ name: '', cost: '', target: '80' })
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const loadWorkspace = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setStatus('')

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    let nextProfile = profileRow as Profile | null

    if (!nextProfile && !profileError) {
      const { data: createdProfile } = await supabase
        .from('profiles')
        .insert({
          id: session.user.id,
          email: session.user.email ?? '',
          full_name: session.user.user_metadata.full_name ?? null,
          role: 'operador',
        })
        .select('*')
        .single()

      nextProfile = createdProfile as Profile | null
    }

    if (!nextProfile) {
      setStatus(profileError?.message ?? 'Não foi possível carregar o perfil do usuário.')
      setLoading(false)
      return
    }

    const [proteinRows, batchRows, settingRows] = await Promise.all([
      supabase.from('proteins').select('*').eq('active', true).order('name'),
      supabase.from('batches').select('*').order('recorded_at', { ascending: false }),
      supabase.from('app_settings').select('*'),
    ])

    setProfile(nextProfile)
    setProteins((proteinRows.data ?? []) as Protein[])
    setBatches((batchRows.data ?? []) as Batch[])
    setThreshold(Number(((settingRows.data ?? []) as AppSetting[]).find((item) => item.key === 'alert_threshold')?.value ?? 1))

    if (canManageUsers(nextProfile.role)) {
      const { data: allProfiles } = await supabase.from('profiles').select('*').order('created_at')
      setProfiles((allProfiles ?? []) as Profile[])
    } else {
      setProfiles([])
    }

    setLoading(false)
  }, [session.user.email, session.user.id, session.user.user_metadata.full_name])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadWorkspace()
    })

    return () => {
      cancelled = true
    }
  }, [loadWorkspace])

  const role = profile?.role ?? 'viewer'
  const alerts = useMemo(() => buildAlerts(proteins, batches, threshold), [batches, proteins, threshold])
  const today = useMemo(() => new Date(), [])

  const summary = useMemo(() => {
    const todayBatches = batches.filter((batch) => isSameDay(new Date(batch.recorded_at), today))
    const averages = proteins
      .map((protein) => ({ protein, avg: averageYield(batches, protein.id) }))
      .filter((item): item is { protein: Protein; avg: number } => item.avg !== null)

    const average = averages.length ? averages.reduce((sum, item) => sum + item.avg, 0) / averages.length : null
    const above = averages.filter((item) => item.avg >= item.protein.target_yield).length
    const below = averages.filter((item) => item.avg < item.protein.target_yield).length
    const totalNet = todayBatches.reduce((sum, batch) => sum + batch.net_kg, 0)

    return { todayCount: todayBatches.length, average, above, below, totalNet }
  }, [batches, proteins, today])

  function openBatchModal(proteinId = '') {
    setBatchForm({ ...emptyBatchForm, proteinId })
    setModalOpen(true)
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  async function saveThreshold(value: number) {
    if (!supabase || !canManageProteins(role) || value < 1) return
    setThreshold(value)
    await supabase.from('app_settings').upsert({ key: 'alert_threshold', value: String(value) })
  }

  async function updateProtein(id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) {
    if (!supabase || !canManageProteins(role)) return
    const client = supabase
    setStatus('')
    const { error } = await client.from('proteins').update(patch).eq('id', id)
    if (error) {
      setStatus(error.message)
      return
    }

    if (patch.cost) {
      const affected = batches.filter((batch) => batch.protein_id === id)
      await Promise.all(
        affected.map((batch) =>
          client
            .from('batches')
            .update({ real_cost_kg: patch.cost! / (batch.yield_pct / 100) })
            .eq('id', batch.id),
        ),
      )
    }

    await loadWorkspace()
  }

  async function createProtein(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !canManageProteins(role)) return
    const name = newProtein.name.trim()
    const cost = Number(newProtein.cost)
    const target = Number(newProtein.target)
    if (!name || cost <= 0 || target <= 0) return

    const slug = `${name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}-${Date.now()}`

    const { error } = await supabase.from('proteins').insert({ slug, name, cost, target_yield: target })
    if (error) {
      setStatus(error.message)
      return
    }

    setNewProtein({ name: '', cost: '', target: '80' })
    await loadWorkspace()
  }

  async function deleteProtein(protein: Protein) {
    if (!supabase || !canManageProteins(role)) return
    if (!window.confirm(`Remover "${protein.name}" e seus lotes?`)) return
    const { error } = await supabase.from('proteins').delete().eq('id', protein.id)
    if (error) {
      setStatus(error.message)
      return
    }
    await loadWorkspace()
  }

  async function createBatch(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !canCreateBatch(role)) return
    const protein = proteins.find((item) => item.id === batchForm.proteinId)
    const gross = Number(batchForm.grossKg)
    const net = Number(batchForm.netKg)
    if (!protein || gross <= 0 || net <= 0 || net > gross) {
      setStatus('Confira proteína, peso bruto e peso líquido.')
      return
    }

    const yieldPct = (net / gross) * 100
    const realCost = protein.cost / (yieldPct / 100)
    const { error } = await supabase.from('batches').insert({
      protein_id: protein.id,
      gross_kg: gross,
      net_kg: net,
      yield_pct: yieldPct,
      real_cost_kg: realCost,
      shift: batchForm.shift,
      responsible: batchForm.responsible.trim() || null,
      notes: batchForm.notes.trim() || null,
      created_by: session.user.id,
    })

    if (error) {
      setStatus(error.message)
      return
    }

    setModalOpen(false)
    await loadWorkspace()
  }

  async function deleteBatch(batchId: string) {
    if (!supabase || !canDeleteBatch(role)) return
    if (!window.confirm('Excluir este lote?')) return
    const { error } = await supabase.from('batches').delete().eq('id', batchId)
    if (error) {
      setStatus(error.message)
      return
    }
    await loadWorkspace()
  }

  async function updateRole(userId: string, nextRole: Role) {
    if (!supabase || !canManageUsers(role) || userId === profile?.id) return
    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', userId)
    if (error) {
      setStatus(error.message)
      return
    }
    await loadWorkspace()
  }

  if (loading || !profile) return <Splash text="Sincronizando dados..." />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo-mark">MP</div>
          <div>
            <div className="logo-main">Mana Poke</div>
            <div className="logo-sub">Controle de rendimento</div>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="date-label">
            {today.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
          <span className="role-chip">
            <Shield size={14} />
            {roleLabel(role)}
          </span>
          {canCreateBatch(role) && (
            <button className="new-batch-btn" type="button" onClick={() => openBatchModal()}>
              <Plus size={18} />
              Novo lote
            </button>
          )}
          <button className="icon-btn ghost" type="button" onClick={signOut} title="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="summary-strip">
        <Metric label="Lotes hoje" value={String(summary.todayCount)} tone="accent" />
        <Metric label="Rendimento médio" value={fmtPct(summary.average)} />
        <Metric label="Acima da meta" value={String(summary.above)} tone="ok" />
        <Metric label="Abaixo da meta" value={String(summary.below)} tone="warn" />
        <Metric label="Kg produzidos hoje" value={summary.totalNet.toFixed(3)} tone="accent" />
      </section>

      <nav className="tab-nav">
        <button className={tab === 'producao' ? 'active' : ''} type="button" onClick={() => setTab('producao')}>
          <ClipboardList size={17} />
          Produção
        </button>
        <button className={tab === 'alertas' ? 'active' : ''} type="button" onClick={() => setTab('alertas')}>
          <Bell size={17} />
          Alertas e visão geral
          <span className={`alert-badge ${alerts.length === 0 ? 'zero' : ''}`}>{alerts.length}</span>
        </button>
        {canManageUsers(role) && (
          <button className={tab === 'acessos' ? 'active' : ''} type="button" onClick={() => setTab('acessos')}>
            <Users size={17} />
            Acessos
          </button>
        )}
      </nav>

      {status && <div className="status-banner">{status}</div>}

      <main className="main">
        {tab === 'producao' && (
          <ProductionTab
            batches={batches}
            canDelete={canDeleteBatch(role)}
            canEdit={canManageProteins(role)}
            onDeleteBatch={deleteBatch}
            onOpenBatch={openBatchModal}
            onUpdateProtein={updateProtein}
            proteins={proteins}
          />
        )}

        {tab === 'alertas' && (
          <AlertsTab
            alerts={alerts}
            batches={batches}
            canEdit={canManageProteins(role)}
            newProtein={newProtein}
            onCreateProtein={createProtein}
            onDeleteProtein={deleteProtein}
            onOpenBatch={openBatchModal}
            onSetNewProtein={setNewProtein}
            onThresholdChange={saveThreshold}
            onUpdateProtein={updateProtein}
            proteins={proteins}
            threshold={threshold}
          />
        )}

        {tab === 'acessos' && canManageUsers(role) && (
          <AccessTab currentUserId={profile.id} onUpdateRole={updateRole} profiles={profiles} />
        )}
      </main>

      {modalOpen && (
        <BatchModal
          form={batchForm}
          onChange={setBatchForm}
          onClose={() => setModalOpen(false)}
          onSubmit={createBatch}
          proteins={proteins}
        />
      )}
    </div>
  )
}

function Metric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="strip-item">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  )
}

function ProductionTab({
  batches,
  canDelete,
  canEdit,
  onDeleteBatch,
  onOpenBatch,
  onUpdateProtein,
  proteins,
}: {
  batches: Batch[]
  canDelete: boolean
  canEdit: boolean
  onDeleteBatch: (batchId: string) => void
  onOpenBatch: (proteinId?: string) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  proteins: Protein[]
}) {
  return (
    <>
      <div className="section-title">Proteínas cadastradas</div>
      <section className="proteins-grid">
        {proteins.map((protein) => (
          <ProteinCard
            batches={batches}
            canEdit={canEdit}
            key={protein.id}
            onOpenBatch={onOpenBatch}
            onUpdateProtein={onUpdateProtein}
            protein={protein}
          />
        ))}
      </section>

      <div className="section-title">Histórico geral de lotes</div>
      <LogTable batches={batches} canDelete={canDelete} onDeleteBatch={onDeleteBatch} proteins={proteins} />
    </>
  )
}

function ProteinCard({
  batches,
  canEdit,
  onOpenBatch,
  onUpdateProtein,
  protein,
}: {
  batches: Batch[]
  canEdit: boolean
  onOpenBatch: (proteinId?: string) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  protein: Protein
}) {
  const rows = batchesForProtein(batches, protein.id)
  const avg = averageYield(batches, protein.id)
  const last = lastBatch(batches, protein.id)
  const status = rendStatus(avg, protein.target_yield)
  const producedToday = rows
    .filter((batch) => isSameDay(new Date(batch.recorded_at), new Date()))
    .reduce((sum, batch) => sum + batch.net_kg, 0)
  const realCost = avg ? protein.cost / (avg / 100) : null

  return (
    <article className={`protein-card ${status}`}>
      <div className="card-accent" />
      <div className="card-body">
        <div className="card-header">
          <div>
            <h2>{protein.name}</h2>
            <span>{rows.length} lote{rows.length === 1 ? '' : 's'} registrado{rows.length === 1 ? '' : 's'}</span>
          </div>
          <span className={`status-pill ${status}`}>{statusLabel(status)}</span>
        </div>

        <div className="metrics-grid">
          <MiniMetric label="Média" value={fmtPct(avg)} tone={status} />
          <MiniMetric label="Meta" value={fmtPct(protein.target_yield)} />
          <MiniMetric label="Hoje" value={fmtKg(producedToday)} />
        </div>

        <div className="gauge">
          <div className="gauge-labels">
            <span>0%</span>
            <span>Meta {fmtPct(protein.target_yield)}</span>
            <span>100%</span>
          </div>
          <div className="gauge-track">
            <div className={`gauge-fill ${status}`} style={{ width: `${Math.min(avg ?? 0, 100)}%` }} />
            <div className="gauge-target" style={{ left: `${Math.min(protein.target_yield, 100)}%` }} />
          </div>
        </div>

        <div className="target-row">
          <span>Meta de rendimento</span>
          <input
            disabled={!canEdit}
            max={100}
            min={1}
            onBlur={(event) => onUpdateProtein(protein.id, { target_yield: Number(event.target.value) })}
            type="number"
            defaultValue={protein.target_yield}
          />
          <span>%</span>
        </div>

        <footer className="card-footer">
          <div>
            <span>Custo bruto {fmtBRL(protein.cost)}/kg</span>
            <strong>Custo real {realCost ? `${fmtBRL(realCost)}/kg` : '-'}</strong>
            {last && <small>Último lote: {new Date(last.recorded_at).toLocaleString('pt-BR')}</small>}
          </div>
          <button className="small-action" type="button" onClick={() => onOpenBatch(protein.id)}>
            <Plus size={15} />
            Lote
          </button>
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
  canDelete,
  onDeleteBatch,
  proteins,
}: {
  batches: Batch[]
  canDelete: boolean
  onDeleteBatch: (batchId: string) => void
  proteins: Protein[]
}) {
  const byId = new Map(proteins.map((protein) => [protein.id, protein]))

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
            <th>Custo real</th>
            <th>Turno</th>
            <th>Obs.</th>
            {canDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {batches.length === 0 && (
            <tr>
              <td className="empty-state" colSpan={canDelete ? 9 : 8}>
                Nenhum lote registrado ainda.
              </td>
            </tr>
          )}
          {batches.map((batch) => {
            const protein = byId.get(batch.protein_id)
            const status = rendStatus(batch.yield_pct, protein?.target_yield ?? 80)
            return (
              <tr key={batch.id}>
                <td>{new Date(batch.recorded_at).toLocaleString('pt-BR')}</td>
                <td>{protein?.name ?? 'Removida'}</td>
                <td>{fmtKg(batch.gross_kg)}</td>
                <td>{fmtKg(batch.net_kg)}</td>
                <td>
                  <span className={`rend-cell ${status}`}>{fmtPct(batch.yield_pct)}</span>
                </td>
                <td>{fmtBRL(batch.real_cost_kg)}</td>
                <td>{batch.shift}</td>
                <td>{batch.notes || '-'}</td>
                {canDelete && (
                  <td>
                    <button className="icon-btn danger" type="button" onClick={() => onDeleteBatch(batch.id)} title="Excluir">
                      <Trash2 size={15} />
                    </button>
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

function AlertsTab({
  alerts,
  batches,
  canEdit,
  newProtein,
  onCreateProtein,
  onDeleteProtein,
  onOpenBatch,
  onSetNewProtein,
  onThresholdChange,
  onUpdateProtein,
  proteins,
  threshold,
}: {
  alerts: ReturnType<typeof buildAlerts>
  batches: Batch[]
  canEdit: boolean
  newProtein: { name: string; cost: string; target: string }
  onCreateProtein: (event: FormEvent) => void
  onDeleteProtein: (protein: Protein) => void
  onOpenBatch: (proteinId?: string) => void
  onSetNewProtein: (value: { name: string; cost: string; target: string }) => void
  onThresholdChange: (value: number) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  proteins: Protein[]
  threshold: number
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
                <button type="button" onClick={() => onOpenBatch(alert.proteinId)}>
                  <Plus size={14} />
                  Registrar lote
                </button>
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
                <th>Rend. médio</th>
                <th>Meta</th>
                <th>Custo bruto</th>
                <th>Custo real</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {proteins.map((protein) => {
                const avg = averageYield(batches, protein.id)
                const last = lastBatch(batches, protein.id)
                const days = daysSince(last?.recorded_at)
                const status = rendStatus(avg, protein.target_yield)
                const realCost = avg ? protein.cost / (avg / 100) : null

                return (
                  <tr key={protein.id}>
                    <td className="strong-cell">{protein.name}</td>
                    <td>{last ? new Date(last.recorded_at).toLocaleString('pt-BR') : '-'}</td>
                    <td>{days === null ? 'Nunca' : days === 0 ? 'Hoje' : `${days}d`}</td>
                    <td>
                      <span className={`rend-cell ${status}`}>{fmtPct(avg)}</span>
                    </td>
                    <td>
                      <input
                        className="table-input"
                        disabled={!canEdit}
                        onBlur={(event) => onUpdateProtein(protein.id, { target_yield: Number(event.target.value) })}
                        type="number"
                        defaultValue={protein.target_yield}
                      />
                    </td>
                    <td>
                      <input
                        className="table-input"
                        disabled={!canEdit}
                        onBlur={(event) => onUpdateProtein(protein.id, { cost: Number(event.target.value) })}
                        type="number"
                        step="0.01"
                        defaultValue={protein.cost}
                      />
                    </td>
                    <td>{realCost ? fmtBRL(realCost) : '-'}</td>
                    <td>
                      <span className={`status-pill ${status}`}>{statusLabel(status)}</span>
                    </td>
                    <td className="row-actions">
                      <button className="icon-btn" type="button" onClick={() => onOpenBatch(protein.id)} title="Novo lote">
                        <Plus size={15} />
                      </button>
                      {canEdit && (
                        <button
                          className="icon-btn danger"
                          type="button"
                          onClick={() => onDeleteProtein(protein)}
                          title="Remover proteína"
                        >
                          <Trash2 size={15} />
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
              type="number"
              step="0.01"
              value={newProtein.cost}
              onChange={(event) => onSetNewProtein({ ...newProtein, cost: event.target.value })}
            />
            <input
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

function AccessTab({
  currentUserId,
  onUpdateRole,
  profiles,
}: {
  currentUserId: string
  onUpdateRole: (userId: string, role: Role) => void
  profiles: Profile[]
}) {
  return (
    <section className="access-panel">
      <div className="section-title">Níveis de acesso</div>
      <div className="role-help">
        <span>
          <Shield size={16} /> Admin gerencia usuários e dados.
        </span>
        <span>
          <Edit3 size={16} /> Gestor edita proteínas e lotes.
        </span>
        <span>
          <Save size={16} /> Operador registra lotes.
        </span>
        <span>
          <Eye size={16} /> Leitura apenas consulta.
        </span>
      </div>
      <section className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Nível</th>
              <th>Entrada</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>{profile.full_name || '-'}</td>
                <td>{profile.email}</td>
                <td>
                  <select
                    disabled={profile.id === currentUserId}
                    onChange={(event) => onUpdateRole(profile.id, event.target.value as Role)}
                    value={profile.role}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{new Date(profile.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}

function BatchModal({
  form,
  onChange,
  onClose,
  onSubmit,
  proteins,
}: {
  form: BatchForm
  onChange: (form: BatchForm) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  proteins: Protein[]
}) {
  const protein = proteins.find((item) => item.id === form.proteinId)
  const gross = Number(form.grossKg)
  const net = Number(form.netKg)
  const yieldPct = gross > 0 && net > 0 && net <= gross ? (net / gross) * 100 : null
  const realCost = protein && yieldPct ? protein.cost / (yieldPct / 100) : null

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={onSubmit}>
        <header className="modal-header">
          <div>
            <h2>Novo lote</h2>
            <span>{protein ? `${protein.name} · ${fmtBRL(protein.cost)}/kg bruto` : 'Selecione a proteína'}</span>
          </div>
          <button className="icon-btn ghost" type="button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field-label">Proteína</label>
          <div className="protein-chips">
            {proteins.map((item) => (
              <button
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
                min={0}
                onChange={(event) => onChange({ ...form, grossKg: event.target.value })}
                step="0.001"
                type="number"
                value={form.grossKg}
              />
            </label>
            <label>
              Líquido (kg)
              <input
                min={0}
                onChange={(event) => onChange({ ...form, netKg: event.target.value })}
                step="0.001"
                type="number"
                value={form.netKg}
              />
            </label>
          </div>

          <div className="live-calc">
            <MiniMetric label="Rendimento" value={fmtPct(yieldPct)} tone={rendStatus(yieldPct, protein?.target_yield ?? 80)} />
            <MiniMetric label="Perda" value={yieldPct ? fmtKg(gross - net) : '-'} />
            <MiniMetric label="Custo real" value={realCost ? fmtBRL(realCost) : '-'} />
          </div>

          <div className="form-grid two">
            <label>
              Turno
              <select value={form.shift} onChange={(event) => onChange({ ...form, shift: event.target.value as Batch['shift'] })}>
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </label>
            <label>
              Responsável
              <input value={form.responsible} onChange={(event) => onChange({ ...form, responsible: event.target.value })} />
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
            Salvar lote
          </button>
        </footer>
      </form>
    </div>
  )
}

export default App
