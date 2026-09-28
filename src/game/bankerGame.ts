import { demoDerived, demoInitialState, demoReducer, type DemoAction, type DemoState, type DemoStatus } from './demoGame'
import type { Card } from './cards'

export const bankerPlayerColors = ['#ed4f7e', '#57b8d7', '#97c844', '#f7a235', '#9b7bd8', '#e78bba']

export type BankerPlayer = {
  id: string
  name: string
  color: string
  totalScore: number
  round: DemoState
}

export type BankerRoundResult = {
  round: number
  scores: Record<string, number>
}

export type BankerForcedTurn = {
  targetPlayerId: string
  remaining: number
  resumeAfterPlayerId: string
}

export type BankerSnapshot = {
  selectedPlayerId: string | null
  turnPlayerId: string | null
  roundFinisherId: string | null
  forcedTurns: BankerForcedTurn[]
  players: BankerPlayer[]
}

export type BankerState = {
  phase: 'setup' | 'round' | 'results'
  targetScore: number
  roundNumber: number
  /** Kept as a compatibility alias for the old Banker state shape. */
  dealerId: string | null
  selectedPlayerId: string | null
  turnPlayerId: string | null
  roundFinisherId: string | null
  forcedTurns: BankerForcedTurn[]
  players: BankerPlayer[]
  history: BankerRoundResult[]
  winnerIds: string[]
  past: BankerSnapshot[]
  future: BankerSnapshot[]
}

export type BankerAction =
  | { type: 'start'; targetScore: number; names: string[] }
  | { type: 'select-player'; playerId: string }
  /** Applies an intentional table correction without changing turn order. */
  | { type: 'player'; playerId: string; action: DemoAction }
  /** Records a newly flipped non-action card for the current Banker turn. */
  | { type: 'record-card'; playerId: string; card: Card }
  /** Records an action card after its active target has been selected. */
  | { type: 'record-action'; sourcePlayerId: string; targetPlayerId: string; card: Card }
  /** Banks the current turn player and advances normal play. */
  | { type: 'settle-player'; playerId: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'move-player'; playerId: string; direction: -1 | 1 }
  | { type: 'advance-round' }
  | { type: 'reset' }

export const bankerInitialState = (): BankerState => ({
  phase: 'setup', targetScore: 200, roundNumber: 1, dealerId: null,
  selectedPlayerId: null, turnPlayerId: null, roundFinisherId: null, forcedTurns: [],
  players: [], history: [], winnerIds: [],
  past: [], future: [],
})

export function bankerPlayerDerived(player: BankerPlayer) { return demoDerived(player.round) }
export function isBankerTerminal(status: DemoStatus) { return status !== 'active' }
export function allBankerPlayersSettled(state: BankerState) {
  return state.phase === 'round' && state.players.length > 0 && state.players.every((player) => isBankerTerminal(player.round.status))
}

function createPlayers(names: string[]): BankerPlayer[] {
  return names.map((name, index) => ({ id: `banker-player-${index + 1}`, name, color: bankerPlayerColors[index % bankerPlayerColors.length], totalScore: 0, round: demoInitialState() }))
}

function nextActivePlayerId(players: BankerPlayer[], afterPlayerId: string | null) {
  if (players.length === 0) return null
  const start = afterPlayerId ? players.findIndex((player) => player.id === afterPlayerId) : -1
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(start + offset + players.length) % players.length]
    if (candidate && !isBankerTerminal(candidate.round.status)) return candidate.id
  }
  return null
}

function currentTurnId(state: BankerState) { return state.forcedTurns[0]?.targetPlayerId ?? state.turnPlayerId }

function replacePlayerRound(players: BankerPlayer[], playerId: string, round: DemoState) {
  return players.map((player) => player.id === playerId ? { ...player, round } : player)
}

function bankerSnapshot(state: BankerState): BankerSnapshot {
  return { selectedPlayerId: state.selectedPlayerId, turnPlayerId: state.turnPlayerId, roundFinisherId: state.roundFinisherId, forcedTurns: state.forcedTurns, players: state.players }
}

function commitBankerState(previous: BankerState, next: BankerState): BankerState {
  return { ...next, past: [...previous.past, bankerSnapshot(previous)], future: [] }
}

function undoBankerState(state: BankerState): BankerState {
  const previous = state.past[state.past.length - 1]
  if (!previous) return state
  return { ...state, ...previous, past: state.past.slice(0, -1), future: [bankerSnapshot(state), ...state.future] }
}

