import { useEffect, useRef } from 'react'

const landingStyles = `
  .landing-root {
    --bg: #140b08;
    --bg-2: #1a0f0a;
    --surface: #22140d;
    --surface-2: #2a1911;
    --border: rgba(255,220,190,.09);
    --border-lit: rgba(255,220,190,.16);
    --text: #fbf3ea;
    --text-dim: #c4a894;
    --text-faint: #8a6f5e;
    --lime: #ff5836;
    --lime-deep: #d13e22;
    --amber: #ffb43d;
    --coral: #ff8a3d;
    --glow: rgba(255,88,54,.24);
  }
  .landing-root * { margin: 0; padding: 0; box-sizing: border-box; }
  .landing-root { scroll-behavior: smooth; }
  .landing-root {
    font-family: 'Geist', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  .landing-root ::selection { background: var(--lime); color: #1a0a05; }
  .landing-root .wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
  .landing-root .mono { font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums; }
  .landing-root .serif { font-family: 'Instrument Serif', serif; font-weight: 400; }

  .landing-root .ambient {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(600px 400px at 75% -5%, rgba(255,88,54,.10), transparent 70%),
      radial-gradient(500px 500px at 10% 20%, rgba(255,107,82,.06), transparent 70%);
  }

  .landing-root .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: 'Geist Mono', monospace; font-size: .72rem;
    letter-spacing: .12em; text-transform: uppercase; color: var(--lime);
    background: rgba(255,88,54,.08); border: 1px solid rgba(255,88,54,.2);
    padding: 6px 13px; border-radius: 100px;
  }
  .landing-root .eyebrow .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 8px var(--lime); animation: landing-pulse 2s infinite; }
  @keyframes landing-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

  .landing-root .btn {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    font-family: 'Geist', sans-serif; font-weight: 500; font-size: .93rem;
    padding: 12px 22px; border-radius: 10px; text-decoration: none; border: none;
    transition: transform .15s, box-shadow .25s, background .2s, border-color .2s;
  }
  .landing-root .btn-primary {
    background: var(--lime); color: #1a0a05; font-weight: 600;
    box-shadow: 0 0 0 1px rgba(255,88,54,.4), 0 8px 30px -8px var(--glow);
  }
  .landing-root .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(255,88,54,.6), 0 14px 40px -8px var(--glow); }
  .landing-root .btn-ghost { background: rgba(255,255,255,.04); color: var(--text); border: 1px solid var(--border-lit); }
  .landing-root .btn-ghost:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.24); }
  .landing-root .btn .arr { transition: transform .2s; }
  .landing-root .btn:hover .arr { transform: translateX(3px); }

  .landing-root nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(10,11,13,.7); backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
  }
  .landing-root .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 66px; }
  .landing-root .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 1.05rem; letter-spacing: -.01em; }
  .landing-root .brand .logo {
    width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center;
    background: linear-gradient(135deg, var(--lime), var(--lime-deep));
    box-shadow: 0 0 20px -4px var(--glow);
  }
  .landing-root .brand .logo svg { width: 19px; height: 19px; }
  .landing-root .nav-links { display: flex; gap: 6px; align-items: center; }
  .landing-root .nav-links a { color: var(--text-dim); text-decoration: none; font-size: .9rem; font-weight: 400; padding: 8px 14px; border-radius: 8px; transition: color .2s, background .2s; }
  .landing-root .nav-links a:hover { color: var(--text); background: rgba(255,255,255,.04); }
  .landing-root .nav-cta { display: flex; gap: 10px; align-items: center; }
  .landing-root .nav-cta .login { color: var(--text-dim); text-decoration: none; font-size: .9rem; padding: 8px 12px; transition: color .2s; cursor: pointer; }
  .landing-root .nav-cta .login:hover { color: var(--text); }

  .landing-root .hero { padding: 90px 0 60px; text-align: center; position: relative; }
  .landing-root .hero h1 {
    font-size: clamp(2.6rem, 6vw, 5rem); font-weight: 600; letter-spacing: -.035em;
    line-height: 1.02; margin: 26px auto 24px; max-width: 15ch;
  }
  .landing-root .hero h1 .serif { font-weight: 400; letter-spacing: 0; }
  .landing-root .hero h1 .grad {
    background: linear-gradient(120deg, var(--lime), var(--amber));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .landing-root .hero p.lead { font-size: 1.18rem; color: var(--text-dim); max-width: 44ch; margin: 0 auto 34px; }
  .landing-root .hero-cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .landing-root .hero-sub { margin-top: 20px; font-size: .84rem; color: var(--text-faint); display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
  .landing-root .hero-sub span { display: inline-flex; align-items: center; gap: 6px; }
  .landing-root .hero-sub svg { width: 14px; height: 14px; stroke: var(--lime); }

  .landing-root .mockup-shell { margin: 66px auto 0; max-width: 1000px; position: relative; }
  .landing-root .mockup-glow { position: absolute; inset: -1px -1px auto; height: 60%; background: radial-gradient(60% 100% at 50% 0, var(--glow), transparent 70%); filter: blur(30px); z-index: 0; }
  .landing-root .mockup {
    position: relative; z-index: 1;
    background: linear-gradient(180deg, var(--surface), var(--bg-2));
    border: 1px solid var(--border-lit); border-radius: 16px; overflow: hidden;
    box-shadow: 0 40px 100px -30px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.05);
  }
  .landing-root .mockup-bar { display: flex; align-items: center; gap: 8px; padding: 13px 16px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,.02); }
  .landing-root .dot3 { display: flex; gap: 6px; }
  .landing-root .dot3 i { width: 11px; height: 11px; border-radius: 50%; display: block; }
  .landing-root .mockup-bar .addr { margin-left: 12px; font-family: 'Geist Mono', monospace; font-size: .72rem; color: var(--text-faint); background: rgba(255,255,255,.03); padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border); }
  .landing-root .mockup-body { display: grid; grid-template-columns: 200px 1fr; min-height: 380px; }
  .landing-root .mk-side { border-right: 1px solid var(--border); padding: 18px 12px; display: flex; flex-direction: column; gap: 3px; }
  .landing-root .mk-side .sec-lbl { font-family: 'Geist Mono', monospace; font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: var(--text-faint); padding: 10px 12px 6px; }
  .landing-root .mk-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; font-size: .84rem; color: var(--text-dim); }
  .landing-root .mk-item svg { width: 15px; height: 15px; stroke: currentColor; opacity: .8; }
  .landing-root .mk-item.active { background: rgba(255,88,54,.1); color: var(--lime); }
  .landing-root .mk-main { padding: 22px 24px; }
  .landing-root .mk-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .landing-root .mk-head h4 { font-size: 1.05rem; font-weight: 600; }
  .landing-root .mk-head .chip { font-family: 'Geist Mono', monospace; font-size: .68rem; color: var(--lime); background: rgba(255,88,54,.1); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,88,54,.2); }
  .landing-root .mk-cards { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 18px; }
  .landing-root .mk-card { background: rgba(255,255,255,.02); border: 1px solid var(--border); border-radius: 11px; padding: 14px; }
  .landing-root .mk-card .lbl { font-size: .68rem; color: var(--text-faint); text-transform: uppercase; letter-spacing: .06em; font-family: 'Geist Mono', monospace; }
  .landing-root .mk-card .val { font-size: 1.5rem; font-weight: 600; margin-top: 6px; letter-spacing: -.02em; }
  .landing-root .mk-card .delta { font-size: .72rem; margin-top: 3px; font-family: 'Geist Mono', monospace; }
  .landing-root .up { color: var(--amber); } .landing-root .down { color: var(--lime); }
  .landing-root .mk-chart { background: rgba(255,255,255,.02); border: 1px solid var(--border); border-radius: 11px; padding: 16px; }
  .landing-root .mk-chart .ct-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .landing-root .mk-chart .ct-head span { font-size: .8rem; color: var(--text-dim); }
  .landing-root .bars { display: flex; align-items: flex-end; gap: 10px; height: 90px; }
  .landing-root .bars .bcol { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 3px; height: 100%; }
  .landing-root .bars .fill { border-radius: 4px 4px 2px 2px; }
  .landing-root .bars .g { background: linear-gradient(180deg, var(--lime), var(--lime-deep)); }
  .landing-root .bars .w { background: rgba(120,72,45,.6); }
  .landing-root .bars .bx { font-family: 'Geist Mono', monospace; font-size: .58rem; color: var(--text-faint); text-align: center; }

  .landing-root .marquee-wrap { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 22px 0; margin-top: 70px; overflow: hidden; }
  .landing-root .marquee { display: flex; gap: 56px; white-space: nowrap; animation: landing-scroll 26s linear infinite; }
  .landing-root .marquee span { font-family: 'Geist Mono', monospace; font-size: .82rem; color: var(--text-faint); letter-spacing: .06em; display: inline-flex; align-items: center; gap: 56px; }
  .landing-root .marquee span::after { content: "\\2022"; color: var(--lime); opacity: .5; }
  @keyframes landing-scroll { to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) { .landing-root .marquee { animation: none; } }

  .landing-root section { padding: 100px 0; }
  .landing-root .sec-head { max-width: 46ch; margin-bottom: 56px; }
  .landing-root .sec-head.center { margin-left: auto; margin-right: auto; text-align: center; }
  .landing-root .sec-head h2 { font-size: clamp(2rem, 4vw, 3.1rem); font-weight: 600; letter-spacing: -.03em; line-height: 1.05; margin: 18px 0 16px; }
  .landing-root .sec-head h2 .serif { font-weight: 400; letter-spacing: 0; color: var(--lime); }
  .landing-root .sec-head p { color: var(--text-dim); font-size: 1.1rem; }

  .landing-root .bento { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
  .landing-root .cell {
    background: linear-gradient(180deg, var(--surface), var(--bg-2));
    border: 1px solid var(--border); border-radius: 18px; padding: 28px;
    position: relative; overflow: hidden; transition: border-color .25s, transform .25s;
  }
  .landing-root .cell:hover { border-color: var(--border-lit); transform: translateY(-3px); }
  .landing-root .cell::before { content: ""; position: absolute; inset: 0; background: radial-gradient(300px 160px at var(--mx,50%) 0, rgba(255,88,54,.06), transparent 70%); opacity: 0; transition: opacity .3s; pointer-events: none; }
  .landing-root .cell:hover::before { opacity: 1; }
  .landing-root .cell.big { grid-column: span 4; }
  .landing-root .cell.small { grid-column: span 2; }
  .landing-root .cell.half { grid-column: span 3; }
  .landing-root .cell .ico { width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center; background: rgba(255,88,54,.1); border: 1px solid rgba(255,88,54,.18); margin-bottom: 18px; }
  .landing-root .cell .ico svg { width: 21px; height: 21px; stroke: var(--lime); }
  .landing-root .cell h3 { font-size: 1.25rem; font-weight: 600; letter-spacing: -.01em; margin-bottom: 9px; }
  .landing-root .cell p { color: var(--text-dim); font-size: .95rem; }
  .landing-root .cell .mini-viz { margin-top: 20px; display: flex; align-items: flex-end; gap: 6px; height: 56px; }
  .landing-root .cell .mini-viz i { flex: 1; background: linear-gradient(180deg, var(--lime), transparent); border-radius: 3px; display: block; opacity: .8; }
  .landing-root .cell .stat-row { margin-top: 18px; display: flex; gap: 22px; }
  .landing-root .cell .stat-row div .n { font-size: 1.7rem; font-weight: 600; letter-spacing: -.02em; }
  .landing-root .cell .stat-row div .n .serif { color: var(--lime); }
  .landing-root .cell .stat-row div .t { font-size: .78rem; color: var(--text-faint); }

  .landing-root .flow { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; counter-reset: step; }
  .landing-root .flow-step { background: linear-gradient(180deg, var(--surface), var(--bg-2)); border: 1px solid var(--border); border-radius: 18px; padding: 30px 26px; position: relative; }
  .landing-root .flow-step .fn { font-family: 'Geist Mono', monospace; font-size: .74rem; color: var(--lime); border: 1px solid rgba(255,88,54,.25); background: rgba(255,88,54,.08); width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; margin-bottom: 18px; }
  .landing-root .flow-step h3 { font-size: 1.18rem; font-weight: 600; margin-bottom: 8px; }
  .landing-root .flow-step p { color: var(--text-dim); font-size: .93rem; }

  .landing-root .metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 18px; border: 1px solid var(--border); border-radius: 20px; padding: 40px 20px; background: linear-gradient(180deg, var(--surface), var(--bg-2)); }
  .landing-root .metric { text-align: center; }
  .landing-root .metric .big { font-size: clamp(2.2rem,4vw,3.2rem); font-weight: 600; letter-spacing: -.03em; line-height: 1; }
  .landing-root .metric .big .grad { background: linear-gradient(120deg, var(--lime), var(--amber)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .landing-root .metric .cap { font-size: .86rem; color: var(--text-dim); margin-top: 10px; }

  .landing-root .plans { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; align-items: stretch; }
  .landing-root .plan { background: linear-gradient(180deg, var(--surface), var(--bg-2)); border: 1px solid var(--border); border-radius: 20px; padding: 32px 28px; display: flex; flex-direction: column; position: relative; }
  .landing-root .plan.featured { border-color: rgba(255,88,54,.4); box-shadow: 0 0 0 1px rgba(255,88,54,.15), 0 30px 70px -30px var(--glow); }
  .landing-root .plan.featured::before { content: ""; position: absolute; inset: 0; border-radius: 20px; padding: 1px; background: linear-gradient(180deg, rgba(255,88,54,.5), transparent 40%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
  .landing-root .badge { position: absolute; top: -12px; left: 28px; background: var(--lime); color: #1a0a05; font-family: 'Geist Mono', monospace; font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 600; padding: 5px 12px; border-radius: 7px; }
  .landing-root .plan-name { font-size: 1.3rem; font-weight: 600; letter-spacing: -.01em; }
  .landing-root .plan-desc { font-size: .87rem; color: var(--text-dim); margin: 8px 0 22px; min-height: 42px; }
  .landing-root .price { display: flex; align-items: baseline; gap: 3px; }
  .landing-root .price .cur { font-family: 'Geist Mono', monospace; font-size: .95rem; color: var(--text-faint); }
  .landing-root .price .amt { font-size: 3rem; font-weight: 600; letter-spacing: -.03em; line-height: 1; }
  .landing-root .price .cents { font-family: 'Geist Mono', monospace; font-size: 1rem; color: var(--text-faint); }
  .landing-root .price-per { font-size: .8rem; color: var(--text-faint); margin: 6px 0 24px; }
  .landing-root .plan ul { list-style: none; margin: 0 0 26px; flex-grow: 1; display: flex; flex-direction: column; gap: 12px; }
  .landing-root .plan ul li { font-size: .9rem; color: var(--text-dim); padding-left: 26px; position: relative; }
  .landing-root .plan ul li::before { content: ""; position: absolute; left: 0; top: 6px; width: 16px; height: 16px; border-radius: 50%; background: rgba(255,88,54,.12); }
  .landing-root .plan ul li::after { content: ""; position: absolute; left: 5px; top: 10px; width: 6px; height: 3px; border-left: 1.6px solid var(--lime); border-bottom: 1.6px solid var(--lime); transform: rotate(-45deg); }
  .landing-root .plan .btn { width: 100%; justify-content: center; }
  .landing-root .pricing-note { text-align: center; margin-top: 30px; font-size: .88rem; color: var(--text-faint); }

  .landing-root .cta-final { text-align: center; position: relative; }
  .landing-root .cta-card { background: linear-gradient(180deg, var(--surface), var(--bg-2)); border: 1px solid var(--border-lit); border-radius: 26px; padding: 66px 40px; position: relative; overflow: hidden; }
  .landing-root .cta-card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(500px 240px at 50% 0, var(--glow), transparent 70%); pointer-events: none; }
  .landing-root .cta-card h2 { font-size: clamp(2rem,4vw,3.2rem); font-weight: 600; letter-spacing: -.03em; margin-bottom: 16px; position: relative; }
  .landing-root .cta-card h2 .serif { color: var(--lime); }
  .landing-root .cta-card p { color: var(--text-dim); font-size: 1.1rem; max-width: 40ch; margin: 0 auto 32px; position: relative; }
  .landing-root .cta-card .hero-cta { position: relative; }

  .landing-root footer { border-top: 1px solid var(--border); padding: 60px 0 34px; }
  .landing-root .foot-grid { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 40px; margin-bottom: 44px; }
  .landing-root .foot-brand { max-width: 24ch; }
  .landing-root .foot-brand .brand { margin-bottom: 14px; }
  .landing-root .foot-brand p { font-size: .9rem; color: var(--text-dim); }
  .landing-root .foot-col h4 { font-size: .74rem; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 14px; font-family: 'Geist Mono', monospace; }
  .landing-root .foot-col a { display: block; color: var(--text-dim); text-decoration: none; font-size: .9rem; padding: 5px 0; transition: color .2s; }
  .landing-root .foot-col a:hover { color: var(--lime); }
  .landing-root .foot-bottom { border-top: 1px solid var(--border); padding-top: 24px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; font-size: .82rem; color: var(--text-faint); }

  .landing-root .reveal { opacity: 0; transform: translateY(28px); transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1); }
  .landing-root .reveal.in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .landing-root .reveal { opacity: 1; transform: none; transition: none; } .landing-root { scroll-behavior: auto; } }

  @media (max-width: 900px) {
    .landing-root .nav-links { display: none; }
    .landing-root .mockup-body { grid-template-columns: 1fr; }
    .landing-root .mk-side { display: none; }
    .landing-root .bento { grid-template-columns: 1fr; }
    .landing-root .cell.big, .landing-root .cell.small, .landing-root .cell.half { grid-column: span 1; }
    .landing-root .flow, .landing-root .metrics, .landing-root .plans { grid-template-columns: 1fr; }
    .landing-root .metrics { gap: 34px; }
    .landing-root section { padding: 70px 0; }
    .landing-root .plan.featured { order: -1; }
  }
  @media (max-width: 560px) {
    .landing-root .mk-cards { grid-template-columns: 1fr; }
    .landing-root .nav-cta .login { display: none; }
    .landing-root .foot-grid { flex-direction: column; }
  }
`

