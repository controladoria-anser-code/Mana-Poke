import { CreditCard, LogOut } from 'lucide-react'
import { PlanGrid } from './PlanGrid'
import type { PlanSlug } from '../types'

export function PaywallScreen({
  accountName,
  checkingOutPlan,
  errorMessage,
  onCheckout,
  onSignOut,
}: {
  accountName: string
  checkingOutPlan: PlanSlug | null
  errorMessage: string
  onCheckout: (planSlug: PlanSlug) => void
  onSignOut: () => void
}) {
  return (
    <main className="setup-screen">
      <section className="setup-panel paywall-panel">
        <div className="logo-lock">
          <CreditCard size={28} />
        </div>
        <h1>Seu período grátis acabou</h1>
        <p>
          O teste grátis de <strong>{accountName}</strong> terminou. Escolha um plano para continuar usando o
          sistema — seus dados continuam salvos e disponíveis assim que a assinatura for confirmada.
        </p>

        <PlanGrid checkingOutPlan={checkingOutPlan} onCheckout={onCheckout} />

        {errorMessage && <p className="form-message">{errorMessage}</p>}

        <div className="setup-actions">
          <button className="secondary-btn" type="button" onClick={onSignOut}>
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </section>
    </main>
  )
}
