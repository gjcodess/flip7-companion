import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { KeyRound, LoaderCircle, Sparkles, UserRoundPlus, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createPasswordAccount, signInAsGuest, signInWithPassword } from '../../lib/room'
import { errorMessage } from '../../lib/app-utils'
import { HomePrompt } from '../../components/HomePrompt'
import { FieldWarningModal } from '../../components/FieldWarningModal'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'guest' | 'sign-in' | 'sign-up'>('guest')
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<{ title: string; message: string } | null>(null)
  const [showHomePrompt, setShowHomePrompt] = useState(false)
  const [showAccountSoon, setShowAccountSoon] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (mode !== 'sign-in' && !displayName.trim()) {
      setWarning({ title: 'Display name required.', message: 'Enter a display name before you start playing.' })
      return
    }
    if (mode !== 'guest' && !email.trim()) {
      setWarning({ title: 'Email required.', message: 'Enter your email address to continue.' })
      return
    }
    if (mode !== 'guest' && !password) {
      setWarning({ title: 'Password required.', message: 'Enter your password to continue.' })
      return
    }
    setBusy(true)
    setWarning(null)
    try {
      const user = mode === 'guest'
        ? await signInAsGuest(displayName)
        : mode === 'sign-up'
          ? await createPasswordAccount(displayName, email, password)
          : await signInWithPassword(email, password)
      if (!user) throw new Error('We could not start your session.')
      onAuthenticated(user)
    } catch (caught) {
      setWarning({ title: 'Couldn’t continue.', message: errorMessage(caught, 'Unable to continue.') })
    } finally {
      setBusy(false)
    }
  }

  return <div className="app-shell lobby-shell">
    <aside className="desktop-marquee left"><div>FLIP<br />7</div></aside>
    <main className="game-shell lobby-main">
      <header className="topbar"><button className="brand-button" aria-label="Go to landing page" onClick={() => setShowHomePrompt(true)}><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /></button><span className="topbar-caption">PHYSICAL CARD COMPANION</span></header>
      <section className="auth-hero"><span className="eyebrow">CARNIVAL TABLE</span><h1>Track the cards<br />you actually flip.</h1><p>Use your physical deck. Each player records their own cards, then the table settles the round together.</p></section>
      <form className="auth-card" noValidate onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={mode === 'guest' ? 'selected' : ''} onClick={() => setMode('guest')}>Play as guest</button>
          <button type="button" onClick={() => setShowAccountSoon(true)}>Account</button>
        </div>
        <div className="auth-benefit" aria-live="polite">
          {mode === 'guest' ? <UserRoundPlus size={18} aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
          <div><b>{mode === 'guest' ? 'Quick start, no account needed.' : 'Keep your profile across sessions.'}</b><span>{mode === 'guest' ? 'Enter a display name and start playing right away.' : 'Sign in securely and use the same profile whenever you return.'}</span></div>
        </div>
        {mode !== 'sign-in' && <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} placeholder="Your name at the table" /></label>}
        {mode !== 'guest' && <><label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" /></label><label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} placeholder="At least 6 characters" /></label></>}
        <button className="primary-wide" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : mode === 'guest' ? <UserRoundPlus /> : <KeyRound />} {mode === 'guest' ? 'Start as a guest' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
        {mode !== 'guest' && <button type="button" className="text-action" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button>}
      </form>
      <section className="auth-demo-card"><div className="auth-demo-copy"><span className="eyebrow">TRY DEMO</span><h2>Just want to look around?</h2><p>Try the visual demo and practice choosing cards without signing in or saving anything.</p></div><button className="auth-demo-button" onClick={() => window.location.assign('/demo')}><Sparkles size={17} /> Try the demo</button></section>
    </main>
    <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>
    <AnimatePresence>{showHomePrompt && <HomePrompt onCancel={() => setShowHomePrompt(false)} onConfirm={() => window.location.assign('/')} />}{showAccountSoon && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setShowAccountSoon(false)}><motion.section className="card-picker home-prompt account-coming-soon" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>ACCOUNT ACCESS</span><h2>Coming soon.</h2></div><button className="close-button" aria-label="Close" title="Close" onClick={() => setShowAccountSoon(false)}><X size={19} /></button></div><p className="home-prompt-copy">Account sign-in and sign-up are being prepared for a future version. You can still start a table as a guest.</p><div className="account-coming-soon-actions"><button className="primary-wide" onClick={() => setShowAccountSoon(false)}><span className="button-content">Continue as guest</span></button></div></motion.section></motion.div>}{warning && <FieldWarningModal title={warning.title} message={warning.message} onClose={() => setWarning(null)} />}</AnimatePresence>
  </div>
}
