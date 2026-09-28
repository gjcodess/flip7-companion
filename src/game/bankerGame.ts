import { demoDerived, demoInitialState, demoReducer, type DemoAction, type DemoState, type DemoStatus } from './demoGame'

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

export type BankerState = {
  phase: 'setup' | 'round' | 'results'
  targetScore: number
  roundNumber: number
  dealerId: string | null
  selectedPlayerId: string | null
  players: BankerPlayer[]
  history: BankerRoundResult[]
  winnerIds: string[]
}

export type BankerAction =
  | { type: 'start'; targetScore: number; names: string[] }
  | { type: 'select-player'; playerId: string }
  | { type: 'player'; playerId: string; action: DemoAction }
  | { type: 'move-player'; playerId: string; direction: -1 | 1 }
  | { type: 'advance-round' }
  | { type: 'reset' }

export const bankerInitialState = (): BankerState => ({
  phase: 'setup',
  targetScore: 200,
  roundNumber: 1,
  dealerId: null,
  selectedPlayerId: null,
  players: [],
  history: [],
  winnerIds: [],
})

export function bankerPlayerDerived(player: BankerPlayer) {
  return demoDerived(player.round)
}

export function isBankerTerminal(status: DemoStatus) {
  return status !== 'active'
}

export function allBankerPlayersSettled(state: BankerState) {
  return state.phase === 'round' && state.players.length > 0 && state.players.every((player) => isBankerTerminal(player.round.status))
}

function createPlayers(names: string[]): BankerPlayer[] {
  return names.map((name, index) => ({
    id: `banker-player-${index + 1}`,
    name,
    color: bankerPlayerColors[index % bankerPlayerColors.length],
    totalScore: 0,
    round: demoInitialState(),
  }))
}

export function bankerReducer(state: BankerState, action: BankerAction): BankerState {
  if (action.type === 'reset') return bankerInitialState()

  if (action.type === 'start') {
    const players = createPlayers(action.names)
    return {
      phase: 'round',
      targetScore: action.targetScore,
      roundNumber: 1,
      dealerId: players[0]?.id ?? null,
      selectedPlayerId: players[0]?.id ?? null,
      players,
      history: [],
      winnerIds: [],
    }
  }

  if (action.type === 'select-player') {
    if (!state.players.some((player) => player.id === action.playerId)) return state
    return { ...state, selectedPlayerId: action.playerId }
  }

  if (action.type === 'move-player') {
    if (state.players.length < 2) return state
    const index = state.players.findIndex((player) => player.id === action.playerId)
    const nextIndex = index + action.direction
    if (index < 0 || nextIndex < 0 || nextIndex >= state.players.length) return state
    const players = [...state.players]
    ;[players[index], players[nextIndex]] = [players[nextIndex], players[index]]
    return { ...state, players }
  }

  if (action.type === 'player') {
    if (state.phase !== 'round') return state
    const player = state.players.find((candidate) => candidate.id === action.playerId)
    if (!player) return state
    const nextRound = demoReducer(player.round, action.action)
    if (nextRound === player.round) return state
    return { ...state, players: state.players.map((candidate) => candidate.id === player.id ? { ...candidate, round: nextRound } : candidate) }
  }

  if (action.type === 'advance-round') {
    if (!allBankerPlayersSettled(state)) return state
    const scores = Object.fromEntries(state.players.map((player) => [player.id, bankerPlayerDerived(player).score]))
    const players = state.players.map((player) => ({ ...player, totalScore: player.totalScore + (scores[player.id] ?? 0) }))
    const history = [...state.history, { round: state.roundNumber, scores }]
    const reachedTarget = players.some((player) => player.totalScore >= state.targetScore)
    if (reachedTarget) {
      const highestScore = Math.max(...players.map((player) => player.totalScore))
      return { ...state, phase: 'results', players, history, winnerIds: players.filter((player) => player.totalScore === highestScore).map((player) => player.id) }
    }
    const dealerIndex = state.dealerId ? players.findIndex((player) => player.id === state.dealerId) : -1
    const nextDealer = players[(dealerIndex + 1 + players.length) % players.length]
    const nextPlayers = players.map((player) => ({ ...player, round: demoInitialState() }))
    return { ...state, players: nextPlayers, history, roundNumber: state.roundNumber + 1, dealerId: nextDealer?.id ?? players[0]?.id ?? null, selectedPlayerId: nextDealer?.id ?? players[0]?.id ?? null }
  }

  return state
}
