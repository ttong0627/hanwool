import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'

interface DriverPin {
  driver_id: number
  name: string
  lat: number
  lng: number
  timestamp: number
}

interface Props {
  drivers: DriverPin[]
  apiKey?: string
}

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void
        Map: new (el: HTMLElement, opts: object) => KakaoMap
        Marker: new (opts: object) => KakaoMarker
        LatLng: new (lat: number, lng: number) => object
        InfoWindow: new (opts: object) => KakaoInfoWindow
      }
    }
  }
}

interface KakaoMap {
  setCenter: (latlng: object) => void
}
interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void
  getPosition: () => object
}
interface KakaoInfoWindow {
  open: (map: KakaoMap, marker: KakaoMarker) => void
  close: () => void
}

const MARKET_LAT = 37.4292
const MARKET_LNG = 127.2551

export function KakaoDriverMap({ drivers, apiKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markersRef = useRef<KakaoMarker[]>([])

  // SDK 로드 + 지도 초기화
  useEffect(() => {
    if (!apiKey || !containerRef.current) return

    const scriptId = 'kakao-maps-sdk'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`
      script.async = true
      document.head.appendChild(script)
      script.onload = () => initMap()
    } else if (window.kakao?.maps) {
      initMap()
    }

    function initMap() {
      window.kakao.maps.load(() => {
        if (!containerRef.current) return
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(MARKET_LAT, MARKET_LNG),
          level: 5,
        })
      })
    }
  }, [apiKey])

  // 기사 핀 업데이트
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return

    // 기존 마커 제거
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    drivers.forEach((d) => {
      const pos = new window.kakao.maps.LatLng(d.lat, d.lng)
      const marker = new window.kakao.maps.Marker({ position: pos, map: mapRef.current! })
      const infowindow = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:13px;font-weight:bold;">${d.name}</div>`,
      })
      infowindow.open(mapRef.current!, marker)
      markersRef.current.push(marker)
    })
  }, [drivers])

  if (!apiKey) {
    return (
      <div className="card flex flex-col items-center justify-center h-48 text-center gap-2 bg-gray-50">
        <MapPin className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-400">카카오맵 API 키 미설정</p>
        <p className="text-xs text-gray-400">
          서버 .env에 <code className="bg-gray-100 px-1 rounded">KAKAO_MAP_KEY</code>를 설정하면 실시간 지도가 표시됩니다
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border border-gray-200"
      style={{ height: 360 }}
    />
  )
}
