export type Role = 'admin' | 'gestor' | 'operador' | 'viewer'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: Role
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
  real_cost_kg: number | null
  shift: 'manha' | 'tarde'
  responsible: string | null
  notes: string | null
  recorded_at: string
  created_by: string | null
}

export type AppSetting = {
  key: string
  value: string
}
