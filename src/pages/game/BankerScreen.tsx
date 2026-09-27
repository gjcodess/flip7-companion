import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CircleHelp, ClipboardList, LogOut, Menu, Play, RotateCcw, UserPlus, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { Card } from '../../game/cards'
import { allBankerPlayersSettled, bankerInitialState, bankerPlayerDerived, bankerReducer, isBankerTerminal, type BankerPlayer } from '../../game/bankerGame'
import { organizeDemoEntries } from '../../game/demoGame'
import { pointLabel } from '../../lib/app-utils'
import { useAppNavigation } from '../../lib/navigation'
import { CardActionsPanel, CardPickerPanel } from './CardDialogs'
import { GameControls } from './GameControls'
import { GameTable } from './GameTable'

const defaultNames = ['', '', '']

function statusLabel(player: BankerPlayer) {
  const status = player.round.status
  return status === 'busted' ? 'Busted' : status === 'frozen' ? 'Frozen' : status === 'flip-seven' ? 'Flip 7!' : status === 'stayed' ? 'Banked' : 'Active'
}

function statusClass(player: BankerPlayer) {
  return player.round.status === 'flip-seven' ? 'stayed' : player.round.status
}

function playerTabSummary(player: BankerPlayer) {
  const derived = bankerPlayerDerived(player)
  const numberCardCount = player.round.entries.filter((entry) => !entry.voided && entry.card.kind === 'number').length
  if (player.round.status === 'active') return `${numberCardCount} cards · ${derived.score} ${pointLabel(derived.score)}`
  if (player.round.status === 'stayed') return `Banked · ${derived.score} ${pointLabel(derived.score)}`
  if (player.round.status === 'frozen') return `Frozen · ${derived.score} ${pointLabel(derived.score)}`
  if (player.round.status === 'flip-seven') return `Flip 7 · ${derived.score} ${pointLabel(derived.score)}`
  return 'Busted'
}

function BankerSetup({ onStart }: { onStart: (targetScore: number, names: string[]) => void }) {
  const [names, setNames] = useState(defaultNames)
  const [targetScore, setTargetScore] = useState(200)
  const [warning, setWarning] = useState('')
  const updateName = (index: number, name: string) => setNames((current) => current.map((value, valueIndex) => valueIndex === index ? name : value))
  const moveName = (index: number, direction: -1 | 1) => setNames((current) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= current.length) return current
    const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    return next
  })
  const start = () => {
    const cleaned = names.map((name) => name.trim())
    if (cleaned.some((name) => !name)) return setWarning('Every player needs a name.')
    if (new Set(cleaned.map((name) => name.toLowerCase())).size !== cleaned.length) return setWarning('Player names must be unique.')
    setWarning('')
    onStart(targetScore, cleaned)
  }
  const cleanedNames = names.map((name) => name.trim())
  const canStart = cleanedNames.every(Boolean) && new Set(cleanedNames.map((name) => name.toLowerCase())).size === cleanedNames.length
  return <div className="banker-setup-wrap">
    <section className="banker-hero"><div><span className="eyebrow">BANKER TABLE</span><h1>Run the table.</h1><p>One device for the banker. Log each physical card, switch player tables, and keep the round moving.</p></div><ClipboardList size={54} aria-hidden="true" /></section>
    <section className="banker-setup-card">
      <div className="banker-section-heading"><div><span className="eyebrow">SET UP PLAYERS</span><h2>Who is at the table?</h2></div><span className="banker-count">{names.length}/18</span></div>
      <p className="banker-muted">Set the order used for player switching and dealer rotation. You can change the order during the game.</p>
      <div className="banker-name-list">{names.map((name, index) => <div className="banker-name-row" key={`draft-${index}`}><span className="banker-seat-number">{String(index + 1).padStart(2, '0')}</span><input value={name} placeholder={`Player ${index + 1}`} maxLength={24} aria-label={`Player ${index + 1} name`} onChange={(event) => updateName(index, event.target.value)} /><div className="banker-order-actions"><button type="button" className="banker-order-button" aria-label={`Move ${name || `player ${index + 1}`} up`} title="Move up" disabled={index === 0} onClick={() => moveName(index, -1)}><ArrowUp size={15} /></button><button type="button" className="banker-order-button" aria-label={`Move ${name || `player ${index + 1}`} down`} title="Move down" disabled={index === names.length - 1} onClick={() => moveName(index, 1)}><ArrowDown size={15} /></button></div>{names.length > 3 && <button type="button" className="banker-remove-player" aria-label={`Remove ${name || `player ${index + 1}`}`} onClick={() => setNames((current) => current.filter((_, valueIndex) => valueIndex !== index))}><X size={16} /></button>}</div>)}</div>
      <div className="banker-setup-actions"><button type="button" className="banker-add-player" disabled={names.length >= 18} onClick={() => setNames((current) => [...current, ''])}><UserPlus size={16} /> Add player</button><label className="banker-target-control"><span>FIRST TO</span><div className="banker-target-value"><input type="number" min="50" max="500" value={targetScore} aria-label="First to target score" onChange={(event) => setTargetScore(Math.max(50, Math.min(500, Number(event.target.value) || 50)))} /><b>PTS</b></div></label></div>
      {warning && <p className="banker-warning" role="alert">{warning}</p>}
      <button type="button" className="primary-wide banker-start-button" disabled={!canStart} onClick={start}><Play size={17} /> Start banker table</button>
    </section>
  </div>
}

