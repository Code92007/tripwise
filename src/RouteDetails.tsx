import { useEffect, useRef } from 'react'
import gcoord from 'gcoord'
import { Clock3, MapPin, Route as RouteIcon, X } from 'lucide-react'
import type { Coordinate, Route, RouteLeg } from './scoring'
import 'leaflet/dist/leaflet.css'

const legNames = { walk: '步行', transit: '公交 / 地铁', rail: '铁路', drive: '驾车' }
const legColors = { walk: '#e38d42', transit: '#17876c', rail: '#5557a9', drive: '#1878b6' }

function formatDistance(meters?: number): string {
  if (meters === undefined) return ''
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`
}

function RouteMap({ route }: { route: Route }) {
  const container = useRef<HTMLDivElement>(null)
  const details = route.details

  useEffect(() => {
    if (!container.current || !details) return
    let cancelled = false
    let map: import('leaflet').Map | undefined

    async function showMap() {
      const L = await import('leaflet')
      if (cancelled || !container.current || !details) return
      const convert = (point: Coordinate): import('leaflet').LatLngTuple => {
        const [lng, lat] = gcoord.transform(point, gcoord.GCJ02, gcoord.WGS84) as Coordinate
        return [lat, lng]
      }
      map = L.map(container.current, { zoomControl: true, scrollWheelZoom: false })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)
      const points: import('leaflet').LatLngTuple[] = []
      for (const leg of details.legs) {
        const path = leg.path.map(convert)
        if (path.length < 2) continue
        L.polyline(path, { color: legColors[leg.mode], weight: 5, opacity: 0.9 }).addTo(map)
        points.push(...path)
      }
      for (const [point, label, color] of [
        [details.origin, '出发', '#16866e'],
        [details.destination, '到达', '#dc7650'],
      ] as const) {
        if (!point) continue
        const latlng = convert(point)
        L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
          .bindTooltip(label).addTo(map)
        points.push(latlng)
      }
      if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 15 })
      else map.setView([35, 104], 4)
      window.requestAnimationFrame(() => map?.invalidateSize())
    }

    void showMap()
    return () => { cancelled = true; map?.remove() }
  }, [details])

  return <div className="route-map" ref={container} role="img" aria-label={`${route.name}的地图路线`} />
}

function Leg({ leg, index }: { leg: RouteLeg; index: number }) {
  return <li className={`detail-leg detail-${leg.mode}`}>
    <span className="detail-leg-index">{String(index + 1).padStart(2, '0')}</span>
    <div className="detail-leg-body">
      <span className="detail-leg-mode">{legNames[leg.mode]}</span>
      <strong>{leg.instruction}</strong>
      {(leg.from || leg.to) && <p>{[leg.from, leg.to].filter(Boolean).join(' → ')}</p>}
      <small>{[leg.minutes !== undefined ? `约 ${leg.minutes} 分钟` : '', formatDistance(leg.distanceMeters), leg.viaStops ? `途经 ${leg.viaStops} 站` : ''].filter(Boolean).join(' · ')}</small>
    </div>
  </li>
}

export function RouteDetails({ route, onClose }: { route: Route; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null)
  const details = route.details

  useEffect(() => {
    title.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="route-dialog" role="dialog" aria-modal="true" aria-labelledby="route-detail-title">
      <div className="route-dialog-head">
        <div><span className="eyebrow">路线详情 · 高德规划</span><h2 id="route-detail-title" ref={title} tabIndex={-1}>{route.name}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭路线详情"><X size={19} /></button>
      </div>
      <div className="route-dialog-summary">
        <span><Clock3 size={16} />约 {route.minutes} 分钟</span>
        <span><RouteIcon size={16} />{details?.legs.length ?? 0} 段行程</span>
        {route.estimatedFare && route.fareRange && <span>打车粗估 ¥{route.fareRange[0]}–{route.fareRange[1]}</span>}
      </div>
      {details && <>
        {(details.origin || details.destination || details.legs.some((leg) => leg.path.length > 1)) && <RouteMap route={route} />}
        <div className="route-dialog-content">
          <h3>怎么走</h3>
          {details.legs.length ? <ol className="detail-leg-list">{details.legs.map((leg, index) => <Leg leg={leg} index={index} key={index} />)}</ol> : <p className="detail-empty">高德未提供分段指引，请尝试更具体的起终点。</p>}
        </div>
      </>}
      <p className="route-dialog-note"><MapPin size={14} />地图路线与指引仅用于行前参考，出行时请留意现场路况和站点信息。{route.estimatedFare && '费用不含动态加价、夜间附加费及可能的通行费。'}</p>
    </section>
  </div>
}
