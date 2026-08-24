import { type FormEvent, useEffect, useRef, useState } from 'react'
import { KeyRound, RefreshCw, Shield, UserPlus } from 'lucide-react'
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
        <div className="splash-badge">
          <RefreshCw className="spin" size={20} />
        </div>
        <p>{text}</p>
      </section>
    </main>
  )
}

const loginStyles = `
  :root {
    --lg-bg: #140b08;
    --lg-bg-2: #1a0f0a;
    --lg-surface: #22140d;
    --lg-border: rgba(255,220,190,.09);
    --lg-border-lit: rgba(255,220,190,.16);
    --lg-text: #fbf3ea;
    --lg-text-dim: #c4a894;
    --lg-text-faint: #8a6f5e;
    --lg-lime: #ff5836;
    --lg-lime-deep: #d13e22;
    --lg-amber: #ffb43d;
    --lg-glow: rgba(255,88,54,.24);
  }
  .brasa-login * { box-sizing: border-box; }
  .brasa-login {
    font-family: 'Geist', -apple-system, sans-serif;
    color: var(--lg-text);
    -webkit-font-smoothing: antialiased;
  }
  .brasa-login .serif { font-family: 'Instrument Serif', serif; font-weight: 400; }
  .brasa-login .grad {
    background: linear-gradient(120deg, var(--lg-lime), var(--lg-amber));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }

  .brasa-login .ambient {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(600px 400px at 80% -5%, rgba(255,88,54,.12), transparent 70%),
      radial-gradient(500px 500px at 5% 90%, rgba(255,107,82,.07), transparent 70%),
      var(--lg-bg);
  }

  .brasa-login .login-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .brasa-login .login-shell { width: min(440px, 100%); }

  .brasa-login .back-link {
    display: inline-flex; align-items: center; gap: 6px;
    border: 0; background: none; cursor: pointer; padding: 0; margin-bottom: 18px;
    color: var(--lg-text-faint); font-size: .84rem; font-family: 'Geist', sans-serif;
    transition: color .2s;
  }
  .brasa-login .back-link:hover { color: var(--lg-text-dim); }

  .brasa-login .login-card {
    background: linear-gradient(180deg, var(--lg-surface), var(--lg-bg-2));
    border: 1px solid var(--lg-border-lit);
    border-radius: 22px;
    padding: 36px 32px;
    box-shadow: 0 40px 100px -30px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.05);
  }

  .brasa-login .login-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .brasa-login .login-brand .logo {
    width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: 0 0 auto;
    background: linear-gradient(135deg, var(--lg-lime), var(--lg-lime-deep));
    box-shadow: 0 0 20px -4px var(--lg-glow);
  }
  .brasa-login .login-brand .logo svg { width: 22px; height: 22px; }
  .brasa-login .login-brand strong { display: block; font-weight: 600; font-size: 1.05rem; letter-spacing: -.01em; }
  .brasa-login .login-brand span { display: block; margin-top: 2px; font-size: .78rem; color: var(--lg-text-faint); }

  .brasa-login .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: 'Geist Mono', monospace; font-size: .68rem;
    letter-spacing: .1em; text-transform: uppercase; color: var(--lg-lime);
    background: rgba(255,88,54,.08); border: 1px solid rgba(255,88,54,.2);
    padding: 5px 12px; border-radius: 100px; margin-bottom: 16px;
  }
  .brasa-login .eyebrow .pulse {
    width: 6px; height: 6px; border-radius: 50%; background: var(--lg-lime);
    box-shadow: 0 0 8px var(--lg-lime); animation: brasa-login-pulse 2s infinite;
  }
  @keyframes brasa-login-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

  .brasa-login .login-title {
    font-size: clamp(1.5rem, 4vw, 1.9rem); font-weight: 600; letter-spacing: -.02em;
    line-height: 1.15; margin: 0 0 8px;
  }
  .brasa-login .login-sub { color: var(--lg-text-dim); font-size: .92rem; margin: 0 0 22px; }

  .brasa-login .login-tabs {
    display: flex; gap: 4px; padding: 4px; margin-bottom: 22px;
    background: rgba(255,255,255,.03); border: 1px solid var(--lg-border); border-radius: 12px;
  }
  .brasa-login .login-tabs button {
    flex: 1; border: 0; background: none; cursor: pointer; padding: 10px 8px;
    border-radius: 8px; font-family: 'Geist', sans-serif; font-weight: 500; font-size: .82rem;
    color: var(--lg-text-dim); transition: background .2s, color .2s;
  }
  .brasa-login .login-tabs button.active {
    background: var(--lg-lime); color: #1a0a05; font-weight: 600;
  }

  .brasa-login .login-form { display: grid; gap: 14px; }
  .brasa-login label {
    display: grid; gap: 7px;
    font-family: 'Geist Mono', monospace; font-size: .68rem; letter-spacing: .08em;
    text-transform: uppercase; color: var(--lg-text-faint);
  }
  .brasa-login input {
    font-family: 'Geist', sans-serif; font-size: .94rem; color: var(--lg-text);
    background: rgba(255,255,255,.03); border: 1px solid var(--lg-border-lit);
    border-radius: 10px; padding: 12px 14px; outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  .brasa-login input::placeholder { color: var(--lg-text-faint); }
  .brasa-login input:focus {
    border-color: var(--lg-lime); box-shadow: 0 0 0 3px rgba(255,88,54,.15);
  }

  .brasa-login .btn-submit {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; cursor: pointer; border: none; margin-top: 4px;
    font-family: 'Geist', sans-serif; font-weight: 600; font-size: .93rem;
    padding: 13px 22px; border-radius: 10px;
    background: var(--lg-lime); color: #1a0a05;
    box-shadow: 0 0 0 1px rgba(255,88,54,.4), 0 8px 30px -8px var(--lg-glow);
    transition: transform .15s, box-shadow .25s, opacity .2s;
  }
  .brasa-login .btn-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(255,88,54,.6), 0 14px 40px -8px var(--lg-glow); }
  .brasa-login .btn-submit:disabled { cursor: not-allowed; opacity: .6; }

  .brasa-login .form-message {
    margin: 0; font-size: .84rem; color: var(--lg-amber); text-align: center; line-height: 1.5;
  }
  .brasa-login .login-help {
    margin: 0; color: var(--lg-text-faint); font-size: .78rem; text-align: center; line-height: 1.5;
  }
`

