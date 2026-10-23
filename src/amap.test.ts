import { describe, expect, it } from 'vitest'
import { parseDriving, parseTransit, parseWalking, uniqueRoutes } from './amap'

describe('AMap response mapping', () => {
  it('keeps missing fares and uncertainty unknown', () => {
    const routes = parseTransit({ route: { transits: [{ cost: { duration: '2400' }, segments: [{ walking: { cost: { duration: '600' } }, bus: { buslines: [{ name: '地铁2号线' }] } }] }] } })
    expect(routes[0]).toMatchObject({ minutes: 40, walkMinutes: 10, price: null, transfers: 0, delayMinutes: null, name: '地铁2号线' })
    expect(parseDriving({ route: { paths: [{ cost: { duration: '1800', tolls: '0', traffic_lights: '17' } }] } })[0])
      .toMatchObject({ minutes: 30, price: null, trafficLights: 17, stopGo: null })
  })

  it('maps priced transit, walking and duplicate routes', () => {
    const transit = parseTransit({ route: { transits: [{ cost: { duration: '1200', transit_fee: '5' }, segments: [{ walking: { cost: { duration: '120' } }, bus: { buslines: [{ name: '1路' }, { name: '2路' }] } }] }] } })
    const walk = parseWalking({ route: { paths: [{ cost: { duration: '900' } }] } })
    expect(transit[0]).toMatchObject({ price: 5, walkMinutes: 2, transfers: 0, name: '1路' })
    expect(walk[0]).toMatchObject({ minutes: 15, price: 0, walkMinutes: 15 })
    expect(uniqueRoutes([...transit, ...transit])).toHaveLength(1)
  })
})
