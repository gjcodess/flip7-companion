import type { Card } from '../game/cards'

export function errorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error) return caught.message
  if (typeof caught === 'object' && caught && 'message' in caught && typeof caught.message === 'string') return caught.message
  return fallback
}

export function cardCode(card: Card) {
  if (card.id.startsWith('number-')) return `number:${card.id.slice(7)}`
  const codes: Record<string, string> = { 'modifier-plus-2': 'modifier:plus2', 'modifier-plus-4': 'modifier:plus4', 'modifier-plus-6': 'modifier:plus6', 'modifier-plus-8': 'modifier:plus8', 'modifier-plus-10': 'modifier:plus10', 'modifier-x2': 'modifier:x2', 'action-second-chance': 'action:second_chance', 'action-freeze': 'action:freeze', 'action-flip-three': 'action:flip_three' }
  return codes[card.id]
}

export function pointLabel(value: number) {
  return Math.abs(value) <= 1 ? 'pt' : 'pts'
}

export function roomCodeFromPath(pathname: string) {
  const match = pathname.match(/^\/(?:game|room)\/([A-Za-z0-9-]+)$/)
  return match?.[1]?.toUpperCase() ?? null
}

export async function withTimeout<T>(task: Promise<T>, message = 'The request took too long. Try again.') {
  let timer: number | undefined
  try {
    return await Promise.race([task, new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), 10000) })])
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}
