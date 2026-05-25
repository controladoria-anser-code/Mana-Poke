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
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { createIsolatedSupabaseClient, supabase, isSupabaseConfigured } from './lib/supabase'
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
  canViewCosts,
  canViewTargets,
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

type NewUserForm = {
  fullName: string
  email: string
  password: string
  role: Role
}

type ResponsibleOption = {
  id: string
  full_name: string | null
}

const emptyBatchForm: BatchForm = {
  proteinId: '',
  grossKg: '',
  netKg: '',
  shift: 'manha',
  responsible: '',
  notes: '',
}

const emptyNewUserForm: NewUserForm = {
  fullName: '',
  email: '',
  password: '',
  role: 'operador',
}

const roles: Role[] = ['admin', 'gestor', 'operador', 'viewer']
const defaultResponsibleNames = ['Cássia', 'Adriano', 'Edelmara']
const otherResponsibleValue = 'Outro'
const otherResponsibleLabel = 'Outro (colocar na observação)'

function buildResponsibleNames(options: ResponsibleOption[]) {
  const names = new Map<string, string>()

  for (const name of defaultResponsibleNames) {
    names.set(name.trim().toLocaleLowerCase('pt-BR'), name)
  }

  for (const option of options) {
    const name = option.full_name?.trim()
    if (!name || name.toLocaleLowerCase('pt-BR') === otherResponsibleValue.toLocaleLowerCase('pt-BR')) continue
    names.set(name.toLocaleLowerCase('pt-BR'), name)
  }

  return [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

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
  const [responsibleOptions, setResponsibleOptions] = useState<ResponsibleOption[]>([])
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

    const [proteinRows, batchRows, settingRows, responsibleRows] = await Promise.all([
      supabase.from('proteins_for_current_user').select('*').eq('active', true).order('name'),
      supabase.from('batches_for_current_user').select('*').order('recorded_at', { ascending: false }),
      supabase.from('app_settings').select('*'),
      supabase.rpc('responsible_options'),
    ])

    setProfile(nextProfile)
    setProteins((proteinRows.data ?? []) as Protein[])
    setBatches((batchRows.data ?? []) as Batch[])
    setThreshold(Number(((settingRows.data ?? []) as AppSetting[]).find((item) => item.key === 'alert_threshold')?.value ?? 1))
    setResponsibleOptions(responsibleRows.error ? [] : ((responsibleRows.data ?? []) as ResponsibleOption[]))

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
  const showCosts = canViewCosts(role)
  const showTargets = canViewTargets(role)
  const alerts = useMemo(() => buildAlerts(proteins, batches, threshold, showTargets), [batches, proteins, showTargets, threshold])
  const responsibleNames = useMemo(() => buildResponsibleNames(responsibleOptions), [responsibleOptions])
  const today = useMemo(() => new Date(), [])

  const summary = useMemo(() => {
    const todayBatches = batches.filter((batch) => isSameDay(new Date(batch.recorded_at), today))
    const averages = proteins
      .map((protein) => ({ protein, avg: averageYield(batches, protein.id) }))
      .filter((item): item is { protein: Protein; avg: number } => item.avg !== null)

    const average = averages.length ? averages.reduce((sum, item) => sum + item.avg, 0) / averages.length : null
    const targetAverages = averages
      .map((item) => ({ ...item, target: item.protein.target_yield }))
      .filter((item): item is { protein: Protein; avg: number; target: number } => item.target !== null)
    const above = showTargets ? targetAverages.filter((item) => item.avg >= item.target).length : 0
    const below = showTargets ? targetAverages.filter((item) => item.avg < item.target).length : 0
    const totalNet = todayBatches.reduce((sum, batch) => sum + batch.net_kg, 0)

    return { todayCount: todayBatches.length, average, above, below, totalNet }
  }, [batches, proteins, showTargets, today])

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

    if (patch.cost && canViewCosts(role)) {
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

    if (!batchForm.responsible) {
      setStatus('Selecione o responsável.')
      return
    }

    if (batchForm.responsible === otherResponsibleValue && !batchForm.notes.trim()) {
      setStatus('Informe o responsável nas observações.')
      return
    }

    const yieldPct = (net / gross) * 100
    const payload: Record<string, unknown> = {
      protein_id: protein.id,
      gross_kg: gross,
      net_kg: net,
      yield_pct: yieldPct,
      shift: batchForm.shift,
      responsible: batchForm.responsible.trim() || null,
      notes: batchForm.notes.trim() || null,
      created_by: session.user.id,
    }

    if (canViewCosts(role) && protein.cost) {
      payload.real_cost_kg = protein.cost / (yieldPct / 100)
    }

    const { error } = await supabase.from('batches').insert(payload)

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

  async function createUser(newUser: NewUserForm) {
    if (!supabase || !canManageUsers(role)) return false
    const authClient = createIsolatedSupabaseClient()
    const email = newUser.email.trim().toLowerCase()
    const fullName = newUser.fullName.trim()

    if (!authClient) {
      setStatus('Supabase não configurado.')
      return false
    }

    if (!email || newUser.password.length < 6) {
      setStatus('Informe e-mail e uma senha com pelo menos 6 caracteres.')
      return false
    }

    setStatus('')

    const { data, error } = await authClient.auth.signUp({
      email,
      password: newUser.password,
      options: {
        data: { full_name: fullName || null },
      },
    })

    await authClient.auth.signOut()

    if (error) {
      setStatus(error.message)
      return false
    }

    if (!data.user) {
      setStatus('Não foi possível criar o usuário.')
      return false
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName || null, role: newUser.role })
      .eq('id', data.user.id)

    if (profileError) {
      setStatus(`Usuário criado, mas não foi possível ajustar o nível: ${profileError.message}`)
      await loadWorkspace()
      return false
    }

    setStatus('Usuário cadastrado com sucesso.')
    await loadWorkspace()
    return true
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
              Nova produção
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
        {showTargets && <Metric label="Acima da meta" value={String(summary.above)} tone="ok" />}
        {showTargets && <Metric label="Abaixo da meta" value={String(summary.below)} tone="warn" />}
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
            showCosts={showCosts}
            showTargets={showTargets}
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
            showCosts={showCosts}
            showTargets={showTargets}
            threshold={threshold}
          />
        )}

        {tab === 'acessos' && canManageUsers(role) && (
          <AccessTab currentUserId={profile.id} onCreateUser={createUser} onUpdateRole={updateRole} profiles={profiles} />
        )}
      </main>

      {modalOpen && (
        <BatchModal
          form={batchForm}
          onChange={setBatchForm}
          onClose={() => setModalOpen(false)}
          onSubmit={createBatch}
          proteins={proteins}
          responsibleNames={responsibleNames}
          showCosts={showCosts}
          showTargets={showTargets}
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
  showCosts,
  showTargets,
}: {
  batches: Batch[]
  canDelete: boolean
  canEdit: boolean
  onDeleteBatch: (batchId: string) => void
  onOpenBatch: (proteinId?: string) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  proteins: Protein[]
  showCosts: boolean
  showTargets: boolean
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
            showCosts={showCosts}
            showTargets={showTargets}
          />
        ))}
      </section>

      <div className="section-title">Histórico geral de lotes</div>
      <LogTable
        batches={batches}
        canDelete={canDelete}
        onDeleteBatch={onDeleteBatch}
        proteins={proteins}
        showCosts={showCosts}
        showTargets={showTargets}
      />
    </>
  )
}

