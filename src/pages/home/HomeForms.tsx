import { LoaderCircle, Play, Users } from 'lucide-react'

type SharedProps = {
  name: string
  setName: (name: string) => void
  busy: 'create' | 'join' | null
}

type JoinGameFormProps = SharedProps & {
  joinCode: string
  setJoinCode: (code: string) => void
  onJoin: () => void
}

export function JoinGameForm({ name, setName, joinCode, setJoinCode, busy, onJoin }: JoinGameFormProps) {
  return <article className="lobby-card join-card"><span className="eyebrow">JOIN A GAME</span><h2>Have a room code?</h2><p>The host approves every player before the match begins.</p><label>Your display name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} /></label><label>Room code<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} placeholder="ABC123" /></label><button className="secondary-wide" disabled={busy !== null || joinCode.length !== 6} onClick={onJoin}>{busy === 'join' ? <LoaderCircle className="spin" /> : <Users />} Request a seat</button></article>
}

type HostGameFormProps = SharedProps & {
  target: number
  setTarget: (score: number) => void
  onCreate: () => void
}

export function HostGameForm({ name, setName, target, setTarget, busy, onCreate }: HostGameFormProps) {
  return <article className="lobby-card"><span className="eyebrow">HOST A GAME</span><h2>Start a table</h2><label>Your display name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} /></label><span className="field-label">TARGET SCORE</span><div className="target-options">{[100, 200, 300].map((score) => <button key={score} className={target === score ? 'selected' : ''} onClick={() => setTarget(score)}>{score}</button>)}</div><label>Custom target (50–500)<input type="number" min="50" max="500" value={target} onChange={(e) => setTarget(Math.max(50, Math.min(500, Number(e.target.value))))} /></label><button className="primary-wide" disabled={busy !== null} onClick={onCreate}>{busy === 'create' ? <LoaderCircle className="spin" /> : <Play />} Create room</button></article>
}
