import type { Card } from './cards'

export type DemoStatus = 'active' | 'stayed' | 'frozen' | 'busted' | 'flip-seven'

export type DemoEntry = {
  instanceId: string
  card: Card
  voided: boolean
}

export type DemoSnapshot = {
  entries: DemoEntry[]
  status: DemoStatus
  flipThreeRemaining: number
  nextId: number
}

export type DemoState = DemoSnapshot & {
  past: DemoSnapshot[]
  future: DemoSnapshot[]
}

export type DemoAction =
  | { type: 'add'; card: Card }
  | { type: 'replace'; index: number; card: Card }
  | { type: 'remove'; index: number }
  | { type: 'reorder'; entries: DemoEntry[] }
  | { type: 'stay' }
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'redo' }

export type DemoDerived = {
  score: number
  numberCardCount: number
  flipSevenBonus: number
  secondChanceCount: number
  flipThreeRemaining: number
  canStay: boolean
}

export const demoInitialState = (): DemoState => ({ entries: [], status: 'active', flipThreeRemaining: 0, nextId: 1, past: [], future: [] })

export function activeDemoEntries(entries: DemoEntry[]) {
  return entries.filter((entry) => !entry.voided)
}

export function scoreDemoEntries(entries: DemoEntry[], status: DemoStatus = 'active') {
  if (status === 'busted') return 0
  const cards = activeDemoEntries(entries).map((entry) => entry.card)
  const numbers = cards.filter((card) => card.kind === 'number')
  const numberTotal = numbers.reduce((sum, card) => sum + (card.points ?? 0), 0)
  const modifiers = cards.filter((card) => card.kind === 'modifier' && card.id !== 'modifier-x2').reduce((sum, card) => sum + (card.points ?? 0), 0)
  const multiplier = cards.some((card) => card.id === 'modifier-x2') ? 2 : 1
  const flipSevenBonus = new Set(numbers.map((card) => card.id)).size >= 7 ? 15 : 0
  return numberTotal * multiplier + modifiers + flipSevenBonus
}

export function deriveDemoState(entries: DemoEntry[]): Pick<DemoSnapshot, 'entries' | 'status' | 'flipThreeRemaining'> {
  const nextEntries = entries.map((entry) => ({ ...entry, voided: false }))
  const evaluationEntries = [...nextEntries].sort((a, b) => Number(a.instanceId.replace('demo-card-', '')) - Number(b.instanceId.replace('demo-card-', '')))
  const seenNumbers = new Set<string>()
  let secondChanceCount = 0
  let flipThreeRemaining = 0
  let status: DemoStatus = 'active'

  for (const entry of evaluationEntries) {
    const { card } = entry
    const wasForcedCard = flipThreeRemaining > 0
    if (card.kind === 'action') {
      if (card.id === 'action-second-chance') secondChanceCount += 1
      if (card.id === 'action-flip-three') {
        if (wasForcedCard) flipThreeRemaining -= 1
        flipThreeRemaining += 3
      }
      if (card.id === 'action-freeze') {
        status = 'frozen'
        flipThreeRemaining = 0
      }
    } else if (card.kind === 'number') {
      if (seenNumbers.has(card.id)) {
        if (secondChanceCount > 0) {
          const consumedSecondChance = evaluationEntries.slice(0, evaluationEntries.indexOf(entry)).reverse().find((candidate) => !candidate.voided && candidate.card.id === 'action-second-chance')
          if (consumedSecondChance) consumedSecondChance.voided = true
          entry.voided = true
          secondChanceCount -= 1
        } else {
          status = 'busted'
          break
        }
      } else {
        seenNumbers.add(card.id)
        if (seenNumbers.size >= 7) {
          status = 'flip-seven'
          flipThreeRemaining = 0
          break
        }
      }
    }
    if (wasForcedCard && card.id !== 'action-flip-three' && status === 'active') flipThreeRemaining -= 1
  }

  return { entries: nextEntries, status, flipThreeRemaining }
}

export function demoDerived(state: DemoState): DemoDerived {
  const entries = activeDemoEntries(state.entries)
  const numbers = entries.filter((entry) => entry.card.kind === 'number')
  const secondChanceCount = entries.filter((entry) => entry.card.id === 'action-second-chance').length
  const flipSevenBonus = new Set(numbers.map((entry) => entry.card.id)).size >= 7 ? 15 : 0
  return { score: scoreDemoEntries(state.entries, state.status), numberCardCount: numbers.length, flipSevenBonus, secondChanceCount, flipThreeRemaining: state.flipThreeRemaining, canStay: state.status === 'active' && state.flipThreeRemaining === 0 && numbers.length >= 2 }
}

function snapshot(state: DemoState): DemoSnapshot {
  return { entries: state.entries, status: state.status, flipThreeRemaining: state.flipThreeRemaining, nextId: state.nextId }
}

function commit(state: DemoState, next: DemoSnapshot): DemoState {
  return { ...next, past: [...state.past, snapshot(state)], future: [] }
}

function rebuild(entries: DemoEntry[], nextId: number) {
  const derived = deriveDemoState(entries)
  return { ...derived, nextId }
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'reset') return demoInitialState()
  if (action.type === 'undo') {
    const previous = state.past[state.past.length - 1]
    return previous ? { ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future] } : state
  }
  if (action.type === 'redo') {
    const next = state.future[0]
    return next ? { ...next, past: [...state.past, snapshot(state)], future: state.future.slice(1) } : state
  }
  if (action.type === 'stay') {
    if (!demoDerived(state).canStay) return state
    return commit(state, { ...snapshot(state), status: 'stayed' })
  }
  if (action.type === 'remove') {
    if (state.status !== 'active' && state.status !== 'busted') return state
    if (!state.entries[action.index]) return state
    return commit(state, rebuild(state.entries.filter((_, index) => index !== action.index), state.nextId))
  }
  if (action.type === 'replace') {
    if (state.status !== 'active' && state.status !== 'busted') return state
    if (!state.entries[action.index]) return state
    const entries = state.entries.map((entry, index) => index === action.index ? { ...entry, card: action.card, voided: false } : entry)
    return commit(state, rebuild(entries, state.nextId))
  }
  if (action.type === 'reorder') {
    if (state.status !== 'active') return state
    return commit(state, { ...snapshot(state), entries: action.entries })
  }
  if (state.status !== 'active') return state
  const entry: DemoEntry = { instanceId: `demo-card-${state.nextId}`, card: action.card, voided: false }
  return commit(state, rebuild([...state.entries, entry], state.nextId + 1))
}
