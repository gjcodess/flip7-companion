import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { KeyRound, LoaderCircle, UserRoundPlus } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createPasswordAccount, signInAsGuest, signInWithPassword } from '../../lib/room'
import { errorMessage } from '../../lib/app-utils'
import { HomePrompt } from '../../components/HomePrompt'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'guest' | 'sign-in' | 'sign-up'>('guest')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showHomePrompt, setShowHomePrompt] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = mode === 'guest'
        ? await signInAsGuest(displayName)
        : mode === 'sign-up'
          ? await createPasswordAccount(displayName, email, password)
          : await signInWithPassword(email, password)
      if (!user) throw new Error('We could not start your session.')
      onAuthenticated(user)
    } catch (caught) {
      setError(errorMessage(caught, 'Unable to continue.'))
    } finally {
      setBusy(false)
    }
  }

  return <div className="app-shell lobby-shell">
    <aside className="desktop-marquee left"><div>FLIP<br />7</div></aside>
    <main className="game-shell lobby-main">
      <header className="topbar"><button className="brand-button" aria-label="Go to landing page" onClick={() => setShowHomePrompt(true)}><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /></button><span className="topbar-caption">PHYSICAL CARD COMPANION</span></header>
      <section className="auth-hero"><span className="eyebrow">CARNIVAL TABLE</span><h1>Track the cards<br />you actually flip.</h1><p>Use your physical deck. Each player records their own cards, then the table settles the round together.</p></section>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={mode === 'guest' ? 'selected' : ''} onClick={() => setMode('guest')}>Play as guest</button>
          <button type="button" className={mode !== 'guest' ? 'selected' : ''} onClick={() => setMode('sign-in')}>Account</button>
        </div>
        <div className="auth-benefit" aria-live="polite">
          {mode === 'guest' ? <UserRoundPlus size={18} aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
          <div><b>{mode === 'guest' ? 'Quick start, no account needed.' : 'Keep your profile across sessions.'}</b><span>{mode === 'guest' ? 'Enter a display name and start playing right away.' : 'Sign in securely and use the same profile whenever you return.'}</span></div>
        </div>
        {mode !== 'sign-in' && <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} placeholder="Your name at the table" required /></label>}
        {mode !== 'guest' && <><label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required /></label><label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} placeholder="At least 6 characters" required /></label></>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-wide" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : mode === 'guest' ? <UserRoundPlus /> : <KeyRound />} {mode === 'guest' ? 'Start as a guest' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
        {mode !== 'guest' && <button type="button" className="text-action" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button>}
      </form>
    </main>
    <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>
    <AnimatePresence>{showHomePrompt && <HomePrompt onCancel={() => setShowHomePrompt(false)} onConfirm={() => window.location.assign('/')} />}</AnimatePresence>
  </div>
}
