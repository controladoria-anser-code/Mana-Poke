export type Role = 'admin' | 'gestor' | 'operador' | 'viewer'

export type Profile = {
  id: string
  account_id: string
  email: string
  full_name: string | null
  role: Role
  enabled: boolean
  created_at: string
}

export type Account = {
  id: string
  name: string
  slug: string
  trial_ends_at: string | null
  created_at: string
}

export type PlanSlug = 'chefe-controle' | 'chefe-cozinha' | 'chefe-executivo'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

export type Subscription = {
  id: string
  account_id: string
  stripe_customer_id: string
  stripe_subscription_id: string | null
  plan_slug: PlanSlug
  status: SubscriptionStatus
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

// Histórico: essa tabela nasceu só para proteínas, mas hoje cobre qualquer
// ingrediente de cozinha (hortifruti, bebidas, etc.) — `category`/`unit`
// dizem do que se trata; `cost`/`target_yield` continuam opcionais até
// alguém preencher.
export type Protein = {
  id: string
  slug: string
  name: string
  category: StockCategory
  unit: StockUnit
  cost: number | null
  target_yield: number | null
  min_stock_kg: number | null
  active: boolean
  created_at: string
}

export type Recipe = {
  id: string
  name: string
  target_markup: number
  notes: string | null
  active: boolean
  created_at: string
}

export type RecipeItem = {
  id: string
  recipe_id: string
  protein_id: string
  protein_name: string
  protein_unit: StockUnit
  quantity: number
  protein_cost: number | null
  protein_target_yield: number | null
}

export type RecipeForm = {
  name: string
  targetMarkup: string
  notes: string
  items: Array<{ proteinId: string; quantity: string }>
}

export type MovementType = 'entrada' | 'saida' | 'ajuste'

export type StockCategory =
  | 'proteinas'
  | 'carboidrato'
  | 'hortifruti'
  | 'secos_graos'
  | 'laticinios'
  | 'bebidas_insumos'
  | 'outros'

export type StockUnit = 'kg' | 'g' | 'l' | 'ml' | 'un'

export type StockMovement = {
  id: string
  item_id: string
  item_name: string
  category: StockCategory
  unit: StockUnit
  movement_type: MovementType
  quantity: number
  note: string | null
  created_by: string | null
  created_at: string
}

export type StockLevel = {
  item_id: string
  name: string
  category: StockCategory
  unit: StockUnit
  min_stock: number | null
  on_hand: number
  status: 'ok' | 'low' | 'out' | 'sem_meta'
}

export type Batch = {
  id: string
  protein_id: string
  gross_qty: number
  net_qty: number
  yield_pct: number
  protein_cost_snapshot: number | null
  real_cost_kg: number | null
  shift: 'manha' | 'tarde'
  responsible: string | null
  notes: string | null
  recorded_at: string
  created_by: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  updated_at: string
}

export type AppSetting = {
  key: string
  value: string
}

export type ResponsibleOption = {
  id: string
  name: string
  created_at: string
}

export type BatchForm = {
  proteinId: string
  grossQty: string
  netQty: string
  shift: Batch['shift']
  responsible: string
  notes: string
}

export type BatchEditLog = {
  id: string
  batch_id: string
  edited_by: string | null
  editor_name: string
  reason: string
  changed_fields: string[]
  before_data: Record<string, unknown>
  after_data: Record<string, unknown>
  edited_at: string
}

export type NewUserForm = {
  fullName: string
  email: string
  password: string
  role: Role
}
