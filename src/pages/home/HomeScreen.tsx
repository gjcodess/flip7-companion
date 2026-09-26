import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { LogOut, Play, Users } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createRoom, requestRoomJoin } from '../../lib/room'
import { errorMessage } from '../../lib/app-utils'
import { supabase } from '../../lib/supabase'
import { HostGameForm, JoinGameForm } from './HomeForms'
import { FieldWarningModal } from '../../components/FieldWarningModal'

export function HomeScreen({ user, openRoom }: { user: User; openRoom: (code: string) => void }) {
  const name = String(user.user_metadata.display_name || 'Player')
  const [target, setTarget] = useState(200)
  const [joinCode, setJoinCode] = useState('')
  const [homeMode, setHomeMode] = useState<'join' | 'host'>('join')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [warning, setWarning] = useState<{ title: string; message: string } | null>(null)

  const create = async () => {
    if (!name.trim()) {
      setWarning({ title: 'Display name required.', message: 'Enter a display name before you create a room.' })
      return
    }
    setBusy('create')
    try { const room = await createRoom(target, name); openRoom(room.code) } catch (caught) { setWarning({ title: 'Couldn’t create room.', message: errorMessage(caught, 'Could not create the room.') }) } finally { setBusy(null) }
  }
  const join = async () => {
    if (!name.trim()) {
      setWarning({ title: 'Display name required.', message: 'Enter a display name before you request a seat.' })
      return
    }
    if (joinCode.length !== 6) {
      setWarning({ title: 'Room code required.', message: 'Enter the six-character room code from the host.' })
      return
    }
    setBusy('join')
    try { const room = await requestRoomJoin(joinCode, name); openRoom(room.code) } catch (caught) { setWarning({ title: 'Couldn’t join room.', message: errorMessage(caught, 'Could not request a seat.') }) } finally { setBusy(null) }
  }

  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell lobby-main">
    <header className="topbar"><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /><button className="account-pill room-leave-button" onClick={() => supabase?.auth.signOut()}><LogOut size={15} /> Exit</button></header>
    <section className="auth-hero compact"><span className="eyebrow">WELCOME TO THE TABLE</span><h1>Ready when the deck is.</h1><p>Create a room for your group, or enter a code from the host.</p></section>
    <section className="home-mode-switch" aria-label="Choose how to enter a game"><button className={homeMode === 'join' ? 'selected' : ''} onClick={() => setHomeMode('join')}><Users size={16} /> Join a game</button><button className={homeMode === 'host' ? 'selected' : ''} onClick={() => setHomeMode('host')}><Play size={16} /> Host a game</button></section>
    <section className="lobby-grid">
      {homeMode === 'join' ? <JoinGameForm name={name} joinCode={joinCode} setJoinCode={setJoinCode} busy={busy} onJoin={join} /> : <HostGameForm name={name} target={target} setTarget={setTarget} busy={busy} onCreate={create} />}
    </section>
    <AnimatePresence>{warning && <FieldWarningModal title={warning.title} message={warning.message} onClose={() => setWarning(null)} />}</AnimatePresence>
  </main><aside className="desktop-marquee right"><div>PLAY<br />TO<br />WIN</div></aside></div>
}