function redoBankerState(state: BankerState): BankerState {
  const next = state.future[0]
  if (!next) return state
  return { ...state, ...next, past: [...state.past, bankerSnapshot(state)], future: state.future.slice(1) }
}

function forceBankActivePlayers(players: BankerPlayer[], preservePlayerId: string) {
  return players.map((player) => player.id !== preservePlayerId && player.round.status === 'active' ? { ...player, round: { ...player.round, status: 'stayed' as const } } : player)
}

function normalizeForcedTurns(state: BankerState, players: BankerPlayer[], forcedTurns: BankerForcedTurn[]) {
  let remainingTurns = [...forcedTurns]
  let resumeAfterPlayerId: string | null = null
  while (remainingTurns.length > 0) {
    const current = remainingTurns[0]
    const target = players.find((player) => player.id === current.targetPlayerId)
    if (target && !isBankerTerminal(target.round.status) && current.remaining > 0) break
    resumeAfterPlayerId = current.resumeAfterPlayerId
    remainingTurns = remainingTurns.slice(1)
  }
  if (remainingTurns.length > 0) return { players, forcedTurns: remainingTurns, turnPlayerId: remainingTurns[0].targetPlayerId }
  return { players, forcedTurns: [], turnPlayerId: nextActivePlayerId(players, resumeAfterPlayerId ?? state.turnPlayerId) }
}

function completeCardTurn(state: BankerState, players: BankerPlayer[], sourcePlayerId: string, forcedTurns: BankerForcedTurn[]) {
  const source = players.find((player) => player.id === sourcePlayerId)
  if (!source) return state
  if (source.round.status === 'flip-seven') {
    return { ...state, players: forceBankActivePlayers(players, sourcePlayerId), turnPlayerId: sourcePlayerId, forcedTurns: [], selectedPlayerId: sourcePlayerId, roundFinisherId: sourcePlayerId }
  }
  const normalized = normalizeForcedTurns(state, players, forcedTurns)
  return { ...state, players: normalized.players, forcedTurns: normalized.forcedTurns, turnPlayerId: normalized.turnPlayerId, selectedPlayerId: normalized.turnPlayerId, roundFinisherId: sourcePlayerId }
}

function validActiveTarget(state: BankerState, playerId: string) {
  const player = state.players.find((candidate) => candidate.id === playerId)
  return player && player.round.status === 'active' ? player : null
}