function BankerResults({ players, history, targetScore, onNewGame, onExit }: { players: BankerPlayer[]; history: { round: number; scores: Record<string, number> }[]; targetScore: number; onNewGame: () => void; onExit: () => void }) {
  const ordered = [...players].sort((a, b) => b.totalScore - a.totalScore)
  const winnerScore = ordered[0]?.totalScore ?? 0
  return <div className="banker-results"><section className="results-hero"><span className="eyebrow">BANKER TABLE COMPLETE</span><h1>Round the table.</h1><p>{ordered.filter((player) => player.totalScore === winnerScore).map((player) => player.name).join(' and ')} finished first to {targetScore}.</p></section><section className="results-card"><div className="results-heading"><div><span className="eyebrow">FINAL SCORES</span><h2>Game results</h2></div><ClipboardList size={24} /></div><div className="results-list">{ordered.map((player, index) => <article className={`results-player ${index === 0 ? 'winner' : ''}`} key={player.id}><span className="results-rank">{index + 1}</span><span className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</span><div className="results-player-copy"><div className="results-player-name"><b>{player.name}</b><small>{player.totalScore} {pointLabel(player.totalScore)} total</small></div><div className="results-rounds">{history.map((round) => <span className="round-score" key={`${player.id}-${round.round}`}>R{round.round}: {round.scores[player.id] ?? 0}</span>)}</div></div><div className="results-total"><small>Total pts</small><strong>{player.totalScore}</strong></div></article>)}</div></section><section className="results-actions"><p>This banker game existed only on this device. Leaving or starting a new game clears it.</p><div className="banker-results-actions"><button className="secondary-action" onClick={onNewGame}><RotateCcw size={16} /> New  game</button><button className="primary-wide" onClick={onExit}><ArrowLeft size={16} /> Exit</button></div></section></div>
}

