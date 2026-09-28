import { useEffect, useRef, useState } from 'react'
import { Crown, LoaderCircle, LogOut, Play } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { approveRoomMember, DEGRADED_REFRESH_INTERVAL_MS, getRoomSnapshot, HEALTHY_REFRESH_INTERVAL_MS, leaveRoom as leaveRoomRpc, REALTIME_INVALIDATION_DEBOUNCE_MS, startMatch, type RoomSnapshot } from '../../lib/room'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/app-utils'
import { RoomCode } from '../../components/RoomCode'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { useAppNavigation, useNavigationGuard } from '../../lib/navigation'
import { ResultsScreen } from '../results/ResultsScreen'
import { TablePreview } from '../game/TablePreview'

export function RoomScreen({ user, code }: { user: User; code: string }) {
  const navigate = useAppNavigation()
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [startPromptOpen, setStartPromptOpen] = useState(false)
  const [leavePromptOpen, setLeavePromptOpen] = useState(false)
  const [realtimeHealthy, setRealtimeHealthy] = useState(false)
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
  const timerCodeRef = useRef<string | undefined>(undefined)
  const refresh = async () => {
    if (document.visibilityState !== 'visible') return
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }
    refreshInFlightRef.current = true
    try { setSnapshot(await getRoomSnapshot(code)); setError('') } catch (caught) { setError(caught instanceof Error ? caught.message : 'This room is unavailable.') }
    finally {
      refreshInFlightRef.current = false
      if (refreshQueuedRef.current && document.visibilityState === 'visible') {
        refreshQueuedRef.current = false
        void refresh()
      } else refreshQueuedRef.current = false
    }
  }
  useEffect(() => {
    let timer: number | undefined
    const startPolling = () => {
      if (timer !== undefined || document.visibilityState !== 'visible') return
      timer = window.setInterval(() => void refresh(), realtimeHealthy ? HEALTHY_REFRESH_INTERVAL_MS : DEGRADED_REFRESH_INTERVAL_MS)
    }
    const stopPolling = () => {
      if (timer === undefined) return
      window.clearInterval(timer)
      timer = undefined
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
        startPolling()
      } else {
        stopPolling()
      }
    }
    const codeChanged = timerCodeRef.current !== code
    timerCodeRef.current = code
    if (codeChanged && document.visibilityState === 'visible') void refresh()
    startPolling()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { stopPolling(); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [code, realtimeHealthy])
  useEffect(() => {
    if (!supabase || !snapshot) return
    const db = supabase
    let refreshTimer: number | undefined
    let disposed = false
    let shouldRefreshAfterSubscribe = false
    setRealtimeHealthy(false)
    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => { refreshTimer = undefined; void refresh() }, REALTIME_INVALIDATION_DEBOUNCE_MS)
    }
    let channel = db.channel(`room-${snapshot.room.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${snapshot.room.id}` }, scheduleRefresh)
    if (snapshot.room.status === 'lobby') channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${snapshot.room.id}` }, scheduleRefresh)
    channel.subscribe((status) => {
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        setRealtimeHealthy(true)
        if (shouldRefreshAfterSubscribe) {
          shouldRefreshAfterSubscribe = false
          scheduleRefresh()
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        shouldRefreshAfterSubscribe = true
        setRealtimeHealthy(false)
      }
    })
    return () => {
      disposed = true
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      void db.removeChannel(channel)
    }
  }, [snapshot?.room.id, snapshot?.room.status])
  useNavigationGuard(snapshot && snapshot.room.status !== 'completed' ? {
    eyebrow: snapshot.room.status === 'lobby' ? 'LEAVE LOBBY' : 'LEAVE MATCH',
    title: 'Leave this table?',
    message: snapshot.room.status === 'lobby'
      ? 'You are navigating away from the lobby. Your seat remains until you explicitly choose Leave table.'
      : 'You are navigating away from the live table. Your room and scores remain available if you return; use Leave table to remove your seat.',
    confirmLabel: 'Continue away',
    cancelLabel: 'Stay here',
    shouldBlock: () => true,
  } : null)
  const requestLeave = () => {
    if (error || !snapshot) { navigate('/landing', { replace: true }); return }
    setLeavePromptOpen(true)
  }
  const confirmExplicitLeave = async () => {
    if (!snapshot || busy) return
    setBusy(true)
    try {
      await withTimeout(leaveRoomRpc(snapshot.room.id), 'Leaving the room took too long. Please try again.')
      setLeavePromptOpen(false)
      navigate('/landing', { replace: true, skipGuard: true })
    } catch (caught) {
      setLeavePromptOpen(false)
      setError(caught instanceof Error ? caught.message : 'Could not leave this room.')
    } finally {
      setBusy(false)
    }
  }
  if (error) return <div className="simple-state"><p>{error}</p><button onClick={requestLeave}>Back to rooms</button></div>
  if (!snapshot) return <div className="simple-state"><LoaderCircle className="spin" /><p>Setting the table…</p></div>
  const { room, members } = snapshot
  const me = members.find((member) => member.user_id === user.id)
  const host = room.host_user_id === user.id
  const approved = members.filter((member) => member.status === 'approved')
  const pending = members.filter((member) => member.status === 'pending')
  const hostName = members.find((member) => member.user_id === room.host_user_id)?.profiles?.display_name || 'Host'
  if (room.status === 'completed') return <ResultsScreen snapshot={snapshot} leaveRoom={requestLeave} />
  if ((room.status === 'active' || room.status === 'round_review') && me?.status === 'approved') return <TablePreview roomCode={room.code} targetScore={room.target_score} hostName={hostName} hostUserId={room.host_user_id} roomId={room.id} user={user} onLeave={requestLeave} />
  const approve = async (member: string) => { setBusy(true); try { await approveRoomMember(room.id, member); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not approve that player.') } finally { setBusy(false) } }
  const begin = async () => { setBusy(true); try { await startMatch(room.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start the match.') } finally { setBusy(false) } }
  return <div className="app-shell lobby-shell"><aside className="desktop-marquee left"><div>FLIP<br />7</div></aside><main className="game-shell lobby-main">
    <header className="topbar"><img className="brand-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /><button className="account-pill room-leave-button" onClick={requestLeave} disabled={busy}><LogOut size={15} /> Exit</button></header>
    <section className="room-hero"><span className="eyebrow">{room.status === 'lobby' ? 'LOBBY' : 'MATCH IN PROGRESS'}</span><h1>{room.status === 'lobby' ? 'Waiting for the table.' : 'The table is playing.'}</h1><p>First to <b>{room.target_score}</b> points · {approved.length} approved player{approved.length === 1 ? '' : 's'}</p>{room.status === 'lobby' && <small className="room-start-note">The game starts with at least 3 approved players.</small>}</section>
    <section className="room-share-card"><div><span className="eyebrow">ROOM CODE</span><p>Share this code with your players.</p></div><RoomCode code={room.code} /></section>
    <section className="members-card"><div className="members-heading"><div><span className="eyebrow">PLAYERS</span><h2>Seats at this table</h2></div><span className="seat-count">{approved.length}/18</span></div>
      {members.map((member) => <div className="member-row" key={member.user_id}><div className="mini-avatar" style={{ background: member.profiles?.avatar_color || '#57b8d7' }}>{member.profiles?.display_name?.[0] || '?'}</div><div><b>{member.profiles?.display_name || 'Player'} {member.user_id === user.id && '(me)'}</b><span>{member.role === 'host' ? 'Host' : member.status === 'pending' ? 'Waiting for host approval' : member.status === 'left' ? 'Left the table' : member.status === 'removed' ? 'Removed from the table' : 'Ready'}</span></div>{member.role === 'host' ? <Crown size={18} /> : host && member.status === 'pending' ? <button className="approve-button" disabled={busy} onClick={() => void approve(member.user_id)}>Approve</button> : <span className={`member-status ${member.status}`}>{member.status}</span>}</div>)}
    </section>
    {host && room.status === 'lobby' && <section className="host-controls"><p>{pending.length ? `${pending.length} player${pending.length === 1 ? ' is' : 's are'} waiting for approval.` : approved.length < 3 ? 'Approve at least 3 players to begin.' : 'The table is ready.'}</p><button className="primary-wide" disabled={busy || approved.length < 3} onClick={() => setStartPromptOpen(true)}>{busy ? <LoaderCircle className="spin" /> : <Play />} Start match</button></section>}
    {room.status === 'round_review' && <section className="host-controls"><p>Everyone has confirmed. Preparing the next round…</p></section>}
    {!host && me?.status === 'pending' && <section className="host-controls"><p>Your seat request is waiting for {hostName}. This page refreshes automatically.</p></section>}
  </main><aside className="desktop-marquee right"><div>YOUR<br />LUCK<br />AWAITS</div></aside>{startPromptOpen && <ConfirmationModal eyebrow="START MATCH" title="Start the match?" message={`This will begin the ${room.target_score}-point match for all ${approved.length} approved players.`} cancelLabel="Not yet" confirmLabel="Start match" confirming={busy} onCancel={() => { if (!busy) setStartPromptOpen(false) }} onConfirm={() => { setStartPromptOpen(false); void begin() }} />}{leavePromptOpen && <ConfirmationModal eyebrow="LEAVE ROOM" title="Leave this table?" message={room.status === 'lobby' ? 'You will lose your seat in this room. If you are the host, another approved player may become host.' : 'Leaving freezes and confirms your current round, removes you from the match, and may transfer host duties.'} cancelLabel="Stay here" confirmLabel="Leave table" confirming={busy} onCancel={() => { if (!busy) setLeavePromptOpen(false) }} onConfirm={() => void confirmExplicitLeave()} />}</div>
}
