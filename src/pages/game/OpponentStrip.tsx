import { pointLabel } from '../../lib/app-utils'

export type Player = {
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

export function OpponentStrip({ players }: { players: Player[] }) {
  return <section className="opponents" aria-label="Opponents">
    {players.map((player) => (
      <article className={`opponent ${player.state}`} key={player.id}>
        <div className="mini-avatar" style={{ background: player.color }}>{player.name[0]}</div>
        <div className="opponent-copy"><b>{player.name}</b><span>{player.state === 'active' ? `${player.cards} cards · ${player.roundScore} ${pointLabel(player.roundScore)}` : player.state === 'stayed' ? `Banked · ${player.roundScore} ${pointLabel(player.roundScore)}` : player.state === 'frozen' ? `Freezed · ${player.roundScore} ${pointLabel(player.roundScore)}` : 'Busted'}</span></div>
        <strong><small>Total pts:</small> <b>{player.score}</b></strong>
      </article>
    ))}
  </section>
}
