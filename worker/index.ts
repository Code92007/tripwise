import { parseDriving, parseGeocode, parseTransit, parseWalking, uniqueRoutes } from '../src/amap'

type Env = {
  AMAP_WEB_KEY?: string
  ALLOWED_ORIGINS?: string
  ROUTE_LIMIT?: { limit: (input: { key: string }) => Promise<{ success: boolean }> }
}

function cors(request: Request, env: Env): Headers {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  if (allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')
  }
  return headers
}

function response(request: Request, env: Env, status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: cors(request, env) })
}

function validPlace(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100
}

async function amap(path: string, params: Record<string, string>, key: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const url = new URL(path, 'https://restapi.amap.com')
  url.search = new URLSearchParams({ ...params, key, output: 'json' }).toString()
  const reply = await fetcher(url.toString(), { signal: AbortSignal.timeout(10000) })
  if (!reply.ok) throw new Error('地图服务暂时不可用')
  const data = await reply.json() as Record<string, unknown>
  if (String(data.status) !== '1') throw new Error('地图服务未能完成本次查询，请检查地点或稍后重试')
  return data
}

export async function handleRequest(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/health' && request.method === 'GET') return response(request, env, 200, { ok: true, configured: Boolean(env.AMAP_WEB_KEY) })
  if (url.pathname !== '/api/routes') return response(request, env, 404, { error: '未找到接口' })
  const headers = cors(request, env)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return response(request, env, 405, { error: '仅支持 POST' })
  const origin = request.headers.get('Origin')
  if (origin && !headers.has('Access-Control-Allow-Origin')) return response(request, env, 403, { error: '来源未获允许' })
  if (!env.AMAP_WEB_KEY) return response(request, env, 503, { error: '路线服务尚未配置高德 Web 服务 Key' })
  if (env.ROUTE_LIMIT && !(await env.ROUTE_LIMIT.limit({ key: 'routes' })).success) return response(request, env, 429, { error: '查询过于频繁，请稍后重试' })
  if (Number(request.headers.get('Content-Length')) > 2048) return response(request, env, 413, { error: '请求过长' })
  let input: Record<string, unknown>
  try {
    const body = await request.text()
    if (body.length > 2048) return response(request, env, 413, { error: '请求过长' })
    input = JSON.parse(body) as Record<string, unknown>
  } catch {
    return response(request, env, 400, { error: '请求格式不正确' })
  }
  if (!input || typeof input !== 'object' || !validPlace(input.origin) || !validPlace(input.destination)) return response(request, env, 400, { error: '请填写 2 至 100 字的出发地和目的地' })

  try {
    const originData = await amap('/v3/geocode/geo', { address: input.origin.trim() }, env.AMAP_WEB_KEY, fetcher)
    const destinationData = await amap('/v3/geocode/geo', { address: input.destination.trim() }, env.AMAP_WEB_KEY, fetcher)
    const origin = parseGeocode(originData)
    const destination = parseGeocode(destinationData)
    if (!origin || !destination) return response(request, env, 422, { error: '无法定位地点，请输入更具体的地名或地址' })
    const params = { origin: origin.location, destination: destination.location }
    const routes = []
    const warnings: string[] = []
    for (const [label, path, options, parse] of [
      ['公交', '/v5/direction/transit/integrated', { ...params, city1: origin.citycode, city2: destination.citycode, strategy: '0', AlternativeRoute: '5', show_fields: 'cost' }, parseTransit],
      ['少换乘公交', '/v5/direction/transit/integrated', { ...params, city1: origin.citycode, city2: destination.citycode, strategy: '2', AlternativeRoute: '3', show_fields: 'cost' }, parseTransit],
      ['少步行公交', '/v5/direction/transit/integrated', { ...params, city1: origin.citycode, city2: destination.citycode, strategy: '3', AlternativeRoute: '3', show_fields: 'cost' }, parseTransit],
      ['驾车', '/v5/direction/driving', { ...params, alternative_route: '3', show_fields: 'cost' }, parseDriving],
      ['步行', '/v5/direction/walking', { ...params, show_fields: 'cost' }, parseWalking],
    ] as const) {
      try {
        routes.push(...parse(await amap(path, options, env.AMAP_WEB_KEY, fetcher)))
      } catch {
        warnings.push(`${label}方案暂不可用`)
      }
    }
    const unique = uniqueRoutes(routes).map((route, index) => ({ ...route, id: `${route.id}-${index}` }))
    if (!unique.length) return response(request, env, 502, { error: '地图服务没有返回可用路线，请更换具体地点后重试' })
    return response(request, env, 200, {
      origin: origin.address || input.origin,
      destination: destination.address || input.destination,
      fetchedAt: new Date().toISOString(),
      provider: '高德地图 Web 服务',
      routes: unique,
      warnings,
    })
  } catch {
    return response(request, env, 502, { error: '地图服务暂时不可用，请稍后重试' })
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  },
}
