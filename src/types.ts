export type Role = 'admin' | 'gestor' | 'operador' | 'viewer'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: Role
  enabled: boolean
  created_at: string
}

export type Protein = {
  id: string
  slug: string
  name: string
  cost: number | null
  target_yield: number | null
  active: boolean
  created_at: string
}

export type Batch = {
  id: string
  protein_id: string
  gross_kg: number
  net_kg: number
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
  grossKg: string
  netKg: string
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
