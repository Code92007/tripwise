import { describe, expect, it } from 'vitest'
import { rankRoutes, sampleRoutes, scoreRoute, presets } from './scoring'

describe('route ranking', () => {
  it('can prefer a slower direct route when transfers are costly', () => {
    expect(rankRoutes(sampleRoutes, presets.comfort)[0].id).toBe('sample-direct')
  })

  it('changes the winner when the traveler prioritizes time', () => {
    const routes = sampleRoutes.slice(0, 2)
    expect(rankRoutes(routes, { ...presets.speed, transfer: 0, walking: 0, delay: 0 })[0].id).toBe('sample-transfers')
  })

  it('includes price and route uncertainty in equivalent-minute cost', () => {
    const route = sampleRoutes[0]
    expect(scoreRoute(route, presets.comfort)).toBeCloseTo(40 + 5 * 0.18 + 20 * 0.45 + 3 * 1.2)
  })
})
