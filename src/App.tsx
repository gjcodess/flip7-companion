import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bell, Check, ChevronDown, CircleHelp, Copy, Crown, LogOut, Plus, Sparkles, Undo2, Users, ArrowLeft, KeyRound, LoaderCircle, Play, UserRoundPlus } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { cardFromCode, demoTable, pickerCards, type Card } from './game/cards'
import { supabase } from './lib/supabase'
import { approveRoomMember, confirmRoundResult, createPasswordAccount, createRoom, currentUser, getLiveRound, getRoomSnapshot, heartbeatRoom, leaveRoom as leaveRoomRpc, recordRoundCard, requestRoomJoin, signInAsGuest, signInWithPassword, startMatch, stayInRound, type LiveRound, type RoomSnapshot } from './lib/room'

type Player = {
  id: string
  name: string
  score: number
  roundScore: number
  state: 'active' | 'stayed' | 'busted'
  color: string
  cards: number
}

const demoPlayers: Player[] = [
  { id: 'maya', name: 'Maya', score: 82, roundScore: 24, state: 'active', color: '#ed4f7e', cards: 4 },
  { id: 'noel', name: 'Noel', score: 71, roundScore: 0, state: 'busted', color: '#97c844', cards: 3 },
  { id: 'chris', name: 'Chris', score: 65, roundScore: 18, state: 'stayed', color: '#57b8d7', cards: 3 },
]

function CardArtwork({ card, lazy = false }: { card: Card; lazy?: boolean }) {
  if (card.image) {
    return <img src={card.image} alt={card.label} loading={lazy ? 'lazy' : 'eager'} decoding="async" />
  }
  return <span className="generated-card-face" aria-label={`${card.label} modifier card`}><small>MODIFIER</small><b>{card.label}</b><small>NUMBER TOTAL</small></span>
}

function scoreTable(cards: Card[]) {
  const numberTotal = cards.filter((card) => card.kind === 'number').reduce((sum, card) => sum + (card.points ?? 0), 0)
  const doubled = cards.some((card) => card.id === 'modifier-x2') ? numberTotal * 2 : numberTotal
  const modifierTotal = cards.filter((card) => card.kind === 'modifier' && card.id !== 'modifier-x2').reduce((sum, card) => sum + (card.points ?? 0), 0)
  return doubled + modifierTotal
}

function errorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error) return caught.message
  if (typeof caught === 'object' && caught && 'message' in caught && typeof caught.message === 'string') return caught.message
  return fallback
}

function RoomCode({ code, showCopy = true }: { code: string; showCopy?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = code
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard access can be unavailable in an insecure local-network context.
    }
  }
  return <div className="room-code"><span>ROOM</span><b>{code}</b>{showCopy && <button className="copy-room-code" aria-label={copied ? 'Room code copied' : 'Copy room code'} title={copied ? 'Copied' : 'Copy room code'} onClick={() => void copyCode()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>}</div>
}

function cardCode(card: Card) {
  if (card.id.startsWith('number-')) return `number:${card.id.slice(7)}`
  const codes: Record<string, string> = { 'modifier-plus-2': 'modifier:plus2', 'modifier-plus-4': 'modifier:plus4', 'modifier-plus-6': 'modifier:plus6', 'modifier-plus-8': 'modifier:plus8', 'modifier-plus-10': 'modifier:plus10', 'modifier-x2': 'modifier:x2', 'action-second-chance': 'action:second_chance', 'action-freeze': 'action:freeze', 'action-flip-three': 'action:flip_three' }
  return codes[card.id]
}

