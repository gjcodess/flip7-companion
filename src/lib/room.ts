import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Room = {
  id: string
  code: string
  host_user_id: string
  target_score: number
  status: 'lobby' | 'active' | 'round_review' | 'completed' | 'abandoned'
  round_number: number
}

export type Member = {
  room_id: string
  user_id: string
  role: 'host' | 'player'
  status: 'pending' | 'approved' | 'removed' | 'left'
  final_score: number | null
  profiles: { display_name: string; avatar_color: string } | null
}

export type RoomSnapshot = { room: Room; members: Member[] }

export type RoundCard = { id: string; round_player_id: string; card_code: string; sequence: number; voided_at: string | null }
export type RoundPlayer = {
  id: string; user_id: string; status: 'active' | 'stayed' | 'busted' | 'frozen'; round_score: number; total_score: number; confirmed_at: string | null
  profiles: { display_name: string; avatar_color: string } | null
}
export type LiveRound = { id: string; number: number; status: 'active' | 'review' | 'finalized'; players: RoundPlayer[]; cards: RoundCard[] }

function client() {
  if (!supabase) throw new Error('Supabase configuration is missing.')
  return supabase
}

export async function signInAsGuest(displayName: string) {
  const { data, error } = await client().auth.signInAnonymously({
    options: { data: { display_name: displayName.trim() || 'Guest' } },
  })
  if (error) throw error
  return data.user
}

export async function createPasswordAccount(displayName: string, email: string, password: string) {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName.trim() || 'Player' } },
  })
  if (error) throw error
  return data.user
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
  return data.user
}

export async function createRoom(targetScore: number, displayName: string) {
  const { data, error } = await client().rpc('create_room', { p_target_score: targetScore, p_display_name: displayName })
  if (error) throw new Error(error.message || JSON.stringify(error))
  if (!data) throw new Error('The room was not returned by Supabase.')
  return data as Room
}

export async function requestRoomJoin(code: string, displayName: string) {
  const { data, error } = await client().rpc('request_room_join', { p_room_code: code.toUpperCase(), p_display_name: displayName })
  if (error) throw new Error(error.message || JSON.stringify(error))
  if (!data) throw new Error('The room was not returned by Supabase.')
  return data as Room
}

export async function leaveRoom(roomId: string) {
  const { error } = await client().rpc('leave_room', { p_room_id: roomId })
  if (error) throw new Error(error.message)
}

export async function getRoomSnapshot(roomCode: string): Promise<RoomSnapshot> {
  const db = client()
  const { data: room, error: roomError } = await db
    .from('rooms')
    .select('id, code, host_user_id, target_score, status, round_number')
    .eq('code', roomCode.toUpperCase())
    .single()
  if (roomError) throw new Error(roomError.message || JSON.stringify(roomError))

  const { data: members, error: membersError } = await db
    .from('room_members')
    .select('room_id, user_id, role, status, final_score, profiles(display_name, avatar_color)')
    .eq('room_id', room.id)
    .order('joined_at')
  if (membersError) throw new Error(membersError.message || JSON.stringify(membersError))
  return { room: room as Room, members: members as unknown as Member[] }
}

export async function approveRoomMember(roomId: string, userId: string) {
  const { error } = await client().rpc('approve_room_member', { p_room_id: roomId, p_user_id: userId })
  if (error) throw error
}

export async function startMatch(roomId: string) {
  const { error } = await client().rpc('start_match', { p_room_id: roomId })
  if (error) throw error
}

export async function getLiveRound(roomId: string): Promise<LiveRound | null> {
  const db = client()
  const { data: round, error: roundError } = await db.from('game_rounds').select('id, number, status').eq('room_id', roomId).order('number', { ascending: false }).limit(1).maybeSingle()
  if (roundError) throw new Error(roundError.message)
  if (!round) return null
  const { data: players, error: playersError } = await db.from('round_players').select('id, user_id, status, round_score, total_score, confirmed_at, profiles(display_name, avatar_color)').eq('round_id', round.id)
  if (playersError) throw new Error(playersError.message)
  const ids = (players ?? []).map((player) => player.id)
  const { data: cards, error: cardsError } = ids.length
    ? await db.from('round_cards').select('id, round_player_id, card_code, sequence, voided_at').in('round_player_id', ids).is('voided_at', null).order('sequence')
    : { data: [], error: null }
  if (cardsError) throw new Error(cardsError.message)
  return { ...round, players: players as unknown as RoundPlayer[], cards: cards as RoundCard[] }
}

export async function recordRoundCard(roomId: string, cardCode: string, targetUserId?: string, confirmBust = false) {
  const { data, error } = await client().rpc('record_round_card', { p_room_id: roomId, p_card_code: cardCode, p_target_user_id: targetUserId ?? null, p_confirm_bust: confirmBust, p_client_event_id: crypto.randomUUID() })
  if (error) throw new Error(error.message)
  return data as { needs_bust_confirmation: boolean; card_code?: string }
}

export async function voidRoundCard(roomId: string, cardId: string) {
  const { error } = await client().rpc('void_round_card', { p_room_id: roomId, p_card_id: cardId, p_client_event_id: crypto.randomUUID() })
  if (error) throw new Error(error.message)
}

export async function stayInRound(roomId: string) {
  const { error } = await client().rpc('stay_in_round', { p_room_id: roomId, p_client_event_id: crypto.randomUUID() })
  if (error) throw new Error(error.message)
}

export async function cancelStay(roomId: string) {
  const { error } = await client().rpc('cancel_stay', { p_room_id: roomId, p_client_event_id: crypto.randomUUID() })
  if (error) throw new Error(error.message)
}

export async function confirmRoundResult(roomId: string) {
  const { error } = await client().rpc('confirm_round_result', { p_room_id: roomId, p_client_event_id: crypto.randomUUID() })
  if (error) throw new Error(error.message)
}

export async function finalizeRound(roomId: string) {
  const { error } = await client().rpc('finalize_round', { p_room_id: roomId, p_client_event_id: crypto.randomUUID() })
  if (error) throw new Error(error.message)
}

export async function heartbeatRoom(roomId: string) {
  await client().rpc('heartbeat_room', { p_room_id: roomId })
  await client().rpc('transfer_host_if_stale', { p_room_id: roomId, p_client_event_id: crypto.randomUUID() })
}

export async function updateProfile(displayName: string) {
  const { data: { user } } = await client().auth.getUser()
  if (!user) return
  const { error } = await client().from('profiles').update({ display_name: displayName.trim() || 'Player' }).eq('id', user.id)
  if (error) throw error
}

export async function currentUser(): Promise<User | null> {
  const { data } = await client().auth.getUser()
  return data.user
}
