export type CardKind = 'number' | 'modifier' | 'action'

export type Card = {
  id: string
  label: string
  kind: CardKind
  points?: number
  image?: string
}

const numberCards: Card[] = Array.from({ length: 13 }, (_, value) => ({
  id: `number-${value}`,
  label: String(value),
  kind: 'number' as const,
  points: value,
  image: `/cards/${value}.png`,
}))

export const pickerCards: Card[] = [
  ...numberCards,
  { id: 'action-second-chance', label: 'Second Chance', kind: 'action', image: '/cards/SECOND CHANCE.png' },
  { id: 'action-freeze', label: 'Freeze', kind: 'action', image: '/cards/FREEZE.png' },
  { id: 'action-flip-three', label: 'Flip Three', kind: 'action', image: '/cards/FLIP THREE.png' },
  { id: 'modifier-x2', label: '×2', kind: 'modifier', image: '/cards/x2.png' },
  { id: 'modifier-plus-2', label: '+2', kind: 'modifier', points: 2, image: '/cards/+2.png' },
  { id: 'modifier-plus-4', label: '+4', kind: 'modifier', points: 4, image: '/cards/+4.png' },
  { id: 'modifier-plus-6', label: '+6', kind: 'modifier', points: 6, image: '/cards/+6.png' },
  { id: 'modifier-plus-8', label: '+8', kind: 'modifier', points: 8, image: '/cards/+8.png' },
  { id: 'modifier-plus-10', label: '+10', kind: 'modifier', points: 10, image: '/cards/+10.png' },
]

export const demoTable: Card[] = [
  numberCards[3],
  numberCards[5],
  { id: 'modifier-plus-4', label: '+4', kind: 'modifier', points: 4 },
]

export function cardFromCode(code: string): Card | undefined {
  if (code.startsWith('number:')) return numberCards.find((card) => card.id === `number-${code.slice(7)}`)
  const lookup: Record<string, string> = {
    'modifier:plus2': 'modifier-plus-2', 'modifier:plus4': 'modifier-plus-4', 'modifier:plus6': 'modifier-plus-6',
    'modifier:plus8': 'modifier-plus-8', 'modifier:plus10': 'modifier-plus-10', 'modifier:x2': 'modifier-x2',
    'action:second_chance': 'action-second-chance', 'action:freeze': 'action-freeze', 'action:flip_three': 'action-flip-three',
  }
  return pickerCards.find((card) => card.id === lookup[code])
}
