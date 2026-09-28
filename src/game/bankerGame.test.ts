import { describe, expect, it } from 'vitest'
import { pickerCards, type Card } from './cards'
import { bankerInitialState, bankerReducer, type BankerState } from './bankerGame'

const card = (id: string) => {
  const found = pickerCards.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing card ${id}`)
  return found
}

const numberCard = (value: number) => card(`number-${value}`)
const secondChance = () => card('action-second-chance')
const freeze = () => card('action-freeze')
const flipThree = () => card('action-flip-three')

function start(names = ['Ana', 'Ben', 'Cy']) {
  return bankerReducer(bankerInitialState(), { type: 'start', targetScore: 200, names })
}

function record(state: BankerState, playerId: string, nextCard: Card) {
  return bankerReducer(state, { type: 'record-card', playerId, card: nextCard })
}

function action(state: BankerState, sourcePlayerId: string, targetPlayerId: string, nextCard: Card) {
  return bankerReducer(state, { type: 'record-action', sourcePlayerId, targetPlayerId, card: nextCard })
}

describe('Banker turn progression', () => {
  it('advances through the configured order and skips terminal tables', () => {
    let state = start()
    state = record(state, 'banker-player-1', numberCard(1))
    expect(state.turnPlayerId).toBe('banker-player-2')
    state = record(state, 'banker-player-2', numberCard(2))
    state = record(state, 'banker-player-3', numberCard(5))
    state = record(state, 'banker-player-1', numberCard(6))
    state = record(state, 'banker-player-2', numberCard(2))
    expect(state.players.find((player) => player.id === 'banker-player-2')?.round.status).toBe('busted')
    expect(state.turnPlayerId).toBe('banker-player-3')
  })

  it('keeps corrections and manual table browsing separate from the turn cursor', () => {
    let state = start()
    state = record(state, 'banker-player-1', numberCard(1))
    const turnBeforeView = state.turnPlayerId
    state = bankerReducer(state, { type: 'select-player', playerId: 'banker-player-3' })
    state = bankerReducer(state, { type: 'player', playerId: 'banker-player-3', action: { type: 'add', card: numberCard(9) } })
    expect(state.selectedPlayerId).toBe('banker-player-3')
    expect(state.turnPlayerId).toBe(turnBeforeView)
  })

  it('restores the turn cursor when undoing and redoing a card', () => {
    let state = record(start(), 'banker-player-1', numberCard(1))
    expect(state.turnPlayerId).toBe('banker-player-2')
    state = bankerReducer(state, { type: 'undo' })
    expect(state.turnPlayerId).toBe('banker-player-1')
    expect(state.players[0].round.entries).toHaveLength(0)
    state = bankerReducer(state, { type: 'redo' })
    expect(state.turnPlayerId).toBe('banker-player-2')
    expect(state.players[0].round.entries.map((entry) => entry.card.id)).toEqual(['number-1'])
  })

  it('restores the full Flip Three queue when undoing and redoing its assignment', () => {
    let state = action(start(), 'banker-player-1', 'banker-player-2', flipThree())
    expect(state.forcedTurns[0]?.targetPlayerId).toBe('banker-player-2')
    state = bankerReducer(state, { type: 'undo' })
    expect(state.forcedTurns).toHaveLength(0)
    expect(state.turnPlayerId).toBe('banker-player-1')
    state = bankerReducer(state, { type: 'redo' })
    expect(state.forcedTurns[0]).toMatchObject({ targetPlayerId: 'banker-player-2', remaining: 3 })
  })

  it('rejects action cards targeted at terminal tables', () => {
    let state = start()
    state = bankerReducer(state, { type: 'player', playerId: 'banker-player-2', action: { type: 'add', card: numberCard(2) } })
    state = bankerReducer(state, { type: 'player', playerId: 'banker-player-2', action: { type: 'add', card: numberCard(3) } })
    state = bankerReducer(state, { type: 'player', playerId: 'banker-player-2', action: { type: 'stay' } })
    const unchanged = action(state, 'banker-player-1', 'banker-player-2', secondChance())
    expect(unchanged).toBe(state)
  })

  it('assigns Second Chance to an active target and advances from the source', () => {
    const state = action(start(), 'banker-player-1', 'banker-player-3', secondChance())
    expect(state.players[2].round.entries.map((entry) => entry.card.id)).toEqual(['action-second-chance'])
    expect(state.turnPlayerId).toBe('banker-player-2')
  })

  it('freezes the target and skips it in the next normal turn', () => {
    const state = action(start(), 'banker-player-1', 'banker-player-2', freeze())
    expect(state.players[1].round.status).toBe('frozen')
    expect(state.turnPlayerId).toBe('banker-player-3')
  })

  it('routes Flip Three cards one by one, then resumes after the source player', () => {
    let state = action(start(), 'banker-player-1', 'banker-player-2', flipThree())
    expect(state.forcedTurns[0]).toMatchObject({ targetPlayerId: 'banker-player-2', remaining: 3, resumeAfterPlayerId: 'banker-player-1' })
    state = record(state, 'banker-player-2', numberCard(1))
    state = record(state, 'banker-player-2', numberCard(2))
    state = record(state, 'banker-player-2', numberCard(3))
    expect(state.forcedTurns).toHaveLength(0)
    expect(state.turnPlayerId).toBe('banker-player-2')
  })

  it('stops a Flip Three sequence when the target busts', () => {
    let state = action(start(), 'banker-player-1', 'banker-player-2', flipThree())
    state = record(state, 'banker-player-2', numberCard(4))
    state = record(state, 'banker-player-2', numberCard(4))
    expect(state.players[1].round.status).toBe('busted')
    expect(state.forcedTurns).toHaveLength(0)
    expect(state.turnPlayerId).toBe('banker-player-3')
  })

  it('resolves a nested Flip Three before returning to the parent sequence', () => {
    let state = action(start(), 'banker-player-1', 'banker-player-2', flipThree())
    state = action(state, 'banker-player-2', 'banker-player-3', flipThree())
    expect(state.forcedTurns[0]).toMatchObject({ targetPlayerId: 'banker-player-3', remaining: 3 })
    state = record(state, 'banker-player-3', numberCard(1))
    state = record(state, 'banker-player-3', numberCard(2))
    state = record(state, 'banker-player-3', numberCard(3))
    expect(state.forcedTurns[0]).toMatchObject({ targetPlayerId: 'banker-player-2', remaining: 2 })
  })

  it('ends the round on Flip 7 and banks all other active tables', () => {
    let state = start()
    for (let value = 0; value < 7; value += 1) {
      state = record(state, 'banker-player-1', numberCard(value))
      if (value < 6) {
        state = record(state, 'banker-player-2', numberCard(value))
        state = record(state, 'banker-player-3', numberCard(value))
      }
    }
    expect(state.players[0].round.status).toBe('flip-seven')
    expect(state.players[1].round.status).toBe('stayed')
    expect(state.players[2].round.status).toBe('stayed')
    expect(state.roundFinisherId).toBe('banker-player-1')
  })

  it('starts the next round with the most recent round finisher', () => {
    let state = start(['Ana', 'Ben'])
    state = record(state, 'banker-player-1', numberCard(1))
    state = record(state, 'banker-player-2', numberCard(2))
    state = record(state, 'banker-player-1', numberCard(3))
    state = record(state, 'banker-player-2', numberCard(4))
    state = bankerReducer(state, { type: 'settle-player', playerId: 'banker-player-1' })
    state = bankerReducer(state, { type: 'settle-player', playerId: 'banker-player-2' })
    expect(state.roundFinisherId).toBe('banker-player-2')
    state = bankerReducer(state, { type: 'advance-round' })
    expect(state.roundNumber).toBe(2)
    expect(state.turnPlayerId).toBe('banker-player-2')
    expect(state.selectedPlayerId).toBe('banker-player-2')
  })
})
