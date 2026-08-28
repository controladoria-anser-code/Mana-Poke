import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Box,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Shield,
  Sun,
  TrendingDown,
  TrendingUp,
  Users,
  Weight,
} from 'lucide-react'
import { FunctionsHttpError, type Session } from '@supabase/supabase-js'
import './App.css'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import type {
  Account,
  AppSetting,
  Batch,
  BatchEditLog,
  BatchForm,
  MovementType,
  NewUserForm,
  PlanSlug,
  Profile,
  Protein,
  Recipe,
  RecipeForm,
  RecipeItem,
  ResponsibleOption,
  Role,
  StockCategory,
  StockLevel,
  StockMovement,
  StockUnit,
  Subscription,
} from './types'
import {
  BUSINESS_TIME_ZONE,
  averageYield,
  buildAlerts,
  fmtKg,
  startOfMetricWindow,
  weightedYield,
} from './lib/metrics'
import {
  canCreateBatch,
  canEditBatch,
  canManageProteins,
  canManageUsers,
  canVoidBatch,
  canViewCosts,
  canViewTargets,
  roleLabel,
} from './lib/permissions'
import { accountHasAccess } from './lib/billing'
import { isWithinRange, periodPhrase, usePeriodFilter } from './lib/period'
import { useNow } from './hooks/useNow'
import { type Theme, useTheme } from './hooks/useTheme'
import { AuthPanel, type AuthMode, SetupRequired, Splash } from './components/AuthViews'
import { LandingPage } from './components/LandingPage'
import { PaywallScreen } from './components/BillingViews'
import { AccessTab } from './components/AccessTab'
import { AlertsTab } from './components/AlertsTab'
import { CustosTab } from './components/CustosTab'
import { DashboardTab, HeroStatCard } from './components/DashboardTab'
import { PeriodFilterBar } from './components/PeriodFilter'
import { ProfileTab } from './components/ProfileTab'
import { RecipeModal, RecipesTab } from './components/RecipesTab'
import { CadastroTab } from './components/CadastroTab'
import { StockTab } from './components/StockTab'
import { BatchHistoryModal, BatchHistoryTab, BatchModal, Metric, ProductionTab } from './components/ProductionViews'

type Tab = 'dashboard' | 'cadastro' | 'producao' | 'historico' | 'custos' | 'fichas' | 'estoque' | 'alertas' | 'acessos' | 'perfil'

const emptyBatchForm: BatchForm = {
  proteinId: '',
  grossQty: '',
  netQty: '',
  shift: 'manha',
  responsible: '',
  notes: '',
}

const otherResponsibleValue = 'Outro'
const batchPageSize = 250
const workspaceRequestTimeoutMs = 15_000

