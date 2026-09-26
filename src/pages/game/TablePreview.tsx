import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CircleHelp, Crown, LogOut, Users, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { cardFromCode, demoTable, type Card } from '../../game/cards'
import { supabase } from '../../lib/supabase'
import { confirmRoundResult, DEGRADED_REFRESH_INTERVAL_MS, finalizeRound, getLiveRound, HEALTHY_REFRESH_INTERVAL_MS, PRESENCE_SYNC_INTERVAL_MS, REALTIME_INVALIDATION_DEBOUNCE_MS, recordRoundCard, stayInRound, syncRoomPresence, voidRoundCard, type LiveRound } from '../../lib/room'
import { cardCode, errorMessage, pointLabel, withTimeout } from '../../lib/app-utils'
import { RoomCode } from '../../components/RoomCode'
import { HomePrompt } from '../../components/HomePrompt'
import { GameTable } from './GameTable'
import { OpponentStrip, type Player } from './OpponentStrip'
import { GameControls } from './GameControls'
import { CardActionsPanel, CardPickerPanel } from './CardDialogs'
import { useAppNavigation } from '../../lib/navigation'

const demoPlayers: Player[] = [
  { id: 'maya', name: 'Maya', score: 82, roundScore: 24, state: 'active', color: '#ed4f7e', cards: 4 },
  { id: 'noel', name: 'Noel', score: 71, roundScore: 0, state: 'busted', color: '#97c844', cards: 3 },
  { id: 'chris', name: 'Chris', score: 65, roundScore: 18, state: 'stayed', color: '#57b8d7', cards: 3 },
]

function scoreTable(cards: Card[]) {
  const numberTotal = cards.filter((card) => card.kind === 'number').reduce((sum, card) => sum + (card.points ?? 0), 0)
  const uniqueNumberCount = new Set(cards.filter((card) => card.kind === 'number').map((card) => card.id)).size
  const flipSevenBonus = uniqueNumberCount >= 7 ? 15 : 0
  const modifierTotal = cards.filter((card) => card.kind === 'modifier' && card.id !== 'modifier-x2').reduce((sum, card) => sum + (card.points ?? 0), 0)
  const numberTotalWithMultiplier = cards.some((card) => card.id === 'modifier-x2') ? numberTotal * 2 : numberTotal
  return numberTotalWithMultiplier + modifierTotal + flipSevenBonus
}

