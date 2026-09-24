import type { Card } from '../game/cards'

export function CardArtwork({ card, lazy = false }: { card: Card; lazy?: boolean }) {
  if (card.image) {
    return <img src={card.image} alt={card.label} loading={lazy ? 'lazy' : 'eager'} decoding="async" />
  }
  return <span className="generated-card-face" aria-label={`${card.label} modifier card`}><small>MODIFIER</small><b>{card.label}</b><small>NUMBER TOTAL</small></span>
}