export function BankerScreen() {
  const navigate = useAppNavigation()
  const [state, dispatch] = useReducer(bankerReducer, undefined, bankerInitialState)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [organized, setOrganized] = useState(false)
  const [cardDialogClosing, setCardDialogClosing] = useState(false)
  const [pendingAction, setPendingAction] = useState<Card | null>(null)
  const [roundSummaryOpen, setRoundSummaryOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [playersOpen, setPlayersOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const cardSelectionRef = useRef(false)
  const actionTargetRef = useRef(false)
  const selectedPlayer = state.players.find((player) => player.id === state.selectedPlayerId) ?? state.players[0]
  const derived = useMemo(() => selectedPlayer ? bankerPlayerDerived(selectedPlayer) : null, [selectedPlayer])
  const terminal = selectedPlayer ? isBankerTerminal(selectedPlayer.round.status) : false
  const allSettled = allBankerPlayersSettled(state)
  const canEdit = selectedPlayer?.round.status === 'active' || selectedPlayer?.round.status === 'busted'
  const interactionLocked = pickerOpen || selectedCardIndex !== null || cardDialogClosing || pendingAction !== null || roundSummaryOpen || !canEdit
  const table = selectedPlayer?.round.entries.map((entry) => entry.card) ?? []
  const cardIds = selectedPlayer?.round.entries.map((entry) => entry.instanceId) ?? []

  useEffect(() => {
    if (state.phase === 'round' && allSettled) setRoundSummaryOpen(true)
    if (!allSettled) setRoundSummaryOpen(false)
  }, [allSettled, state.phase])

  if (state.phase === 'setup') return <div className="app-shell banker-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell"><header className="topbar banker-topbar"><button className="brand-button" aria-label="Exit banker mode" onClick={() => navigate('/landing')}><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /></button><button className="account-pill room-leave-button" onClick={() => navigate('/landing')}><LogOut size={15} /> Exit</button></header><BankerSetup onStart={(targetScore, names) => dispatch({ type: 'start', targetScore, names })} /></main><aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside></div>

  if (state.phase === 'results') return <div className="app-shell banker-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell"><header className="topbar banker-topbar"><button className="brand-button" aria-label="Exit banker mode" onClick={() => navigate('/landing')}><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /></button><span className="topbar-caption">BANKER MODE · LOCAL ONLY</span></header><BankerResults players={state.players} history={state.history} targetScore={state.targetScore} onNewGame={() => dispatch({ type: 'reset' })} onExit={() => navigate('/landing')} /></main><aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside></div>

  const exit = () => navigate('/landing')
  const newRound = () => { dispatch({ type: 'advance-round' }); setRoundSummaryOpen(false); setOrganized(false) }
  const resetForNewGame = () => dispatch({ type: 'reset' })
  const closePicker = () => { cardSelectionRef.current = false; setCardDialogClosing(true); setPickerOpen(false); setEditingIndex(null) }
  const selectCard = (card: Card) => {
    if (!selectedPlayer || cardSelectionRef.current) return
    cardSelectionRef.current = true
    if (card.kind === 'action') {
      actionTargetRef.current = false
      setCardDialogClosing(true)
      setPickerOpen(false)
      setPendingAction(card)
      return
    }
    dispatch({ type: 'player', playerId: selectedPlayer.id, action: editingIndex === null ? { type: 'add', card } : { type: 'replace', index: editingIndex, card } })
    setCardDialogClosing(true)
    setPickerOpen(false)
    setEditingIndex(null)
    setOrganized(false)
  }
  const closePendingAction = () => { actionTargetRef.current = false; cardSelectionRef.current = false; setCardDialogClosing(true); setPendingAction(null); setEditingIndex(null) }
  const chooseActionTarget = (playerId: string) => {
    if (!pendingAction || actionTargetRef.current) return
    actionTargetRef.current = true
    cardSelectionRef.current = true
    if (editingIndex !== null && playerId === selectedPlayer?.id) dispatch({ type: 'player', playerId, action: { type: 'replace', index: editingIndex, card: pendingAction } })
    else {
      if (editingIndex !== null && selectedPlayer) dispatch({ type: 'player', playerId: selectedPlayer.id, action: { type: 'remove', index: editingIndex } })
      dispatch({ type: 'player', playerId, action: { type: 'add', card: pendingAction } })
    }
    setPendingAction(null)
    setEditingIndex(null)
    setCardDialogClosing(true)
    setOrganized(false)
  }
  const organize = () => {
    if (!selectedPlayer) return
    if (organized) {
      const original = [...selectedPlayer.round.entries].sort((a, b) => Number(a.instanceId.replace('demo-card-', '')) - Number(b.instanceId.replace('demo-card-', '')))
      dispatch({ type: 'player', playerId: selectedPlayer.id, action: { type: 'reorder', entries: original } })
      setOrganized(false)
      return
    }
    dispatch({ type: 'player', playerId: selectedPlayer.id, action: { type: 'reorder', entries: organizeDemoEntries(selectedPlayer.round.entries) } })
    setOrganized(true)
  }
  const playerStatus = selectedPlayer?.round.status === 'flip-seven' ? 'stayed' : selectedPlayer?.round.status
  return <div className="app-shell banker-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell">
    <header className="topbar banker-topbar"><button className="brand-button" aria-label="Exit banker mode" onClick={exit}><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /></button><span className="topbar-caption">BANKER MODE · LOCAL ONLY</span><button className="account-pill room-leave-button" aria-label="Open banker menu" onClick={() => setShowMenu((open) => !open)}><Menu size={16} /> Menu</button>{showMenu && <div className="room-menu banker-room-menu"><div className="room-menu-title">BANKER MODE</div><div className="room-menu-divider" /><button onClick={() => { setShowMenu(false); setPlayersOpen(true) }}><Users size={16} /> Players</button><button onClick={() => { setShowMenu(false); setRulesOpen(true) }}><CircleHelp size={16} /> Rules</button><button onClick={exit}><LogOut size={16} /> Leave room</button></div>}</header>
    <section className="match-strip"><div><span>ROUND</span><b>{String(state.roundNumber).padStart(2, '0')}</b></div><div className="target"><span>FIRST TO</span><b>{state.targetScore}</b></div><div><span>PLAYER</span><b>{selectedPlayer?.name || '—'}</b></div></section>
    <section className="banker-player-strip" aria-label="Player tables">{state.players.map((player) => <button key={player.id} className={`banker-player-tab opponent ${player.id === selectedPlayer?.id ? 'selected' : ''} ${statusClass(player)}`} onClick={() => { dispatch({ type: 'select-player', playerId: player.id }); setOrganized(false); setSelectedCardIndex(null) }}><span className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</span><span className="opponent-copy"><b>{player.name}</b><span>{playerTabSummary(player)}</span></span><strong><small>Total pts:</small> <b>{player.totalScore}</b></strong></button>)}</section>
    <GameTable table={table} tableCardIds={cardIds} isVoidedCard={(index) => Boolean(selectedPlayer?.round.entries[index]?.voided)} score={derived?.score ?? 0} flipSevenBonus={derived?.flipSevenBonus ?? 0} busted={selectedPlayer?.round.status === 'busted'} frozen={selectedPlayer?.round.status === 'frozen'} submitting={false} interactionLocked={interactionLocked} canEditCards={canEdit} confirmedAt={terminal ? 'banker' : null} isStaying={selectedPlayer?.round.status === 'stayed'} isOrganized={organized} playerName={selectedPlayer?.name ?? 'Player'} isHost={false} onOrganize={organize} onOpenPicker={() => { if (!interactionLocked) { cardSelectionRef.current = false; setEditingIndex(null); setPickerOpen(true) } }} onSelectCard={(index) => { if (!interactionLocked) setSelectedCardIndex(index) }} />
    <GameControls isHost allPlayersSettled={allSettled} submitting={false} canEditCards={canEdit} hasCardsOrRemoval={table.length > 0} hasRedo={Boolean(selectedPlayer?.round.future.length)} isStaying={selectedPlayer?.round.status === 'stayed'} busted={selectedPlayer?.round.status === 'busted'} frozen={selectedPlayer?.round.status === 'frozen'} numberCardCount={derived?.numberCardCount ?? 0} playerStatus={playerStatus} confirmedAt={terminal ? 'banker' : null} onNextRound={newRound} onUndo={() => selectedPlayer && dispatch({ type: 'player', playerId: selectedPlayer.id, action: { type: 'undo' } })} onStay={() => selectedPlayer && dispatch({ type: 'player', playerId: selectedPlayer.id, action: { type: 'stay' } })} onRedo={() => selectedPlayer && dispatch({ type: 'player', playerId: selectedPlayer.id, action: { type: 'redo' } })} />
  </main><aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>
    <AnimatePresence onExitComplete={() => { setCardDialogClosing(false); cardSelectionRef.current = false }}>
      {selectedCardIndex !== null && selectedPlayer?.round.entries[selectedCardIndex] && <motion.div key="card-actions" className="picker-backdrop card-focus-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => { setCardDialogClosing(true); setSelectedCardIndex(null) }}><CardActionsPanel card={selectedPlayer.round.entries[selectedCardIndex].card} cardVoided={selectedPlayer.round.entries[selectedCardIndex].voided} submitting={false} onClose={() => { setCardDialogClosing(true); setSelectedCardIndex(null) }} onEdit={() => { setEditingIndex(selectedCardIndex); setSelectedCardIndex(null); setPickerOpen(true) }} onRemove={() => { dispatch({ type: 'player', playerId: selectedPlayer.id, action: { type: 'remove', index: selectedCardIndex } }); setSelectedCardIndex(null); setOrganized(false) }} /></motion.div>}
      {pickerOpen && <motion.div key="card-picker" className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={closePicker}><CardPickerPanel submitting={false} onClose={closePicker} onSelect={selectCard} /></motion.div>}
      {pendingAction && <motion.div key="action-target" className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={closePendingAction}><motion.section className="card-picker" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: .14, ease: 'easeOut' }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>ACTION TARGET</span><h2>Who gets {pendingAction.label}?</h2></div><button className="close-button" aria-label="Close action target" title="Close" onClick={closePendingAction}><X size={19} /></button></div><p>Select the player who receives this action card. The card will be logged on that player’s local table.</p><div className="target-list banker-target-list">{state.players.map((player) => <button key={player.id} onClick={() => chooseActionTarget(player.id)}>{player.name}</button>)}</div></motion.section></motion.div>}
      {playersOpen && <motion.div key="players" className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setPlayersOpen(false)}><motion.section className="card-picker info-panel" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>AT THIS TABLE</span><h2>Players</h2></div><div className="panel-heading-actions"><b className="panel-count">{state.players.length} players</b><button className="close-button" aria-label="Close players" title="Close" onClick={() => setPlayersOpen(false)}><X size={19} /></button></div></div><div className="info-list">{state.players.map((player) => { const playerScore = bankerPlayerDerived(player).score; return <div className={`info-player ${player.id === selectedPlayer?.id ? 'current-player' : ''}`} key={player.id}><span className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</span><div><b>{player.name}{player.id === selectedPlayer?.id ? ' (current)' : ''}</b><small>{playerTabSummary(player)}</small></div><strong>{playerScore}</strong></div> })}</div></motion.section></motion.div>}
      {roundSummaryOpen && <motion.div key="round-summary" className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }}><motion.section className="card-picker banker-summary" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>ROUND {String(state.roundNumber).padStart(2, '0')} COMPLETE</span><h2>Everyone is settled.</h2></div><button className="close-button" aria-label="Close round summary" onClick={() => setRoundSummaryOpen(false)}><X size={19} /></button></div><div className="banker-round-summary-list">{state.players.map((player) => <div className={`banker-summary-player ${statusClass(player)}`} key={player.id}><span className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</span><div className="banker-summary-player-copy"><b>{player.name}</b><span className={`banker-status-pill ${statusClass(player)}`}>{statusLabel(player)}</span></div><div className="banker-summary-score"><small>ROUND</small><strong>{bankerPlayerDerived(player).score}</strong></div></div>)}</div><p>Confirm the local scores, then rotate the dealer and start the next round.</p><div className="banker-results-actions"><button className="secondary-action" onClick={resetForNewGame}><RotateCcw size={16} /> New game</button><button className="primary-wide" onClick={newRound}><Play size={16} /> Next round</button></div></motion.section></motion.div>}
      {rulesOpen && <motion.div key="rules" className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setRulesOpen(false)}><motion.section className="card-picker info-panel" initial={{ y: 50 }} animate={{ y: 0 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>BANKER MODE</span><h2>How it works</h2></div><button className="close-button" aria-label="Close rules" onClick={() => setRulesOpen(false)}><X size={19} /></button></div><div className="rules-copy"><section><h3>Select a player</h3><p>Use the ordered player tabs to switch tables. The selected player receives the next card you log.</p></section><section><h3>Log the physical deck</h3><p>Choose cards as they appear. Number duplicates bust that player unless they have a Second Chance. Freeze and Flip Three follow the same rules as a live table.</p></section><section><h3>Settle the round</h3><p>When every player has banked, frozen, busted, or flipped seven, review the local scores and continue to the next round.</p></section></div></motion.section></motion.div>}
    </AnimatePresence>
  </div>
}
