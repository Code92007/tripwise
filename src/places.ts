export type PlaceSelection = {
  label: string
  location: string
  citycode?: string
  adcode?: string
  detail?: string
}

type Data = Record<string, unknown>

function object(value: unknown): Data {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function validLocation(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = value.split(',')
  if (parts.length !== 2 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) return false
  const [longitude, latitude] = parts.map(Number)
  return longitude >= 70 && longitude <= 140 && latitude >= 0 && latitude <= 60
}

export function validSelection(value: unknown): value is PlaceSelection {
  const place = object(value)
  return string(place.label).length >= 2 && string(place.label).length <= 120 && validLocation(place.location)
    && (!place.citycode || /^\d{3,6}$/.test(string(place.citycode)))
}

export function parseTips(payload: unknown): PlaceSelection[] {
  const tips = object(payload).tips
  if (!Array.isArray(tips)) return []
  return tips.flatMap((item) => {
    const tip = object(item)
    const name = string(tip.name)
    if (!name || !validLocation(tip.location)) return []
    const district = string(tip.district)
    const address = string(tip.address)
    const detail = [district, address].filter(Boolean).join(' · ')
    return [{ label: [district, name].filter(Boolean).join(' '), location: tip.location, adcode: string(tip.adcode), detail }]
  }).slice(0, 8)
}

export function parseReverseGeocode(payload: unknown, location: string): PlaceSelection | null {
  const regeocode = object(object(payload).regeocode)
  const address = string(regeocode.formatted_address)
  if (!address || !validLocation(location)) return null
  const component = object(regeocode.addressComponent)
  const street = object(component.streetNumber)
  const detail = [string(street.street), string(street.number)].filter(Boolean).join('')
  return { label: address, location, citycode: string(component.citycode), adcode: string(component.adcode), detail }
}
