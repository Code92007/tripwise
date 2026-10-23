import type { Route } from './scoring'

type Data = Record<string, unknown>

function object(value: unknown): Data {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
}

function items(value: unknown): Data[] {
  return Array.isArray(value) ? value.map(object) : []
}

function number(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const result = Number(value)
  return Number.isFinite(result) && result >= 0 ? result : null
}

function minutes(value: unknown): number | null {
  const seconds = number(value)
  return seconds === null ? null : Math.ceil(seconds / 60)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export type Place = { address: string; location: string; citycode: string; adcode: string }

export function parseGeocode(payload: unknown): Place | null {
  const first = items(object(payload).geocodes)[0]
  if (!first || !/^\d+(\.\d+)?,\d+(\.\d+)?$/.test(text(first.location))) return null
  return {
    address: text(first.formatted_address),
    location: text(first.location),
    citycode: text(first.citycode),
    adcode: text(first.adcode),
  }
}

function transitName(segments: Data[], index: number): string {
  const names = segments.map((segment) => text(items(object(segment.bus).buslines)[0]?.name).split('(')[0])
  const railway = segments.some((segment) => items(object(segment.railway).spaces).length > 0 || Boolean(object(segment.railway).name))
  const label = [...new Set(names.filter(Boolean))].slice(0, 2).join(' → ')
  return label || (railway ? `铁路组合 ${index + 1}` : `公共交通 ${index + 1}`)
}

export function parseTransit(payload: unknown): Route[] {
  return items(object(object(payload).route).transits).flatMap((transit, index) => {
    const duration = minutes(object(transit.cost).duration ?? transit.duration)
    if (duration === null || duration === 0) return []
    const segments = items(transit.segments)
    const walkingDurations = segments.map((segment) => minutes(object(object(segment.walking).cost).duration ?? object(segment.walking).duration))
    const walkMinutes = walkingDurations.length > 0 && walkingDurations.every((value) => value !== null)
      ? walkingDurations.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
    const fares = segments.map((segment) => number(object(segment.cost).transit_fee))
    const fare = number(object(transit.cost).transit_fee ?? transit.transit_fee)
      ?? (fares.length > 0 && fares.every((value) => value !== null) ? fares.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null)
    const rides = segments.reduce((count, segment) => count + (items(object(segment.bus).buslines).length ? 1 : 0) + (Object.keys(object(segment.railway)).length ? 1 : 0), 0)
    const railway = segments.some((segment) => Object.keys(object(segment.railway)).length > 0)
    return [{
      id: `amap-transit-${index}-${duration}-${rides}`,
      name: transitName(segments, index),
      mode: railway ? 'mixed' as const : 'transit' as const,
      minutes: duration,
      price: fare,
      walkMinutes,
      transfers: Math.max(0, rides - 1),
      delayMinutes: null,
      stopGo: null,
      note: railway ? '高德跨城公共交通方案；铁路班次与票价请另行核实' : '高德公共交通规划；班次与票价请核实',
      source: 'amap' as const,
    }]
  })
}

export function parseDriving(payload: unknown): Route[] {
  const route = object(object(payload).route)
  return items(route.paths).slice(0, 3).flatMap((path, index) => {
    const duration = minutes(object(path.cost).duration ?? path.duration)
    if (duration === null || duration === 0) return []
    return [{
      id: `amap-drive-${index}`,
      name: index ? `驾车备选 ${index + 1}` : '驾车路线',
      mode: 'drive' as const,
      minutes: duration,
      price: null,
      walkMinutes: null,
      transfers: 0,
      delayMinutes: null,
      stopGo: null,
      trafficLights: number(object(path.cost).traffic_lights),
      note: `高德驾车规划；通行费 ${number(object(path.cost).tolls ?? path.tolls) === null ? '未知' : `约 ¥${number(object(path.cost).tolls ?? path.tolls)}`}，总成本待填写；用时不含取车与停车`,
      source: 'amap' as const,
    }]
  })
}

export function parseWalking(payload: unknown): Route[] {
  return items(object(object(payload).route).paths).slice(0, 1).flatMap((path) => {
    const duration = minutes(object(path.cost).duration ?? path.duration)
    return duration === null || duration === 0 ? [] : [{
      id: 'amap-walk',
      name: '全程步行',
      mode: 'walk' as const,
      minutes: duration,
      price: 0,
      walkMinutes: duration,
      transfers: 0,
      delayMinutes: null,
      stopGo: null,
      note: '高德步行规划',
      source: 'amap' as const,
    }]
  })
}

export function uniqueRoutes(routes: Route[]): Route[] {
  const seen = new Set<string>()
  return routes.filter((route) => {
    const key = [route.mode, route.name, route.minutes, route.price, route.walkMinutes, route.transfers].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
