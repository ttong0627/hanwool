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
interface KakaoMarkerImage {
  _brand: never
}

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void
        Map: new (el: HTMLElement, opts: object) => KakaoMap
        Marker: new (opts: object) => KakaoMarker
        MarkerImage: new (src: string, size: object, opts?: object) => KakaoMarkerImage
        Size: new (w: number, h: number) => object
        Point: new (x: number, y: number) => object
        LatLng: new (lat: number, lng: number) => object
        InfoWindow: new (opts: object) => KakaoInfoWindow
      }
    }
  }
}

// 경기도 광주시 경안동 33-16 (Nominatim 검증 좌표)
const MARKET_LAT = 37.4090
const MARKET_LNG = 127.2574

// 경안시장 마커 HTML — 주황색 store 아이콘 + 라벨
const MARKET_MARKER_CONTENT = `
<div style="
  display:flex;flex-direction:column;align-items:center;
  transform:translateX(-50%) translateY(-100%);
  filter: drop-shadow(0 4px 8px rgba(249,115,22,0.45));
">
  <div style="
    background:linear-gradient(135deg,#ea580c,#f97316);
    border-radius:50%;
    width:40px;height:40px;
    display:flex;align-items:center;justify-content:center;
    border:3px solid #fff;
    box-shadow:0 2px 8px rgba(234,88,12,0.5);
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  </div>
  <div style="
    margin-top:4px;
    background:rgba(234,88,12,0.92);
    color:#fff;
    font-size:11px;font-weight:700;
    padding:2px 8px;border-radius:99px;
    white-space:nowrap;
    box-shadow:0 1px 4px rgba(0,0,0,0.18);
  ">경안시장</div>
  <div style="width:2px;height:8px;background:rgba(234,88,12,0.6);margin-top:2px;"></div>
</div>`

export function KakaoDriverMap({ drivers, apiKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markersRef = useRef<KakaoMarker[]>([])
  const marketMarkerRef = useRef<KakaoMarker | null>(null)

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
        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(MARKET_LAT, MARKET_LNG),
          level: 5,
        })
        mapRef.current = map

        // 경안시장 커스텀 오버레이 마커
        const CustomOverlay = (window.kakao.maps as unknown as {
          CustomOverlay?: new (opts: object) => { setMap: (m: KakaoMap) => void }
        }).CustomOverlay

        if (CustomOverlay) {
          const overlay = new CustomOverlay({
            position: new window.kakao.maps.LatLng(MARKET_LAT, MARKET_LNG),
            content: MARKET_MARKER_CONTENT,
            yAnchor: 0,
          })
          overlay.setMap(map)
        } else {
          // 폴백: 기본 마커 + 인포윈도우
          const pos = new window.kakao.maps.LatLng(MARKET_LAT, MARKET_LNG)
          const marker = new window.kakao.maps.Marker({ position: pos, map })
          marketMarkerRef.current = marker
          const iw = new window.kakao.maps.InfoWindow({
            content: `<div style="padding:5px 10px;font-size:13px;font-weight:700;color:#ea580c;">🏪 경안시장</div>`,
          })
          iw.open(map, marker)
        }
      })
    }
  }, [apiKey])

  // 기사 핀 업데이트
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return

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