const logoMark = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M4 17 L15 5 C18 2 22 4 20 8 L11 18 Z" fill="#2a0f06" />
    <path d="M4 17 L8 21 L11 18" fill="#2a0f06" />
  </svg>
)

type AuthMode = 'signin' | 'signup'

export function AuthPanel({
  initialMessage = '',
  onBack,
}: {
  initialMessage?: string
  onBack?: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState(initialMessage)
  const [loading, setLoading] = useState(false)
  const [signUpDone, setSignUpDone] = useState(false)

  useEffect(() => {
    const preconnect1 = document.createElement('link')
    preconnect1.rel = 'preconnect'
    preconnect1.href = 'https://fonts.googleapis.com'
    const preconnect2 = document.createElement('link')
    preconnect2.rel = 'preconnect'
    preconnect2.href = 'https://fonts.gstatic.com'
    preconnect2.crossOrigin = 'anonymous'
    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href =
      'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap'
    document.head.append(preconnect1, preconnect2, stylesheet)

    return () => {
      preconnect1.remove()
      preconnect2.remove()
      stylesheet.remove()
    }
  }, [])

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setMessage('')
    setSignUpDone(false)
    setPassword('')
    setConfirmPassword('')
  }

  async function submitSignIn(event: FormEvent) {
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

  async function submitSignUp(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setMessage('')

    if (password !== confirmPassword) {
      setMessage('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim() || undefined,
          business_name: businessName.trim() || undefined,
        },
      },
    })

    if (result.error) {
      const lower = result.error.message.toLowerCase()
      const errorMessage = lower.includes('email rate limit')
        ? 'Taxa de envio de e-mail atingida. Aguarde alguns minutos e tente novamente.'
        : lower.includes('already registered') || lower.includes('already exists')
          ? 'Esse e-mail já está cadastrado. Use a aba "Já sou cliente" para entrar.'
          : result.error.message
      setMessage(errorMessage)
      setLoading(false)
      return
    }

    setLoading(false)
    setSignUpDone(true)
    setMessage(
      result.data.session
        ? 'Conta criada! Você tem 7 dias grátis para explorar a plataforma.'
        : 'Conta criada! Confirme seu e-mail para começar seus 7 dias grátis.',
    )
  }

  return (
    <div className="brasa-login" ref={rootRef}>
      <style>{loginStyles}</style>
      <div className="ambient"></div>
      <main className="login-page">
        <div className="login-shell">
          {onBack && (
            <button type="button" className="back-link" onClick={onBack}>
              ← Voltar ao site
            </button>
          )}

          <section className="login-card">
            <div className="login-brand">
              <span className="logo">{logoMark}</span>
              <div>
                <strong>Controle do Chefe</strong>
                <span>Controle de rendimento online</span>
              </div>
            </div>

            <span className="eyebrow"><span className="pulse"></span> Acesso à plataforma</span>

            <h1 className="login-title">
              {mode === 'signin' ? (
                <>Bem-vindo de <span className="grad serif">volta</span>.</>
              ) : (
                <>Crie sua <span className="grad serif">conta</span>.</>
              )}
            </h1>
            <p className="login-sub">
              {mode === 'signin'
                ? 'Entre para acompanhar rendimento, custo e produção em tempo real.'
                : 'Crie sua conta e comece a usar agora — 7 dias grátis, sem cartão.'}
            </p>

            <div className="login-tabs" role="tablist">
              <button
                className={mode === 'signin' ? 'active' : ''}
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                onClick={() => switchMode('signin')}
              >
                Já sou cliente
              </button>
              <button
                className={mode === 'signup' ? 'active' : ''}
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => switchMode('signup')}
              >
                Quero criar uma conta
              </button>
            </div>

            {mode === 'signin' ? (
              <form className="login-form" onSubmit={submitSignIn}>
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

                <button className="btn-submit" type="submit" disabled={loading}>
                  <KeyRound size={18} />
                  {loading ? 'Aguarde...' : 'Entrar'}
                </button>
                {message && <p className="form-message">{message}</p>}
                <p className="login-help">Novos acessos também podem ser criados por um administrador.</p>
              </form>
            ) : signUpDone ? (
              <div className="login-form">
                <p className="form-message">{message}</p>
                <button className="btn-submit" type="button" onClick={() => switchMode('signin')}>
                  <KeyRound size={18} />
                  Ir para o login
                </button>
              </div>
            ) : (
              <form className="login-form" onSubmit={submitSignUp}>
                <label>
                  Nome do negócio
                  <input
                    autoComplete="organization"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    type="text"
                    placeholder="Ex.: Poke da Maria"
                    required
                  />
                </label>
                <label>
                  Seu nome completo
                  <input
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    type="text"
                    required
                  />
                </label>
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
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    minLength={6}
                    required
                  />
                </label>
                <label>
                  Confirmar senha
                  <input
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    type="password"
                    minLength={6}
                    required
                  />
                </label>

                <button className="btn-submit" type="submit" disabled={loading}>
                  <UserPlus size={18} />
                  {loading ? 'Aguarde...' : 'Criar conta'}
                </button>
                {message && <p className="form-message">{message}</p>}
                <p className="login-help">7 dias grátis, sem cartão. Depois, escolha um plano para continuar.</p>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
