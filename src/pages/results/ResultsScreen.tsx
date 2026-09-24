import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Crown, LogOut } from 'lucide-react'
import { getRoundScores, type RoomSnapshot, type RoundScore } from '../../lib/room'

export function ResultsScreen({ snapshot, leaveRoom }: { snapshot: RoomSnapshot; leaveRoom: () => void }) {
  const [roundScores, setRoundScores] = useState<RoundScore[]>([])
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(() => new Set())
  const players = [...snapshot.members].filter((member) => member.status !== 'left' && member.status !== 'removed').sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
  const winnerScore = players[0]?.final_score ?? 0

  useEffect(() => {
    let mounted = true
    void getRoundScores(snapshot.room.id).then((scores) => {
      if (mounted) setRoundScores(scores)
    }).catch(() => {
      if (mounted) setRoundScores([])
    })
    return () => { mounted = false }
  }, [snapshot.room.id])

  const scoresByPlayer = useMemo(() => roundScores.reduce((scores, round) => {
    const playerScores = scores.get(round.userId) ?? []
    playerScores.push(round)
    scores.set(round.userId, playerScores)
    return scores
  }, new Map<string, RoundScore[]>()), [roundScores])

  const toggleRounds = (userId: string) => {
    setExpandedPlayers((current) => {
      const next = new Set(current)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell results-shell">
    <header className="topbar"><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /><button className="account-pill room-leave-button" onClick={leaveRoom}><LogOut size={15} /> Exit</button></header>
    <section className="results-hero"><span className="eyebrow">MATCH COMPLETE</span><h1>What a finish!</h1><p>First to <b>{snapshot.room.target_score}</b> points · Final results</p></section>
    <section className="results-card"><div className="results-heading"><div><span className="eyebrow">FINAL SCORES</span><h2>{players[0]?.profiles?.display_name || 'Winner'} wins!</h2></div><Crown size={30} /></div><div className="results-list">{players.map((player, index) => {
      const playerRounds = scoresByPlayer.get(player.user_id) ?? []
      const roundsExpanded = expandedPlayers.has(player.user_id)
      return <div className={`results-player ${index === 0 ? 'winner' : ''}`} key={player.user_id}><span className="results-rank">{index + 1}</span><span className="mini-avatar" style={{ background: player.profiles?.avatar_color || '#57b8d7' }}>{player.profiles?.display_name?.[0] || '?'}</span><div className="results-player-copy"><div className="results-player-name"><b>{player.profiles?.display_name || 'Player'} {index === 0 && <Crown className="host-crown" size={15} aria-label="Winner" />}</b><small>{index === 0 && (player.final_score ?? 0) === winnerScore ? 'Winner' : 'Final score'}</small></div>{playerRounds.length ? <><button className="results-round-toggle" type="button" onClick={() => toggleRounds(player.user_id)} aria-expanded={roundsExpanded} aria-controls={`round-scores-${player.user_id}`}><span>Round scores</span><ChevronDown size={14} /></button>{roundsExpanded ? <div className="results-rounds" id={`round-scores-${player.user_id}`} aria-label={`${player.profiles?.display_name || 'Player'} round scores`}>{playerRounds.map((round) => <span className="round-score" key={round.roundNumber}><i>R{round.roundNumber}</i><strong>{round.score}</strong></span>)}</div> : null}</> : null}</div><div className="results-total"><small>Total</small><strong>{player.final_score ?? 0}</strong></div></div>
    })}</div></section>
    <section className="results-actions"><p>The game is complete. These final scores have been recorded.</p><button className="primary-wide" onClick={leaveRoom}>Back to rooms</button></section>
  </main><aside className="desktop-marquee right"><div>YOUR<br />LUCK<br />AWAITS</div></aside></div>
}
