import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default map center when no coordinates exist yet — central Israel (Tel Aviv area). */
const DEFAULT_CENTER: [number, number] = [32.0853, 34.7818]
const DEFAULT_ZOOM = 12
const PICKED_ZOOM = 15
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/**
 * Default Leaflet markers reference assets at /marker-icon.png by relative path.
 * In a Vite bundle that path is wrong, so we point the icons at CDN-hosted assets
 * once at module load. This avoids a missing-marker rendering bug.
 */
const DEFAULT_MARKER_ICON = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Coordinates {
  lat: number
  lng: number
}

interface MapClickCaptureProps {
  onPick: (coords: Coordinates) => void
}

/** Single-responsibility child that captures map clicks and forwards them. */
function MapClickCapture({ onPick }: MapClickCaptureProps) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

interface MapCenterControllerProps {
  center: [number, number]
  zoom: number
}

/** Recenters the map whenever the picked coordinates change. */
function MapCenterController({ center, zoom }: MapCenterControllerProps) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom, { animate: true })
  }, [center[0], center[1], zoom, map])
  return null
}

// ─── Public component ───────────────────────────────────────────────────────

export interface MapLocationPickerProps {
  latitude: number | null
  longitude: number | null
  onChange: (coords: Coordinates) => void
  /** Tailwind classes to control map height/width; defaults to a sane size. */
  className?: string
}

/**
 * MapLocationPicker — lets the user click on a map to drop/move a marker.
 * Stateless: the parent owns lat/lng; this component only reports changes.
 */
export default function MapLocationPicker({
  latitude,
  longitude,
  onChange,
  className,
}: MapLocationPickerProps) {
  const markerRef = useRef<L.Marker | null>(null)

  const hasCoords = latitude !== null && longitude !== null
  const markerPosition: [number, number] | null = hasCoords
    ? [latitude as number, longitude as number]
    : null

  const initialCenter: [number, number] = useMemo(
    () => markerPosition ?? DEFAULT_CENTER,
    // intentionally only on mount — controller handles updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const initialZoom = markerPosition ? PICKED_ZOOM : DEFAULT_ZOOM

  const dragHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current
        if (!marker) return
        const { lat, lng } = marker.getLatLng()
        onChange({ lat, lng })
      },
    }),
    [onChange],
  )

  return (
    <div
      className={
        className ??
        'h-64 w-full rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600'
      }
    >
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        <MapClickCapture onPick={onChange} />
        {markerPosition && (
          <>
            <MapCenterController center={markerPosition} zoom={PICKED_ZOOM} />
            <Marker
              position={markerPosition}
              draggable
              eventHandlers={dragHandlers}
              icon={DEFAULT_MARKER_ICON}
              ref={(instance) => {
                markerRef.current = instance
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  )
}
