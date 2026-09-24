import { ArrowLeft, Crown } from 'lucide-react'
import type { RoomSnapshot } from '../../lib/room'
import { RoomCode } from '../../components/RoomCode'

export function ResultsScreen({ snapshot, leaveRoom }: { snapshot: RoomSnapshot; leaveRoom: () => void }) {
  const players = [...snapshot.members].filter((member) => member.status !== 'left' && member.status !== 'removed').sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
  const winnerScore = players[0]?.final_score ?? 0
  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell results-shell">
    <header className="topbar"><button className="back-button" onClick={leaveRoom}><ArrowLeft size={18} /> Leave room</button><RoomCode code={snapshot.room.code} /></header>
    <section className="results-hero"><span className="eyebrow">MATCH COMPLETE</span><h1>What a finish!</h1><p>First to <b>{snapshot.room.target_score}</b> points · Final results</p></section>
    <section className="results-card"><div className="results-heading"><div><span className="eyebrow">FINAL SCORES</span><h2>{players[0]?.profiles?.display_name || 'Winner'} wins!</h2></div><Crown size={30} /></div><div className="results-list">{players.map((player, index) => <div className={`results-player ${index === 0 ? 'winner' : ''}`} key={player.user_id}><span className="results-rank">{index + 1}</span><span className="mini-avatar" style={{ background: player.profiles?.avatar_color || '#57b8d7' }}>{player.profiles?.display_name?.[0] || '?'}</span><div><b>{player.profiles?.display_name || 'Player'} {index === 0 && <Crown className="host-crown" size={15} aria-label="Winner" />}</b><small>{index === 0 && (player.final_score ?? 0) === winnerScore ? 'Winner' : 'Final total'}</small></div><strong>{player.final_score ?? 0}</strong></div>)}</div></section>
    <section className="results-actions"><p>The game is complete. These final scores have been recorded.</p><button className="primary-wide" onClick={leaveRoom}>Back to rooms</button></section>
  </main><aside className="desktop-marquee right"><div>YOUR<br />LUCK<br />AWAITS</div></aside></div>
}
