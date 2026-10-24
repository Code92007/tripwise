import { expect, it, vi } from 'vitest'
import { handleRequest } from './index'

const env = { AMAP_WEB_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://code92007.github.io' }

it('allows the native iOS WebView origin when configured', async () => {
  const response = await handleRequest(new Request('https://worker.example/api/routes', {
    method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' },
  }), { ...env, ALLOWED_ORIGINS: `${env.ALLOWED_ORIGINS},capacitor://localhost` })
  expect(response.status).toBe(204)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost')
})

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
    else if (url.pathname.includes('driving')) payload = { status: '1', route: { taxi_cost: '38', paths: [{ distance: '10000', cost: { duration: '1800', traffic_lights: '12' }, steps: [{ instruction: '直行', polyline: '121.1,31.1;121.2,31.2' }] }] } }
    else payload = { status: '1', route: { paths: [{ cost: { duration: '3600' } }] } }
    return new Response(JSON.stringify(payload))
  }) as typeof fetch
  const response = await handleRequest(new Request('https://worker.example/api/routes', {
    method: 'POST', headers: { Origin: 'https://code92007.github.io', 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: '上海虹桥站', destination: '人民广场' }),
  }), env, fetcher)
  const result = await response.json() as { routes: { mode: string; price: number | null; details?: { legs: unknown[] } }[] }
  expect(response.status).toBe(200)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://code92007.github.io')
  expect(result.routes).toHaveLength(3)
  expect(result.routes.find((route) => route.mode === 'drive')?.price).toBe(38)
  expect(result.routes.find((route) => route.mode === 'drive')?.details?.legs).toHaveLength(1)
  expect(fetcher.mock.calls.filter(([url]) => !url.includes('geocode')).every(([url]) => new URL(url).searchParams.get('show_fields') === 'cost,polyline')).toBe(true)
  expect(JSON.stringify(result)).not.toContain('test-secret')
})

it('returns only located suggestions and reverse geocodes a coordinate', async () => {
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input)
    if (url.pathname.includes('inputtips')) return new Response(JSON.stringify({ status: '1', tips: [
      { name: '沙岗路233号', district: '广州市海珠区', location: '113.300001,23.100001', adcode: '440105' },
      { name: '公交线路', location: [] },
    ] }))
    return new Response(JSON.stringify({ status: '1', regeocode: { formatted_address: '广东省广州市海珠区沙岗路233号', addressComponent: { citycode: '020', adcode: '440105', streetNumber: { street: '沙岗路', number: '233号' } } } }))
  }) as typeof fetch
  const suggest = await handleRequest(new Request('https://worker.example/api/suggest?query=沙岗路', { headers: { Origin: 'https://code92007.github.io' } }), env, fetcher)
  expect(suggest.status).toBe(200)
  expect((await suggest.json() as { places: unknown[] }).places).toHaveLength(1)
  const locate = await handleRequest(new Request('https://worker.example/api/locate', {
    method: 'POST', body: JSON.stringify({ location: '113.300001,23.100001' }),
  }), env, fetcher)
  const located = await locate.json() as { place: { label: string; location: string } }
  expect(located.place.label).toContain('沙岗路233号')
  expect(located.place.location).toBe('113.300001,23.100001')
  expect(JSON.stringify(located)).not.toContain('test-secret')
})

it('uses selected coordinates without geocoding their labels again', async () => {
  const fetcher = vi.fn(async (input: string) => {
    const url = new URL(input)
    if (url.pathname.includes('/v3/geocode/geo')) throw new Error('selected place must not be geocoded')
    if (url.pathname.includes('/v3/geocode/regeo')) return new Response(JSON.stringify({ status: '1', regeocode: { formatted_address: '出发地', addressComponent: { citycode: '020' } } }))
    if (url.pathname.includes('walking')) return new Response(JSON.stringify({ status: '1', route: { paths: [{ cost: { duration: '1200' } }] } }))
    return new Response(JSON.stringify({ status: '1', route: {} }))
  }) as typeof fetch
  const response = await handleRequest(new Request('https://worker.example/api/routes', {
    method: 'POST', body: JSON.stringify({
      origin: '广州沙岗路233号', destination: '广州塔',
      originSelection: { label: '广州沙岗路233号', location: '113.300001,23.100001' },
      destinationSelection: { label: '广州塔', location: '113.320001,23.110001', citycode: '020' },
    }),
  }), env, fetcher)
  expect(response.status).toBe(200)
  const directions = fetcher.mock.calls.map(([input]) => new URL(input)).filter((url) => url.pathname.includes('/direction/'))
  expect(directions.every((url) => url.searchParams.get('origin') === '113.300001,23.100001' && url.searchParams.get('destination') === '113.320001,23.110001')).toBe(true)
})