function ProteinCard({
  batches,
  canEdit,
  onOpenBatch,
  onUpdateProtein,
  protein,
  showCosts,
  showTargets,
}: {
  batches: Batch[]
  canEdit: boolean
  onOpenBatch: (proteinId?: string) => void
  onUpdateProtein: (id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) => void
  protein: Protein
  showCosts: boolean
  showTargets: boolean
}) {
  const rows = batchesForProtein(batches, protein.id)
  const avg = averageYield(batches, protein.id)
  const last = lastBatch(batches, protein.id)
  const status = showTargets ? rendStatus(avg, protein.target_yield) : 'virgin'
  const producedToday = rows
    .filter((batch) => isSameDay(new Date(batch.recorded_at), new Date()))
    .reduce((sum, batch) => sum + batch.net_kg, 0)
  const realCost = showCosts && protein.cost && avg ? protein.cost / (avg / 100) : null

  return (
    <article className={`protein-card ${status}`}>
      <div className="card-accent" />
      <div className="card-body">
        <div className="card-header">
          <div>
            <h2>{protein.name}</h2>
            <span>{rows.length} lote{rows.length === 1 ? '' : 's'} registrado{rows.length === 1 ? '' : 's'}</span>
          </div>
          {showTargets && <span className={`status-pill ${status}`}>{statusLabel(status)}</span>}
        </div>

        <div className={`metrics-grid ${showTargets ? '' : 'two'}`}>
          <MiniMetric label="Média" value={fmtPct(avg)} tone={status} />
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
            <div className={`gauge-fill ${status}`} style={{ width: `${Math.min(avg ?? 0, 100)}%` }} />
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
                <strong>Custo real {realCost ? `${fmtBRL(realCost)}/kg` : '-'}</strong>
              </>
            )}
            {last && <small>Último lote: {new Date(last.recorded_at).toLocaleString('pt-BR')}</small>}
          </div>
          <button className="small-action" type="button" onClick={() => onOpenBatch(protein.id)}>
            <Plus size={15} />
            Produção
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
  showCosts,
  showTargets,
}: {
  batches: Batch[]
  canDelete: boolean
  onDeleteBatch: (batchId: string) => void
  proteins: Protein[]
  showCosts: boolean
  showTargets: boolean
}) {
  const byId = new Map(proteins.map((protein) => [protein.id, protein]))
  const columnCount = 7 + (showCosts ? 1 : 0) + (canDelete ? 1 : 0)

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
            {showCosts && <th>Custo real</th>}
            <th>Turno</th>
            <th>Obs.</th>
            {canDelete && <th />}
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
              <tr key={batch.id}>
                <td>{new Date(batch.recorded_at).toLocaleString('pt-BR')}</td>
                <td>{protein?.name ?? 'Removida'}</td>
                <td>{fmtKg(batch.gross_kg)}</td>
                <td>{fmtKg(batch.net_kg)}</td>
                <td>
                  <span className={`rend-cell ${status}`}>{fmtPct(batch.yield_pct)}</span>
                </td>
                {showCosts && <td>{batch.real_cost_kg ? fmtBRL(batch.real_cost_kg) : '-'}</td>}
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
  showCosts,
  showTargets,
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
  showCosts: boolean
  showTargets: boolean
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
                  Registrar produção
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
                {showTargets && <th>Meta</th>}
                {showCosts && <th>Custo bruto</th>}
                {showCosts && <th>Custo real</th>}
                {showTargets && <th>Status</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {proteins.map((protein) => {
                const avg = averageYield(batches, protein.id)
                const last = lastBatch(batches, protein.id)
                const days = daysSince(last?.recorded_at)
                const status = showTargets ? rendStatus(avg, protein.target_yield) : 'virgin'
                const realCost = showCosts && protein.cost && avg ? protein.cost / (avg / 100) : null

                return (
                  <tr key={protein.id}>
                    <td className="strong-cell">{protein.name}</td>
                    <td>{last ? new Date(last.recorded_at).toLocaleString('pt-BR') : '-'}</td>
                    <td>{days === null ? 'Nunca' : days === 0 ? 'Hoje' : `${days}d`}</td>
                    <td>
                      <span className={`rend-cell ${status}`}>{fmtPct(avg)}</span>
                    </td>
                    {showTargets && (
                      <td>
                        <input
                          className="table-input"
                          disabled={!canEdit}
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
                          onBlur={(event) => onUpdateProtein(protein.id, { cost: Number(event.target.value) })}
                          type="number"
                          step="0.01"
                          defaultValue={protein.cost ?? ''}
                        />
                      </td>
                    )}
                    {showCosts && <td>{realCost ? fmtBRL(realCost) : '-'}</td>}
                    {showTargets && (
                      <td>
                        <span className={`status-pill ${status}`}>{statusLabel(status)}</span>
                      </td>
                    )}
                    <td className="row-actions">
                      <button className="icon-btn" type="button" onClick={() => onOpenBatch(protein.id)} title="Nova produção">
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
  onCreateUser,
  onUpdateRole,
  profiles,
}: {
  currentUserId: string
  onCreateUser: (newUser: NewUserForm) => Promise<boolean>
  onUpdateRole: (userId: string, role: Role) => void
  profiles: Profile[]
}) {
  const [newUser, setNewUser] = useState<NewUserForm>(emptyNewUserForm)
  const [creating, setCreating] = useState(false)

  async function submitNewUser(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    const created = await onCreateUser(newUser)
    if (created) {
      setNewUser(emptyNewUserForm)
    }
    setCreating(false)
  }

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
          <Eye size={16} /> Leitor apenas consulta.
        </span>
      </div>

      <form className="add-user-form" onSubmit={submitNewUser}>
        <div className="section-title compact">Novo usuário</div>
        <div className="user-form-grid">
          <label>
            Nome
            <input
              autoComplete="name"
              value={newUser.fullName}
              onChange={(event) => setNewUser({ ...newUser, fullName: event.target.value })}
            />
          </label>
          <label>
            E-mail
            <input
              autoComplete="email"
              required
              type="email"
              value={newUser.email}
              onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="new-password"
              minLength={6}
              required
              type="password"
              value={newUser.password}
              onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
            />
          </label>
          <label>
            Nível
            <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as Role })}>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="small-action" type="submit" disabled={creating}>
          <UserPlus size={15} />
          {creating ? 'Cadastrando...' : 'Cadastrar usuário'}
        </button>
      </form>

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
  const realCost = showCosts && protein?.cost && yieldPct ? protein.cost / (yieldPct / 100) : null

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={onSubmit}>
        <header className="modal-header">
          <div>
            <h2>Nova produção</h2>
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

          <div className={`live-calc ${showCosts ? '' : 'two'}`}>
            <MiniMetric
              label="Rendimento"
              value={fmtPct(yieldPct)}
              tone={showTargets ? rendStatus(yieldPct, protein?.target_yield) : 'virgin'}
            />
            <MiniMetric label="Perda" value={yieldPct ? fmtKg(gross - net) : '-'} />
            {showCosts && <MiniMetric label="Custo real" value={realCost ? fmtBRL(realCost) : '-'} />}
          </div>

          <div className="form-grid two">
            <label>
              Turno
              <select value={form.shift} onChange={(event) => onChange({ ...form, shift: event.target.value as Batch['shift'] })}>
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
              </select>
            </label>
            <label>
              Responsável
              <select required value={form.responsible} onChange={(event) => onChange({ ...form, responsible: event.target.value })}>
                <option value="">Selecione</option>
                {responsibleNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={otherResponsibleValue}>{otherResponsibleLabel}</option>
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

export default App