export function bankerReducer(state: BankerState, action: BankerAction): BankerState {
  if (action.type === 'reset') return bankerInitialState()
  if (action.type === 'undo') return undoBankerState(state)
  if (action.type === 'redo') return redoBankerState(state)

  if (action.type === 'start') {
    const players = createPlayers(action.names)
    const firstPlayerId = players[0]?.id ?? null
    return { phase: 'round', targetScore: action.targetScore, roundNumber: 1, dealerId: firstPlayerId, selectedPlayerId: firstPlayerId, turnPlayerId: firstPlayerId, roundFinisherId: null, forcedTurns: [], players, history: [], winnerIds: [], past: [], future: [] }
  }

  if (action.type === 'select-player') {
    return state.players.some((player) => player.id === action.playerId) ? { ...state, selectedPlayerId: action.playerId } : state
  }

  if (action.type === 'move-player') {
    if (state.players.length < 2) return state
    const index = state.players.findIndex((player) => player.id === action.playerId)
    const nextIndex = index + action.direction
    if (index < 0 || nextIndex < 0 || nextIndex >= state.players.length) return state
    const players = [...state.players]; [players[index], players[nextIndex]] = [players[nextIndex], players[index]]
    return { ...state, players }
  }

  if (action.type === 'player') {
    if (state.phase !== 'round') return state
    if (action.action.type === 'undo') return undoBankerState(state)
    if (action.action.type === 'redo') return redoBankerState(state)
    const player = state.players.find((candidate) => candidate.id === action.playerId)
    if (!player) return state
    const nextRound = demoReducer(player.round, action.action)
    if (nextRound === player.round) return state
    const players = replacePlayerRound(state.players, player.id, nextRound)
    if (state.forcedTurns.length === 0) return commitBankerState(state, { ...state, players })
    const normalized = normalizeForcedTurns(state, players, state.forcedTurns)
    const forcedTargetRemainsValid = normalized.forcedTurns[0]?.targetPlayerId === state.forcedTurns[0]?.targetPlayerId
    return commitBankerState(state, { ...state, ...normalized, selectedPlayerId: forcedTargetRemainsValid ? state.selectedPlayerId : normalized.turnPlayerId })
  }

  if (action.type === 'record-card') {
    if (state.phase !== 'round' || currentTurnId(state) !== action.playerId) return state
    const player = state.players.find((candidate) => candidate.id === action.playerId)
    if (!player || player.round.status !== 'active' || action.card.kind === 'action') return state
    const nextRound = demoReducer(player.round, { type: 'add', card: action.card })
    if (nextRound === player.round) return state
    const players = replacePlayerRound(state.players, player.id, nextRound)
    const forcedTurns = state.forcedTurns.length > 0 ? [{ ...state.forcedTurns[0], remaining: state.forcedTurns[0].remaining - 1 }, ...state.forcedTurns.slice(1)] : state.forcedTurns
    return commitBankerState(state, completeCardTurn({ ...state, players }, players, player.id, forcedTurns))
  }

  if (action.type === 'record-action') {
    if (state.phase !== 'round' || currentTurnId(state) !== action.sourcePlayerId || action.card.kind !== 'action') return state
    const source = state.players.find((player) => player.id === action.sourcePlayerId)
    const target = validActiveTarget(state, action.targetPlayerId)
    if (!source || !target) return state
    const targetRound = demoReducer(target.round, { type: 'add', card: action.card })
    if (targetRound === target.round) return state
    let players = replacePlayerRound(state.players, target.id, targetRound)
    let forcedTurns = state.forcedTurns
    if (forcedTurns.length > 0) {
      if (source.id !== target.id) {
        const consumedSource = demoReducer(source.round, { type: 'consume-flip-three' })
        players = replacePlayerRound(players, source.id, consumedSource)
      }
      forcedTurns = [{ ...forcedTurns[0], remaining: forcedTurns[0].remaining - 1 }, ...forcedTurns.slice(1)]
    }
    if (action.card.id === 'action-flip-three' && target.round.status === 'active') {
      const parentResumeId = forcedTurns[0]?.resumeAfterPlayerId ?? action.sourcePlayerId
      forcedTurns = [{ targetPlayerId: target.id, remaining: 3, resumeAfterPlayerId: parentResumeId }, ...forcedTurns]
    }
    const nextState = { ...state, players, roundFinisherId: target.id }
    const completed = completeCardTurn(nextState, players, action.sourcePlayerId, forcedTurns)
    return commitBankerState(state, { ...completed, roundFinisherId: target.id })
  }

  if (action.type === 'settle-player') {
    if (state.phase !== 'round' || currentTurnId(state) !== action.playerId || state.forcedTurns.length > 0) return state
    const player = state.players.find((candidate) => candidate.id === action.playerId)
    if (!player || player.round.status !== 'active') return state
    const nextRound = demoReducer(player.round, { type: 'stay' })
    if (nextRound === player.round) return state
    const players = replacePlayerRound(state.players, player.id, nextRound)
    const nextPlayerId = nextActivePlayerId(players, player.id)
    return commitBankerState(state, { ...state, players, turnPlayerId: nextPlayerId, selectedPlayerId: nextPlayerId, roundFinisherId: player.id })
  }

  if (action.type === 'advance-round') {
    if (!allBankerPlayersSettled(state)) return state
    const scores = Object.fromEntries(state.players.map((player) => [player.id, bankerPlayerDerived(player).score]))
    const players = state.players.map((player) => ({ ...player, totalScore: player.totalScore + (scores[player.id] ?? 0) }))
    const history = [...state.history, { round: state.roundNumber, scores }]
    const reachedTarget = players.some((player) => player.totalScore >= state.targetScore)
    if (reachedTarget) {
      const highestScore = Math.max(...players.map((player) => player.totalScore))
      return { ...state, phase: 'results', players, history, winnerIds: players.filter((player) => player.totalScore === highestScore).map((player) => player.id), forcedTurns: [], past: [], future: [] }
    }
    const starterId = state.roundFinisherId && players.some((player) => player.id === state.roundFinisherId) ? state.roundFinisherId : players[0]?.id ?? null
    const nextPlayers = players.map((player) => ({ ...player, round: demoInitialState() }))
    return { ...state, players: nextPlayers, history, roundNumber: state.roundNumber + 1, dealerId: starterId, turnPlayerId: starterId, roundFinisherId: null, forcedTurns: [], selectedPlayerId: starterId, past: [], future: [] }
  }

  return state
}
