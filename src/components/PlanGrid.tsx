import { Check, Sparkles } from 'lucide-react'
import { PLAN_DETAILS } from '../lib/billing'
import type { PlanSlug } from '../types'

const plans: PlanSlug[] = ['chefe-controle', 'chefe-cozinha', 'chefe-executivo']

export function PlanGrid({
  checkingOutPlan,
  onCheckout,
}: {
  checkingOutPlan: PlanSlug | null
  onCheckout: (planSlug: PlanSlug) => void
}) {
  return (
    <div className="plan-grid">
      {plans.map((planSlug) => {
        const plan = PLAN_DETAILS[planSlug]
        return (
          <div className={`plan-card${plan.featured ? ' featured' : ''}`} key={planSlug}>
            {plan.featured && (
              <div className="plan-card-badge">
                <Sparkles size={12} />
                Mais escolhido
              </div>
            )}
            <div className="plan-card-name">{plan.name}</div>
            <p className="plan-card-desc">{plan.description}</p>
            <div className="plan-card-price">
              <span className="plan-card-currency">R$</span>
              <span className="plan-card-amount">{plan.priceAmount}</span>
              <span className="plan-card-cents">,{plan.priceCents}</span>
              <span className="plan-card-period">/mês</span>
            </div>
            <ul className="plan-card-features">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={14} />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              className={plan.featured ? 'primary-btn large' : 'secondary-btn large'}
              disabled={checkingOutPlan !== null}
              onClick={() => onCheckout(planSlug)}
              type="button"
            >
              {checkingOutPlan === planSlug ? 'Abrindo checkout...' : 'Assinar'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
