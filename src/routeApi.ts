import { isRoute, type Route } from './scoring'
import type { PlaceSelection } from './places'

export type RouteSearch = {
  origin: string
  destination: string
  fetchedAt: string
  provider: string
  routes: Route[]
  warnings: string[]
}

export async function searchRoutes(origin: string, destination: string, originSelection?: PlaceSelection, destinationSelection?: PlaceSelection): Promise<RouteSearch> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!base) throw new Error('路线服务尚未配置，请先部署接口并设置 VITE_API_BASE_URL')
  let response: Response
  try {
    response = await fetch(`${base.replace(/\/$/, '')}/api/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, originSelection, destinationSelection }),
    })
  } catch {
    throw new Error('无法连接路线服务，请检查网络或接口地址')
  }
  const data = await response.json() as Partial<RouteSearch> & { error?: string }
  if (!response.ok) throw new Error(data.error || '路线查询失败，请稍后重试')
  if (!Array.isArray(data.routes) || !data.routes.every(isRoute)) throw new Error('路线服务返回的数据格式不正确')
  return {
    origin: data.origin || origin,
    destination: data.destination || destination,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    provider: data.provider || '高德地图 Web 服务',
    routes: data.routes,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  }
}