function TablePreview({ roomCode = 'SPARK-7', targetScore = 200, hostName = 'Glen', roomId, user, onLeave }: { roomCode?: string; targetScore?: number; hostName?: string; roomId?: string; user?: User; onLeave?: () => void }) {
  const [table, setTable] = useState<Card[]>(demoTable)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [toast, setToast] = useState('')
  const [isStaying, setIsStaying] = useState(false)
  const [liveRound, setLiveRound] = useState<LiveRound | null>(null)
  const [pendingAction, setPendingAction] = useState<Card | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const refreshLiveRound = async () => {
    if (!roomId) return
    try { const next = await getLiveRound(roomId); setLiveRound(next); const mine = next?.players.find((player) => player.user_id === user?.id); const cards = next?.cards.filter((card) => card.round_player_id === mine?.id).map((card) => cardFromCode(card.card_code)).filter((card): card is Card => Boolean(card)); if (cards) setTable(cards) } catch (caught) { setToast(errorMessage(caught, 'Could not refresh the table.')) }
  }
  useEffect(() => { if (!roomId) return; void refreshLiveRound(); const timer = window.setInterval(() => { void refreshLiveRound(); void heartbeatRoom(roomId) }, 15000); return () => window.clearInterval(timer) }, [roomId, user?.id])
  const mine = liveRound?.players.find((player) => player.user_id === user?.id)
  const localScore = useMemo(() => scoreTable(table), [table])
  const score = mine?.round_score ?? localScore
  const visiblePlayers: Player[] = liveRound ? liveRound.players.filter((player) => player.user_id !== user?.id).map((player) => ({ id: player.id, name: player.profiles?.display_name || 'Player', score: player.total_score, roundScore: player.round_score, state: player.status === 'frozen' ? 'stayed' : player.status, color: player.profiles?.avatar_color || '#57b8d7', cards: liveRound.cards.filter((card) => card.round_player_id === player.id).length })) : demoPlayers

  const addCard = async (card: Card, targetUserId?: string, confirmBust = false) => {
    if (roomId) {
      if (card.kind === 'action' && !targetUserId) { setPendingAction(card); setPickerOpen(false); return }
      setSubmitting(true)
      try {
        const result = await recordRoundCard(roomId, cardCode(card), targetUserId, confirmBust)
        if (result.needs_bust_confirmation) { setToast(`A second ${card.label} will bust you. Choose it again and confirm.`); setPickerOpen(false); return }
        await refreshLiveRound(); setToast(`${card.label} recorded`)
      } catch (caught) { setToast(errorMessage(caught, 'Could not record that card.')) } finally { setSubmitting(false); setPickerOpen(false); setPendingAction(null) }
      return
    }
    const duplicate = card.kind === 'number' && table.some((onTable) => onTable.id === card.id)
    if (duplicate) {
      setToast(`A second ${card.label} would bust you. Bust confirmation will be added with live game actions.`)
      setPickerOpen(false)
      return
    }
    setTable((current) => [...current, card])
    setPickerOpen(false)
    setToast(`${card.label} added to your table`)
  }

  const undo = () => {
    setTable((current) => current.slice(0, -1))
    setToast('Last card removed')
  }

  const stay = async () => {
    if (roomId) { setSubmitting(true); try { if (mine?.status === 'active') await stayInRound(roomId); else await confirmRoundResult(roomId); await refreshLiveRound(); setToast(mine?.status === 'active' ? 'Stayed. Confirm your result when ready.' : 'Round result confirmed.') } catch (caught) { setToast(errorMessage(caught, 'Could not update your round.')) } finally { setSubmitting(false) }; return }
    setIsStaying(true)
    setToast(`Round score locked at ${score} until you confirm.`)
  }

  return (
    <div className="app-shell">
      <aside className="desktop-marquee left"><div>FLIP<br />7</div></aside>
      <main className="game-shell">
        <header className="topbar">
          <div className="brand"><span>FLIP</span><strong>7</strong></div>
          <RoomCode code={roomCode} showCopy={false} />
          <button className="avatar" aria-label="Open room menu" onClick={() => setShowMenu(!showMenu)}>G</button>
          {showMenu && <div className="room-menu"><button><Users size={16} /> Players</button><button><CircleHelp size={16} /> Rules</button><button onClick={onLeave}><LogOut size={16} /> Leave room</button></div>}
        </header>

        <section className="match-strip">
          <div><span>ROUND</span><b>{String(liveRound?.number ?? 1).padStart(2, '0')}</b></div>
          <div className="target"><span>FIRST TO</span><b>{targetScore}</b></div>
          <div><span>YOU</span><b>{score}</b></div>
        </section>

        <section className="opponents" aria-label="Opponents">
          {visiblePlayers.map((player) => (
            <article className={`opponent ${player.state}`} key={player.id}>
              <div className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</div>
              <div className="opponent-copy"><b>{player.name}</b><span>{player.state === 'active' ? `${player.cards} cards · ${player.roundScore} pts` : player.state === 'stayed' ? `Stayed · ${player.roundScore} pts` : 'Busted'}</span></div>
              <strong>{player.score}</strong>
            </article>
          ))}
        </section>

        <section className="table-area">
          <div className="section-kicker"><Crown size={16} /> YOUR TABLE <span>{mine?.status?.toUpperCase() || 'ACTIVE'}</span></div>
          <div className="score-display"><span>ROUND SCORE</span><motion.b key={score} initial={{ scale: 1.25, color: '#ed4f7e' }} animate={{ scale: 1, color: '#132d67' }}>{score}</motion.b></div>
          <div className="card-table">
            <AnimatePresence initial={false}>
              {table.map((card, index) => (
                <motion.button
                  className={`table-card ${card.kind}`}
                  key={`${card.id}-${index}`}
                  initial={{ opacity: 0, y: -32, rotate: index % 2 ? 3 : -3 }}
                  animate={{ opacity: 1, y: 0, rotate: index % 2 ? 2 : -2 }}
                  exit={{ opacity: 0, y: -28 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  onClick={() => setToast(`${card.label} is on your table`)}
                >
                  <CardArtwork card={card} />
                </motion.button>
              ))}
              <button className="add-card-card" onClick={() => setPickerOpen(true)} aria-label="Record a physical card"><Plus size={30} /></button>
            </AnimatePresence>
          </div>
        </section>

        <section className="actions">
          <button className="secondary-action" disabled={table.length === 0 || Boolean(roomId)} onClick={undo}><Undo2 size={19} /> Undo</button>
          <button className={`stay-action ${isStaying || mine?.status !== 'active' ? 'confirmed' : ''}`} disabled={table.length === 0 || submitting || mine?.confirmed_at !== null} onClick={() => void stay()}>{mine?.confirmed_at ? <><Check size={19} /> Confirmed</> : mine?.status && mine.status !== 'active' ? <><Check size={19} /> Confirm round</> : isStaying ? <><Check size={19} /> Staying</> : <>Stay <ChevronDown size={18} /></>}</button>
          <button className="flip-action" disabled={submitting || mine?.status !== undefined && mine.status !== 'active'} onClick={() => setPickerOpen(true)}><Sparkles size={20} /> Record card</button>
        </section>

        <footer className="game-footer"><span><Bell size={15} /> Live sync {supabase ? 'connected' : 'preview mode'}</span><span><Crown size={15} /> Host: {hostName}</span></footer>
      </main>
      <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>

      <AnimatePresence>
        {pickerOpen && (
          <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPickerOpen(false)}>
            <motion.section className="card-picker" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: 'spring', damping: 26 }} onClick={(event) => event.stopPropagation()}>
              <div className="picker-heading"><div><span>PHYSICAL CARD</span><h2>What did you flip?</h2></div><button onClick={() => setPickerOpen(false)}>Close</button></div>
              <p>Select the card in front of you. The app never draws a card for you.</p>
              <div className="picker-grid">
                {pickerCards.map((card) => <button key={card.id} onClick={() => addCard(card)} aria-label={`Record ${card.label}`}><CardArtwork card={card} lazy /></button>)}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast" initial={{ y: 35, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 35, opacity: 0 }} onAnimationComplete={() => window.setTimeout(() => setToast(''), 2600)}>{toast}</motion.div>}</AnimatePresence>
      <AnimatePresence>{pendingAction && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="card-picker" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}><div className="picker-heading"><div><span>ACTION TARGET</span><h2>Who gets {pendingAction.label}?</h2></div><button onClick={() => setPendingAction(null)}>Close</button></div><div className="target-list">{liveRound?.players.filter((player) => player.user_id !== user?.id).map((player) => <button key={player.user_id} onClick={() => void addCard(pendingAction, player.user_id)}>{player.profiles?.display_name || 'Player'}</button>)}</div></motion.section></motion.div>}</AnimatePresence>
    </div>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'guest' | 'sign-in' | 'sign-up'>('guest')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      <header className="topbar"><div className="brand"><span>FLIP</span><strong>7</strong></div><span className="topbar-caption">PHYSICAL CARD COMPANION</span></header>
      <section className="auth-hero"><span className="eyebrow">CARNIVAL TABLE</span><h1>Track the cards<br />you actually flip.</h1><p>Use your physical deck. Each player records their own cards, then the table settles the round together.</p></section>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={mode === 'guest' ? 'selected' : ''} onClick={() => setMode('guest')}>Play as guest</button>
          <button type="button" className={mode !== 'guest' ? 'selected' : ''} onClick={() => setMode('sign-in')}>Account</button>
        </div>
        {mode !== 'sign-in' && <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} placeholder="Your name at the table" required /></label>}
        {mode !== 'guest' && <><label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required /></label><label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} placeholder="At least 6 characters" required /></label></>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-wide" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : mode === 'guest' ? <UserRoundPlus /> : <KeyRound />} {mode === 'guest' ? 'Start as a guest' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
        {mode !== 'guest' && <button type="button" className="text-action" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button>}
      </form>
      <footer className="lobby-footer">The app records your physical cards. It never deals for you.</footer>
    </main>
    <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>
  </div>
}