export function TablePreview({ roomCode = 'SPARK-7', targetScore = 200, hostName = 'Glen', hostUserId, roomId, user, onLeave }: { roomCode?: string; targetScore?: number; hostName?: string; hostUserId?: string; roomId?: string; user?: User; onLeave?: () => void }) {
  const navigate = useAppNavigation()
  const [table, setTable] = useState<Card[]>(roomId ? [] : demoTable)
  const [tableCardIds, setTableCardIds] = useState<string[]>([])
  const [tableVoidedIds, setTableVoidedIds] = useState<string[]>([])
  const cardOrderRef = useRef<string[]>([])
  const originalTableRef = useRef<{ cards: Card[]; ids: string[] } | null>(null)
  const [isOrganized, setIsOrganized] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQueued, setPickerQueued] = useState(false)
  const [cardDialogClosing, setCardDialogClosing] = useState(false)
  const [targetDialogClosing, setTargetDialogClosing] = useState(false)
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null)
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showHomePrompt, setShowHomePrompt] = useState(false)
  const [openPanel, setOpenPanel] = useState<'players' | 'rules' | null>(null)
  const [, setToast] = useState('')
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
  const [realtimeHealthy, setRealtimeHealthy] = useState(false)
  const actionLockRef = useRef(false)
  const dialogLockRef = useRef(false)
  const cardSelectionRef = useRef(false)
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
  const queuedPreserveCardIndexRef = useRef<number | undefined>(undefined)
  const timerRoomIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!pickerOpen && !pickerQueued && !submitting && !pendingAction) actionLockRef.current = false
  }, [pickerOpen, pickerQueued, submitting, pendingAction])
  const refreshLiveRound = async (preserveCardIndex?: number) => {
    if (!roomId) return
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      if (preserveCardIndex !== undefined) queuedPreserveCardIndexRef.current = preserveCardIndex
      return
    }
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
    } catch (caught) { setToast(errorMessage(caught, 'Could not refresh the table.')) } finally {
      refreshInFlightRef.current = false
      if (refreshQueuedRef.current && document.visibilityState === 'visible') {
        refreshQueuedRef.current = false
        const queuedPreserveCardIndex = queuedPreserveCardIndexRef.current
        queuedPreserveCardIndexRef.current = undefined
        void refreshLiveRound(queuedPreserveCardIndex)
      } else {
        refreshQueuedRef.current = false
        queuedPreserveCardIndexRef.current = undefined
      }
    }
  }
  useEffect(() => {
    if (!roomId) return
    let refreshTimer: number | undefined
    let presenceTimer: number | undefined
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refreshLiveRound()
    }
    const syncPresenceWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      void syncRoomPresence(roomId).catch(() => undefined)
    }
    const startTimers = () => {
      if (document.visibilityState !== 'visible') return
      if (refreshTimer === undefined) refreshTimer = window.setInterval(refreshWhenVisible, realtimeHealthy ? HEALTHY_REFRESH_INTERVAL_MS : DEGRADED_REFRESH_INTERVAL_MS)
      if (presenceTimer === undefined) presenceTimer = window.setInterval(syncPresenceWhenVisible, PRESENCE_SYNC_INTERVAL_MS)
    }
    const stopTimers = () => {
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
      if (presenceTimer !== undefined) window.clearInterval(presenceTimer)
      refreshTimer = undefined
      presenceTimer = undefined
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshWhenVisible()
        syncPresenceWhenVisible()
        startTimers()
      } else {
        stopTimers()
      }
    }
    const roomChanged = timerRoomIdRef.current !== roomId
    timerRoomIdRef.current = roomId
    if (roomChanged) {
      refreshWhenVisible()
      syncPresenceWhenVisible()
    }
    startTimers()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { stopTimers(); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [roomId, user?.id, realtimeHealthy])
  useEffect(() => {
    if (!roomId || !supabase) return
    const db = supabase
    let refreshTimer: number | undefined
    let disposed = false
    let shouldRefreshAfterSubscribe = false
    setRealtimeHealthy(false)
    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => { refreshTimer = undefined; void refreshLiveRound() }, REALTIME_INVALIDATION_DEBOUNCE_MS)
    }
    const channel = db.channel(`live-round-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` }, scheduleRefresh)
    if (liveRound?.id) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${liveRound.id}` }, scheduleRefresh)
    }
    channel.subscribe((status) => {
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        setRealtimeHealthy(true)
        if (shouldRefreshAfterSubscribe) {
          shouldRefreshAfterSubscribe = false
          scheduleRefresh()
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        shouldRefreshAfterSubscribe = true
        setRealtimeHealthy(false)
      }
    })
    return () => {
      disposed = true
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      void db.removeChannel(channel)
    }
  }, [roomId, user?.id, liveRound?.id])
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
  const playerName = mine?.profiles?.display_name || String(user?.user_metadata.display_name || 'Player').trim() || 'Player'
  const allPlayersSettled = Boolean(roomId && liveRound?.players.length && liveRound.players.every((player) => player.status !== 'active' && player.confirmed_at !== null))
  const cardInteractionLocked = submitting || pickerOpen || pickerQueued || selectedCardIndex !== null || cardDialogClosing || pendingAction !== null || targetDialogClosing
  const closePicker = () => {
    cardSelectionRef.current = false
    dialogLockRef.current = true
    setCardDialogClosing(true)
    setPickerOpen(false)
    setPickerQueued(false)
    setEditingCardIndex(null)
  }
  const closeCardActions = () => {
    dialogLockRef.current = true
    setCardDialogClosing(true)
    setSelectedCardIndex(null)
  }
  const openPicker = () => {
    if (dialogLockRef.current || cardInteractionLocked) return
    dialogLockRef.current = true
    setEditingCardIndex(null)
    setPickerOpen(true)
  }
  const beginCardEdit = () => {
    if (selectedCardIndex === null || cardDialogClosing) return
    dialogLockRef.current = true
    setCardDialogClosing(true)
    setEditingCardIndex(selectedCardIndex)
    setSelectedCardIndex(null)
    setPickerQueued(true)
  }
  const closePendingAction = () => {
    cardSelectionRef.current = false
    dialogLockRef.current = true
    setTargetDialogClosing(true)
    setPendingAction(null)
  }
  const resetOrganization = () => {
    setIsOrganized(false)
    originalTableRef.current = null
    cardOrderRef.current = []
  }

  const organizeCards = () => {
    if (isOrganized) {
      const original = originalTableRef.current
      if (original) {
        setTable(original.cards)
        if (roomId) setTableCardIds(original.ids)
        cardOrderRef.current = original.ids
      }
      setIsOrganized(false)
      return
    }
    originalTableRef.current = { cards: [...table], ids: [...tableCardIds] }
    const rank = (card: Card) => card.kind === 'number' ? 0 : card.id === 'modifier-x2' ? 1 : card.kind === 'modifier' ? 2 : 3
    const entries = table.map((card, index) => ({ card, id: tableCardIds[index], index, voided: isVoidedCard(index) }))
    entries.sort((a, b) => {
      if (a.voided !== b.voided) return Number(a.voided) - Number(b.voided)
      const rankDifference = rank(a.card) - rank(b.card)
      if (rankDifference !== 0) return rankDifference
      if (a.card.kind === 'number' && b.card.kind === 'number') return (a.card.points ?? 0) - (b.card.points ?? 0)
      if (a.card.kind === 'modifier' && b.card.kind === 'modifier') return (a.card.points ?? 0) - (b.card.points ?? 0)
      return a.index - b.index
    })
    const cards = entries.map((entry) => entry.card)
    const ids = entries.map((entry) => entry.id).filter((id): id is string => Boolean(id))
    cardOrderRef.current = ids
    setTable(cards)
    if (roomId) setTableCardIds(ids)
    setIsOrganized(true)
  }

  const addCard = async (card: Card, targetUserId?: string) => {
    if (submitting || actionLockRef.current || cardSelectionRef.current) return
    if (roomId) {
      if (card.kind === 'action' && !targetUserId) {
        cardSelectionRef.current = true
        dialogLockRef.current = true
        setCardDialogClosing(true)
        setPendingAction(card)
        setPickerOpen(false)
        return
      }
      cardSelectionRef.current = true
      actionLockRef.current = true
      setSubmitting(true)
      // Close the picker immediately so rapid taps cannot queue another save.
      setCardDialogClosing(true)
      setPickerOpen(false)
      try {
        resetOrganization()
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
      } catch (caught) { setToast(errorMessage(caught, 'Could not record that card.')) } finally { setSubmitting(false); setPickerOpen(false); setPendingAction(null); actionLockRef.current = false; cardSelectionRef.current = false }
      setEditingCardIndex(null)
      return
    }
    cardSelectionRef.current = true
    resetOrganization()
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
    cardSelectionRef.current = false
  }

  const removeCard = async (index: number) => {
    const cardVoided = isVoidedCard(index)
    if ((!canEditCards && !cardVoided) || submitting || actionLockRef.current) return
    actionLockRef.current = true
    closeCardActions()
    const card = table[index]
    setSubmitting(true)
    try {
      resetOrganization()
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
        resetOrganization()
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
        resetOrganization()
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
        resetOrganization()
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
      resetOrganization()
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
      resetOrganization()
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
      resetOrganization()
      await withTimeout(finalizeRound(roomId))
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

      <OpponentStrip players={visiblePlayers} />

      <GameTable table={table} tableCardIds={tableCardIds} isVoidedCard={isVoidedCard} score={score} flipSevenBonus={flipSevenBonus} busted={busted} frozen={frozen} submitting={submitting} interactionLocked={cardInteractionLocked} canEditCards={canEditCards} confirmedAt={mine?.confirmed_at} isStaying={isStaying} isOrganized={isOrganized} playerName={playerName} isHost={isHost} onOrganize={organizeCards} onOpenPicker={openPicker} onSelectCard={(index, card) => { if (dialogLockRef.current || cardInteractionLocked) return; if (!canEditCards && !isVoidedCard(index)) { setToast(`${card.label} is locked after you stay.`); return } dialogLockRef.current = true; setSelectedCardIndex(index) }} />

        <GameControls isHost={isHost} allPlayersSettled={allPlayersSettled} submitting={submitting} canEditCards={canEditCards} hasCardsOrRemoval={table.length > 0 || Boolean(lastRemoval)} hasRedo={redoStack.length > 0} isStaying={isStaying} busted={busted} frozen={frozen} numberCardCount={numberCardCount} playerStatus={mine?.status} confirmedAt={mine?.confirmed_at} onNextRound={() => void proceedToNextRound()} onUndo={() => void undo()} onStay={() => void stay()} onRedo={() => void redo()} />

      </main>
      <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>

      <AnimatePresence>{stayPrompt && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setStayPrompt(null)}><motion.section className="card-picker home-prompt" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>STAY / BANK</span><h2>Stay for this round?</h2></div><button className="close-button" aria-label="Cancel" title="Cancel" onClick={() => setStayPrompt(null)}><X size={19} /></button></div><p className="home-prompt-copy">Your score will be saved and your round will be confirmed. You will wait for the other players.</p><div className="home-prompt-actions"><button className="secondary-action" onClick={() => setStayPrompt(null)}>Cancel</button><button className="primary-wide" onClick={() => void completeStayPrompt()}><span className="button-content">Confirm stay</span></button></div></motion.section></motion.div>}</AnimatePresence>

      <AnimatePresence mode="wait" onExitComplete={() => { setCardDialogClosing(false); if (pickerQueued) { setPickerQueued(false); setPickerOpen(true) } else if (!pendingAction) dialogLockRef.current = false }}>
        {selectedCardIndex !== null && table[selectedCardIndex] && <motion.div key="card-actions" className="picker-backdrop card-focus-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={closeCardActions}><CardActionsPanel card={table[selectedCardIndex]} cardVoided={isVoidedCard(selectedCardIndex)} submitting={submitting} onClose={closeCardActions} onEdit={beginCardEdit} onRemove={() => void removeCard(selectedCardIndex)} /></motion.div>}
        {pickerOpen && (
          <motion.div key="card-picker" className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={closePicker}>
            <CardPickerPanel submitting={submitting} onClose={closePicker} onSelect={(card) => void addCard(card)} />
          </motion.div>
        )}
      </AnimatePresence>
        <AnimatePresence>{showHomePrompt && <HomePrompt onCancel={() => setShowHomePrompt(false)} onConfirm={() => navigate('/')} />}</AnimatePresence>
        <AnimatePresence>
          {openPanel && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setOpenPanel(null)}>
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
        <AnimatePresence onExitComplete={() => { setTargetDialogClosing(false); if (!pendingAction) dialogLockRef.current = false }}>{pendingAction && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={closePendingAction}><motion.section className="card-picker" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>ACTION TARGET</span><h2>Who gets {pendingAction.label}?</h2></div><button className="close-button" aria-label="Close action target" title="Close" onClick={closePendingAction}><X size={19} /></button></div><div className="target-list">{liveRound?.players.map((player) => <button key={player.user_id} disabled={submitting || actionLockRef.current} onClick={() => { cardSelectionRef.current = false; void addCard(pendingAction, player.user_id) }}>{player.user_id === user?.id ? `${player.profiles?.display_name || 'Player'} (me)` : player.profiles?.display_name || 'Player'}</button>)}</div></motion.section></motion.div>}</AnimatePresence>
    </div>
  )
}