const logoMark = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M4 17 L15 5 C18 2 22 4 20 8 L11 18 Z" fill="#2a0f06" />
    <path d="M4 17 L8 21 L11 18" fill="#2a0f06" />
  </svg>
)

function trackPointer(event: React.MouseEvent<HTMLDivElement>) {
  event.currentTarget.style.setProperty('--mx', `${event.nativeEvent.offsetX}px`)
}

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const container = rootRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 },
    )

    container.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  function handleEnterClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    onEnter()
  }

  return (
    <div className="landing-root" ref={rootRef}>
      <style>{landingStyles}</style>
      <div className="ambient"></div>

      <nav>
        <div className="wrap nav-inner">
          <div className="brand">
            <span className="logo">{logoMark}</span>
            Controle do Chefe
          </div>
          <div className="nav-links">
            <a href="#recursos">Recursos</a>
            <a href="#como">Como funciona</a>
            <a href="#numeros">Resultados</a>
            <a href="#planos">Planos</a>
          </div>
          <div className="nav-cta">
            <a href="#" className="login" onClick={handleEnterClick}>Entrar</a>
            <a href="#" className="btn btn-primary" onClick={handleEnterClick}>Começar grátis <span className="arr">→</span></a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap">
          <span className="eyebrow reveal"><span className="pulse"></span> Inteligência de rendimento em tempo real</span>
          <h1 className="reveal">Cada corte vira <span className="grad serif">margem</span>, não desperdício.</h1>
          <p className="lead reveal">A plataforma que pesa, calcula e precifica por você. Do salmão inteiro ao prato no cardápio, saiba exatamente quanto rende, quanto custa e quanto lucra.</p>
          <div className="hero-cta reveal">
            <a href="#" className="btn btn-primary" onClick={handleEnterClick}>Começar grátis <span className="arr">→</span></a>
            <a href="#como" className="btn btn-ghost">Ver a plataforma</a>
          </div>
          <div className="hero-sub reveal">
            <span><svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg> 7 dias grátis</span>
            <span><svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg> Sem cartão</span>
            <span><svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg> Configura em minutos</span>
          </div>
        </div>

        <div className="wrap">
          <div className="mockup-shell reveal">
            <div className="mockup-glow"></div>
            <div className="mockup">
              <div className="mockup-bar">
                <div className="dot3"><i style={{ background: '#ff5f57' }}></i><i style={{ background: '#febc2e' }}></i><i style={{ background: '#28c840' }}></i></div>
                <div className="addr">app.controledochefe.com.br/rendimento</div>
              </div>
              <div className="mockup-body">
                <aside className="mk-side">
                  <div className="sec-lbl">Operação</div>
                  <div className="mk-item active"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg> Rendimento</div>
                  <div className="mk-item"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><path d="M12 2v20M17 6H9a3 3 0 000 6h6a3 3 0 010 6H6"/></svg> Custos</div>
                  <div className="mk-item"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><path d="M5 3h11l3 3v15H5z"/><path d="M9 9h7M9 13h7"/></svg> Fichas técnicas</div>
                  <div className="mk-item"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/></svg> Estoque</div>
                  <div className="sec-lbl">Análise</div>
                  <div className="mk-item"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg> Relatórios</div>
                </aside>
                <main className="mk-main">
                  <div className="mk-head">
                    <h4>Rendimento por insumo</h4>
                    <span className="chip">● ao vivo</span>
                  </div>
                  <div className="mk-cards">
                    <div className="mk-card">
                      <div className="lbl">Rendimento médio</div>
                      <div className="val">68<span style={{ fontSize: '1rem', color: 'var(--text-faint)' }}>%</span></div>
                      <div className="delta up">▲ 6% vs. mês anterior</div>
                    </div>
                    <div className="mk-card">
                      <div className="lbl">Custo por kg limpo</div>
                      <div className="val">R$ 92</div>
                      <div className="delta down">▼ 4% preço da carne</div>
                    </div>
                    <div className="mk-card">
                      <div className="lbl">Perda evitada</div>
                      <div className="val">R$ 3,4k</div>
                      <div className="delta up">▲ neste mês</div>
                    </div>
                  </div>
                  <div className="mk-chart">
                    <div className="ct-head"><span>Rendimento vs. perda por peça</span><span className="mono" style={{ color: 'var(--text-faint)', fontSize: '.72rem' }}>últimos 6 cortes</span></div>
                    <div className="bars">
                      <div className="bcol"><div className="fill g" style={{ height: '62%' }}></div><div className="fill w" style={{ height: '14%' }}></div><div className="bx">Salmão</div></div>
                      <div className="bcol"><div className="fill g" style={{ height: '78%' }}></div><div className="fill w" style={{ height: '8%' }}></div><div className="bx">Picanha</div></div>
                      <div className="bcol"><div className="fill g" style={{ height: '54%' }}></div><div className="fill w" style={{ height: '20%' }}></div><div className="bx">Costela</div></div>
                      <div className="bcol"><div className="fill g" style={{ height: '70%' }}></div><div className="fill w" style={{ height: '11%' }}></div><div className="bx">Filé</div></div>
                      <div className="bcol"><div className="fill g" style={{ height: '66%' }}></div><div className="fill w" style={{ height: '13%' }}></div><div className="bx">Robalo</div></div>
                      <div className="bcol"><div className="fill g" style={{ height: '82%' }}></div><div className="fill w" style={{ height: '6%' }}></div><div className="bx">Frango</div></div>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="marquee-wrap">
        <div className="marquee">
          <span>Restaurantes</span><span>Peixarias</span><span>Açougues</span><span>Cozinhas industriais</span><span>Hamburguerias</span><span>Rotisserias</span><span>Buffets</span>
          <span>Restaurantes</span><span>Peixarias</span><span>Açougues</span><span>Cozinhas industriais</span><span>Hamburguerias</span><span>Rotisserias</span><span>Buffets</span>
        </div>
      </div>

      <section id="recursos">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow"><span className="pulse"></span> A plataforma</span>
            <h2>Tudo que sai da faca, <span className="serif">medido</span> e conectado.</h2>
            <p>Quatro módulos que trabalham juntos. O que você pesa vira número na sua margem, sem planilha no meio do caminho.</p>
          </div>
          <div className="bento">
            <div className="cell big reveal" onMouseMove={trackPointer}>
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg></div>
              <h3>Rendimento de corte em tempo real</h3>
              <p>Registre o peso bruto e o das aparas. A plataforma devolve na hora o rendimento em quilo, percentual e reais, mostrando ganho e perda de cada peça que passa pela cozinha.</p>
              <div className="mini-viz">
                <i style={{ height: '44%' }}></i><i style={{ height: '66%' }}></i><i style={{ height: '52%' }}></i><i style={{ height: '78%' }}></i><i style={{ height: '60%' }}></i><i style={{ height: '88%' }}></i><i style={{ height: '70%' }}></i><i style={{ height: '94%' }}></i>
              </div>
            </div>
            <div className="cell small reveal" onMouseMove={trackPointer}>
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2v20M17 6H9a3 3 0 000 6h6a3 3 0 010 6H6"/></svg></div>
              <h3>Custo de matéria-prima</h3>
              <p>Acompanhe o preço de compra e o histórico. Quando a carne sobe, o custo do prato se ajusta sozinho.</p>
            </div>
            <div className="cell half reveal" onMouseMove={trackPointer}>
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round"><path d="M5 3h11l3 3v15H5z"/><path d="M9 9h7M9 13h7M9 17h4"/></svg></div>
              <h3>Ficha técnica que se calcula sozinha</h3>
              <p>Monte a receita com ingredientes e rendimento. O custo do prato aparece pronto e sugere o preço de venda pela margem que você definir.</p>
              <div className="stat-row">
                <div><div className="n"><span className="serif">R$</span> 18,40</div><div className="t">Custo do prato</div></div>
                <div><div className="n"><span className="serif">3,2x</span></div><div className="t">Markup sugerido</div></div>
              </div>
            </div>
            <div className="cell half reveal" onMouseMove={trackPointer}>
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg></div>
              <h3>Estoque com alerta inteligente</h3>
              <p>Saiba o que tem, o que falta e o que está prestes a acabar. Alertas de mínimo evitam a compra de emergência que sempre sai mais cara.</p>
              <div className="stat-row">
                <div><div className="n"><span className="serif">142</span></div><div className="t">Itens monitorados</div></div>
                <div><div className="n"><span className="serif" style={{ color: 'var(--coral)' }}>3</span></div><div className="t">Abaixo do mínimo</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como">
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="eyebrow"><span className="pulse"></span> Simples de verdade</span>
            <h2>Três passos entre a balança e a <span className="serif">decisão</span>.</h2>
          </div>
          <div className="flow">
            <div className="flow-step reveal">
              <div className="fn">01</div>
              <h3>Pese e registre</h3>
              <p>Informe o peso bruto da peça inteira e depois o peso das aparas, ossos e partes que não vão para o prato.</p>
            </div>
            <div className="flow-step reveal">
              <div className="fn">02</div>
              <h3>A plataforma calcula</h3>
              <p>Na hora, você vê o rendimento real, o custo por quilo limpo e quanto aquele corte custou de verdade em reais.</p>
            </div>
            <div className="flow-step reveal">
              <div className="fn">03</div>
              <h3>Precifique com certeza</h3>
              <p>Com o custo real na mão, defina o preço do prato pela margem que você quer, não pelo palpite do concorrente.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="numeros">
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="eyebrow"><span className="pulse"></span> Resultados</span>
            <h2>O que uma cozinha <span className="serif">no controle</span> ganha.</h2>
          </div>
          <div className="metrics reveal">
            <div className="metric"><div className="big"><span className="grad">30%</span></div><div className="cap">de perda escondida no corte, revelada</div></div>
            <div className="metric"><div className="big"><span className="grad">3min</span></div><div className="cap">para montar a ficha de um prato</div></div>
            <div className="metric"><div className="big"><span className="grad">R$ 3,4k</span></div><div className="cap">de desperdício evitado por mês</div></div>
            <div className="metric"><div className="big"><span className="grad">100%</span></div><div className="cap">do custo real, sem achismo</div></div>
          </div>
        </div>
      </section>

      <section id="planos">
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="eyebrow"><span className="pulse"></span> Planos</span>
            <h2>Comece pequeno. <span className="serif">Suba na brigada.</span></h2>
            <p style={{ marginLeft: 'auto', marginRight: 'auto' }}>Do primeiro corte controlado à operação com várias unidades. Escolha o tamanho da sua cozinha.</p>
          </div>
          <div className="plans">
            <div className="plan reveal">
              <div className="plan-name">Chefe no Controle</div>
              <div className="plan-desc">Para quem está começando a organizar a cozinha.</div>
              <div className="price"><span className="cur">R$</span><span className="amt">49</span><span className="cents">,90</span></div>
              <div className="price-per">por mês</div>
              <ul>
                <li>Cálculo de rendimento de corte</li>
                <li>Ganhos e perdas por insumo</li>
                <li>Até 30 fichas técnicas</li>
                <li>Até 50 insumos cadastrados</li>
                <li>1 usuário</li>
                <li>Relatórios de rendimento</li>
              </ul>
              <a href="#" className="btn btn-ghost" onClick={handleEnterClick}>Começar agora</a>
            </div>
            <div className="plan featured reveal">
              <div className="badge">Mais escolhido</div>
              <div className="plan-name">Chefe de Cozinha</div>
              <div className="plan-desc">Para restaurantes que querem controlar o custo de verdade.</div>
              <div className="price"><span className="cur">R$</span><span className="amt">99</span><span className="cents">,90</span></div>
              <div className="price-per">por mês</div>
              <ul>
                <li>Tudo do plano anterior</li>
                <li>Fichas técnicas ilimitadas</li>
                <li>Controle de estoque com alertas</li>
                <li>Custo de matéria-prima em tempo real</li>
                <li>Precificação por margem</li>
                <li>Insumos ilimitados e até 5 usuários</li>
                <li>Suporte por e-mail e WhatsApp</li>
              </ul>
              <a href="#" className="btn btn-primary" onClick={handleEnterClick}>Testar 7 dias grátis <span className="arr">→</span></a>
            </div>
            <div className="plan reveal">
              <div className="plan-name">Chefe Executivo</div>
              <div className="plan-desc">Para operações com várias unidades ou alto volume.</div>
              <div className="price"><span className="cur">R$</span><span className="amt">199</span><span className="cents">,90</span></div>
              <div className="price-per">por mês</div>
              <ul>
                <li>Tudo do plano anterior</li>
                <li>Múltiplas unidades e filiais</li>
                <li>Usuários ilimitados</li>
                <li>Painel consolidado entre unidades</li>
                <li>Metas de perda e desperdício</li>
                <li>Integração via API</li>
                <li>Gerente de conta dedicado</li>
              </ul>
              <a href="#" className="btn btn-ghost">Falar com vendas</a>
            </div>
          </div>
          <p className="pricing-note">Todos os planos com 7 dias grátis, sem cartão.</p>
        </div>
      </section>

      <section className="cta-final">
        <div className="wrap">
          <div className="cta-card reveal">
            <h2>O próximo corte pode fechar a conta <span className="serif">a seu favor</span>.</h2>
            <p>Descubra em minutos quanto sua cozinha ganha, ou perde, em cada peça que passa pela faca.</p>
            <div className="hero-cta">
              <a href="#" className="btn btn-primary" onClick={handleEnterClick}>Começar grátis <span className="arr">→</span></a>
              <a href="#planos" className="btn btn-ghost">Ver planos</a>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <div className="brand">
                <span className="logo">{logoMark}</span>
                Controle do Chefe
              </div>
              <p>Inteligência de rendimento, custo e ficha técnica para cozinhas profissionais.</p>
            </div>
            <div className="foot-col">
              <h4>Produto</h4>
              <a href="#recursos">Recursos</a>
              <a href="#como">Como funciona</a>
              <a href="#planos">Planos</a>
              <a href="#">Novidades</a>
            </div>
            <div className="foot-col">
              <h4>Empresa</h4>
              <a href="#">Sobre</a>
              <a href="#">Blog</a>
              <a href="#">Contato</a>
            </div>
            <div className="foot-col">
              <h4>Suporte</h4>
              <a href="#">Central de ajuda</a>
              <a href="#">WhatsApp</a>
              <a href="#">Privacidade</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Controle do Chefe. Todos os direitos reservados.</span>
            <span className="mono">Feito para quem vive de cozinha.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
