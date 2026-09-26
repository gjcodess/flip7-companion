import { useEffect, useMemo, useReducer, useState } from 'react'
import { ArrowLeft, CircleHelp, LogOut, RotateCcw, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import type { Card } from '../../game/cards'
import { demoDerived, demoInitialState, demoReducer, type DemoStatus } from '../../game/demoGame'
import { pointLabel } from '../../lib/app-utils'
import { CardActionsPanel, CardPickerPanel } from './CardDialogs'
import { GameControls } from './GameControls'
import { GameTable } from './GameTable'

const terminalStatuses: DemoStatus[] = ['stayed', 'frozen', 'busted', 'flip-seven']

export function DemoScreen() {
  const [state, dispatch] = useReducer(demoReducer, undefined, demoInitialState)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [organized, setOrganized] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const derived = useMemo(() => demoDerived(state), [state])
  const terminal = terminalStatuses.includes(state.status)
  const canEdit = state.status === 'active' || state.status === 'busted'
  const interactionLocked = pickerOpen || selectedIndex !== null || summaryOpen || !canEdit
  const table = state.entries.map((entry) => entry.card)
  const cardIds = state.entries.map((entry) => entry.instanceId)

  useEffect(() => {
    if (terminal) setSummaryOpen(true)
  }, [terminal])

  const exit = () => window.location.assign('/landing')
  const newRound = () => window.location.assign('/demo')
  const closePicker = () => { setPickerOpen(false); setEditingIndex(null) }
  const openPicker = () => {
    if (!interactionLocked) {
      setEditingIndex(null)
      setPickerOpen(true)
    }
  }
  const selectCard = (card: Card) => {
    if (editingIndex === null) dispatch({ type: 'add', card })
    else dispatch({ type: 'replace', index: editingIndex, card })
    closePicker()
  }
  const organize = () => {
    if (organized) {
      const originalOrder = [...state.entries].sort((a, b) => Number(a.instanceId.replace('demo-card-', '')) - Number(b.instanceId.replace('demo-card-', '')))
      dispatch({ type: 'reorder', entries: originalOrder })
      setOrganized(false)
      return
    }
    const rank = (id: string) => id.startsWith('number-') ? 0 : id === 'modifier-x2' ? 1 : id.startsWith('modifier-') ? 2 : 3
    dispatch({ type: 'reorder', entries: [...state.entries].sort((a, b) => Number(a.voided) - Number(b.voided) || rank(a.card.id) - rank(b.card.id) || a.card.label.localeCompare(b.card.label)) })
    setOrganized(true)
  }
  const statusLabel = state.status === 'busted' ? 'BUSTED' : state.status === 'frozen' ? 'FROZEN' : state.status === 'flip-seven' ? 'FLIP 7!' : state.status === 'stayed' ? 'BANKED' : 'ACTIVE'
  const resultCopy = state.status === 'busted'
    ? 'A duplicate number ended the round.'
    : state.status === 'frozen'
      ? 'Freeze locked your current score.'
      : state.status === 'flip-seven'
        ? 'Seven unique number cards earned the Flip 7 bonus.'
        : 'You banked your score for this practice round.'

  return <div className="app-shell demo-shell">
    <aside className="desktop-marquee left"><div>FLIP<br />7</div></aside>
    <main className="game-shell">
      <header className="topbar demo-topbar">
        <button className="brand-button" aria-label="Exit demo" onClick={exit}><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /></button>
        <button className="account-pill room-leave-button" onClick={exit}><LogOut size={15} /> Exit</button>
      </header>
      <section className="demo-intro"><div><span className="eyebrow">DEMO PRACTICE TABLE</span><h1>Try the game.</h1><p>Choose cards to explore scoring, busts, and action cards.</p></div><button className="demo-rules-button" onClick={() => setRulesOpen(true)}><CircleHelp size={16} /> Rules</button></section>
      <section className="match-strip"><div><span>ROUND</span><b>01</b></div><div className="target"><span>FIRST TO</span><b>200</b></div><div><span>MY TOTAL</span><b>—</b></div></section>
      <GameTable table={table} tableCardIds={cardIds} isVoidedCard={(index) => Boolean(state.entries[index]?.voided)} score={derived.score} flipSevenBonus={derived.flipSevenBonus} busted={state.status === 'busted'} frozen={state.status === 'frozen'} submitting={false} interactionLocked={interactionLocked} canEditCards={canEdit} confirmedAt={terminal ? 'demo' : null} isStaying={state.status === 'stayed'} isOrganized={organized} playerName="Demo Player" isHost={false} onOrganize={organize} onOpenPicker={openPicker} onSelectCard={(index) => { if (!interactionLocked) setSelectedIndex(index) }} />
      <GameControls isHost={false} allPlayersSettled={false} submitting={false} canEditCards={canEdit} hasCardsOrRemoval={state.entries.length > 0} hasRedo={state.future.length > 0} isStaying={state.status === 'stayed'} busted={state.status === 'busted'} frozen={state.status === 'frozen'} numberCardCount={derived.numberCardCount} playerStatus={state.status === 'flip-seven' ? 'stayed' : state.status} confirmedAt={terminal ? 'demo' : null} onNextRound={() => undefined} onUndo={() => { dispatch({ type: 'undo' }); setSummaryOpen(false) }} onStay={() => dispatch({ type: 'stay' })} onRedo={() => { dispatch({ type: 'redo' }); setSummaryOpen(false) }} />
    </main>
    <aside className="desktop-marquee right"><div>PRESS<br />YOUR<br />LUCK</div></aside>

    <AnimatePresence><div className="demo-overlay-group">
      {selectedIndex !== null && state.entries[selectedIndex] && <motion.div className="picker-backdrop card-focus-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedIndex(null)}><CardActionsPanel card={state.entries[selectedIndex].card} cardVoided={state.entries[selectedIndex].voided} submitting={false} onClose={() => setSelectedIndex(null)} onEdit={() => { setEditingIndex(selectedIndex); setSelectedIndex(null); setPickerOpen(true) }} onRemove={() => { dispatch({ type: 'remove', index: selectedIndex }); setSelectedIndex(null); setOrganized(false) }} /></motion.div>}
      {pickerOpen && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closePicker}><CardPickerPanel submitting={false} onClose={closePicker} onSelect={selectCard} /></motion.div>}
      {summaryOpen && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="card-picker demo-summary" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>ROUND COMPLETE</span><h2>{statusLabel}</h2></div><button className="close-button" aria-label="Close summary" onClick={() => setSummaryOpen(false)}><X size={19} /></button></div><div className="demo-result-score"><span>ROUND SCORE</span><strong>{derived.score}</strong><small>{derived.score} {pointLabel(derived.score)}</small></div><p>{resultCopy}</p><div className="home-prompt-actions"><button className="secondary-action" onClick={newRound}><RotateCcw size={16} /> New round</button><button className="primary-wide" onClick={exit}><ArrowLeft size={16} /> Exit demo</button></div></motion.section></motion.div>}
      {rulesOpen && <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRulesOpen(false)}><motion.section className="card-picker info-panel" initial={{ y: 50 }} animate={{ y: 0 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>HOW TO PLAY</span><h2>Demo rules</h2></div><button className="close-button" aria-label="Close rules" onClick={() => setRulesOpen(false)}><X size={19} /></button></div><div className="rules-copy"><section><h3>Choose your cards</h3><p>Add the cards you want to practice. The demo never draws cards or records your choices.</p></section><section><h3>Score points</h3><p>Number cards score their face value. ×2 doubles numbers, modifiers add points, and seven unique numbers earn +15.</p></section><section><h3>Press your luck</h3><p>A duplicate busts unless you have Second Chance. Stay after two number cards, or practice Freeze and Flip Three on yourself.</p></section></div></motion.section></motion.div>}
    </div></AnimatePresence>
  </div>
}
