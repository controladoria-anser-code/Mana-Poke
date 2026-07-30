import { type FormEvent, useState } from 'react'
import { KeyRound, RefreshCw, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function SetupRequired() {
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

export function Splash({ text }: { text: string }) {
  return (
    <main className="setup-screen">
      <section className="setup-panel compact">
        <RefreshCw className="spin" size={24} />
        <p>{text}</p>
      </section>
    </main>
  )
}

export function AuthPanel({ initialMessage = '' }: { initialMessage?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(initialMessage)
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setMessage('')

    const result = await supabase.auth.signInWithPassword({ email, password })

    if (result.error) {
      const errorMessage = result.error.message.toLowerCase().includes('email rate limit')
        ? 'Taxa de envio de e-mail atingida. Aguarde alguns minutos e tente novamente.'
        : result.error.message
      setMessage(errorMessage)
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

        <form className="auth-form" onSubmit={submit}>
          <label>
            E-mail
            <input
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={6}
              required
            />
          </label>

          <button className="primary-btn" type="submit" disabled={loading}>
            <KeyRound size={18} />
            {loading ? 'Aguarde...' : 'Entrar'}
          </button>
          {message && <p className="form-message">{message}</p>}
          <p className="auth-help">Novos acessos são criados exclusivamente por um administrador.</p>
        </form>
      </section>
    </main>
  )
}
