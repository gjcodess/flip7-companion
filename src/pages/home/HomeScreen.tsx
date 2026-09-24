import { useState } from 'react'
import { LogOut, Play, Users } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createRoom, requestRoomJoin } from '../../lib/room'
import { errorMessage } from '../../lib/app-utils'
import { supabase } from '../../lib/supabase'
import { HostGameForm, JoinGameForm } from './HomeForms'

export function HomeScreen({ user, openRoom }: { user: User; openRoom: (code: string) => void }) {
  const [name, setName] = useState(String(user.user_metadata.display_name || 'Player'))
  const [target, setTarget] = useState(200)
  const [joinCode, setJoinCode] = useState('')
  const [homeMode, setHomeMode] = useState<'join' | 'host'>('join')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')

  const create = async () => {
    setBusy('create'); setError('')
    try { const room = await createRoom(target, name); openRoom(room.code) } catch (caught) { setError(errorMessage(caught, 'Could not create the room.')) } finally { setBusy(null) }
  }
  const join = async () => {
    setBusy('join'); setError('')
    try { const room = await requestRoomJoin(joinCode, name); openRoom(room.code) } catch (caught) { setError(errorMessage(caught, 'Could not request a seat.')) } finally { setBusy(null) }
  }

  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell lobby-main">
    <header className="topbar"><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /><button className="account-pill" onClick={() => supabase?.auth.signOut()}><LogOut size={15} /> Exit</button></header>
    <section className="auth-hero compact"><span className="eyebrow">WELCOME TO THE TABLE</span><h1>Ready when the deck is.</h1><p>Create a room for your group, or enter a code from the host.</p></section>
    <section className="home-mode-switch" aria-label="Choose how to enter a game"><button className={homeMode === 'join' ? 'selected' : ''} onClick={() => setHomeMode('join')}><Users size={16} /> Join a game</button><button className={homeMode === 'host' ? 'selected' : ''} onClick={() => setHomeMode('host')}><Play size={16} /> Host a game</button></section>
    <section className="lobby-grid">
      {homeMode === 'join' ? <JoinGameForm name={name} setName={setName} joinCode={joinCode} setJoinCode={setJoinCode} busy={busy} onJoin={join} /> : <HostGameForm name={name} setName={setName} target={target} setTarget={setTarget} busy={busy} onCreate={create} />}
    </section>
    {error && <p className="form-error page-error">{error}</p>}
  </main><aside className="desktop-marquee right"><div>PLAY<br />TO<br />WIN</div></aside></div>
}
