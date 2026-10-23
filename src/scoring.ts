export type TravelMode = 'transit' | 'rail' | 'flight' | 'drive' | 'walk' | 'mixed'

export type Route = {
  id: string
  name: string
  mode: TravelMode
  minutes: number
  price: number
  walkMinutes: number
  transfers: number
  delayMinutes: number
  stopGo: number
  note: string
}

export type Weights = {
  price: number
  walking: number
  transfer: number
  delay: number
  stopGo: number
}

export type Preset = 'comfort' | 'value' | 'speed' | 'custom'

export const presets: Record<Exclude<Preset, 'custom'>, Weights> = {
  comfort: { price: 0.18, walking: 0.45, transfer: 9, delay: 1.2, stopGo: 2.5 },
  value: { price: 0.65, walking: 0.15, transfer: 5, delay: 0.8, stopGo: 1.5 },
  speed: { price: 0.08, walking: 0.1, transfer: 3, delay: 0.4, stopGo: 0.8 },
}

export const sampleRoutes: Route[] = [
  {
    id: 'sample-direct',
    name: '步行 + 直达地铁',
    mode: 'transit',
    minutes: 40,
    price: 5,
    walkMinutes: 20,
    transfers: 0,
    delayMinutes: 3,
    stopGo: 0,
    note: '多走一段，途中无需换乘',
  },
  {
    id: 'sample-transfers',
    name: '少步行 + 多次换乘',
    mode: 'transit',
    minutes: 35,
    price: 5,
    walkMinutes: 10,
    transfers: 3,
    delayMinutes: 8,
    stopGo: 0,
    note: '表面用时更短，换乘负担较高',
  },
  {
    id: 'sample-drive',
    name: '网约车',
    mode: 'drive',
    minutes: 32,
    price: 48,
    walkMinutes: 2,
    transfers: 0,
    delayMinutes: 15,
    stopGo: 4,
    note: '少走路，路况波动较明显',
  },
]

export function scoreRoute(route: Route, weights: Weights): number {
  return (
    route.minutes +
    route.price * weights.price +
    route.walkMinutes * weights.walking +
    route.transfers * weights.transfer +
    route.delayMinutes * weights.delay +
    route.stopGo * weights.stopGo
  )
}

export function rankRoutes(routes: Route[], weights: Weights): Route[] {
  return [...routes].sort((a, b) => scoreRoute(a, weights) - scoreRoute(b, weights) || a.minutes - b.minutes)
}

export function compareWithFastest(best: Route, routes: Route[]): string {
  const fastest = [...routes].sort((a, b) => a.minutes - b.minutes)[0]
  if (!fastest || best.id === fastest.id) return '在当前偏好下，这也是用时最短的方案。'

  const differences: string[] = []
  if (fastest.price > best.price) differences.push(`省 ¥${formatNumber(fastest.price - best.price)}`)
  if (fastest.transfers > best.transfers) differences.push(`少换乘 ${fastest.transfers - best.transfers} 次`)
  if (fastest.delayMinutes > best.delayMinutes) differences.push('延误风险更低')
  if (fastest.stopGo > best.stopGo) differences.push('停走负担更小')
  const slower = best.minutes - fastest.minutes
  return `${slower > 0 ? `比最快方案多 ${formatNumber(slower)} 分钟` : '与最快方案用时相同'}${differences.length ? `，但${differences.join('、')}` : ''}。`
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function isRoute(value: unknown): value is Route {
  if (!value || typeof value !== 'object') return false
  const route = value as Record<string, unknown>
  return (
    typeof route.id === 'string' &&
    typeof route.name === 'string' &&
    ['transit', 'rail', 'flight', 'drive', 'walk', 'mixed'].includes(String(route.mode)) &&
    ['minutes', 'price', 'walkMinutes', 'transfers', 'delayMinutes', 'stopGo'].every(
      (key) => typeof route[key] === 'number' && Number.isFinite(route[key]) && (route[key] as number) >= 0,
    ) &&
    typeof route.note === 'string'
  )
}
