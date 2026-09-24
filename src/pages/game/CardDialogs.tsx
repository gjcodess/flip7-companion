import { motion } from 'motion/react'
import { X } from 'lucide-react'
import type { Card } from '../../game/cards'
import { pickerCards } from '../../game/cards'
import { CardArtwork } from '../../components/CardArtwork'

type CardActionsPanelProps = {
  card: Card
  cardVoided?: boolean
  submitting: boolean
  onClose: () => void
  onEdit: () => void
  onRemove: () => void
}

export function CardActionsPanel({ card, cardVoided = false, submitting, onClose, onEdit, onRemove }: CardActionsPanelProps) {
  return <motion.section className="card-picker card-actions-panel card-focus-panel" initial={{ scale: .86, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: .9, y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 330, damping: 25 }} onClick={(event) => event.stopPropagation()}><div className="picker-heading"><div><span>{cardVoided ? 'DISCARDED CARD' : 'MY CARD'}</span><h2>{card.label}</h2></div><button className="close-button" aria-label="Close card actions" title="Close" onClick={onClose}><X size={19} /></button></div><motion.div className="card-focus-art" initial={{ scale: .45, y: 100, rotate: -8, opacity: 0 }} animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20, delay: .04 }}><CardArtwork card={card} /></motion.div><p>{cardVoided ? 'This card was discarded by Second Chance. Correct the misclick or remove it from the table.' : 'Edit this card or remove it while your round is still active.'}</p><div className="card-action-buttons"><button className="secondary-action" disabled={submitting} onClick={onEdit}>Edit card</button><button className="danger-action" disabled={submitting} onClick={onRemove}>Remove card</button></div></motion.section>
}

type CardPickerPanelProps = {
  submitting: boolean
  onClose: () => void
  onSelect: (card: Card) => void
}

export function CardPickerPanel({ submitting, onClose, onSelect }: CardPickerPanelProps) {
  return <motion.section className="card-picker" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: 'spring', damping: 26 }} onClick={(event) => event.stopPropagation()}>
    <div className="picker-heading"><div><span>PHYSICAL CARD</span><h2>What did you flip?</h2></div><button className="close-button" aria-label="Close card picker" title="Close" onClick={onClose}><X size={19} /></button></div>
    <p>Select the card in front of you. The app never draws a card for you.</p>
    <div className="picker-grid">{pickerCards.map((card) => <button key={card.id} disabled={submitting} onClick={() => onSelect(card)} aria-label={`Record ${card.label}`}><CardArtwork card={card} lazy /></button>)}</div>
  </motion.section>
}
