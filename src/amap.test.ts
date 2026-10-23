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

  it('builds a readable transit itinerary and path from station data', () => {
    const [route] = parseTransit({ route: {
      origin: '121.1,31.1', destination: '121.3,31.3',
      transits: [{ cost: { duration: '1800', transit_fee: '4' }, segments: [{
        walking: { distance: '300', cost: { duration: '240' }, steps: [{ polyline: { polyline: '121.1,31.1;121.11,31.11' } }] },
        bus: { buslines: [{ name: '地铁1号线(起点--终点)', departure_stop: { name: '甲站' }, arrival_stop: { name: '乙站' }, via_stops: [{ name: '中间站' }], cost: { duration: '1200' }, polyline: { polyline: '121.11,31.11;121.3,31.3' } }] },
      }] }],
    } })
    expect(route.details?.legs).toMatchObject([
      { mode: 'walk', instruction: '步行至甲站', minutes: 4, distanceMeters: 300, path: [[121.1, 31.1], [121.11, 31.11]] },
      { mode: 'transit', instruction: '乘坐地铁1号线', from: '甲站', to: '乙站', viaStops: 1, path: [[121.11, 31.11], [121.3, 31.3]] },
    ])
  })

  it('uses the map fare as a taxi estimate and adjusts alternatives by distance', () => {
    const routes = parseDriving({ route: {
      origin: '121.1,31.1', destination: '121.3,31.3', taxi_cost: '71',
      paths: [
        { distance: '20000', cost: { duration: '1800' }, steps: [{ instruction: '向东行驶', step_distance: '100', polyline: '121.1,31.1;121.2,31.2' }] },
        { distance: '22000', cost: { duration: '1900' }, steps: [] },
      ],
    } })
    expect(routes[0]).toMatchObject({ name: '打车路线', price: 71, estimatedFare: true, fareRange: [56, 93] })
    expect(routes[0].details?.legs[0]).toMatchObject({ instruction: '向东行驶', path: [[121.1, 31.1], [121.2, 31.2]] })
    expect(routes[1].price).toBe(76)
    expect(parseDriving({ route: { paths: [{ distance: '5000', cost: { duration: '900' } }] } })[0].price).toBeGreaterThan(0)
  })
})