function HomeScreen({ user, openRoom }: { user: User; openRoom: (code: string) => void }) {
  const [name, setName] = useState(String(user.user_metadata.display_name || 'Player'))
  const [target, setTarget] = useState(200)
  const [joinCode, setJoinCode] = useState('')
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
    <header className="topbar"><div className="brand"><span>FLIP</span><strong>7</strong></div><button className="account-pill" onClick={() => supabase?.auth.signOut()}><LogOut size={15} /> {name}</button></header>
    <section className="auth-hero compact"><span className="eyebrow">WELCOME TO THE TABLE</span><h1>Ready when the deck is.</h1><p>Create a room for your group, or enter a code from the host.</p></section>
    <section className="lobby-grid">
      <article className="lobby-card"><span className="eyebrow">HOST A GAME</span><h2>Start a table</h2><label>Your display name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} /></label><span className="field-label">TARGET SCORE</span><div className="target-options">{[100, 200, 300].map((score) => <button key={score} className={target === score ? 'selected' : ''} onClick={() => setTarget(score)}>{score}</button>)}</div><label>Custom target (50–500)<input type="number" min="50" max="500" value={target} onChange={(e) => setTarget(Math.max(50, Math.min(500, Number(e.target.value))))} /></label><button className="primary-wide" disabled={busy !== null} onClick={create}>{busy === 'create' ? <LoaderCircle className="spin" /> : <Play />} Create room</button></article>
      <article className="lobby-card join-card"><span className="eyebrow">JOIN A GAME</span><h2>Have a room code?</h2><p>The host approves every player before the match begins.</p><label>Room code<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} placeholder="ABC123" /></label><button className="secondary-wide" disabled={busy !== null || joinCode.length !== 6} onClick={join}>{busy === 'join' ? <LoaderCircle className="spin" /> : <Users />} Request a seat</button></article>
    </section>
    {error && <p className="form-error page-error">{error}</p>}
  </main><aside className="desktop-marquee right"><div>PLAY<br />TO<br />WIN</div></aside></div>
}

