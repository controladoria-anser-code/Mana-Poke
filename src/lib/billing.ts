import type { Account, PlanSlug, Subscription } from '../types'

export const PLAN_DETAILS: Record<
  PlanSlug,
  {
    name: string
    priceAmount: string
    priceCents: string
    description: string
    features: string[]
    featured?: boolean
  }
> = {
  'chefe-controle': {
    name: 'Chefe no Controle',
    priceAmount: '49',
    priceCents: '90',
    description: 'Para quem está começando a organizar a cozinha.',
    features: [
      'Cálculo de rendimento de corte',
      'Ganhos e perdas por insumo',
      'Até 30 fichas técnicas',
      'Até 50 insumos cadastrados',
      '1 usuário',
    ],
  },
  'chefe-cozinha': {
    name: 'Chefe de Cozinha',
    priceAmount: '99',
    priceCents: '90',
    description: 'Para restaurantes que querem controlar o custo de verdade.',
    features: [
      'Tudo do plano anterior',
      'Fichas técnicas ilimitadas',
      'Controle de estoque com alertas',
      'Custo de matéria-prima em tempo real',
      'Insumos ilimitados e até 5 usuários',
    ],
    featured: true,
  },
  'chefe-executivo': {
    name: 'Chefe Executivo',
    priceAmount: '199',
    priceCents: '90',
    description: 'Para operações com várias unidades ou alto volume.',
    features: [
      'Tudo do plano anterior',
      'Múltiplas unidades e filiais',
      'Usuários ilimitados',
      'Painel consolidado entre unidades',
      'Gerente de conta dedicado',
    ],
  },
}

export const SUBSCRIPTION_STATUS_LABEL: Record<Subscription['status'], string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  incomplete_expired: 'Expirada',
  unpaid: 'Não paga',
  paused: 'Pausada',
}

export const SUBSCRIPTION_STATUS_TONE: Record<Subscription['status'], string> = {
  trialing: 'accent',
  active: 'ok',
  past_due: 'danger',
  canceled: 'virgin',
  incomplete: 'warn',
  incomplete_expired: 'virgin',
  unpaid: 'danger',
  paused: 'virgin',
}

const ACCESS_GRANTING_STATUSES = new Set(['trialing', 'active', 'past_due'])

export function accountHasAccess(account: Account | null, subscription: Subscription | null): boolean {
  if (!account) return false
  if (account.trial_ends_at === null) return true
  if (new Date(account.trial_ends_at).getTime() > Date.now()) return true
  return Boolean(subscription && ACCESS_GRANTING_STATUSES.has(subscription.status))
}
