import type { Coordinate, Route, RouteDetails, RouteLeg } from './scoring'

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

function coordinate(value: unknown): Coordinate | null {
  const parts = text(value).split(',').map(Number)
  return parts.length === 2 && parts.every(Number.isFinite) && Math.abs(parts[0]) <= 180 && Math.abs(parts[1]) <= 90
    ? [parts[0], parts[1]] : null
}

function polyline(value: unknown): Coordinate[] {
  const raw = typeof value === 'string' ? value : text(object(value).polyline)
  const points = raw.split(';').map(coordinate).filter((point): point is Coordinate => point !== null)
  if (points.length <= 300) return points
  const stride = Math.ceil((points.length - 1) / 299)
  return points.filter((_, index) => index % stride === 0 || index === points.length - 1)
}

function mergePaths(steps: Data[]): Coordinate[] {
  return polyline(steps.map((step) => typeof step.polyline === 'string' ? step.polyline : text(object(step.polyline).polyline)).filter(Boolean).join(';'))
}

function routeDetails(route: Data, legs: RouteLeg[]): RouteDetails {
  return { origin: coordinate(route.origin), destination: coordinate(route.destination), legs }
}

function meters(value: unknown): number | undefined {
  return number(value) ?? undefined
}

function walkLeg(walking: Data, destination: string): RouteLeg | null {
  const steps = items(walking.steps)
  const distance = number(walking.distance)
  if (!steps.length && (!distance || distance <= 0)) return null
  return {
    mode: 'walk',
    instruction: destination ? `步行至${destination}` : '步行前往下一站',
    minutes: minutes(object(walking.cost).duration ?? walking.duration) ?? undefined,
    distanceMeters: distance ?? undefined,
    path: mergePaths(steps),
  }
}

function transitLegs(segments: Data[]): RouteLeg[] {
  const legs: RouteLeg[] = []
  for (const segment of segments) {
    const busline = items(object(segment.bus).buslines)[0]
    const rail = object(segment.railway)
    const departure = text(object(busline?.departure_stop).name) || text(object(rail.departure_stop).name)
    const walk = walkLeg(object(segment.walking), departure)
    if (walk) legs.push(walk)
    if (busline) {
      const name = text(busline.name).split('(')[0] || '公共交通'
      legs.push({
        mode: 'transit', instruction: `乘坐${name}`,
        from: text(object(busline.departure_stop).name), to: text(object(busline.arrival_stop).name),
        minutes: minutes(object(busline.cost).duration) ?? undefined,
        distanceMeters: meters(busline.distance), viaStops: items(busline.via_stops).length,
        path: polyline(busline.polyline),
      })
    } else if (Object.keys(rail).length) {
      legs.push({
        mode: 'rail', instruction: `乘坐${text(rail.name) || '火车'}`,
        from: text(object(rail.departure_stop).name), to: text(object(rail.arrival_stop).name),
        minutes: minutes(rail.time) ?? undefined,
        distanceMeters: meters(rail.distance),
        path: polyline(rail.polyline),
      })
    }
  }
  return legs
}

function stepLegs(steps: Data[], mode: 'walk' | 'drive'): RouteLeg[] {
  return steps.slice(0, 100).map((step) => ({
    mode,
    instruction: text(step.instruction) || (mode === 'drive' ? '继续行驶' : '继续步行'),
    distanceMeters: meters(step.step_distance ?? step.distance),
    path: polyline(step.polyline),
  }))
}

function taxiEstimate(route: Data, path: Data, firstPath: Data): { price: number; range: [number, number] } | null {
  const distance = number(path.distance)
  const baseDistance = number(firstPath.distance)
  const providerFare = number(route.taxi_cost)
  if (distance === null) return null
  const duration = minutes(object(path.cost).duration ?? path.duration) ?? 0
  const baseline = providerFare !== null && baseDistance !== null
    ? providerFare + (distance - baseDistance) / 1000 * 2.5
    : 14 + Math.max(0, distance / 1000 - 3) * 2.7 + duration * 0.25
  const price = Math.max(10, Math.round(baseline))
  return { price, range: [Math.max(10, Math.floor(price * 0.8)), Math.ceil(price * 1.3)] }
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
  const route = object(object(payload).route)
  return items(route.transits).flatMap((transit, index) => {
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
      details: routeDetails(route, transitLegs(segments)),
    }]
  })
}

export function parseDriving(payload: unknown): Route[] {
  const route = object(object(payload).route)
  const paths = items(route.paths)
  return paths.slice(0, 3).flatMap((path, index) => {
    const duration = minutes(object(path.cost).duration ?? path.duration)
    if (duration === null || duration === 0) return []
    const fare = taxiEstimate(route, path, paths[0])
    const tolls = number(object(path.cost).tolls ?? path.tolls)
    return [{
      id: `amap-drive-${index}`,
      name: index ? `打车备选 ${index + 1}` : '打车路线',
      mode: 'drive' as const,
      minutes: duration,
      price: fare?.price ?? null,
      estimatedFare: fare !== null,
      fareRange: fare?.range,
      walkMinutes: null,
      transfers: 0,
      delayMinutes: null,
      stopGo: null,
      trafficLights: number(object(path.cost).traffic_lights),
      note: `高德驾车规划；打车费用为粗估${tolls === null ? '' : `，通行费约 ¥${tolls}`}；用时不含等车与上下车`,
      source: 'amap' as const,
      details: routeDetails(route, stepLegs(items(path.steps), 'drive')),
    }]
  })
}

export function parseWalking(payload: unknown): Route[] {
  const route = object(object(payload).route)
  return items(route.paths).slice(0, 1).flatMap((path) => {
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
      details: routeDetails(route, stepLegs(items(path.steps), 'walk')),
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
