import { describe, expect, it } from 'vitest'
import { parseDriving, parseTransit, parseWalking, uniqueRoutes } from './amap'
import crossCity from './fixtures/amap-cross-city.json'

describe('AMap response mapping', () => {
  it('keeps the onward taxi after arriving at Shaoxing North in a real cross-city response', () => {
    const [route] = parseTransit(crossCity, { origin: '上海南站', destination: '绍兴职业技术学院' })
    expect(route).toMatchObject({ name: 'G7545 → 打车', minutes: 117, price: 141, transfers: 1 })
    expect(route.details?.legs).toMatchObject([
      { mode: 'rail', from: '上海南', to: '绍兴北', minutes: 68, pathIsSchematic: true,
        path: [[121.429462, 31.153127], [120.539485, 30.098661]] },
      { mode: 'drive', instruction: '打车接续', from: '绍兴北', to: '绍兴职业技术学院', minutes: 17,
        distanceMeters: 14083, pathIsSchematic: true, path: [[120.539485, 30.098661], [120.557350, 29.983219]] },
    ])
  })

  it('orders the access taxi before its train when both are in the same segment', () => {
    const [, route] = parseTransit(crossCity)
    expect(route.details?.legs.map((leg) => [leg.mode, leg.from, leg.to])).toEqual([
      ['drive', '出发地', '上海虹桥'], ['rail', '上海虹桥', '绍兴北'],
    ])
    expect(route.transfers).toBe(1)
  })

  it('keeps an onward taxi after a train in the same segment and uses real geometry when supplied', () => {
    const [railSegment, taxiSegment] = crossCity.route.transits[0].segments
    const [route] = parseTransit({ route: { transits: [{ cost: { duration: '7020' }, segments: [{
      ...railSegment, taxi: { ...taxiSegment.taxi, polyline: { polyline: '120.539485,30.098661;120.55,30.05;120.557350,29.983219' } },
    }] }] } })
    expect(route.details?.legs.map((leg) => leg.mode)).toEqual(['rail', 'drive'])
    expect(route.details?.legs[1].path).toHaveLength(3)
    expect(route.details?.legs[1].pathIsSchematic).toBeUndefined()
  })

  it('keeps empty provider values unknown and never invents station coordinates', () => {
    const [route] = parseTransit({ route: { transits: [{ cost: { duration: '600', transit_fee: [] }, segments: [{
      railway: { name: 'G1', departure_stop: { location: ' , ' }, arrival_stop: { location: '120.5,30.1' } },
      taxi: { drivetime: [], distance: [], startpoint: '', endpoint: '' },
    }] }] } })
    expect(route.price).toBeNull()
    expect(route.details?.legs.every((leg) => leg.path.length === 0)).toBe(true)
    expect(route.details?.legs.find((leg) => leg.mode === 'drive')?.minutes).toBeUndefined()
  })

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
