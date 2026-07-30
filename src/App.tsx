import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  LogOut,
  Plus,
  RefreshCw,
  Shield,
  Users,
} from 'lucide-react'
import { FunctionsHttpError, type Session } from '@supabase/supabase-js'
import './App.css'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import type { AppSetting, Batch, BatchForm, NewUserForm, Profile, Protein, ResponsibleOption, Role } from './types'
import {
  BUSINESS_TIME_ZONE,
  averageYield,
  buildAlerts,
  fmtKg,
  fmtPct,
  isSameDay,
  startOfMetricWindow,
  weightedYield,
} from './lib/metrics'
import {
  canCreateBatch,
  canManageProteins,
  canManageUsers,
  canVoidBatch,
  canViewCosts,
  canViewTargets,
  roleLabel,
} from './lib/permissions'
import { useNow } from './hooks/useNow'
import { AuthPanel, SetupRequired, Splash } from './components/AuthViews'
import { AccessTab } from './components/AccessTab'
import { AlertsTab } from './components/AlertsTab'
import { BatchModal, Metric, ProductionTab } from './components/ProductionViews'

type Tab = 'producao' | 'alertas' | 'acessos'

const emptyBatchForm: BatchForm = {
  proteinId: '',
  grossKg: '',
  netKg: '',
  shift: 'manha',
  responsible: '',
  notes: '',
}

const otherResponsibleValue = 'Outro'
const batchPageSize = 250

