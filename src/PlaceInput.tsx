import { useEffect, useId, useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import { suggestPlaces } from './placeApi'
import type { PlaceSelection } from './places'

type Props = {
  kind: 'origin' | 'destination'
  value: string
  selection?: PlaceSelection
  onChange: (value: string) => void
  onSelect: (place: PlaceSelection) => void
  onLocate?: () => Promise<void>
  locating?: boolean
}

export function PlaceInput({ kind, value, selection, onChange, onSelect, onLocate, locating }: Props) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const [places, setPlaces] = useState<PlaceSelection[]>([])
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const label = kind === 'origin' ? '出发地' : '目的地'

  useEffect(() => {
    if (!focused || selection || value.trim().length < 2) {
      setPlaces([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        setPlaces(await suggestPlaces(value.trim(), controller.signal))
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '地点补全暂不可用')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 350)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [focused, selection, value])

  function choose(place: PlaceSelection) {
    onSelect(place)
    setPlaces([])
    setFocused(false)
    setActive(-1)
    document.getElementById(id)?.blur()
  }

  const showList = focused && !selection && value.trim().length >= 2 && (places.length > 0 || loading || Boolean(error))

  return <div className="place-input-wrap">
    <div className="place-field">
      <span className={`place-icon ${kind}`}><MapPin size={16} /></span>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input id={id} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={`${id}-list`} aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
        value={value} placeholder={`输入${label}`} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => { setActive(-1); onChange(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && places.length) { event.preventDefault(); setActive((current) => (current + 1) % places.length) }
          if (event.key === 'ArrowUp' && places.length) { event.preventDefault(); setActive((current) => current <= 0 ? places.length - 1 : current - 1) }
          if (event.key === 'Enter' && active >= 0 && places[active]) { event.preventDefault(); choose(places[active]) }
          if (event.key === 'Escape') { setPlaces([]); setFocused(false) }
        }} />
      {onLocate && <button className="place-locate" type="button" title="定位当前出发地" aria-label="定位当前出发地" disabled={locating} onClick={onLocate}><LocateFixed size={17} className={locating ? 'locating' : ''} /></button>}
    </div>
    {showList && <div id={`${id}-list`} className="place-suggestions" role="listbox" aria-label={`${label}候选地点`}>
      {loading && !places.length && <p className="place-suggestion-status">正在搜索地点…</p>}
      {error && <p className="place-suggestion-status" role="status">{error}</p>}
      {places.map((place, index) => <button id={`${id}-option-${index}`} role="option" aria-selected={active === index} className={`place-suggestion ${active === index ? 'active' : ''}`} type="button" key={`${place.location}-${index}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}><strong>{place.label}</strong>{place.detail && <small>{place.detail}</small>}</button>)}
    </div>}
  </div>
}
