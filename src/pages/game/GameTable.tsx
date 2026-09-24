import { motion, AnimatePresence } from 'motion/react'
import { Crown, ListOrdered, LoaderCircle, Plus } from 'lucide-react'
import type { Card } from '../../game/cards'
import { CardArtwork } from '../../components/CardArtwork'

type GameTableProps = {
  table: Card[]
  tableCardIds: string[]
  isVoidedCard: (index: number) => boolean
  score: number
  flipSevenBonus: number
  busted: boolean
  frozen: boolean
  submitting: boolean
  canEditCards: boolean | undefined
  confirmedAt: string | null | undefined
  isStaying: boolean
  isOrganized: boolean
  playerName: string
  isHost: boolean
  onOrganize: () => void
  onOpenPicker: () => void
  onSelectCard: (index: number, card: Card) => void
}

export function GameTable({ table, tableCardIds, isVoidedCard, score, flipSevenBonus, busted, frozen, submitting, canEditCards, confirmedAt, isStaying, isOrganized, playerName, isHost, onOrganize, onOpenPicker, onSelectCard }: GameTableProps) {
  const cardRows = Array.from({ length: Math.ceil(table.length / 5) }, (_, rowIndex) => table.slice(rowIndex * 5, rowIndex * 5 + 5))
  return <section className="table-area">
    <div className="section-kicker">{isHost && <Crown size={16} aria-label="Lobby host" />} {playerName.toUpperCase()}'S TABLE <button className="organize-button" onClick={onOrganize} disabled={table.length < 2 || submitting} title={isOrganized ? 'Restore original card order' : 'Organize cards'}><ListOrdered size={14} /> {isOrganized ? 'Original' : 'Organize'}</button></div>
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
                  onClick={() => onSelectCard(index, card)}
                ><CardArtwork card={card} /></motion.button>
              })}
            </AnimatePresence>
          </div>)}
        </div>
        {!confirmedAt && !isStaying && !busted && !frozen && <button className="add-card-card" disabled={submitting || !canEditCards} onClick={() => { if (submitting || !canEditCards) return; onOpenPicker() }} aria-label="Record a physical card"><Plus size={30} /></button>}
      </AnimatePresence>
    </div>
  </section>
}