function RoomScreen({ user, code, leaveRoom }: { user: User; code: string; leaveRoom: () => void }) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = async () => { try { setSnapshot(await getRoomSnapshot(code)); setError('') } catch (caught) { setError(caught instanceof Error ? caught.message : 'This room is unavailable.') } }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer) }, [code])
  useEffect(() => {
    if (!supabase || !snapshot) return
    const db = supabase
    const channel = db.channel(`room-${snapshot.room.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${snapshot.room.id}` }, () => void refresh()).subscribe()
    return () => { void db.removeChannel(channel) }
  }, [snapshot?.room.id])
  if (error) return <div className="simple-state"><p>{error}</p><button onClick={leaveRoom}>Back to rooms</button></div>
  if (!snapshot) return <div className="simple-state"><LoaderCircle className="spin" /><p>Setting the table…</p></div>
  const { room, members } = snapshot
  const me = members.find((member) => member.user_id === user.id)
  const host = room.host_user_id === user.id
  const approved = members.filter((member) => member.status === 'approved')
  const pending = members.filter((member) => member.status === 'pending')
  const hostName = members.find((member) => member.user_id === room.host_user_id)?.profiles?.display_name || 'Host'
  const quitRoom = async () => { setBusy(true); try { await leaveRoomRpc(room.id); leaveRoom() } catch (caught) { setError(errorMessage(caught, 'Could not leave this room.')) } finally { setBusy(false) } }
  if (room.status === 'active' && me?.status === 'approved') return <TablePreview roomCode={room.code} targetScore={room.target_score} hostName={hostName} roomId={room.id} user={user} onLeave={() => void quitRoom()} />
  const approve = async (member: string) => { setBusy(true); try { await approveRoomMember(room.id, member); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not approve that player.') } finally { setBusy(false) } }
  const begin = async () => { setBusy(true); try { await startMatch(room.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start the match.') } finally { setBusy(false) } }
  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell lobby-main">
    <header className="topbar"><button className="back-button" onClick={() => void quitRoom()} disabled={busy}><ArrowLeft size={18} /> Leave room</button><RoomCode code={room.code} /></header>
    <section className="room-hero"><span className="eyebrow">{room.status === 'lobby' ? 'LOBBY' : 'MATCH IN PROGRESS'}</span><h1>{room.status === 'lobby' ? 'Waiting for the table.' : 'The table is playing.'}</h1><p>First to <b>{room.target_score}</b> points · {approved.length} approved player{approved.length === 1 ? '' : 's'}</p></section>
    <section className="room-share-card"><div><span className="eyebrow">ROOM CODE</span><p>Share this code with your players.</p></div><RoomCode code={room.code} /></section>
    <section className="members-card"><div className="members-heading"><div><span className="eyebrow">PLAYERS</span><h2>Seats at this table</h2></div><span className="seat-count">{approved.length}/18</span></div>
      {members.map((member) => <div className="member-row" key={member.user_id}><div className="mini-avatar" style={{ background: member.profiles?.avatar_color || '#57b8d7' }}>{member.profiles?.display_name?.[0] || '?'}</div><div><b>{member.profiles?.display_name || 'Player'} {member.user_id === user.id && '(you)'}</b><span>{member.role === 'host' ? 'Host' : member.status === 'pending' ? 'Waiting for host approval' : 'Ready'}</span></div>{member.role === 'host' ? <Crown size={18} /> : host && member.status === 'pending' ? <button className="approve-button" disabled={busy} onClick={() => void approve(member.user_id)}>Approve</button> : <span className={`member-status ${member.status}`}>{member.status}</span>}</div>)}
    </section>
    {host && room.status === 'lobby' && <section className="host-controls"><p>{pending.length ? `${pending.length} player${pending.length === 1 ? ' is' : 's are'} waiting for approval.` : approved.length < 3 ? 'Approve at least 3 players to begin.' : 'The table is ready.'}</p><button className="primary-wide" disabled={busy || approved.length < 3} onClick={() => void begin()}>{busy ? <LoaderCircle className="spin" /> : <Play />} Start match</button></section>}
    {!host && me?.status === 'pending' && <section className="host-controls"><p>Your seat request is waiting for {hostName}. This page refreshes automatically.</p></section>}
  </main><aside className="desktop-marquee right"><div>YOUR<br />LUCK<br />AWAITS</div></aside></div>
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room'))
  useEffect(() => {
    if (!supabase) { setUser(null); return }
    void currentUser().then(setUser)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])
  const openRoom = (code: string) => { const next = code.toUpperCase(); window.history.replaceState({}, '', `?room=${next}`); setRoomCode(next) }
  const leaveRoom = () => { window.history.replaceState({}, '', window.location.pathname); setRoomCode(null) }
  if (!supabase) return <div className="simple-state"><p>Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values to .env.local.</p></div>
  if (user === undefined) return <div className="simple-state"><LoaderCircle className="spin" /><p>Opening the table…</p></div>
  if (!user) return <AuthScreen onAuthenticated={setUser} />
  return roomCode ? <RoomScreen user={user} code={roomCode} leaveRoom={leaveRoom} /> : <HomeScreen user={user} openRoom={openRoom} />
}
