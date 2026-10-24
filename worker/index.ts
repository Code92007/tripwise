import { parseDriving, parseGeocode, parseTransit, parseWalking, uniqueRoutes } from '../src/amap'
import { parseReverseGeocode, parseTips, validLocation, validSelection } from '../src/places'

type Env = {
  AMAP_WEB_KEY?: string
  ALLOWED_ORIGINS?: string
  ROUTE_LIMIT?: { limit: (input: { key: string }) => Promise<{ success: boolean }> }
  LOOKUP_LIMIT?: { limit: (input: { key: string }) => Promise<{ success: boolean }> }
}

function cors(request: Request, env: Env): Headers {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  if (allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

async function readInput(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('Content-Length')) > 2048) return null
  try {
    const body = await request.text()
    if (body.length > 2048) return null
    const input = JSON.parse(body) as unknown
    return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null
  } catch {
    return null
  }
}

async function resolvePlace(label: string, selection: unknown, key: string, fetcher: typeof fetch) {
  if (validSelection(selection)) {
    if (selection.citycode) return { address: selection.label, location: selection.location, citycode: selection.citycode }
    const reverse = parseReverseGeocode(await amap('/v3/geocode/regeo', { location: selection.location }, key, fetcher), selection.location)
    if (reverse?.citycode) return { address: selection.label, location: selection.location, citycode: reverse.citycode }
    return null
  }
  return parseGeocode(await amap('/v3/geocode/geo', { address: label }, key, fetcher))
}

export async function handleRequest(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/health' && request.method === 'GET') return response(request, env, 200, { ok: true, configured: Boolean(env.AMAP_WEB_KEY) })
  if (!['/api/routes', '/api/suggest', '/api/locate'].includes(url.pathname)) return response(request, env, 404, { error: '未找到接口' })
  const headers = cors(request, env)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== (url.pathname === '/api/suggest' ? 'GET' : 'POST')) return response(request, env, 405, { error: '请求方法不支持' })
  const origin = request.headers.get('Origin')
  if (origin && !headers.has('Access-Control-Allow-Origin')) return response(request, env, 403, { error: '来源未获允许' })
  if (!env.AMAP_WEB_KEY) return response(request, env, 503, { error: '地点服务尚未配置高德 Web 服务 Key' })
  const limiter = url.pathname === '/api/routes' ? env.ROUTE_LIMIT : env.LOOKUP_LIMIT
  if (limiter && !(await limiter.limit({ key: url.pathname })).success) return response(request, env, 429, { error: '查询过于频繁，请稍后重试' })
  if (url.pathname === '/api/suggest') {
    const query = url.searchParams.get('query')?.trim() || ''
    if (query.length < 2 || query.length > 80) return response(request, env, 400, { error: '请输入至少两个字的地点' })
    try {
      const tips = await amap('/v3/assistant/inputtips', { keywords: query, datatype: 'all' }, env.AMAP_WEB_KEY, fetcher)
      return response(request, env, 200, { places: parseTips(tips) })
    } catch {
      return response(request, env, 502, { error: '地点补全暂不可用' })
    }
  }
  const input = await readInput(request)
  if (!input) return response(request, env, 400, { error: '请求格式不正确或过长' })
  if (url.pathname === '/api/locate') {
    if (!validLocation(input.location)) return response(request, env, 400, { error: '位置坐标无效' })
    try {
      const place = parseReverseGeocode(await amap('/v3/geocode/regeo', { location: input.location, extensions: 'base' }, env.AMAP_WEB_KEY, fetcher), input.location)
      return place ? response(request, env, 200, { place }) : response(request, env, 422, { error: '无法识别当前位置，请手动输入附近地点' })
    } catch {
      return response(request, env, 502, { error: '地址解析暂不可用' })
    }
  }
  if (!input || typeof input !== 'object' || !validPlace(input.origin) || !validPlace(input.destination)) return response(request, env, 400, { error: '请填写 2 至 100 字的出发地和目的地' })
  if ((input.originSelection && !validSelection(input.originSelection)) || (input.destinationSelection && !validSelection(input.destinationSelection))) return response(request, env, 400, { error: '地点坐标无效' })

  try {
    const origin = await resolvePlace(input.origin.trim(), input.originSelection, env.AMAP_WEB_KEY, fetcher)
    const destination = await resolvePlace(input.destination.trim(), input.destinationSelection, env.AMAP_WEB_KEY, fetcher)
    if (!origin || !destination) return response(request, env, 422, { error: '无法定位地点，请输入更具体的地名或地址' })
    const params = { origin: origin.location, destination: destination.location }
    const routes = []
    const warnings: string[] = []
    for (const [label, path, options, parse] of [
      ['公交', '/v5/direction/transit/integrated', { ...params, city1: origin.citycode, city2: destination.citycode, strategy: '0', AlternativeRoute: '5', show_fields: 'cost,polyline' }, parseTransit],
      ['少换乘公交', '/v5/direction/transit/integrated', { ...params, city1: origin.citycode, city2: destination.citycode, strategy: '2', AlternativeRoute: '3', show_fields: 'cost,polyline' }, parseTransit],
      ['少步行公交', '/v5/direction/transit/integrated', { ...params, city1: origin.citycode, city2: destination.citycode, strategy: '3', AlternativeRoute: '3', show_fields: 'cost,polyline' }, parseTransit],
      ['驾车', '/v5/direction/driving', { ...params, alternative_route: '3', show_fields: 'cost,polyline' }, parseDriving],
      ['步行', '/v5/direction/walking', { ...params, show_fields: 'cost,polyline' }, parseWalking],
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