function buildResponsibleNames(options: ResponsibleOption[]) {
  return options.map((option) => option.name).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(isSupabaseConfigured)
  const [authMessage, setAuthMessage] = useState('')

  useEffect(() => {
    if (!supabase) {
      return
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        setSession(data.session)
        if (error) setAuthMessage(`Não foi possível recuperar a sessão: ${error.message}`)
      })
      .catch(() => setAuthMessage('Não foi possível conectar ao serviço de autenticação.'))
      .finally(() => setBooting(false))

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return <SetupRequired />
  if (booting) return <Splash text="Carregando sessão..." />
  if (!session) return <AuthPanel initialMessage={authMessage} />

  return <Workspace session={session} />
}

function Workspace({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [responsibleOptions, setResponsibleOptions] = useState<ResponsibleOption[]>([])
  const [proteins, setProteins] = useState<Protein[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [metricBatches, setMetricBatches] = useState<Batch[]>([])
  const [latestBatches, setLatestBatches] = useState<Batch[]>([])
  const [hasMoreBatches, setHasMoreBatches] = useState(false)
  const [loadingMoreBatches, setLoadingMoreBatches] = useState(false)
  const [threshold, setThreshold] = useState(1)
  const [yieldWindowDays, setYieldWindowDays] = useState(30)
  const [tab, setTab] = useState<Tab>('producao')
  const [batchForm, setBatchForm] = useState<BatchForm>(emptyBatchForm)
  const [modalOpen, setModalOpen] = useState(false)
  const [newProtein, setNewProtein] = useState({ name: '', cost: '', target: '80' })
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const loadWorkspace = useCallback(async () => {
    if (!supabase) return
    setLoading(true)

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    const nextProfile = profileRow as Profile | null

    if (!nextProfile || !nextProfile.enabled) {
      setProfile(null)
      setStatus(
        profileError?.message ??
          'Seu acesso ainda não foi habilitado. Solicite a um administrador que regularize o usuário.',
      )
      setLoading(false)
      return
    }

    setProfile(nextProfile)
    const metricWindowStart = startOfMetricWindow(yieldWindowDays).toISOString()
    const [proteinRows, batchRows, metricBatchRows, latestBatchRows, settingRows, responsibleRows] = await Promise.all([
      supabase.from('proteins_for_current_user').select('*').order('name'),
      supabase
        .from('batches_for_current_user')
        .select('*')
        .order('recorded_at', { ascending: false })
        .range(0, batchPageSize - 1),
      supabase
        .from('batches_for_current_user')
        .select('*')
        .is('voided_at', null)
        .gte('recorded_at', metricWindowStart)
        .order('recorded_at', { ascending: false }),
      supabase.from('latest_batches_for_current_user').select('*'),
      supabase.from('app_settings').select('*'),
      supabase.from('production_responsibles').select('*').order('name'),
    ])

    const loadError = [
      proteinRows.error,
      batchRows.error,
      metricBatchRows.error,
      latestBatchRows.error,
      settingRows.error,
      responsibleRows.error,
    ].find(Boolean)

    if (loadError) {
      setStatus(`Não foi possível sincronizar todos os dados: ${loadError.message}`)
      setLoading(false)
      return
    }

    setProteins((proteinRows.data ?? []) as Protein[])
    setBatches((batchRows.data ?? []) as Batch[])
    setMetricBatches((metricBatchRows.data ?? []) as Batch[])
    setLatestBatches((latestBatchRows.data ?? []) as Batch[])
    setHasMoreBatches((batchRows.data?.length ?? 0) === batchPageSize)

    const settings = (settingRows.data ?? []) as AppSetting[]
    const loadedThreshold = Number(settings.find((item) => item.key === 'alert_threshold')?.value ?? 1)
    const loadedWindow = Number(settings.find((item) => item.key === 'yield_window_days')?.value ?? 30)
    setThreshold(Number.isFinite(loadedThreshold) && loadedThreshold >= 1 ? loadedThreshold : 1)
    setYieldWindowDays(Number.isFinite(loadedWindow) && loadedWindow >= 1 ? loadedWindow : 30)
    setResponsibleOptions((responsibleRows.data ?? []) as ResponsibleOption[])

    if (canManageUsers(nextProfile.role)) {
      const { data: allProfiles, error: profilesError } = await supabase.from('profiles').select('*').order('created_at')
      if (profilesError) {
        setStatus(`Dados carregados, mas os acessos não puderam ser consultados: ${profilesError.message}`)
      }
      setProfiles((allProfiles ?? []) as Profile[])
    } else {
      setProfiles([])
    }

    setLoading(false)
  }, [session.user.id, yieldWindowDays])

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
  const activeProteins = useMemo(() => proteins.filter((protein) => protein.active), [proteins])
  const alerts = useMemo(
    () => buildAlerts(activeProteins, metricBatches, latestBatches, threshold, showTargets),
    [activeProteins, latestBatches, metricBatches, showTargets, threshold],
  )
  const responsibleNames = useMemo(() => buildResponsibleNames(responsibleOptions), [responsibleOptions])
  const today = useNow()

  const summary = useMemo(() => {
    const todayBatches = metricBatches.filter((batch) => isSameDay(new Date(batch.recorded_at), today))
    const averages = activeProteins
      .map((protein) => ({ protein, avg: averageYield(metricBatches, protein.id) }))
      .filter((item): item is { protein: Protein; avg: number } => item.avg !== null)

    const average = weightedYield(metricBatches)
    const targetAverages = averages
      .map((item) => ({ ...item, target: item.protein.target_yield }))
      .filter((item): item is { protein: Protein; avg: number; target: number } => item.target !== null)
    const above = showTargets ? targetAverages.filter((item) => item.avg >= item.target).length : 0
    const below = showTargets ? targetAverages.filter((item) => item.avg < item.target).length : 0
    const totalNet = todayBatches.reduce((sum, batch) => sum + batch.net_kg, 0)

    return { todayCount: todayBatches.length, average, above, below, totalNet }
  }, [activeProteins, metricBatches, showTargets, today])

  function openBatchModal(proteinId = '') {
    setBatchForm({ ...emptyBatchForm, proteinId })
    setModalOpen(true)
  }

  async function loadMoreBatchHistory() {
    if (!supabase || loadingMoreBatches || !hasMoreBatches) return
    setLoadingMoreBatches(true)
    setStatus('')

    const start = batches.length
    const { data, error } = await supabase
      .from('batches_for_current_user')
      .select('*')
      .order('recorded_at', { ascending: false })
      .range(start, start + batchPageSize - 1)

    if (error) {
      setStatus(`Não foi possível carregar mais lotes: ${error.message}`)
    } else {
      const nextRows = (data ?? []) as Batch[]
      setBatches((current) => [...current, ...nextRows])
      setHasMoreBatches(nextRows.length === batchPageSize)
    }

    setLoadingMoreBatches(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setStatus(error.message)
  }

  async function saveThreshold(value: number) {
    if (!supabase || !canManageProteins(role) || !Number.isInteger(value) || value < 1) {
      setStatus('O limite sem produção deve ser um número inteiro maior ou igual a 1.')
      return
    }

    const { error } = await supabase.from('app_settings').upsert({ key: 'alert_threshold', value: String(value) })
    if (error) {
      setStatus(`Não foi possível salvar o limite: ${error.message}`)
      return
    }

    setThreshold(value)
    setStatus('Limite de alerta atualizado.')
  }

  async function saveYieldWindow(value: number) {
    if (!supabase || !canManageProteins(role) || !Number.isInteger(value) || value < 1 || value > 365) {
      setStatus('A janela de rendimento deve ter entre 1 e 365 dias.')
      return
    }

    const { error } = await supabase.from('app_settings').upsert({ key: 'yield_window_days', value: String(value) })
    if (error) {
      setStatus(`Não foi possível salvar a janela de rendimento: ${error.message}`)
      return
    }

    setYieldWindowDays(value)
    setStatus('Janela de rendimento atualizada.')
  }

  async function updateProtein(id: string, patch: Partial<Pick<Protein, 'cost' | 'target_yield' | 'active'>>) {
    if (!supabase || !canManageProteins(role)) return
    const nextCost = patch.cost
    const nextTarget = patch.target_yield
    if (nextCost !== undefined && (nextCost === null || !Number.isFinite(nextCost) || nextCost <= 0)) {
      setStatus('O custo deve ser maior que zero.')
      return
    }
    if (
      nextTarget !== undefined &&
      (nextTarget === null || !Number.isFinite(nextTarget) || nextTarget <= 0 || nextTarget > 100)
    ) {
      setStatus('A meta deve estar entre 1% e 100%.')
      return
    }

    const client = supabase
    setStatus('')
    const { error } = await client.from('proteins').update(patch).eq('id', id)
    if (error) {
      setStatus(error.message)
      return
    }

    await loadWorkspace()
  }

  async function createProtein(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !canManageProteins(role)) return
    const name = newProtein.name.trim()
    const cost = Number(newProtein.cost)
    const target = Number(newProtein.target)
    if (!name || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(target) || target <= 0 || target > 100) {
      setStatus('Informe nome, custo maior que zero e meta entre 1% e 100%.')
      return
    }

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
    setStatus('Proteína cadastrada com sucesso.')
    await loadWorkspace()
  }

  async function toggleProtein(protein: Protein) {
    if (!supabase || !canManageProteins(role)) return
    const action = protein.active ? 'desativar' : 'reativar'
    if (!window.confirm(`${action === 'desativar' ? 'Desativar' : 'Reativar'} "${protein.name}"?`)) return
    const { error } = await supabase.from('proteins').update({ active: !protein.active }).eq('id', protein.id)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus(`Proteína ${protein.active ? 'desativada' : 'reativada'} sem alterar o histórico.`)
    await loadWorkspace()
  }

  async function createBatch(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !canCreateBatch(role)) return
    const protein = proteins.find((item) => item.id === batchForm.proteinId)
    const gross = Number(batchForm.grossKg)
    const net = Number(batchForm.netKg)
    if (
      !protein ||
      !protein.active ||
      !Number.isFinite(gross) ||
      !Number.isFinite(net) ||
      gross <= 0 ||
      net <= 0 ||
      net > gross
    ) {
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

    const payload: Record<string, unknown> = {
      protein_id: protein.id,
      gross_kg: gross,
      net_kg: net,
      shift: batchForm.shift,
      responsible: batchForm.responsible.trim() || null,
      notes: batchForm.notes.trim() || null,
    }

    const { error } = await supabase.from('batches').insert(payload)

    if (error) {
      setStatus(error.message)
      return
    }

    setModalOpen(false)
    setStatus('Produção registrada com custo e rendimento congelados no histórico.')
    await loadWorkspace()
  }

  async function voidBatch(batchId: string) {
    if (!supabase || !canVoidBatch(role)) return
    const reason = window.prompt('Motivo da anulação do lote:')
    if (reason === null) return
    const trimmedReason = reason.trim()
    if (trimmedReason.length < 3) {
      setStatus('Informe um motivo com pelo menos 3 caracteres.')
      return
    }

    const { error } = await supabase.rpc('void_batch', { p_batch_id: batchId, p_reason: trimmedReason })
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('Lote anulado. O registro foi preservado no histórico.')
    await loadWorkspace()
  }

  async function updateRole(userId: string, nextRole: Role) {
    if (!supabase || !canManageUsers(role) || userId === profile?.id) return
    const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: nextRole })
    if (error) {
      setStatus(error.message)
      return
    }
    await loadWorkspace()
  }

  async function toggleUser(userProfile: Profile) {
    if (!supabase || !canManageUsers(role) || userProfile.id === profile?.id) return
    const enabled = !userProfile.enabled
    const action = enabled ? 'habilitar' : 'bloquear'
    if (!window.confirm(`${enabled ? 'Habilitar' : 'Bloquear'} o acesso de "${userProfile.email}"?`)) return

    const { error } = await supabase.rpc('set_user_enabled', {
      p_enabled: enabled,
      p_user_id: userProfile.id,
    })
    if (error) {
      setStatus(error.message)
      return
    }

    setStatus(`Usuário ${action === 'habilitar' ? 'habilitado' : 'bloqueado'} com sucesso.`)
    await loadWorkspace()
  }

  async function createResponsible(name: string) {
    if (!supabase || !canManageUsers(role)) return false
    const trimmedName = name.trim()

    if (!trimmedName) {
      setStatus('Informe o nome do responsável.')
      return false
    }

    if (trimmedName.toLocaleLowerCase('pt-BR') === otherResponsibleValue.toLocaleLowerCase('pt-BR')) {
      setStatus('Use um nome específico. A opção Outro já aparece automaticamente no formulário.')
      return false
    }

    const { error } = await supabase
      .from('production_responsibles')
      .insert({ name: trimmedName })

    if (error) {
      setStatus(error.code === '23505' ? 'Esse responsável já está cadastrado.' : error.message)
      return false
    }

    setStatus('Responsável cadastrado com sucesso.')
    await loadWorkspace()
    return true
  }

  async function deleteResponsible(responsible: ResponsibleOption) {
    if (!supabase || !canManageUsers(role)) return
    if (!window.confirm(`Descadastrar "${responsible.name}" da lista de responsáveis?`)) return

    const { error } = await supabase.from('production_responsibles').delete().eq('id', responsible.id)
    if (error) {
      setStatus(error.message)
      return
    }

    setStatus('Responsável descadastrado com sucesso.')
    await loadWorkspace()
  }

  async function createUser(newUser: NewUserForm) {
    if (!supabase || !canManageUsers(role)) return false
    const email = newUser.email.trim().toLowerCase()
    const fullName = newUser.fullName.trim()

    if (!email || newUser.password.length < 8) {
      setStatus('Informe e-mail e uma senha com pelo menos 8 caracteres.')
      return false
    }

    setStatus('')

    const { error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email,
        fullName: fullName || null,
        password: newUser.password,
        role: newUser.role,
      },
    })

    if (error) {
      let errorMessage = error.message
      if (error instanceof FunctionsHttpError) {
        try {
          const responseBody = (await error.context.json()) as { error?: string }
          errorMessage = responseBody.error ?? errorMessage
        } catch {
          // Mantém a mensagem de transporte quando a resposta não for JSON.
        }
      }
      setStatus(errorMessage)
      return false
    }

    setStatus('Usuário cadastrado com sucesso.')
    await loadWorkspace()
    return true
  }

  if (loading) return <Splash text="Sincronizando dados..." />
  if (!profile) {
    return (
      <main className="setup-screen">
        <section className="setup-panel">
          <AlertTriangle size={28} />
          <h1>Acesso não configurado</h1>
          <p>{status}</p>
          <div className="setup-actions">
            <button className="secondary-btn" type="button" onClick={() => void loadWorkspace()}>
              <RefreshCw size={17} />
              Tentar novamente
            </button>
            <button className="primary-btn" type="button" onClick={() => void signOut()}>
              <LogOut size={17} />
              Sair
            </button>
          </div>
        </section>
      </main>
    )
  }

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
            {today.toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              timeZone: BUSINESS_TIME_ZONE,
            })}
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
        <Metric label={`Rend. ponderado (${yieldWindowDays}d)`} value={fmtPct(summary.average)} />
        {showTargets && <Metric label="Acima da meta" value={String(summary.above)} tone="ok" />}
        {showTargets && <Metric label="Abaixo da meta" value={String(summary.below)} tone="warn" />}
        <Metric label="Kg produzidos hoje" value={fmtKg(summary.totalNet)} tone="accent" />
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

      {status && (
        <div aria-live="polite" className="status-banner" role="status">
          {status}
        </div>
      )}

      <main className="main">
        {tab === 'producao' && (
          <ProductionTab
            activeProteins={activeProteins}
            canCreate={canCreateBatch(role)}
            canEdit={canManageProteins(role)}
            canVoid={canVoidBatch(role)}
            hasMoreBatches={hasMoreBatches}
            historyBatches={batches}
            latestBatches={latestBatches}
            loadingMoreBatches={loadingMoreBatches}
            metricBatches={metricBatches}
            onLoadMoreBatches={loadMoreBatchHistory}
            onOpenBatch={openBatchModal}
            onVoidBatch={voidBatch}
            onUpdateProtein={updateProtein}
            proteinCatalog={proteins}
            showCosts={showCosts}
            showTargets={showTargets}
            yieldWindowDays={yieldWindowDays}
          />
        )}

        {tab === 'alertas' && (
          <AlertsTab
            alerts={alerts}
            canCreate={canCreateBatch(role)}
            canEdit={canManageProteins(role)}
            latestBatches={latestBatches}
            metricBatches={metricBatches}
            newProtein={newProtein}
            onCreateProtein={createProtein}
            onOpenBatch={openBatchModal}
            onSetNewProtein={setNewProtein}
            onThresholdChange={saveThreshold}
            onToggleProtein={toggleProtein}
            onUpdateProtein={updateProtein}
            onYieldWindowChange={saveYieldWindow}
            proteins={proteins}
            showCosts={showCosts}
            showTargets={showTargets}
            threshold={threshold}
            yieldWindowDays={yieldWindowDays}
          />
        )}

        {tab === 'acessos' && canManageUsers(role) && (
          <AccessTab
            currentUserId={profile.id}
            onCreateResponsible={createResponsible}
            onCreateUser={createUser}
            onDeleteResponsible={deleteResponsible}
            onToggleUser={toggleUser}
            onUpdateRole={updateRole}
            profiles={profiles}
            responsibleOptions={responsibleOptions}
          />
        )}
      </main>

      {modalOpen && (
        <BatchModal
          form={batchForm}
          onChange={setBatchForm}
          onClose={() => setModalOpen(false)}
          onSubmit={createBatch}
          proteins={activeProteins}
          responsibleNames={responsibleNames}
          showCosts={showCosts}
          showTargets={showTargets}
        />
      )}
    </div>
  )
}

export default App
