import { expect, it, vi } from 'vitest'
import { handleRequest } from './index'

const env = { AMAP_WEB_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://code92007.github.io' }

it('rejects invalid input before calling the provider', async () => {
  const fetcher = vi.fn()
  const response = await handleRequest(new Request('https://worker.example/api/routes', {
    method: 'POST', headers: { Origin: 'https://code92007.github.io', 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: 'a', destination: '上海' }),
  }), env, fetcher)
  expect(response.status).toBe(400)
  expect(fetcher).not.toHaveBeenCalled()
})

it('enforces the configured provider quota guard', async () => {
  const fetcher = vi.fn()
  const response = await handleRequest(new Request('https://worker.example/api/routes', {
    method: 'POST', body: JSON.stringify({ origin: '上海虹桥站', destination: '人民广场' }),
  }), { ...env, ROUTE_LIMIT: { limit: async () => ({ success: false }) } }, fetcher)
  expect(response.status).toBe(429)
  expect(fetcher).not.toHaveBeenCalled()
})

it('returns normalized live routes without exposing the key', async () => {
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input)
    let payload: object
    if (url.pathname.includes('geocode')) payload = { status: '1', geocodes: [{ formatted_address: url.searchParams.get('address'), location: '121.1,31.1', citycode: '021', adcode: '310000' }] }
    else if (url.pathname.includes('transit')) payload = { status: '1', route: { transits: [{ cost: { duration: '2400', transit_fee: '5' }, segments: [{ walking: { cost: { duration: '600' } }, bus: { buslines: [{ name: '地铁2号线' }] } }] }] } }
    else if (url.pathname.includes('driving')) payload = { status: '1', route: { paths: [{ cost: { duration: '1800', traffic_lights: '12' } }] } }
    else payload = { status: '1', route: { paths: [{ cost: { duration: '3600' } }] } }
    return new Response(JSON.stringify(payload))
  }) as typeof fetch
  const response = await handleRequest(new Request('https://worker.example/api/routes', {
    method: 'POST', headers: { Origin: 'https://code92007.github.io', 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: '上海虹桥站', destination: '人民广场' }),
  }), env, fetcher)
  const result = await response.json() as { routes: { mode: string; price: number | null }[] }
  expect(response.status).toBe(200)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://code92007.github.io')
  expect(result.routes).toHaveLength(3)
  expect(result.routes.find((route) => route.mode === 'drive')?.price).toBeNull()
  expect(JSON.stringify(result)).not.toContain('test-secret')
})
