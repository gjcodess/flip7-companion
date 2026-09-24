import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, CircleHelp, Copy, Crown, ListOrdered, LogOut, Plus, Undo2, Redo2, Users, ArrowLeft, KeyRound, LoaderCircle, Play, UserRoundPlus, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { cardFromCode, demoTable, pickerCards, type Card } from './game/cards'
import { supabase } from './lib/supabase'
import { approveRoomMember, confirmRoundResult, createPasswordAccount, createRoom, currentUser, finalizeRound, getLiveRound, getRoomSnapshot, heartbeatRoom, leaveRoom as leaveRoomRpc, recordRoundCard, requestRoomJoin, signInAsGuest, signInWithPassword, startMatch, stayInRound, voidRoundCard, type LiveRound, type RoomSnapshot } from './lib/room'

type Player = {
  id: string
  userId?: string
  name: string
  score: number
  roundScore: number
  state: 'active' | 'stayed' | 'frozen' | 'busted'
  color: string
  cards: number
  isHost?: boolean
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
  const flipSevenBonus = cards.filter((card) => card.kind === 'number').length >= 7 ? 15 : 0
  const modifierTotal = cards.filter((card) => card.kind === 'modifier' && card.id !== 'modifier-x2').reduce((sum, card) => sum + (card.points ?? 0), 0)
  const subtotal = numberTotal + modifierTotal
  return (cards.some((card) => card.id === 'modifier-x2') ? subtotal * 2 : subtotal) + flipSevenBonus
}

function errorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error) return caught.message
  if (typeof caught === 'object' && caught && 'message' in caught && typeof caught.message === 'string') return caught.message
  return fallback
}

function RoomCode({ code, showCopy = true, label = 'ROOM' }: { code: string; showCopy?: boolean; label?: string }) {
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
  return <div className="room-code"><span>{label}</span><b>{code}</b>{showCopy && <button className="copy-room-code" aria-label={copied ? 'Room code copied' : 'Copy room code'} title={copied ? 'Copied' : 'Copy room code'} onClick={() => void copyCode()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>}</div>
}

function cardCode(card: Card) {
  if (card.id.startsWith('number-')) return `number:${card.id.slice(7)}`
  const codes: Record<string, string> = { 'modifier-plus-2': 'modifier:plus2', 'modifier-plus-4': 'modifier:plus4', 'modifier-plus-6': 'modifier:plus6', 'modifier-plus-8': 'modifier:plus8', 'modifier-plus-10': 'modifier:plus10', 'modifier-x2': 'modifier:x2', 'action-second-chance': 'action:second_chance', 'action-freeze': 'action:freeze', 'action-flip-three': 'action:flip_three' }
  return codes[card.id]
}

function pointLabel(value: number) {
  return Math.abs(value) <= 1 ? 'pt' : 'pts'
}

function roomCodeFromPath(pathname: string) {
  const match = pathname.match(/^\/(?:game|room)\/([A-Za-z0-9-]+)$/)
  return match?.[1]?.toUpperCase() ?? null
}

async function withTimeout<T>(task: Promise<T>, message = 'The request took too long. Try again.') {
  let timer: number | undefined
  try {
    return await Promise.race([task, new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), 10000) })])
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

