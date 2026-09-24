import { useEffect, useState } from 'react'
import { ArrowLeft, Crown, LoaderCircle, Play } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { approveRoomMember, getRoomSnapshot, leaveRoom as leaveRoomRpc, startMatch, type RoomSnapshot } from '../../lib/room'
import { supabase } from '../../lib/supabase'
import { RoomCode } from '../../components/RoomCode'
import { ResultsScreen } from '../results/ResultsScreen'
import { TablePreview } from '../game/TablePreview'

export function RoomScreen({ user, code, leaveRoom }: { user: User; code: string; leaveRoom: () => void }) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = async () => { try { setSnapshot(await getRoomSnapshot(code)); setError('') } catch (caught) { setError(caught instanceof Error ? caught.message : 'This room is unavailable.') } }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer) }, [code])
  useEffect(() => {
    if (!supabase || !snapshot) return
    const db = supabase
    let channel = db.channel(`room-${snapshot.room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${snapshot.room.id}` }, () => void refresh())
    if (snapshot.room.status === 'lobby') channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${snapshot.room.id}` }, () => void refresh())
    channel.subscribe()
    return () => { void db.removeChannel(channel) }
  }, [snapshot?.room.id, snapshot?.room.status])
  if (error) return <div className="simple-state"><p>{error}</p><button onClick={leaveRoom}>Back to rooms</button></div>
  if (!snapshot) return <div className="simple-state"><LoaderCircle className="spin" /><p>Setting the table…</p></div>
  const { room, members } = snapshot
  const me = members.find((member) => member.user_id === user.id)
  const host = room.host_user_id === user.id
  const approved = members.filter((member) => member.status === 'approved')
  const pending = members.filter((member) => member.status === 'pending')
  const hostName = members.find((member) => member.user_id === room.host_user_id)?.profiles?.display_name || 'Host'
  const quitRoom = async () => { setBusy(true); leaveRoom(); try { await leaveRoomRpc(room.id) } catch { /* Navigation already completed; cleanup can finish independently. */ } finally { setBusy(false) } }
  if (room.status === 'completed') return <ResultsScreen snapshot={snapshot} leaveRoom={leaveRoom} />
  if ((room.status === 'active' || room.status === 'round_review') && me?.status === 'approved') return <TablePreview roomCode={room.code} targetScore={room.target_score} hostName={hostName} hostUserId={room.host_user_id} roomId={room.id} user={user} onLeave={() => void quitRoom()} />
  const approve = async (member: string) => { setBusy(true); try { await approveRoomMember(room.id, member); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not approve that player.') } finally { setBusy(false) } }
  const begin = async () => { setBusy(true); try { await startMatch(room.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start the match.') } finally { setBusy(false) } }
  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell lobby-main">
    <header className="topbar"><button className="back-button" onClick={() => void quitRoom()} disabled={busy}><ArrowLeft size={18} /> Leave room</button><RoomCode code={room.code} /></header>
    <section className="room-hero"><span className="eyebrow">{room.status === 'lobby' ? 'LOBBY' : 'MATCH IN PROGRESS'}</span><h1>{room.status === 'lobby' ? 'Waiting for the table.' : 'The table is playing.'}</h1><p>First to <b>{room.target_score}</b> points · {approved.length} approved player{approved.length === 1 ? '' : 's'}</p>{room.status === 'lobby' && <small className="room-start-note">The game starts with at least 3 approved players.</small>}</section>
    <section className="room-share-card"><div><span className="eyebrow">ROOM CODE</span><p>Share this code with your players.</p></div><RoomCode code={room.code} /></section>
    <section className="members-card"><div className="members-heading"><div><span className="eyebrow">PLAYERS</span><h2>Seats at this table</h2></div><span className="seat-count">{approved.length}/18</span></div>
      {members.map((member) => <div className="member-row" key={member.user_id}><div className="mini-avatar" style={{ background: member.profiles?.avatar_color || '#57b8d7' }}>{member.profiles?.display_name?.[0] || '?'}</div><div><b>{member.profiles?.display_name || 'Player'} {member.user_id === user.id && '(me)'}</b><span>{member.role === 'host' ? 'Host' : member.status === 'pending' ? 'Waiting for host approval' : 'Ready'}</span></div>{member.role === 'host' ? <Crown size={18} /> : host && member.status === 'pending' ? <button className="approve-button" disabled={busy} onClick={() => void approve(member.user_id)}>Approve</button> : <span className={`member-status ${member.status}`}>{member.status}</span>}</div>)}
    </section>
    {host && room.status === 'lobby' && <section className="host-controls"><p>{pending.length ? `${pending.length} player${pending.length === 1 ? ' is' : 's are'} waiting for approval.` : approved.length < 3 ? 'Approve at least 3 players to begin.' : 'The table is ready.'}</p><button className="primary-wide" disabled={busy || approved.length < 3} onClick={() => void begin()}>{busy ? <LoaderCircle className="spin" /> : <Play />} Start match</button></section>}
    {room.status === 'round_review' && <section className="host-controls"><p>Everyone has confirmed. Preparing the next round…</p></section>}
    {!host && me?.status === 'pending' && <section className="host-controls"><p>Your seat request is waiting for {hostName}. This page refreshes automatically.</p></section>}
  </main><aside className="desktop-marquee right"><div>YOUR<br />LUCK<br />AWAITS</div></aside></div>
}
