import type { PlaceSelection } from './places'

function baseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!base) throw new Error('地点服务尚未配置')
  return base.replace(/\/$/, '')
}

export async function suggestPlaces(query: string, signal: AbortSignal): Promise<PlaceSelection[]> {
  const reply = await fetch(`${baseUrl()}/api/suggest?query=${encodeURIComponent(query)}`, { signal })
  const data = await reply.json() as { places?: PlaceSelection[]; error?: string }
  if (!reply.ok) throw new Error(data.error || '地点补全暂不可用')
  return Array.isArray(data.places) ? data.places : []
}

export async function reverseGeocode(location: string): Promise<PlaceSelection> {
  const reply = await fetch(`${baseUrl()}/api/locate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location }),
  })
  const data = await reply.json() as { place?: PlaceSelection; error?: string }
  if (!reply.ok || !data.place) throw new Error(data.error || '无法识别当前位置')
  return data.place
}