function TablePreview({ roomCode = 'SPARK-7', targetScore = 200, hostName = 'Glen', hostUserId, roomId, user, onLeave }: { roomCode?: string; targetScore?: number; hostName?: string; hostUserId?: string; roomId?: string; user?: User; onLeave?: () => void }) {
  const [table, setTable] = useState<Card[]>(roomId ? [] : demoTable)
  const [tableCardIds, setTableCardIds] = useState<string[]>([])
  const [tableVoidedIds, setTableVoidedIds] = useState<string[]>([])
  const cardOrderRef = useRef<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null)
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showHomePrompt, setShowHomePrompt] = useState(false)
  const [openPanel, setOpenPanel] = useState<'players' | 'rules' | null>(null)
  const [toast, setToast] = useState('')
  const [isStaying, setIsStaying] = useState(false)
  const [stayPrompt, setStayPrompt] = useState<'stay' | 'confirm' | null>(null)
  const [liveRound, setLiveRound] = useState<LiveRound | null>(null)
  const [pendingAction, setPendingAction] = useState<Card | null>(null)
  const [localBusted, setLocalBusted] = useState(false)
  const [redoStack, setRedoStack] = useState<Card[]>([])
  const [lastEdit, setLastEdit] = useState<{ index: number; card: Card; id?: string } | null>(null)
  const [lastRemoval, setLastRemoval] = useState<{ index: number; card: Card } | null>(null)
  const [lastAdded, setLastAdded] = useState<{ card: Card; id?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const actionLockRef = useRef(false)
  const refreshInFlightRef = useRef(false)
  useEffect(() => {
    if (!pickerOpen && !submitting && !pendingAction) actionLockRef.current = false
  }, [pickerOpen, submitting, pendingAction])
  const refreshLiveRound = async (preserveCardIndex?: number) => {
    if (!roomId || refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    try {
      const next = await withTimeout(getLiveRound(roomId), 'The table refresh took too long. Please try again.')
      setLiveRound(next)
      const mine = next?.players.find((player) => player.user_id === user?.id)
      const mineCards = next?.cards.filter((card) => card.round_player_id === mine?.id) ?? []
      const previousOrder = cardOrderRef.current
      const orderedMineCards = previousOrder.length
        ? [...mineCards].sort((a, b) => (previousOrder.indexOf(a.id) === -1 ? Number.MAX_SAFE_INTEGER : previousOrder.indexOf(a.id)) - (previousOrder.indexOf(b.id) === -1 ? Number.MAX_SAFE_INTEGER : previousOrder.indexOf(b.id)))
        : mineCards
      const visibleMineCards = orderedMineCards.filter((card) => card.voided_at === null || card.voided_by_second_chance)
      const cards = visibleMineCards.map((card) => cardFromCode(card.card_code)).filter((card): card is Card => Boolean(card))
      const cardIds = visibleMineCards.map((card) => card.id)
      const voidedIds = visibleMineCards.filter((card) => card.voided_by_second_chance).map((card) => card.id)
      const availableSecondChance = mine?.second_chance_count ?? 0
      const secondChanceIds = visibleMineCards.filter((card) => card.card_code === 'action:second_chance').map((card) => card.id)
      const consumedSecondChanceIds = secondChanceIds.slice(0, Math.max(0, secondChanceIds.length - availableSecondChance))
      if (preserveCardIndex !== undefined && preserveCardIndex < cards.length) {
        const replacementCard = cards.pop()
        const replacementId = cardIds.pop()
        if (replacementCard && replacementId) { cards.splice(preserveCardIndex, 0, replacementCard); cardIds.splice(preserveCardIndex, 0, replacementId) }
      }
      cardOrderRef.current = cardIds
      setTable(cards)
      setTableCardIds(cardIds)
      setTableVoidedIds([...voidedIds, ...consumedSecondChanceIds])
    } catch (caught) { setToast(errorMessage(caught, 'Could not refresh the table.')) } finally { refreshInFlightRef.current = false }
  }
  useEffect(() => { if (!roomId) return; void refreshLiveRound(); const timer = window.setInterval(() => { void refreshLiveRound(); void heartbeatRoom(roomId) }, 15000); return () => window.clearInterval(timer) }, [roomId, user?.id])
  useEffect(() => {
    if (!roomId || !supabase) return
    const db = supabase
    let refreshTimer: number | undefined
    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => { refreshTimer = undefined; void refreshLiveRound() }, 80)
    }
    const channel = db.channel(`live-round-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_cards' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds' }, scheduleRefresh)
      .subscribe()
    return () => { if (refreshTimer !== undefined) window.clearTimeout(refreshTimer); void db.removeChannel(channel) }
  }, [roomId, user?.id])
  const mine = liveRound?.players.find((player) => player.user_id === user?.id)
  const localScore = useMemo(() => scoreTable(table), [table])
  const isVoidedCard = (index: number) => Boolean(roomId && tableVoidedIds.includes(tableCardIds[index]))
  const numberCardCount = table.filter((card, index) => card.kind === 'number' && !isVoidedCard(index)).length
  const busted = mine?.status === 'busted' || localBusted
  const frozen = mine?.status === 'frozen'
  const score = mine?.round_score ?? (busted ? 0 : localScore)
  const flipSevenBonus = mine?.flip_seven_bonus ?? (numberCardCount >= 7 ? 15 : 0)
  const headerScore = mine?.total_score ?? score
  const visiblePlayers: Player[] = roomId ? (liveRound ? liveRound.players.filter((player) => player.user_id !== user?.id).map((player) => ({ id: player.id, userId: player.user_id, name: player.profiles?.display_name || 'Player', score: player.total_score, roundScore: player.round_score, state: player.status, color: player.profiles?.avatar_color || '#57b8d7', cards: liveRound.cards.filter((card) => card.round_player_id === player.id && card.card_code.startsWith('number:') && card.voided_at === null).length, isHost: player.user_id === hostUserId })) : []) : demoPlayers
  const canEditCards = roomId ? mine?.status === 'busted' || (mine?.status === 'active' && mine.confirmed_at === null) : !isStaying
  const isHost = hostUserId === user?.id
  const allPlayersSettled = Boolean(roomId && liveRound?.players.length && liveRound.players.every((player) => player.status !== 'active' && player.confirmed_at !== null))
  const cardRows = Array.from({ length: Math.ceil(table.length / 5) }, (_, rowIndex) => table.slice(rowIndex * 5, rowIndex * 5 + 5))
  const organizeCards = () => {
    const rank = (card: Card) => card.kind === 'number' ? 0 : card.kind === 'action' ? 3 : card.id === 'modifier-x2' ? 2 : 1
    const entries = table.map((card, index) => ({ card, id: tableCardIds[index], index }))
    entries.sort((a, b) => rank(a.card) - rank(b.card) || (a.card.kind === 'number' && b.card.kind === 'number' ? (a.card.points ?? 0) - (b.card.points ?? 0) : (a.index - b.index)))
    const cards = entries.map((entry) => entry.card)
    const ids = entries.map((entry) => entry.id).filter((id): id is string => Boolean(id))
    cardOrderRef.current = ids
    setTable(cards)
    if (roomId) setTableCardIds(ids)
  }

  const addCard = async (card: Card, targetUserId?: string) => {
    if (submitting || actionLockRef.current) return
    if (roomId) {
      if (card.kind === 'action' && !targetUserId) { setPendingAction(card); setPickerOpen(false); return }
      actionLockRef.current = true
      setSubmitting(true)
      // Close the picker immediately so rapid taps cannot queue another save.
      setPickerOpen(false)
      try {
        const previousCard = editingCardIndex === null ? null : table[editingCardIndex]
        const existingId = editingCardIndex === null ? null : tableCardIds[editingCardIndex]
        const duplicateSelection = card.kind === 'number' && table.some((onTable, index) => index !== editingCardIndex && onTable.id === card.id)
        const correctingBust = mine?.status === 'busted'
        if (editingCardIndex !== null && !existingId) throw new Error('This card is still loading. Try again in a moment.')
        if (existingId && correctingBust) await withTimeout(voidRoundCard(roomId, existingId))
        const result = await withTimeout(recordRoundCard(roomId, cardCode(card), targetUserId, true))
        if (existingId && !correctingBust && !duplicateSelection) await withTimeout(voidRoundCard(roomId, existingId))
        await withTimeout(refreshLiveRound(editingCardIndex ?? undefined)); setToast(editingCardIndex === null ? `${card.label} recorded` : `${card.label} updated`)
        setRedoStack([])
        setLastAdded(editingCardIndex === null && (!targetUserId || targetUserId === user?.id) ? { card, id: result.card_id } : null)
        setLastEdit(editingCardIndex !== null && previousCard ? { index: editingCardIndex, card: previousCard, id: result.card_id } : null)
        setLastRemoval(null)
      } catch (caught) { setToast(errorMessage(caught, 'Could not record that card.')) } finally { setSubmitting(false); setPickerOpen(false); setPendingAction(null); actionLockRef.current = false }
      setEditingCardIndex(null)
      return
    }
    const duplicate = card.kind === 'number' && table.some((onTable, index) => index !== editingCardIndex && onTable.id === card.id)
    setTable((current) => editingCardIndex === null ? [...current, card] : current.map((entry, index) => index === editingCardIndex ? card : entry))
    if (duplicate) setLocalBusted(true)
    else if (editingCardIndex !== null || localBusted) setLocalBusted(false)
    setPickerOpen(false)
    setToast(duplicate ? `Duplicate ${card.label} recorded. You busted this round.` : editingCardIndex === null ? `${card.label} added to your table` : `${card.label} updated`)
    setRedoStack([])
    setLastAdded(editingCardIndex === null ? { card } : null)
    setLastEdit(editingCardIndex !== null ? { index: editingCardIndex, card: table[editingCardIndex] } : null)
    setLastRemoval(null)
    setEditingCardIndex(null)
  }

  const removeCard = async (index: number) => {
    if (!canEditCards || submitting || actionLockRef.current) return
    actionLockRef.current = true
    setSelectedCardIndex(null)
    const card = table[index]
    setSubmitting(true)
    try {
      if (roomId) {
        const cardId = tableCardIds[index]
        if (!cardId) throw new Error('This card is still loading. Try again in a moment.')
        await withTimeout(voidRoundCard(roomId, cardId))
        await withTimeout(refreshLiveRound())
      } else {
        setTable((current) => current.filter((_, cardIndex) => cardIndex !== index))
        setLocalBusted(false)
      }
      setRedoStack([])
      setLastAdded(null)
      setLastRemoval({ index, card })
      setLastEdit(null)
      setToast('Card removed from your table')
    } catch (caught) { setToast(errorMessage(caught, 'Could not remove that card.')) } finally { setSubmitting(false); actionLockRef.current = false }
  }

  const undo = async () => {
    if (!canEditCards || submitting || actionLockRef.current || (table.length === 0 && !lastRemoval)) return
    if (lastEdit) {
      const index = roomId && lastEdit.id ? tableCardIds.indexOf(lastEdit.id) : lastEdit.index
      if (index < 0 || !table[index]) { setLastEdit(null); return }
      const previousCard = lastEdit.card
      const currentCardId = tableCardIds[index]
      actionLockRef.current = true
      setSubmitting(true)
      try {
        if (roomId) {
          if (!currentCardId) throw new Error('This card is still loading. Try again in a moment.')
          await withTimeout(voidRoundCard(roomId, currentCardId))
          await withTimeout(recordRoundCard(roomId, cardCode(previousCard)))
          await withTimeout(refreshLiveRound(index))
        } else {
          setTable((current) => current.map((card, cardIndex) => cardIndex === index ? previousCard : card))
        }
        setLastEdit(null)
      } catch (caught) { setToast(errorMessage(caught, 'Could not undo that edit.')) } finally { setSubmitting(false); actionLockRef.current = false }
      return
    }
    if (lastRemoval) {
      const { index, card } = lastRemoval
      actionLockRef.current = true
      setSubmitting(true)
      try {
        if (roomId) {
          await withTimeout(recordRoundCard(roomId, cardCode(card)))
          await withTimeout(refreshLiveRound(index))
        } else {
          setTable((current) => { const next = [...current]; next.splice(Math.min(index, next.length), 0, card); return next })
        }
        setLastRemoval(null)
      } catch (caught) { setToast(errorMessage(caught, 'Could not undo that removal.')) } finally { setSubmitting(false); actionLockRef.current = false }
      return
    }
    if (lastAdded) {
      const index = roomId && lastAdded.id ? tableCardIds.indexOf(lastAdded.id) : table.findIndex((card) => card === lastAdded.card)
      if (index < 0) { setLastAdded(null); return }
      const card = table[index]
      const cardId = tableCardIds[index]
      actionLockRef.current = true
      setSubmitting(true)
      try {
        if (roomId) {
          if (!cardId) throw new Error('This card is still loading. Try again in a moment.')
          await withTimeout(voidRoundCard(roomId, cardId))
          await withTimeout(refreshLiveRound())
        } else setTable((current) => current.filter((_, cardIndex) => cardIndex !== index))
        setRedoStack((current) => [...current, card])
        setLastAdded(null)
      } catch (caught) { setToast(errorMessage(caught, 'Could not undo that card.')) } finally { setSubmitting(false); actionLockRef.current = false }
      return
    }
    const index = table.length - 1
    const card = table[index]
    const cardId = tableCardIds[index]
    actionLockRef.current = true
    setSubmitting(true)
    try {
      if (roomId) {
        if (!cardId) throw new Error('This card is still loading. Try again in a moment.')
        await withTimeout(voidRoundCard(roomId, cardId))
        await withTimeout(refreshLiveRound())
      } else {
        setTable((current) => current.slice(0, -1))
      }
      setRedoStack((current) => [...current, card])
      setLastAdded(null)
      setLastEdit(null)
    } catch (caught) { setToast(errorMessage(caught, 'Could not undo that card.')) } finally { setSubmitting(false); actionLockRef.current = false }
  }

  const redo = async () => {
    if (!canEditCards || submitting || actionLockRef.current || redoStack.length === 0) return
    const card = redoStack[redoStack.length - 1]
    actionLockRef.current = true
    setSubmitting(true)
    try {
      if (roomId) {
        await withTimeout(recordRoundCard(roomId, cardCode(card)))
        await withTimeout(refreshLiveRound())
      } else {
        setTable((current) => [...current, card])
      }
      setRedoStack((current) => current.slice(0, -1))
    } catch (caught) { setToast(errorMessage(caught, 'Could not redo that card.')) } finally { setSubmitting(false); actionLockRef.current = false }
  }

  const stay = async () => {
    if (submitting || actionLockRef.current) return
    if (roomId) { setStayPrompt(mine?.status === 'active' ? 'stay' : 'confirm'); return }
    setStayPrompt('stay')
  }

  const proceedToNextRound = async () => {
    if (!roomId || !isHost || !allPlayersSettled || submitting || actionLockRef.current) return
    actionLockRef.current = true
    setSubmitting(true)
    try {
      await withTimeout(finalizeRound(roomId))
      cardOrderRef.current = []
      await withTimeout(refreshLiveRound())
      setToast('Next round started.')
    } catch (caught) { setToast(errorMessage(caught, 'Could not start the next round.')) }
    finally { setSubmitting(false); actionLockRef.current = false }
  }

  const completeStayPrompt = async () => {
    const decision = stayPrompt
    if (!decision || submitting || actionLockRef.current) return
    setStayPrompt(null)
    if (!roomId) {
      setIsStaying(true)
      setToast(`Round score locked at ${score} until you confirm.`)
      return
    }
    actionLockRef.current = true
    setSubmitting(true)
    try {
      if (decision === 'stay') {
        await withTimeout(stayInRound(roomId))
        await withTimeout(confirmRoundResult(roomId))
      } else await withTimeout(confirmRoundResult(roomId))
      await withTimeout(refreshLiveRound())
      setToast('Round result confirmed.')
    } catch (caught) { setToast(errorMessage(caught, 'Could not update your round.')) }
    finally { setSubmitting(false); actionLockRef.current = false }
  }

  return (
    <div className="app-shell">
      <aside className="desktop-marquee left"><div>FLIP<br />7</div></aside>
      <main className="game-shell">
        <header className="topbar">
          <button className="brand-button" aria-label="Go to home" onClick={() => setShowHomePrompt(true)}><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /></button>
          <button className="avatar" aria-label="Open room menu" onClick={() => setShowMenu(!showMenu)}>{String(user?.user_metadata.display_name || 'Player').trim().charAt(0).toUpperCase() || 'P'}</button>
          {showMenu && <div className="room-menu"><div className="room-menu-title" /><RoomCode code={roomCode} label="ROOM CODE" /><div className="room-menu-divider" /><button onClick={() => { setShowMenu(false); setOpenPanel('players') }}><Users size={16} /> Players</button><button onClick={() => { setShowMenu(false); setOpenPanel('rules') }}><CircleHelp size={16} /> Rules</button><button onClick={onLeave}><LogOut size={16} /> Leave room</button></div>}
        </header>

        <section className="match-strip">
          <div><span>ROUND</span><b>{String(liveRound?.number ?? 1).padStart(2, '0')}</b></div>
          <div className="target"><span>FIRST TO</span><b>{targetScore}</b></div>
          <div><span>MY TOTAL</span><b>{headerScore}</b></div>
        </section>

      <section className="opponents" aria-label="Opponents">
          {visiblePlayers.map((player) => (
            <article className={`opponent ${player.state}`} key={player.id}>
              <div className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</div>
          <div className="opponent-copy"><b>{player.name}</b><span>{player.state === 'active' ? `${player.cards} cards · ${player.roundScore} ${pointLabel(player.roundScore)}` : player.state === 'stayed' ? `Banked · ${player.roundScore} ${pointLabel(player.roundScore)}` : player.state === 'frozen' ? `Freezed · ${player.roundScore} ${pointLabel(player.roundScore)}` : 'Busted'}</span></div>
          <strong><small>Total pts:</small> <b>{player.score}</b></strong>
            </article>
          ))}
        </section>

        <section className="table-area">
          <div className="section-kicker"><Crown size={16} /> MY TABLE <button className="organize-button" onClick={organizeCards} disabled={table.length < 2} title="Organize cards"><ListOrdered size={14} /> Organize</button></div>
          <div className="score-display"><span>ROUND SCORE</span><motion.b key={score} initial={{ scale: 1.25, color: '#ed4f7e' }} animate={{ scale: 1, color: '#132d67' }}>{score}</motion.b>{busted ? <small className="flip-seven-bonus bust-badge">BUST</small> : flipSevenBonus > 0 && <small className="flip-seven-bonus">+15</small>}</div>
          <AnimatePresence>{submitting && <motion.div className="card-operation-status" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} role="status"><LoaderCircle className="spin" size={16} /> Updating table…</motion.div>}</AnimatePresence>
          <div className="card-table">
            <AnimatePresence initial={false}>
              <div className="card-rows">
                {cardRows.map((row, rowIndex) => <div className={`card-row cards-${row.length}`} key={`card-row-${rowIndex}`}>
                  <AnimatePresence initial={false}>
                  {row.map((card, rowCardIndex) => {
                    const index = rowIndex * 5 + rowCardIndex
                    const cardVoided = isVoidedCard(index)
                    return <motion.button
                      className={`table-card ${card.kind} ${cardVoided ? 'card-voided' : ''}`}
                      key={tableCardIds[index] || card.id}
                      layout
                      initial={{ opacity: 0, y: -32, rotate: rowCardIndex % 2 ? 3 : -3 }}
                      animate={{ opacity: cardVoided ? .42 : 1, y: 0, rotate: rowCardIndex % 2 ? 2 : -2 }}
                      exit={{ opacity: 0, y: -28 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                      onClick={() => {
                        if (!canEditCards) { setToast(`${card.label} is locked after you stay.`); return }
                        setSelectedCardIndex(index)
                      }}
                    >
                      <CardArtwork card={card} />
                    </motion.button>
                  })}
                  </AnimatePresence>
                </div>)}
              </div>
                  {!mine?.confirmed_at && !isStaying && !busted && !frozen && <button className="add-card-card" disabled={submitting || !canEditCards} onClick={() => { if (submitting || !canEditCards) return; setPickerOpen(true) }} aria-label="Record a physical card"><Plus size={30} /></button>}
            </AnimatePresence>
          </div>
        </section>

        <section className="actions">
          {isHost && allPlayersSettled && <button className="next-round-button" disabled={submitting} onClick={() => void proceedToNextRound()}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />} Proceed to next round</button>}
          <button className="secondary-action" disabled={(table.length === 0 && !lastRemoval) || submitting || !canEditCards} onClick={() => void undo()}><Undo2 size={19} /> Undo</button>
          <button className={`stay-action ${isStaying || busted || frozen || (mine?.status != null && mine.status !== 'active') ? 'confirmed' : ''} ${busted ? 'bust-state' : ''} ${frozen ? 'frozen-state' : ''}`} disabled={busted || frozen || numberCardCount < 2 || submitting || mine?.confirmed_at !== null} onClick={() => void stay()}>{busted ? <>BUST!</> : frozen ? <>FREEZED!</> : mine?.confirmed_at ? <>BANKED!</> : mine?.status && mine.status !== 'active' ? <>Confirm round</> : isStaying ? <>Staying</> : <>STAY / BANK</>}</button>
          <button className="secondary-action redo-action" disabled={redoStack.length === 0 || submitting || !canEditCards} onClick={() => void redo()}><Redo2 size={19} /> Redo</button>
        </section>

      </main>
      <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>

      <AnimatePresence>{stayPrompt && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setStayPrompt(null)}><motion.section className="card-picker home-prompt" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>STAY / BANK</span><h2>Stay for this round?</h2></div><button className="close-button" aria-label="Cancel" title="Cancel" onClick={() => setStayPrompt(null)}><X size={19} /></button></div><p className="home-prompt-copy">Your score will be saved and your round will be confirmed. You will wait for the other players.</p><div className="home-prompt-actions"><button className="secondary-action" onClick={() => setStayPrompt(null)}>Cancel</button><button className="primary-wide" onClick={() => void completeStayPrompt()}><span className="button-content">Confirm stay</span></button></div></motion.section></motion.div>}</AnimatePresence>

      <AnimatePresence mode="wait">
        {selectedCardIndex !== null && table[selectedCardIndex] && <motion.div key="card-actions" className="picker-backdrop card-focus-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setSelectedCardIndex(null)}><motion.section className="card-picker card-actions-panel card-focus-panel" initial={{ scale: .86, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: .9, y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 330, damping: 25 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>MY CARD</span><h2>{table[selectedCardIndex].label}</h2></div><button className="close-button" aria-label="Close card actions" title="Close" onClick={() => setSelectedCardIndex(null)}><X size={19} /></button></div><motion.div className="card-focus-art" initial={{ scale: .45, y: 100, rotate: -8, opacity: 0 }} animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20, delay: .04 }}><CardArtwork card={table[selectedCardIndex]} /></motion.div><p>Edit this card or remove it while your round is still active.</p><div className="card-action-buttons"><button className="secondary-action" disabled={submitting} onClick={() => { const index = selectedCardIndex; setSelectedCardIndex(null); setEditingCardIndex(index); window.setTimeout(() => setPickerOpen(true), 0) }}>Edit card</button><button className="danger-action" disabled={submitting} onClick={() => void removeCard(selectedCardIndex)}>Remove card</button></div></motion.section></motion.div>}
        {pickerOpen && (
          <motion.div key="card-picker" className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => { setPickerOpen(false); setEditingCardIndex(null); setPendingAction(null) }}>
            <motion.section className="card-picker" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: 'spring', damping: 26 }} onClick={(event) => event.stopPropagation()}>
              <div className="picker-heading"><div><span>PHYSICAL CARD</span><h2>What did you flip?</h2></div><button className="close-button" aria-label="Close card picker" title="Close" onClick={() => { setPickerOpen(false); setEditingCardIndex(null); setPendingAction(null) }}><X size={19} /></button></div>
              <p>Select the card in front of you. The app never draws a card for you.</p>
              <div className="picker-grid">
                {pickerCards.map((card) => <button key={card.id} disabled={submitting} onClick={() => void addCard(card)} aria-label={`Record ${card.label}`}><CardArtwork card={card} lazy /></button>)}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
        <AnimatePresence>{showHomePrompt && <HomePrompt onCancel={() => setShowHomePrompt(false)} onConfirm={() => { window.location.assign('/') }} />}</AnimatePresence>
        <AnimatePresence>
          {openPanel && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpenPanel(null)}>
            <motion.section className="card-picker info-panel" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={(event) => event.stopPropagation()}>
              <div className="picker-heading"><div><span>{openPanel === 'players' ? 'AT THIS TABLE' : 'HOW TO PLAY'}</span><h2>{openPanel === 'players' ? 'Players' : 'Rules'}</h2></div><div className="panel-heading-actions">{openPanel === 'players' && <b className="panel-count">{visiblePlayers.length + 1} players</b>}<button className="close-button" aria-label="Close panel" title="Close" onClick={() => setOpenPanel(null)}><X size={19} /></button></div></div>
              {openPanel === 'players' ? <div className="info-list"><div className="info-player current-player"><span className="mini-avatar" style={{ background: user?.user_metadata.avatar_color || '#57b8d7' }}>{String(user?.user_metadata.display_name || 'M')[0]}</span><div><b>{user?.user_metadata.display_name || 'Player'} (me) {hostUserId === user?.id && <Crown className="host-crown" size={15} aria-label="Host" />}</b><small>My score: {mine?.total_score ?? 0}</small></div></div>{visiblePlayers.map((player) => <div className="info-player" key={player.id}><span className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</span><div><b>{player.name} {player.isHost && <Crown className="host-crown" size={15} aria-label="Host" />}</b><small>{player.state === 'active' ? `${player.cards} cards · ${player.roundScore} ${pointLabel(player.roundScore)}` : player.state === 'stayed' ? `Banked · ${player.roundScore} ${pointLabel(player.roundScore)}` : player.state === 'frozen' ? `Freezed · ${player.roundScore} ${pointLabel(player.roundScore)}` : 'Busted'}</small></div><strong>{player.score}</strong></div>)}</div> : <div className="rules-copy">
                <section><h3>Objective</h3><p>Be the first player to reach 200 points. At the end of that round, the player with the most points wins.</p></section>
                <section><h3>On your turn</h3><p>Choose <b>Hit</b> to take another card or <b>Stay</b> to stop and bank your points. Each player records the physical cards they receive.</p></section>
                <section><h3>Number cards</h3><p>Number cards score their face value. You cannot have the same number twice: drawing a duplicate makes you bust and score zero for the round.</p></section>
                <section><h3>Modifiers</h3><p><b>+2 to +10</b> add points to your number-card total. <b>×2</b> doubles the value of all your number cards before other bonuses are added.</p></section>
                <section><h3>Action cards</h3><p><b>Second Chance</b> cancels one duplicate number card. <b>Freeze</b> banks your current points and removes you from the round. <b>Flip Three</b> makes you take the next three cards, one at a time.</p></section>
                <section><h3>End of a round</h3><p>A round ends when everyone has busted or stayed, or when someone flips seven unique number cards. Seven unique numbers earns a <b>+15</b> Flip 7 bonus.</p></section>
                <section><h3>Scoring</h3><p>Add your number cards, apply ×2 if present, then add modifier bonuses. Action cards do not add points.</p></section>
                <section><h3>Next round</h3><p>Set the round cards aside, pass the dealer, and deal again. Reshuffle discarded cards when the deck runs out.</p></section>
              </div>}
            </motion.section>
          </motion.div>}
        </AnimatePresence>
        <AnimatePresence>{pendingAction && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="card-picker" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}><div className="picker-heading"><div><span>ACTION TARGET</span><h2>Who gets {pendingAction.label}?</h2></div><button className="close-button" aria-label="Close action target" title="Close" onClick={() => setPendingAction(null)}><X size={19} /></button></div><div className="target-list">{liveRound?.players.map((player) => <button key={player.user_id} onClick={() => void addCard(pendingAction, player.user_id)}>{player.user_id === user?.id ? `${player.profiles?.display_name || 'Player'} (me)` : player.profiles?.display_name || 'Player'}</button>)}</div></motion.section></motion.div>}</AnimatePresence>
    </div>
  )
}

function LandingScreen({ onStart }: { onStart: () => void }) {
  const [promoIndex, setPromoIndex] = useState(0)
  const [navScrolled, setNavScrolled] = useState(false)
  useEffect(() => { const timer = window.setInterval(() => setPromoIndex((current) => current === 0 ? 1 : 0), 4500); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    document.documentElement.classList.add('landing-active')
    return () => document.documentElement.classList.remove('landing-active')
  }, [])
  return <div id="landing-page" className="landing-page">
    <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /><nav className="landing-top-links" aria-label="Primary navigation"><a href="#landing-page">Home</a><a href="#landing-how">How it Works</a><a href="/rules">Rules</a><a href="#landing-how">FAQ</a></nav><button className="landing-signin" onClick={onStart}>Sign in</button></header>
    <main>
      <section className="landing-hero"><div className="landing-copy"><span className="eyebrow">THE PHYSICAL CARD COMPANION</span><h1>Press your luck.<br /><em>Race to 200.</em></h1><p>Bring the table to life. Track the cards you actually flip, settle the round together, and keep the whole game moving.</p><div className="landing-actions"><button className="landing-primary" onClick={onStart}><Play size={18} /> Start a table</button><button className="landing-secondary" onClick={() => document.getElementById('landing-how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button></div></div><div className="landing-art"><AnimatePresence mode="wait"><motion.div key={`promo-glow-${promoIndex}`} className="landing-promo-glow" initial={{ opacity: 0, scale: .72, x: '-50%', y: '-50%' }} animate={{ opacity: .9, scale: 1, x: '-50%', y: '-50%' }} exit={{ opacity: 0, scale: 1.2, x: '-50%', y: '-50%' }} transition={{ duration: .7 }} /></AnimatePresence><AnimatePresence mode="wait">{promoIndex === 0 ? <motion.img key="promo-card" className="landing-promo-card" src="/assets/promo-1.png" alt="Flip 7 card game" initial={{ opacity: 0, scale: .94, x: '-50%', y: '-50%', rotate: 1 }} animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%', rotate: 5 }} exit={{ opacity: 0, scale: 1.04, x: '-50%', y: '-50%', rotate: 9 }} transition={{ duration: .7 }} /> : <motion.img key="promo-player" className="landing-promo-player" src="/assets/promo-2.png" alt="A player pressing their luck" initial={{ opacity: 0, scale: .94, x: '-50%', y: '-50%', rotate: -1 }} animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%', rotate: -5 }} exit={{ opacity: 0, scale: 1.04, x: '-50%', y: '-50%', rotate: -9 }} transition={{ duration: .7 }} />}</AnimatePresence></div></section>
      <section id="landing-how" className="landing-how"><span className="eyebrow">MADE FOR THE TABLE</span><h2>Keep your eyes on the cards.</h2><div className="landing-features"><article><b>01</b><h3>Start together</h3><p>Create a room, share the code, and approve the players joining your table.</p></article><article><b>02</b><h3>Record your flips</h3><p>Each player records their own physical cards. The app never draws for you.</p></article><article><b>03</b><h3>Settle the round</h3><p>Confirm scores, resolve disagreements, and keep the race to 200 moving.</p></article></div><div className="landing-how-details"><div className="landing-detail-card"><span className="eyebrow">A ROUND IN FOUR STEPS</span><ol><li><span><b>Join the table.</b> The host shares a room code and approves every player.</span></li><li><span><b>Flip and record.</b> Add each physical card as it lands in front of you.</span></li><li><span><b>Press your luck.</b> Stay to bank your score, or keep going and risk a duplicate.</span></li><li><span><b>Move together.</b> Once everyone is banked, frozen, or busted, the host starts the next round.</span></li></ol></div><div className="landing-detail-card landing-score-card"><span className="eyebrow">SCORING AT A GLANCE</span><h3>Build your round score.</h3><p>Number cards score their face value. Add cards increase the total, while <b>×2</b> is applied last. Seven unique number cards earn a <b>+15</b> Flip 7 bonus.</p><div className="landing-rule-tags"><span>Duplicate = BUST</span><span>Action cards = 0 pts</span><span>First to the target wins</span></div></div></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-footer-inner"><div className="landing-footer-top"><div className="landing-footer-brand"><img src="/assets/flip7-title-logo.png" alt="Flip7 Companion" /><p>Flip7 Companion is a physical card companion for groups who want to press their luck, track every flip, and keep the table moving.</p></div><div className="landing-footer-links"><div><h3>EXPLORE</h3><a href="#landing-page">Home</a><a href="#landing-how">How it works</a><a href="/rules">Rules</a></div><div><h3>SUPPORT</h3><a href="#landing-how">Contact us</a><a href="#landing-how">FAQ</a></div><div><h3>LEGAL</h3><a href="#privacy">Data privacy policy</a><a href="#terms">Terms &amp; conditions</a></div></div></div><div className="landing-footer-bottom"><span>© 2026 Flip7 Companion. All rights reserved.</span></div></div></footer>
  </div>
}

function RulesCardStrip({ cards }: { cards: string[] }) {
  return <div className="rules-card-strip">{cards.map((card) => <img key={card} src={`/cards/${card}.png`} alt={`${card} card`} />)}</div>
}

function RulesScreen() {
  const [navScrolled, setNavScrolled] = useState(false)
  useEffect(() => { const onScroll = () => setNavScrolled(window.scrollY > 8); onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll) }, [])
  return <div className="landing-page rules-page"><header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}><a href="/" className="rules-brand"><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip7 Companion" /></a><nav className="landing-top-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/#landing-how">How it Works</a><a href="/rules">Rules</a><a href="/#landing-how">FAQ</a></nav><a href="/lobby" className="landing-signin">Sign in</a></header><main className="rules-main"><section className="rules-hero"><span className="eyebrow">FLIP7 COMPANION · OFFICIAL RULES</span><h1>Press your luck.</h1><p>Track the cards in front of you, score every round, and be the first player to reach the target.</p></section><div className="rules-grid"><section className="rules-card rules-card-wide"><span className="eyebrow">THE OBJECTIVE</span><h2>Race to 200 points.</h2><p>Flip cards in turn and collect points without repeating a number. Score your cards at the end of the round. Once a player reaches 200 points, finish the round and the player with the highest total wins.</p><RulesCardStrip cards={['12', '11', '10', '9', '8', '7']} /></section><section className="rules-card"><b className="rules-number">01</b><h2>Join the table</h2><p>Create a room or enter a room code. The host approves players before the match begins.</p></section><section className="rules-card"><b className="rules-number">02</b><h2>Flip and record</h2><p>Flip a physical card, then record the matching card in your table. The app tracks the cards you actually hold.</p></section><section className="rules-card"><b className="rules-number">03</b><h2>Stay or press on</h2><p>With at least two number cards, choose <b>STAY / BANK</b> to lock in your round score, or keep going.</p></section><section className="rules-card"><b className="rules-number">04</b><h2>Resolve the round</h2><p>When everyone is banked, frozen, or busted, the host proceeds to the next round.</p></section><section className="rules-card rules-card-accent"><span className="eyebrow">NUMBER CARDS</span><h2>Unique numbers score.</h2><p>Number cards score their face value. You cannot keep the same number twice. A duplicate makes you bust and score 0 for the round.</p><RulesCardStrip cards={['0', '3', '7', '12']} /></section><section className="rules-card"><span className="eyebrow">MODIFIER CARDS</span><h2>Add more points.</h2><p><b>+2 to +10</b> add to your number-card total. The <b>×2</b> card doubles the value of your number cards after the add cards have been included.</p><RulesCardStrip cards={['+2', '+6', '+10', 'x2']} /></section><section className="rules-card rules-card-danger"><span className="eyebrow">ACTION CARDS</span><h2>Change the table.</h2><p><b>Second Chance</b> cancels one duplicate. <b>Freeze</b> banks the chosen player. <b>Flip Three</b> makes the chosen player take three cards one at a time.</p><RulesCardStrip cards={['SECOND CHANCE', 'FREEZE', 'FLIP THREE']} /></section><section className="rules-card rules-card-wide"><span className="eyebrow">SCORING AT A GLANCE</span><h2>Calculate your round score.</h2><div className="rules-score-steps"><div><b>1</b><span>Add the value of your number cards.</span></div><div><b>2</b><span>Add modifier cards.</span></div><div><b>3</b><span>Apply <strong>×2</strong> last, then add the <strong>+15</strong> Flip 7 bonus.</span></div></div></section><section className="rules-card rules-card-wide"><span className="eyebrow">END OF THE ROUND</span><h2>Settle, score, continue.</h2><p>The round ends when all players are banked, frozen, or busted, or when someone flips seven unique number cards. The host reviews the table and starts the next round.</p></section></div></main></div>
}

function HomePrompt({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}><motion.section className="card-picker home-prompt" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>LEAVE THIS VIEW</span><h2>Go to home?</h2></div><button className="close-button" aria-label="Close" title="Close" onClick={onCancel}><X size={19} /></button></div><p className="home-prompt-copy">You can return to the room from the home screen at any time.</p><div className="home-prompt-actions"><button className="secondary-action" onClick={onCancel}>Stay here</button><button className="primary-wide" onClick={onConfirm}><span className="button-content">Go to home</span></button></div></motion.section></motion.div>
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
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
        {mode !== 'sign-in' && <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} placeholder="Your name at the table" required /></label>}
        {mode !== 'guest' && <><label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required /></label><label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} placeholder="At least 6 characters" required /></label></>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-wide" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : mode === 'guest' ? <UserRoundPlus /> : <KeyRound />} {mode === 'guest' ? 'Start as a guest' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
        {mode !== 'guest' && <button type="button" className="text-action" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button>}
      </form>
      <footer className="lobby-footer">The app records your physical cards. It never deals for you.</footer>
    </main>
    <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>
    <AnimatePresence>{showHomePrompt && <HomePrompt onCancel={() => setShowHomePrompt(false)} onConfirm={() => window.location.assign('/')} />}</AnimatePresence>
  </div>
}

function HomeScreen({ user, openRoom }: { user: User; openRoom: (code: string) => void }) {
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
      {homeMode === 'join' ? <article className="lobby-card join-card"><span className="eyebrow">JOIN A GAME</span><h2>Have a room code?</h2><p>The host approves every player before the match begins.</p><label>Your display name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} /></label><label>Room code<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} placeholder="ABC123" /></label><button className="secondary-wide" disabled={busy !== null || joinCode.length !== 6} onClick={join}>{busy === 'join' ? <LoaderCircle className="spin" /> : <Users />} Request a seat</button></article> : <article className="lobby-card"><span className="eyebrow">HOST A GAME</span><h2>Start a table</h2><label>Your display name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} /></label><span className="field-label">TARGET SCORE</span><div className="target-options">{[100, 200, 300].map((score) => <button key={score} className={target === score ? 'selected' : ''} onClick={() => setTarget(score)}>{score}</button>)}</div><label>Custom target (50–500)<input type="number" min="50" max="500" value={target} onChange={(e) => setTarget(Math.max(50, Math.min(500, Number(e.target.value))))} /></label><button className="primary-wide" disabled={busy !== null} onClick={create}>{busy === 'create' ? <LoaderCircle className="spin" /> : <Play />} Create room</button></article>}
    </section>
    {error && <p className="form-error page-error">{error}</p>}
  </main><aside className="desktop-marquee right"><div>PLAY<br />TO<br />WIN</div></aside></div>
}

function ResultsScreen({ snapshot, leaveRoom }: { snapshot: RoomSnapshot; leaveRoom: () => void }) {
  const players = [...snapshot.members].filter((member) => member.status !== 'left' && member.status !== 'removed').sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
  const winnerScore = players[0]?.final_score ?? 0
  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell results-shell">
    <header className="topbar"><button className="back-button" onClick={leaveRoom}><ArrowLeft size={18} /> Leave room</button><RoomCode code={snapshot.room.code} /></header>
    <section className="results-hero"><span className="eyebrow">MATCH COMPLETE</span><h1>What a finish!</h1><p>First to <b>{snapshot.room.target_score}</b> points · Final results</p></section>
    <section className="results-card"><div className="results-heading"><div><span className="eyebrow">FINAL SCORES</span><h2>{players[0]?.profiles?.display_name || 'Winner'} wins!</h2></div><Crown size={30} /></div><div className="results-list">{players.map((player, index) => <div className={`results-player ${index === 0 ? 'winner' : ''}`} key={player.user_id}><span className="results-rank">{index + 1}</span><span className="mini-avatar" style={{ background: player.profiles?.avatar_color || '#57b8d7' }}>{player.profiles?.display_name?.[0] || '?'}</span><div><b>{player.profiles?.display_name || 'Player'} {index === 0 && <Crown className="host-crown" size={15} aria-label="Winner" />}</b><small>{index === 0 && (player.final_score ?? 0) === winnerScore ? 'Winner' : 'Final total'}</small></div><strong>{player.final_score ?? 0}</strong></div>)}</div></section>
    <section className="results-actions"><p>The game is complete. These final scores have been recorded.</p><button className="primary-wide" onClick={leaveRoom}>Back to rooms</button></section>
  </main><aside className="desktop-marquee right"><div>YOUR<br />LUCK<br />AWAITS</div></aside></div>
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
    let channel = db.channel(`room-${snapshot.room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${snapshot.room.id}` }, () => void refresh())
    if (snapshot.room.status === 'lobby') channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${snapshot.room.id}` }, () => void refresh())
    channel.subscribe()
    return () => { void db.removeChannel(channel) }
  }, [snapshot?.room.id, snapshot?.room.status])
  if (error) return <div className="simple-state"><p>{error}</p><button onClick={leaveRoom}>Back to rooms</button></div>
  if (!snapshot) return <div className="simple-state"><LoaderCircle className="spin" /><p>Setting the table…</p></div>
  const { room, members } = snapshot
  const me = members.find((member) => member.user_id === user.id)
  const host = room.host_user_id === user.id
  const approved = members.filter((member) => member.status === 'approved')
  const pending = members.filter((member) => member.status === 'pending')
  const hostName = members.find((member) => member.user_id === room.host_user_id)?.profiles?.display_name || 'Host'
  const quitRoom = async () => { setBusy(true); leaveRoom(); try { await leaveRoomRpc(room.id) } catch { /* Navigation already completed; cleanup can finish independently. */ } finally { setBusy(false) } }
  if (room.status === 'completed') return <ResultsScreen snapshot={snapshot} leaveRoom={leaveRoom} />
  if ((room.status === 'active' || room.status === 'round_review') && me?.status === 'approved') return <TablePreview roomCode={room.code} targetScore={room.target_score} hostName={hostName} hostUserId={room.host_user_id} roomId={room.id} user={user} onLeave={() => void quitRoom()} />
  const approve = async (member: string) => { setBusy(true); try { await approveRoomMember(room.id, member); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not approve that player.') } finally { setBusy(false) } }
  const begin = async () => { setBusy(true); try { await startMatch(room.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start the match.') } finally { setBusy(false) } }
  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell lobby-main">
    <header className="topbar"><button className="back-button" onClick={() => void quitRoom()} disabled={busy}><ArrowLeft size={18} /> Leave room</button><RoomCode code={room.code} /></header>
    <section className="room-hero"><span className="eyebrow">{room.status === 'lobby' ? 'LOBBY' : 'MATCH IN PROGRESS'}</span><h1>{room.status === 'lobby' ? 'Waiting for the table.' : 'The table is playing.'}</h1><p>First to <b>{room.target_score}</b> points · {approved.length} approved player{approved.length === 1 ? '' : 's'}</p>{room.status === 'lobby' && <small className="room-start-note">The game starts with at least 3 approved players.</small>}</section>
    <section className="room-share-card"><div><span className="eyebrow">ROOM CODE</span><p>Share this code with your players.</p></div><RoomCode code={room.code} /></section>
    <section className="members-card"><div className="members-heading"><div><span className="eyebrow">PLAYERS</span><h2>Seats at this table</h2></div><span className="seat-count">{approved.length}/18</span></div>
      {members.map((member) => <div className="member-row" key={member.user_id}><div className="mini-avatar" style={{ background: member.profiles?.avatar_color || '#57b8d7' }}>{member.profiles?.display_name?.[0] || '?'}</div><div><b>{member.profiles?.display_name || 'Player'} {member.user_id === user.id && '(me)'}</b><span>{member.role === 'host' ? 'Host' : member.status === 'pending' ? 'Waiting for host approval' : 'Ready'}</span></div>{member.role === 'host' ? <Crown size={18} /> : host && member.status === 'pending' ? <button className="approve-button" disabled={busy} onClick={() => void approve(member.user_id)}>Approve</button> : <span className={`member-status ${member.status}`}>{member.status}</span>}</div>)}
    </section>
    {host && room.status === 'lobby' && <section className="host-controls"><p>{pending.length ? `${pending.length} player${pending.length === 1 ? ' is' : 's are'} waiting for approval.` : approved.length < 3 ? 'Approve at least 3 players to begin.' : 'The table is ready.'}</p><button className="primary-wide" disabled={busy || approved.length < 3} onClick={() => void begin()}>{busy ? <LoaderCircle className="spin" /> : <Play />} Start match</button></section>}
    {room.status === 'round_review' && <section className="host-controls"><p>Everyone has confirmed. Preparing the next round…</p></section>}
    {!host && me?.status === 'pending' && <section className="host-controls"><p>Your seat request is waiting for {hostName}. This page refreshes automatically.</p></section>}
  </main><aside className="desktop-marquee right"><div>YOUR<br />LUCK<br />AWAITS</div></aside></div>
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const isRulesPage = window.location.pathname === '/rules'
  const [showLanding, setShowLanding] = useState(() => window.location.pathname === '/' || window.location.pathname === '/landing')
  const [roomCode, setRoomCode] = useState(() => roomCodeFromPath(window.location.pathname) || new URLSearchParams(window.location.search).get('room'))
  useEffect(() => {
    if (!supabase) { setUser(null); return }
    void currentUser().then(setUser)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (showLanding && window.location.pathname === '/') window.history.replaceState({}, '', '/landing')
    if (!showLanding && window.location.pathname === '/') window.history.replaceState({}, '', roomCode ? `/game/${roomCode}` : '/lobby')
  }, [roomCode, showLanding])
  const openRoom = (code: string) => { const next = code.toUpperCase(); window.history.replaceState({}, '', `/game/${next}`); setRoomCode(next) }
  const leaveRoom = () => { window.history.replaceState({}, '', '/landing'); setRoomCode(null); setShowLanding(true) }
  const enterApp = () => { sessionStorage.setItem('flip7-app-entered', '1'); window.history.replaceState({}, '', '/lobby'); setShowLanding(false) }
  if (isRulesPage) return <RulesScreen />
  if (!supabase) return <div className="simple-state"><p>Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values to .env.local.</p></div>
  if (showLanding) return <LandingScreen onStart={enterApp} />
  if (user === undefined) return <div className="simple-state"><LoaderCircle className="spin" /><p>Opening the table…</p></div>
  if (!user) return <AuthScreen onAuthenticated={setUser} />
  return roomCode ? <RoomScreen user={user} code={roomCode} leaveRoom={leaveRoom} /> : <HomeScreen user={user} openRoom={openRoom} />
}
