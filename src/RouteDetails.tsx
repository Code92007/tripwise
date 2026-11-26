import { useEffect, useMemo, useRef, useState } from 'react'
import gcoord from 'gcoord'
import { Clock3, MapPin, Route as RouteIcon, X } from 'lucide-react'
import type { Coordinate, Route, RouteDetails as Details, RouteLeg } from './scoring'
import { searchLegRoute } from './routeApi'
import 'leaflet/dist/leaflet.css'

const legNames = { walk: '步行', transit: '公交 / 地铁', rail: '铁路', drive: '驾车' }
const legColors = { walk: '#e38d42', transit: '#17876c', rail: '#5557a9', drive: '#1878b6' }

function formatDistance(meters?: number): string {
  if (meters === undefined) return ''
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`
}

function RouteMap({ details, label, originLabel, destinationLabel }: { details: Details; label: string; originLabel: string; destinationLabel: string }) {
  const container = useRef<HTMLDivElement>(null)

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
        const label = document.createElement('span')
        label.textContent = leg.pathIsSchematic ? `${leg.instruction}（起终点示意）` : leg.instruction
        L.polyline(path, { color: legColors[leg.mode], weight: 5, opacity: 0.9, dashArray: leg.pathIsSchematic ? '8 8' : undefined })
          .bindTooltip(label).addTo(map)
        points.push(...path)
      }
      for (const [point, label, color] of [
        [details.origin, originLabel, '#16866e'],
        [details.destination, destinationLabel, '#dc7650'],
      ] as const) {
        if (!point) continue
        const latlng = convert(point)
        const tooltip = document.createElement('span')
        tooltip.textContent = label
        L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
          .bindTooltip(tooltip).addTo(map)
        points.push(latlng)
      }
      if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 15 })
      else map.setView([35, 104], 4)
      window.requestAnimationFrame(() => map?.invalidateSize())
    }

    void showMap()
    return () => { cancelled = true; map?.remove() }
  }, [details, originLabel, destinationLabel])

  return <div className="route-map" ref={container} role="img" aria-label={label} />
}

function Leg({ leg, index, selected, hasRoad, onSelect }: { leg: RouteLeg; index: number; selected: boolean; hasRoad: boolean; onSelect: () => void }) {
  return <li className={`detail-leg detail-${leg.mode}`}>
    <button type="button" className="detail-leg-button" aria-pressed={selected} aria-label={`查看第 ${index + 1} 步地图：${leg.instruction}`} onClick={onSelect}>
    <span className="detail-leg-index">{String(index + 1).padStart(2, '0')}</span>
    <span className="detail-leg-body">
      <span className="detail-leg-mode">{leg.instruction === '打车接续' ? '打车' : legNames[leg.mode]}</span>
      <strong>{leg.instruction}</strong>
      {(leg.from || leg.to) && <span className="detail-leg-stations">{[leg.from, leg.to].filter(Boolean).join(' → ')}</span>}
      <small>{[leg.minutes !== undefined ? `约 ${leg.minutes} 分钟` : '', formatDistance(leg.distanceMeters), leg.viaStops ? `途经 ${leg.viaStops} 站` : '', leg.pathIsSchematic && !hasRoad ? '地图虚线为起终点示意' : ''].filter(Boolean).join(' · ')}</small>
      <span className="detail-leg-map-hint">{selected ? '正在查看本段地图' : '点击查看本段地图'}</span>
    </span>
    </button>
  </li>
}

export function RouteDetails({ route, onClose }: { route: Route; onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null)
  const mapArea = useRef<HTMLDivElement>(null)
  const requests = useRef(new Map<number, AbortController>())
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [legRoutes, setLegRoutes] = useState<Record<number, { route?: Route; loading?: boolean; error?: string }>>({})
  const details = route.details
  const selectedLeg = selectedIndex === null ? undefined : details?.legs[selectedIndex]
  const selectedRoad = selectedIndex === null ? undefined : legRoutes[selectedIndex]
  const mapDetails = useMemo(() => {
    if (!details || !selectedLeg) return details
    if (selectedRoad?.route?.details) return selectedRoad.route.details
    return { origin: selectedLeg.path[0] || null, destination: selectedLeg.path.at(-1) || null, legs: [selectedLeg] }
  }, [details, selectedLeg, selectedRoad?.route])

  useEffect(() => {
    const pending = requests.current
    return () => { for (const controller of pending.values()) controller.abort() }
  }, [])

  async function loadLeg(index: number) {
    const leg = details?.legs[index]
    if (!leg || !['drive', 'walk'].includes(leg.mode) || leg.path.length < 2 || requests.current.has(index)) return
    const controller = new AbortController()
    requests.current.set(index, controller)
    setLegRoutes((current) => ({ ...current, [index]: { loading: true } }))
    try {
      const road = await searchLegRoute(leg.path[0], leg.path.at(-1)!, leg.mode as 'drive' | 'walk', controller.signal)
      if (!controller.signal.aborted) setLegRoutes((current) => ({ ...current, [index]: { route: road } }))
    } catch (error) {
      if (!controller.signal.aborted) setLegRoutes((current) => ({ ...current, [index]: { error: error instanceof Error ? error.message : '本段道路路线暂不可用' } }))
    } finally {
      requests.current.delete(index)
    }
  }

  function selectLeg(index: number | null) {
    setSelectedIndex(index)
    mapArea.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (index === null || legRoutes[index] || requests.current.has(index)) return
    const leg = details?.legs[index]
    if (leg && (leg.pathIsSchematic || leg.instruction === '打车接续' || leg.instruction.startsWith('步行至') || leg.instruction === '步行前往下一站')) void loadLeg(index)
  }

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
        <div className="route-map-panel" ref={mapArea}>
          <nav className="route-map-controls" aria-label="选择地图行程">
            <button type="button" aria-pressed={selectedIndex === null} onClick={() => selectLeg(null)}>查看全程</button>
            {details.legs.map((_, index) => <button type="button" key={index} aria-pressed={selectedIndex === index} onClick={() => selectLeg(index)}>第 {index + 1} 步</button>)}
          </nav>
          <div className="route-segment-summary" aria-live="polite">
            {selectedLeg ? <>
              <strong>第 {selectedIndex! + 1} 步 · {selectedLeg.instruction}</strong>
              {(selectedLeg.from || selectedLeg.to) && <p>{[selectedLeg.from, selectedLeg.to].filter(Boolean).join(' → ')}</p>}
              <span>{[selectedRoad?.route ? '本段道路规划' : '', (selectedRoad?.route?.minutes ?? selectedLeg.minutes) !== undefined ? `约 ${selectedRoad?.route?.minutes ?? selectedLeg.minutes} 分钟` : '', formatDistance(selectedRoad?.route?.distanceMeters ?? selectedLeg.distanceMeters)].filter(Boolean).join(' · ')}</span>
            </> : <span>当前显示全程，点击任一步查看本段地图与指引。</span>}
          </div>
          {mapDetails && (mapDetails.origin || mapDetails.destination || mapDetails.legs.some((leg) => leg.path.length > 1))
            ? <RouteMap details={mapDetails} label={selectedLeg ? `第 ${selectedIndex! + 1} 步的地图路线` : `${route.name}的全程地图路线`} originLabel={selectedLeg?.from || '出发'} destinationLabel={selectedLeg?.to || '到达'} />
            : <p className="detail-empty">该步暂未提供地图坐标，请参考文字指引。</p>}
          {selectedRoad?.loading && <p className="route-segment-status" role="status">正在加载本段道路路线与指引…</p>}
          {selectedRoad?.error && <p className="route-segment-status" role="status">{selectedRoad.error}<button type="button" onClick={() => void loadLeg(selectedIndex!)}>重试</button></p>}
          {selectedLeg?.pathIsSchematic && !selectedRoad?.route && <p className="route-segment-status">当前虚线仅连接本段起终点，不代表实际行驶轨迹。</p>}
          {selectedRoad?.route?.details && <div className="route-segment-directions">
            <h3>本段怎么走</h3>
            <ol>{selectedRoad.route.details.legs.map((leg, index) => <li key={index}><span>{leg.instruction}</span>{leg.distanceMeters !== undefined && <small>{formatDistance(leg.distanceMeters)}</small>}</li>)}</ol>
          </div>}
        </div>
        <div className="route-dialog-content">
          <h3>怎么走</h3>
          {details.legs.length ? <ol className="detail-leg-list">{details.legs.map((leg, index) => <Leg leg={leg} index={index} key={index} selected={selectedIndex === index} hasRoad={Boolean(legRoutes[index]?.route)} onSelect={() => selectLeg(index)} />)}</ol> : <p className="detail-empty">高德未提供分段指引，请尝试更具体的起终点。</p>}
        </div>
      </>}
      <p className="route-dialog-note"><MapPin size={14} />地图路线与指引仅用于行前参考，出行时请留意现场路况和站点信息。{details?.legs.some((leg) => leg.pathIsSchematic) && '虚线为起终点连线，不代表实际道路或铁路轨迹。'}{route.estimatedFare && '费用不含动态加价、夜间附加费及可能的通行费。'}</p>
    </section>
  </div>
}