async function withDiagnosticTimeout<T>(label: string, request: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Tempo limite excedido ao carregar ${label} (${workspaceRequestTimeoutMs / 1000}s).`,
            ),
          )
        }, workspaceRequestTimeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

function formatLoadError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Erro inesperado sem detalhes adicionais.'
}

function formatServiceError(label: string, error: { message: string; code?: string }) {
  return `${label}: ${error.message}${error.code ? ` (código ${error.code})` : ''}`
}

function buildResponsibleNames(options: ResponsibleOption[]) {
  return options.map((option) => option.name).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(isSupabaseConfigured)
  const [authMessage, setAuthMessage] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [pendingPlan, setPendingPlan] = useState<PlanSlug | null>(null)
  const { theme, toggleTheme } = useTheme()

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
  if (!session) {
    return showLogin ? (
      <AuthPanel initialMessage={authMessage} initialMode={authMode} onBack={() => setShowLogin(false)} />
    ) : (
      <LandingPage
        onEnter={() => {
          setAuthMode('signin')
          setShowLogin(true)
        }}
        onSelectPlan={(plan) => {
          setPendingPlan(plan)
          setAuthMode('signup')
          setShowLogin(true)
        }}
        onStartSignup={() => {
          setAuthMode('signup')
          setShowLogin(true)
        }}
      />
    )
  }

  return (
    <Workspace
      onToggleTheme={toggleTheme}
      onConsumePendingPlan={() => setPendingPlan(null)}
      pendingPlan={pendingPlan}
      session={session}
      theme={theme}
    />
  )
}

function Workspace({
  onConsumePendingPlan,
  pendingPlan,
  session,
  theme,
  onToggleTheme,
}: {
  onConsumePendingPlan: () => void
  pendingPlan: PlanSlug | null
  session: Session
  theme: Theme
  onToggleTheme: () => void
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [checkingOutPlan, setCheckingOutPlan] = useState<PlanSlug | null>(null)
  const [billingError, setBillingError] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [responsibleOptions, setResponsibleOptions] = useState<ResponsibleOption[]>([])
  const [proteins, setProteins] = useState<Protein[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [metricBatches, setMetricBatches] = useState<Batch[]>([])
  const [trendBatches, setTrendBatches] = useState<Batch[]>([])
  const [latestBatches, setLatestBatches] = useState<Batch[]>([])
  const [threshold, setThreshold] = useState(1)
  const [yieldWindowDays, setYieldWindowDays] = useState(30)
  const [tab, setTab] = useState<Tab>('dashboard')
  const dashboardPeriod = usePeriodFilter('today')
  const [batchForm, setBatchForm] = useState<BatchForm>(emptyBatchForm)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [editReason, setEditReason] = useState('')
  const [historyBatch, setHistoryBatch] = useState<Batch | null>(null)
  const [batchEditLogs, setBatchEditLogs] = useState<BatchEditLog[]>([])
  const [loadingBatchEditLogs, setLoadingBatchEditLogs] = useState(false)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [recipeModalOpen, setRecipeModalOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([])
  const [editIngredientId, setEditIngredientId] = useState<string | null>(null)
  const [status, setStatusState] = useState(() => {
    const checkoutStatus = new URLSearchParams(window.location.search).get('checkout')
    if (checkoutStatus === 'success') {
      return 'Pagamento confirmado! Pode levar alguns segundos para liberar o acesso — atualize a página se necessário.'
    }
    if (checkoutStatus === 'cancel') {
      return 'Checkout cancelado. Você pode tentar novamente quando quiser.'
    }
    return ''
  })
  const [statusTone, setStatusTone] = useState<'error' | 'success'>(() =>
    new URLSearchParams(window.location.search).get('checkout') === 'success' ? 'success' : 'error',
  )
  const setStatus = (message: string) => {
    setStatusTone('error')
    setStatusState(message)
  }
  const setStatusOk = (message: string) => {
    setStatusTone('success')
    setStatusState(message)
  }
  const [loading, setLoading] = useState(true)

  const loadWorkspace = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setStatus('')

    try {
      const { data: profileRow, error: profileError } = await withDiagnosticTimeout(
        'o perfil do usuário',
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      )

      if (profileError) {
        setProfile(null)
        setStatus(`Diagnóstico da inicialização — ${formatServiceError('perfil do usuário', profileError)}`)
        return
      }

      const nextProfile = profileRow as Profile | null

      if (!nextProfile || !nextProfile.enabled) {
        setProfile(null)
        setStatus('Seu acesso ainda não foi habilitado. Solicite a um administrador que regularize o usuário.')
        return
      }

      setProfile(nextProfile)
      const metricWindowStart = startOfMetricWindow(yieldWindowDays).toISOString()
      const trendWindowStart = startOfMetricWindow(400).toISOString()
      const [
        accountRow,
        subscriptionRow,
        proteinRows,
        batchRows,
        metricBatchRows,
        trendBatchRows,
        latestBatchRows,
        settingRows,
        responsibleRows,
        recipeRows,
        recipeItemRows,
        stockLevelRows,
        stockMovementRows,
      ] = await Promise.all([
        withDiagnosticTimeout(
          'a conta',
          supabase.from('accounts').select('*').eq('id', nextProfile.account_id).maybeSingle(),
        ),
        withDiagnosticTimeout(
          'a assinatura',
          supabase.from('subscriptions').select('*').eq('account_id', nextProfile.account_id).maybeSingle(),
        ),
        withDiagnosticTimeout(
          'o catálogo de ingredientes',
          supabase.from('proteins_for_current_user').select('*').order('name'),
        ),
        withDiagnosticTimeout(
          'o histórico de lotes',
          supabase
            .from('batches_for_current_user')
            .select('*')
            .order('recorded_at', { ascending: false })
            .range(0, batchPageSize - 1),
        ),
        withDiagnosticTimeout(
          'os indicadores de rendimento',
          supabase
            .from('batches_for_current_user')
            .select('*')
            .is('voided_at', null)
            .gte('recorded_at', metricWindowStart)
            .order('recorded_at', { ascending: false }),
        ),
        withDiagnosticTimeout(
          'a tendência de rendimento',
          supabase
            .from('batches_for_current_user')
            .select('*')
            .is('voided_at', null)
            .gte('recorded_at', trendWindowStart)
            .order('recorded_at', { ascending: false }),
        ),
        withDiagnosticTimeout(
          'os últimos lotes',
          supabase.from('latest_batches_for_current_user').select('*'),
        ),
        withDiagnosticTimeout('as configurações', supabase.from('app_settings').select('*')),
        withDiagnosticTimeout(
          'os responsáveis de produção',
          supabase.from('production_responsibles').select('*').order('name'),
        ),
        withDiagnosticTimeout(
          'as fichas técnicas',
          supabase.from('recipes_for_current_user').select('*').order('name'),
        ),
        withDiagnosticTimeout(
          'os itens das fichas técnicas',
          supabase.from('recipe_items_for_current_user').select('*'),
        ),
        withDiagnosticTimeout(
          'os níveis de estoque',
          supabase.from('stock_levels_for_current_user').select('*').order('name'),
        ),
        withDiagnosticTimeout(
          'os movimentos de estoque',
          supabase.from('stock_movements_for_current_user').select('*').limit(200),
        ),
      ])

      setAccount((accountRow.data ?? null) as Account | null)
      setSubscription((subscriptionRow.data ?? null) as Subscription | null)

      const loadFailure = [
        { error: proteinRows.error, label: 'catálogo de ingredientes' },
        { error: batchRows.error, label: 'histórico de lotes' },
        { error: metricBatchRows.error, label: 'indicadores de rendimento' },
        { error: trendBatchRows.error, label: 'tendência de rendimento' },
        { error: latestBatchRows.error, label: 'últimos lotes' },
        { error: settingRows.error, label: 'configurações' },
        { error: responsibleRows.error, label: 'responsáveis de produção' },
        { error: recipeRows.error, label: 'fichas técnicas' },
        { error: recipeItemRows.error, label: 'itens das fichas técnicas' },
        { error: stockLevelRows.error, label: 'níveis de estoque' },
        { error: stockMovementRows.error, label: 'movimentos de estoque' },
      ].find((item) => item.error)

      if (loadFailure?.error) {
        setStatus(
          `Diagnóstico da inicialização — ${formatServiceError(loadFailure.label, loadFailure.error)}. Tente atualizar a página.`,
        )
        return
      }

      setProteins((proteinRows.data ?? []) as Protein[])
      let allBatchRows = (batchRows.data ?? []) as Batch[]
      while (allBatchRows.length > 0 && allBatchRows.length % batchPageSize === 0) {
        const { data: moreRows, error: moreError } = await withDiagnosticTimeout(
          'mais lotes do histórico',
          supabase
            .from('batches_for_current_user')
            .select('*')
            .order('recorded_at', { ascending: false })
            .range(allBatchRows.length, allBatchRows.length + batchPageSize - 1),
        )
        if (moreError || !moreRows || moreRows.length === 0) break
        allBatchRows = [...allBatchRows, ...(moreRows as Batch[])]
      }
      setBatches(allBatchRows)
      setMetricBatches((metricBatchRows.data ?? []) as Batch[])
      setTrendBatches((trendBatchRows.data ?? []) as Batch[])
      setLatestBatches((latestBatchRows.data ?? []) as Batch[])
      setRecipes((recipeRows.data ?? []) as Recipe[])
      setRecipeItems((recipeItemRows.data ?? []) as RecipeItem[])
      setStockLevels((stockLevelRows.data ?? []) as StockLevel[])
      setStockMovements((stockMovementRows.data ?? []) as StockMovement[])

      const settings = (settingRows.data ?? []) as AppSetting[]
      const loadedThreshold = Number(settings.find((item) => item.key === 'alert_threshold')?.value ?? 1)
      const loadedWindow = Number(settings.find((item) => item.key === 'yield_window_days')?.value ?? 30)
      setThreshold(Number.isFinite(loadedThreshold) && loadedThreshold >= 1 ? loadedThreshold : 1)
      setYieldWindowDays(Number.isFinite(loadedWindow) && loadedWindow >= 1 ? loadedWindow : 30)
      setResponsibleOptions((responsibleRows.data ?? []) as ResponsibleOption[])

      if (canManageUsers(nextProfile.role)) {
        const { data: allProfiles, error: profilesError } = await withDiagnosticTimeout(
          'a lista de acessos',
          supabase.from('profiles').select('*').order('created_at'),
        )
        if (profilesError) {
          setStatus(`Dados carregados, mas ${formatServiceError('lista de acessos', profilesError)}.`)
        }
        setProfiles((allProfiles ?? []) as Profile[])
      } else {
        setProfiles([])
      }
    } catch (error) {
      setStatus(`Diagnóstico da inicialização — ${formatLoadError(error)} Tente atualizar a página.`)
    } finally {
      setLoading(false)
    }
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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('checkout')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const role = profile?.role ?? 'viewer'

  useEffect(() => {
    if (pendingPlan === null || loading || !profile || role !== 'admin' || subscription) return
    onConsumePendingPlan()
    void startCheckout(pendingPlan)
  }, [loading, onConsumePendingPlan, pendingPlan, profile, role, subscription])

  const showCosts = canViewCosts(role)
  const showTargets = canViewTargets(role)
  const activeProteins = useMemo(() => proteins.filter((protein) => protein.active), [proteins])
  const alerts = useMemo(
    () => buildAlerts(activeProteins, metricBatches, latestBatches, threshold, showTargets),
    [activeProteins, latestBatches, metricBatches, showTargets, threshold],
  )
  const responsibleNames = useMemo(() => buildResponsibleNames(responsibleOptions), [responsibleOptions])
  const today = useNow()

  const periodBatches = useMemo(() => {
    const range = dashboardPeriod.range
    if (!range) return []
    return trendBatches.filter((batch) => !batch.voided_at && isWithinRange(batch.recorded_at, range.fromMs, range.toMs))
  }, [dashboardPeriod.range, trendBatches])

  const summary = useMemo(() => {
    const averages = activeProteins
      .map((protein) => ({ protein, avg: averageYield(periodBatches, protein.id) }))
      .filter((item): item is { protein: Protein; avg: number } => item.avg !== null)

    const average = weightedYield(periodBatches)
    const targetAverages = averages
      .map((item) => ({ ...item, target: item.protein.target_yield }))
      .filter((item): item is { protein: Protein; avg: number; target: number } => item.target !== null)
    const above = showTargets ? targetAverages.filter((item) => item.avg >= item.target).length : 0
    const below = showTargets ? targetAverages.filter((item) => item.avg < item.target).length : 0
    const totalNet = periodBatches.reduce((sum, batch) => sum + batch.net_qty, 0)
    const validBatches = metricBatches.filter((batch) => !batch.voided_at)
    const avgBatchesPerDay = validBatches.length / yieldWindowDays
    const avgKgPerDay = validBatches.reduce((sum, batch) => sum + batch.net_qty, 0) / yieldWindowDays
    const monitoredCount = targetAverages.length
    const todayCost = periodBatches.reduce((sum, batch) => sum + (batch.protein_cost_snapshot ?? 0) * batch.gross_qty, 0)
    const todayCostPerKg = totalNet > 0 ? todayCost / totalNet : null

    return {
      todayCount: periodBatches.length,
      average,
      above,
      below,
      totalNet,
      avgBatchesPerDay,
      avgKgPerDay,
      monitoredCount,
      todayCost,
      todayCostPerKg,
    }
  }, [activeProteins, metricBatches, periodBatches, showTargets, yieldWindowDays])

  function openBatchModal(proteinId = '') {
    setEditingBatch(null)
    setEditReason('')
    setBatchForm({ ...emptyBatchForm, proteinId })
    setModalOpen(true)
  }

  function openEditBatch(batch: Batch) {
    if (!canEditBatch(role) || batch.voided_at) return
    setEditingBatch(batch)
    setEditReason('')
    setBatchForm({
      proteinId: batch.protein_id,
      grossQty: String(batch.gross_qty),
      netQty: String(batch.net_qty),
      shift: batch.shift,
      responsible: batch.responsible ?? '',
      notes: batch.notes ?? '',
    })
    setModalOpen(true)
  }

  async function showBatchHistory(batch: Batch) {
    if (!supabase || !canEditBatch(role)) return
    setHistoryBatch(batch)
    setBatchEditLogs([])
    setLoadingBatchEditLogs(true)

    const { data, error } = await supabase
      .from('batch_edit_logs_for_current_user')
      .select('*')
      .eq('batch_id', batch.id)
      .order('edited_at', { ascending: false })

    if (error) {
      setStatus(`Não foi possível carregar o log de alterações: ${error.message}`)
      setHistoryBatch(null)
    } else {
      setBatchEditLogs((data ?? []) as BatchEditLog[])
    }
    setLoadingBatchEditLogs(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setStatus(error.message)
  }

  async function startCheckout(planSlug: PlanSlug) {
    if (!supabase) return
    setCheckingOutPlan(planSlug)
    setBillingError('')

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { planSlug },
    })

    if (error || !data?.url) {
      setBillingError('Não foi possível iniciar o checkout. Tente novamente em instantes.')
      setCheckingOutPlan(null)
      return
    }

    window.location.href = data.url as string
  }

  async function openBillingPortal() {
    if (!supabase) return
    setStatus('')

    const { data, error } = await supabase.functions.invoke('create-billing-portal-session')

    if (error || !data?.url) {
      setStatus('Não foi possível abrir o portal de cobrança.')
      return
    }

    window.location.href = data.url as string
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
    setStatusOk('Limite de alerta atualizado.')
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
    setStatusOk('Janela de rendimento atualizada.')
  }

  async function updateProtein(
    id: string,
    patch: Partial<Pick<Protein, 'name' | 'category' | 'unit' | 'cost' | 'target_yield' | 'active' | 'min_stock_kg'>>,
  ) {
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
    if (patch.name !== undefined && !patch.name.trim()) {
      setStatus('Informe o nome do ingrediente.')
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

  async function deleteProtein(id: string) {
    if (!supabase || !canManageProteins(role)) return false
    const { error } = await supabase.from('proteins').delete().eq('id', id)
    if (error) {
      const message =
        error.code === '23503'
          ? 'Não é possível excluir: esse ingrediente já tem lotes, movimentações ou fichas técnicas registrados. Desative-o em vez de excluir.'
          : error.message
      setStatus(message)
      return false
    }
    setStatusOk('Ingrediente excluído.')
    await loadWorkspace()
    return true
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
    setStatusOk(`Proteína ${protein.active ? 'desativada' : 'reativada'} sem alterar o histórico.`)
    await loadWorkspace()
  }

  async function createBatch(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !canCreateBatch(role)) return
    const protein = proteins.find((item) => item.id === batchForm.proteinId)
    const gross = Number(batchForm.grossQty)
    const net = Number(batchForm.netQty)
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
      gross_qty: gross,
      net_qty: net,
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
    setStatusOk('Produção registrada com custo e rendimento congelados no histórico.')
    await loadWorkspace()
  }

  async function editBatch(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !editingBatch || !canEditBatch(role)) return

    const protein = proteins.find((item) => item.id === batchForm.proteinId)
    const gross = Number(batchForm.grossQty)
    const net = Number(batchForm.netQty)
    if (
      !protein ||
      (!protein.active && protein.id !== editingBatch.protein_id) ||
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

    const reason = editReason.trim()
    if (reason.length < 3) {
      setStatus('Informe uma justificativa com pelo menos 3 caracteres.')
      return
    }

    const { error } = await supabase.rpc('edit_batch', {
      p_batch_id: editingBatch.id,
      p_gross_qty: gross,
      p_net_qty: net,
      p_notes: batchForm.notes.trim() || null,
      p_protein_id: protein.id,
      p_reason: reason,
      p_responsible: batchForm.responsible.trim(),
      p_shift: batchForm.shift,
    })

    if (error) {
      setStatus(error.message)
      return
    }

    setModalOpen(false)
    setEditingBatch(null)
    setEditReason('')
    setStatusOk('Lançamento atualizado e alteração registrada no log.')
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
    setStatusOk('Lote anulado. O registro foi preservado no histórico.')
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

    setStatusOk(`Usuário ${action === 'habilitar' ? 'habilitado' : 'bloqueado'} com sucesso.`)
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

    setStatusOk('Responsável cadastrado com sucesso.')
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

    setStatusOk('Responsável descadastrado com sucesso.')
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

    setStatusOk('Usuário cadastrado com sucesso.')
    await loadWorkspace()
    return true
  }

  function openRecipeModal(recipe: Recipe | null) {
    setEditingRecipe(recipe)
    setRecipeModalOpen(true)
  }

  function closeRecipeModal() {
    setEditingRecipe(null)
    setRecipeModalOpen(false)
  }

  async function submitRecipe(form: RecipeForm) {
    if (!supabase || !canViewCosts(role)) return
    const name = form.name.trim()
    const targetMarkup = Number(form.targetMarkup)
    if (!name || !Number.isFinite(targetMarkup) || targetMarkup <= 0 || form.items.length === 0) {
      setStatus('Informe nome, markup válido e ao menos um ingrediente.')
      return
    }

    const recipePayload = { name, target_markup: targetMarkup, notes: form.notes.trim() || null }
    let recipeId = editingRecipe?.id

    if (editingRecipe) {
      const { error } = await supabase.from('recipes').update(recipePayload).eq('id', editingRecipe.id)
      if (error) {
        setStatus(error.message)
        return
      }
      const { error: deleteError } = await supabase.from('recipe_items').delete().eq('recipe_id', editingRecipe.id)
      if (deleteError) {
        setStatus(deleteError.message)
        return
      }
    } else {
      const { data, error } = await supabase.from('recipes').insert(recipePayload).select('id').single()
      if (error || !data) {
        setStatus(error?.message ?? 'Não foi possível criar a ficha técnica.')
        return
      }
      recipeId = data.id as string
    }

    const itemsPayload = form.items
      .filter((item) => item.proteinId && Number(item.quantity) > 0)
      .map((item) => ({ recipe_id: recipeId, protein_id: item.proteinId, quantity: Number(item.quantity) }))

    const { error: itemsError } = await supabase.from('recipe_items').insert(itemsPayload)
    if (itemsError) {
      setStatus(itemsError.message)
      return
    }

    setStatusOk(editingRecipe ? 'Ficha técnica atualizada.' : 'Ficha técnica criada com sucesso.')
    closeRecipeModal()
    await loadWorkspace()
  }

  async function deleteRecipe(recipe: Recipe) {
    if (!supabase || !canViewCosts(role)) return
    if (!window.confirm(`Excluir a ficha técnica "${recipe.name}"?`)) return

    const { error } = await supabase.from('recipes').delete().eq('id', recipe.id)
    if (error) {
      setStatus(error.message)
      return
    }
    setStatusOk('Ficha técnica excluída.')
    await loadWorkspace()
  }

  async function recordStockMovement(itemId: string, type: MovementType, quantity: number, note: string) {
    if (!supabase || !canManageProteins(role)) return false

    const { error } = await supabase.from('stock_movements').insert({
      protein_id: itemId,
      movement_type: type,
      quantity,
      note: note || null,
    })

    if (error) {
      setStatus(error.message)
      return false
    }

    setStatusOk('Movimento de estoque registrado.')
    await loadWorkspace()
    return true
  }

  async function createIngredient(
    name: string,
    category: StockCategory,
    unit: StockUnit,
    cost: number | null,
    targetYield: number | null,
    minStock: number | null,
  ) {
    if (!supabase || !canManageProteins(role)) return false
    const cleanName = name.trim()
    if (!cleanName) {
      setStatus('Informe o nome do ingrediente.')
      return false
    }

    const slug = `${cleanName
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}-${Date.now()}`

    const { error } = await supabase.from('proteins').insert({
      slug,
      name: cleanName,
      category,
      unit,
      cost,
      target_yield: targetYield,
      min_stock_kg: minStock,
    })

    if (error) {
      setStatus(error.message)
      return false
    }

    setStatusOk('Ingrediente cadastrado.')
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

  if (!accountHasAccess(account, subscription)) {
    return (
      <PaywallScreen
        accountName={account?.name ?? 'sua conta'}
        checkingOutPlan={checkingOutPlan}
        errorMessage={billingError}
        onCheckout={startCheckout}
        onSignOut={signOut}
      />
    )
  }

  const tabTitles: Record<Tab, string> = {
    dashboard: 'Dashboard',
    cadastro: 'Cadastro de produtos',
    producao: 'Rendimentos',
    historico: 'Histórico de lotes',
    custos: 'Financeiro',
    fichas: 'Fichas técnicas',
    estoque: 'Estoque',
    alertas: 'Relatórios',
    acessos: 'Acessos',
    perfil: 'Minha conta',
  }

  const lowStockCount = stockLevels.filter((level) => level.status === 'low' || level.status === 'out').length
  const stockValue = stockLevels.reduce((sum, level) => {
    const protein = proteins.find((item) => item.id === level.item_id)
    return sum + (protein?.cost ? protein.cost * level.on_hand : 0)
  }, 0)

  const stalledAlertsCount = alerts.filter((alert) => !alert.title.includes('abaixo da meta')).length
  const belowTargetAlertsCount = alerts.length - stalledAlertsCount
  const alertsSubtitleParts: string[] = []
  if (stalledAlertsCount > 0) alertsSubtitleParts.push(`${stalledAlertsCount} parada${stalledAlertsCount === 1 ? '' : 's'}`)
  if (belowTargetAlertsCount > 0) alertsSubtitleParts.push(`${belowTargetAlertsCount} abaixo da meta`)
  const alertsSubtitle = alertsSubtitleParts.length > 0 ? alertsSubtitleParts.join(' · ') : 'Tudo em dia'

  const lowStockNames = stockLevels
    .filter((level) => level.status === 'low' || level.status === 'out')
    .map((level) => level.name)
  const stockSubtitle =
    lowStockNames.length === 0
      ? 'Estoque em dia'
      : lowStockNames.length <= 2
        ? lowStockNames.join(', ')
        : `${lowStockNames.slice(0, 2).join(', ')} +${lowStockNames.length - 2}`

  const avgRecipeMarkup =
    recipes.length > 0 ? recipes.reduce((sum, recipe) => sum + recipe.target_markup, 0) / recipes.length : null
  const recipesSubtitle = avgRecipeMarkup !== null ? `Markup médio ${avgRecipeMarkup.toFixed(1)}x` : 'Cadastre a primeira ficha'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark">CC</div>
          <div>
            <div className="logo-main">{account?.name ?? 'Controle do Chefe'}</div>
            <div className="logo-sub">Controle de rendimento</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Visão geral</div>
          <button className={tab === 'dashboard' ? 'active' : ''} type="button" onClick={() => setTab('dashboard')}>
            <LayoutDashboard size={17} />
            Dashboard
          </button>

          <div className="sidebar-section-label">Operação</div>
          {canManageProteins(role) && (
            <button className={tab === 'cadastro' ? 'active' : ''} type="button" onClick={() => setTab('cadastro')}>
              <ClipboardList size={17} />
              Cadastro de produtos
            </button>
          )}
          {showCosts && (
            <button className={tab === 'fichas' ? 'active' : ''} type="button" onClick={() => setTab('fichas')}>
              <FileText size={17} />
              Fichas técnicas
            </button>
          )}
          <button
            className={tab === 'estoque' || tab === 'producao' ? 'active' : ''}
            type="button"
            onClick={() => setTab('estoque')}
          >
            <Box size={17} />
            Estoque
          </button>

          <div className="sidebar-section-label">Análise</div>
          <button className={tab === 'historico' ? 'active' : ''} type="button" onClick={() => setTab('historico')}>
            <History size={17} />
            Histórico de lotes
          </button>
          {showCosts && (
            <button className={tab === 'custos' ? 'active' : ''} type="button" onClick={() => setTab('custos')}>
              <DollarSign size={17} />
              Financeiro
            </button>
          )}
          <button className={tab === 'alertas' ? 'active' : ''} type="button" onClick={() => setTab('alertas')}>
            <BarChart3 size={17} />
            Relatórios
            <span className={`alert-badge ${alerts.length === 0 ? 'zero' : ''}`}>{alerts.length}</span>
          </button>

          {canManageUsers(role) && (
            <>
              <div className="sidebar-section-label">Gestão</div>
              <button className={tab === 'acessos' ? 'active' : ''} type="button" onClick={() => setTab('acessos')}>
                <Users size={17} />
                Acessos
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="role-chip" type="button" onClick={() => setTab('perfil')}>
            <Shield size={14} />
            {roleLabel(role)}
          </button>
          <div className="sidebar-footer-actions">
            <button
              className="icon-btn ghost"
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="icon-btn ghost" type="button" onClick={() => void signOut()} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="content-header">
          <div>
            <h1>{tabTitles[tab]}</h1>
            <span className="date-label">
              {today.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                timeZone: BUSINESS_TIME_ZONE,
              })}
              <span className="live-badge">
                <span className="live-dot" />
                ao vivo
              </span>
            </span>
          </div>
          <div className="content-header-actions">
            {tab === 'dashboard' && (
              <PeriodFilterBar
                customFrom={dashboardPeriod.customFrom}
                customTo={dashboardPeriod.customTo}
                periodMode={dashboardPeriod.periodMode}
                setCustomFrom={dashboardPeriod.setCustomFrom}
                setCustomTo={dashboardPeriod.setCustomTo}
                setPeriodMode={dashboardPeriod.setPeriodMode}
              />
            )}
            {(tab === 'estoque' || tab === 'producao') && (
              <div className="chart-period-filter">
                <button className={tab === 'estoque' ? 'active' : ''} onClick={() => setTab('estoque')} type="button">
                  Estoque
                </button>
                <button className={tab === 'producao' ? 'active' : ''} onClick={() => setTab('producao')} type="button">
                  Rendimento
                </button>
              </div>
            )}
            {(tab === 'dashboard' || tab === 'producao') && canCreateBatch(role) && (
              <button className="new-batch-btn" type="button" onClick={() => openBatchModal()}>
                <Plus size={18} />
                Nova produção
              </button>
            )}
          </div>
        </header>

        {tab === 'dashboard' && (
          <section className="hero-stats">
            <HeroStatCard
              periodMode={dashboardPeriod.periodMode}
              proteins={proteins}
              range={dashboardPeriod.range}
              showCosts={showCosts}
              showTargets={showTargets}
              stockValue={stockValue}
              todayCost={summary.todayCost}
              todayCostPerKg={summary.todayCostPerKg}
              todayCount={summary.todayCount}
              totalNet={summary.totalNet}
              trendBatches={trendBatches}
              weightedAverage={summary.average}
            />
            <div className="hero-stats-secondary">
              <Metric
                icon={Layers}
                iconMotion="stack"
                label={`Lotes ${periodPhrase(dashboardPeriod.periodMode)}`}
                sub={`Média de ${summary.avgBatchesPerDay.toFixed(1)}/dia`}
                tone="accent"
                value={String(summary.todayCount)}
              />
              {showTargets && (
                <Metric
                  icon={TrendingUp}
                  iconMotion="rise"
                  label="Acima da meta"
                  sub={summary.monitoredCount > 0 ? `${Math.round((summary.above / summary.monitoredCount) * 100)}% das proteínas` : undefined}
                  tone="ok"
                  value={String(summary.above)}
                />
              )}
              {showTargets && (
                <Metric
                  icon={TrendingDown}
                  iconMotion="fall"
                  label="Abaixo da meta"
                  sub={summary.monitoredCount > 0 ? `${Math.round((summary.below / summary.monitoredCount) * 100)}% das proteínas` : undefined}
                  tone="warn"
                  value={String(summary.below)}
                />
              )}
              <Metric
                icon={Weight}
                iconMotion="balance"
                label={`Kg produzidos ${periodPhrase(dashboardPeriod.periodMode)}`}
                sub={`Média de ${fmtKg(summary.avgKgPerDay)}/dia`}
                tone="accent"
                value={fmtKg(summary.totalNet)}
              />
            </div>
          </section>
        )}

        {status && (
          <div aria-live="polite" className={`status-banner ${statusTone}`} role="status">
            {status}
          </div>
        )}

        <main className="main">
        {tab === 'dashboard' && (
          <>
            <div className="dashboard-teasers">
              <button
                className={`teaser-card${alerts.length > 0 ? ' danger' : ' ok'}`}
                type="button"
                onClick={() => setTab('alertas')}
              >
                <div className="teaser-card-main">
                  <span className="teaser-label">Alertas ativos</span>
                  <strong className={alerts.length > 0 ? 'warn' : 'ok'}>{alerts.length}</strong>
                  <small className="teaser-sub">{alertsSubtitle}</small>
                </div>
                <div className="teaser-card-visual">
                  <span className={`teaser-icon warn motion-alert${alerts.length > 0 ? ' active' : ''}`}>
                    <AlertTriangle size={26} />
                    {alerts.length > 0 && <span className="teaser-icon-dot" />}
                  </span>
                  <ChevronRight className="teaser-arrow" size={14} />
                </div>
              </button>
              <button
                className={`teaser-card${lowStockCount > 0 ? ' danger' : ' ok'}`}
                type="button"
                onClick={() => setTab('estoque')}
              >
                <div className="teaser-card-main">
                  <span className="teaser-label">Abaixo do mínimo</span>
                  <strong className={lowStockCount > 0 ? 'warn' : 'ok'}>{lowStockCount}</strong>
                  <small className="teaser-sub">{stockSubtitle}</small>
                </div>
                <div className="teaser-card-visual">
                  <span className={`teaser-icon motion-box ${lowStockCount > 0 ? 'warn active' : 'ok'}`}>
                    <Box size={26} />
                    {lowStockCount > 0 && <span className="teaser-icon-dot" />}
                  </span>
                  <ChevronRight className="teaser-arrow" size={14} />
                </div>
              </button>
              {showCosts && (
                <button className="teaser-card" type="button" onClick={() => setTab('fichas')}>
                  <div className="teaser-card-main">
                    <span className="teaser-label">Fichas técnicas</span>
                    <strong>{recipes.length}</strong>
                    <small className="teaser-sub">{recipesSubtitle}</small>
                  </div>
                  <div className="teaser-card-visual">
                    <span className="teaser-icon accent motion-doc">
                      <FileText size={26} />
                    </span>
                    <ChevronRight className="teaser-arrow" size={14} />
                  </div>
                </button>
              )}
            </div>
            <DashboardTab
              periodBatches={periodBatches}
              proteins={proteins}
              range={dashboardPeriod.range}
              showTargets={showTargets}
              trendBatches={trendBatches}
            />
          </>
        )}

        {tab === 'producao' && (
          <ProductionTab
            activeProteins={activeProteins}
            canCreate={canCreateBatch(role)}
            canEdit={canManageProteins(role)}
            latestBatches={latestBatches}
            metricBatches={metricBatches}
            onOpenBatch={openBatchModal}
            onUpdateProtein={updateProtein}
            showCosts={showCosts}
            showTargets={showTargets}
            yieldWindowDays={yieldWindowDays}
          />
        )}

        {tab === 'historico' && (
          <BatchHistoryTab
            canEditBatch={canEditBatch(role)}
            canVoid={canVoidBatch(role)}
            historyBatches={batches}
            onEditBatch={openEditBatch}
            onShowBatchHistory={showBatchHistory}
            onVoidBatch={voidBatch}
            proteinCatalog={proteins}
            showCosts={showCosts}
            showTargets={showTargets}
          />
        )}

        {tab === 'custos' && showCosts && (
          <CustosTab proteins={proteins} recipes={recipes} stockLevels={stockLevels} trendBatches={trendBatches} />
        )}

        {tab === 'fichas' && showCosts && (
          <RecipesTab
            activeProteins={activeProteins}
            canManage={showCosts}
            metricBatches={metricBatches}
            onCreateRecipe={submitRecipe}
            onDeleteRecipe={deleteRecipe}
            onOpenRecipeModal={openRecipeModal}
            recipeItems={recipeItems}
            recipes={recipes}
          />
        )}

        {tab === 'cadastro' && (
          <CadastroTab
            canManage={canManageProteins(role)}
            onConsumeOpenEdit={() => setEditIngredientId(null)}
            onCreateItem={createIngredient}
            onDeleteItem={deleteProtein}
            onUpdateProtein={updateProtein}
            openEditId={editIngredientId}
            proteins={proteins}
          />
        )}

        {tab === 'estoque' && (
          <StockTab
            canManage={canManageProteins(role)}
            movements={stockMovements}
            onDeleteItem={deleteProtein}
            onEditItem={(id) => {
              setEditIngredientId(id)
              setTab('cadastro')
            }}
            onRecordMovement={recordStockMovement}
            onUpdateProtein={updateProtein}
            proteins={proteins}
            stockLevels={stockLevels}
          />
        )}

        {tab === 'alertas' && (
          <AlertsTab
            alerts={alerts}
            canCreate={canCreateBatch(role)}
            canEdit={canManageProteins(role)}
            latestBatches={latestBatches}
            metricBatches={metricBatches}
            onOpenBatch={openBatchModal}
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
            onManageBilling={openBillingPortal}
            onToggleUser={toggleUser}
            onUpdateRole={updateRole}
            profiles={profiles}
            responsibleOptions={responsibleOptions}
            subscription={subscription}
          />
        )}

        {tab === 'perfil' && (
          <ProfileTab
            account={account}
            billingError={billingError}
            checkingOutPlan={checkingOutPlan}
            onCheckout={startCheckout}
            onManageBilling={openBillingPortal}
            profile={profile}
            subscription={subscription}
          />
        )}
        </main>
      </div>

      {modalOpen && (
        <BatchModal
          editReason={editReason}
          editingBatch={editingBatch}
          form={batchForm}
          onChange={setBatchForm}
          onClose={() => {
            setModalOpen(false)
            setEditingBatch(null)
            setEditReason('')
          }}
          onEditReasonChange={setEditReason}
          onSubmit={editingBatch ? editBatch : createBatch}
          proteins={editingBatch ? proteins : activeProteins}
          responsibleNames={responsibleNames}
          showCosts={showCosts}
          showTargets={showTargets}
        />
      )}

      {historyBatch && (
        <BatchHistoryModal
          batch={historyBatch}
          loading={loadingBatchEditLogs}
          logs={batchEditLogs}
          onClose={() => setHistoryBatch(null)}
          proteins={proteins}
        />
      )}

      {recipeModalOpen && (
        <RecipeModal
          activeProteins={activeProteins}
          editingItems={editingRecipe ? recipeItems.filter((item) => item.recipe_id === editingRecipe.id) : []}
          editingRecipe={editingRecipe}
          metricBatches={metricBatches}
          onClose={closeRecipeModal}
          onSubmit={submitRecipe}
        />
      )}
    </div>
  )
}

export default App
