import { Building2, Calendar, CreditCard, Mail, Shield, User } from 'lucide-react'
import { PLAN_DETAILS, SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUS_TONE } from '../lib/billing'
import { BUSINESS_TIME_ZONE } from '../lib/metrics'
import { roleLabel } from '../lib/permissions'
import { PlanGrid } from './PlanGrid'
import type { Account, PlanSlug, Profile, Subscription } from '../types'

function trialDaysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

export function ProfileTab({
  account,
  billingError,
  checkingOutPlan,
  onCheckout,
  onManageBilling,
  profile,
  subscription,
}: {
  account: Account | null
  billingError: string
  checkingOutPlan: PlanSlug | null
  onCheckout: (planSlug: PlanSlug) => void
  onManageBilling: () => void
  profile: Profile
  subscription: Subscription | null
}) {
  const isAdmin = profile.role === 'admin'
  const daysLeft = trialDaysLeft(account?.trial_ends_at)
  return (
    <>
      <div className="section-title">
        <User size={13} />
        Meu perfil
      </div>
      <section className="profile-card">
        <div className="profile-card-icon">
          <User size={22} />
        </div>
        <div className="profile-card-body">
          <h2>{profile.full_name || profile.email}</h2>
          <span className="profile-card-detail">
            <Mail size={13} />
            {profile.email}
          </span>
          <span className="profile-card-detail">
            <Shield size={13} />
            {roleLabel(profile.role)}
          </span>
          <span className="profile-card-detail">
            <Calendar size={13} />
            Cliente desde {new Date(profile.created_at).toLocaleDateString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}
          </span>
        </div>
      </section>

      {account && (
        <>
          <div className="section-title">
            <Building2 size={13} />
            Conta
          </div>
          <section className="profile-card">
            <div className="profile-card-icon">
              <Building2 size={22} />
            </div>
            <div className="profile-card-body">
              <h2>{account.name}</h2>
              <span className="profile-card-detail">
                <Calendar size={13} />
                Criada em {new Date(account.created_at).toLocaleDateString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}
              </span>
            </div>
          </section>
        </>
      )}

      <div className="section-title">
        <CreditCard size={13} />
        Assinatura
      </div>
      <div className="billing-summary">
        {subscription ? (
          <>
            <span>
              <strong>{PLAN_DETAILS[subscription.plan_slug].name}</strong>
            </span>
            <span className={`status-pill ${SUBSCRIPTION_STATUS_TONE[subscription.status]}`}>
              {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
            </span>
            {subscription.current_period_end && (
              <span className="billing-renewal">
                {subscription.cancel_at_period_end ? 'Cancela em' : 'Renova em'}{' '}
                {new Date(subscription.current_period_end).toLocaleDateString('pt-BR', {
                  timeZone: BUSINESS_TIME_ZONE,
                })}
              </span>
            )}
          </>
        ) : (
          <>
            <span>
              {isAdmin
                ? 'Nenhum plano do Controle do Chefe contratado ainda — escolha um abaixo.'
                : 'Nenhum plano do Controle do Chefe contratado ainda — peça a um administrador para contratar um plano.'}
            </span>
            {daysLeft !== null && (
              <>
                <span className={`status-pill ${daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warn' : 'accent'}`}>
                  Teste grátis · {daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}
                </span>
                <span className="billing-renewal">
                  Termina em{' '}
                  {new Date(account!.trial_ends_at!).toLocaleDateString('pt-BR', { timeZone: BUSINESS_TIME_ZONE })}
                </span>
              </>
            )}
          </>
        )}
        {subscription && (
          <button className="small-action" type="button" onClick={onManageBilling}>
            <CreditCard size={15} />
            Gerenciar assinatura
          </button>
        )}
      </div>

      {!subscription && isAdmin && (
        <>
          <PlanGrid checkingOutPlan={checkingOutPlan} onCheckout={onCheckout} />
          {billingError && <p className="form-message">{billingError}</p>}
        </>
      )}
    </>
  )
}
