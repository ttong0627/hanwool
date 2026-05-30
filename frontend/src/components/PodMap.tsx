import { useEffect, useRef, useState } from 'react'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined

export type MapPt = { lat: number; lng: number; label: string }

/** Kakao SDK를 1회만 로드(스크립트 id 공유)하고 maps 준비되면 resolve */
function loadKakao(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any
    if (w.kakao?.maps) { w.kakao.maps.load(() => resolve(w.kakao)); return }
    const id = 'kakao-maps-sdk'
    const ready = () => w.kakao.maps.load(() => resolve(w.kakao))
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', ready)
      if (w.kakao) ready()
      return
    }
    const s = document.createElement('script')
    s.id = id
    s.async = true
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`
    s.onload = ready
    s.onerror = () => reject(new Error('SDK load failed'))
    document.head.appendChild(s)
  })
}

function pin(color: string, text: string): string {
  return `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
    <div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3);">${text}</div>
    <div style="width:11px;height:11px;background:${color};border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>
  </div>`
}

function distText(m?: number | null): string {
  if (m == null) return ''
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
}

/** 배송지(파랑)와 기사 완료위치(주황)를 한 지도에 함께 표시. 둘 다 있으면 연결선 + 거리. */
export function PodMap({ delivery, pod, distanceM }: { delivery: MapPt | null; pod: MapPt | null; distanceM?: number | null }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!KAKAO_MAP_KEY) { setError('카카오 지도 키가 설정되지 않았습니다.'); return }
    if (!delivery && !pod) { setError('표시할 좌표가 없습니다.'); return }
    let cancelled = false
    loadKakao()
      .then((kakao) => {
        if (cancelled || !elRef.current) return
        const center = (delivery ?? pod)!
        const map = new kakao.maps.Map(elRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 4,
        })
        const bounds = new kakao.maps.LatLngBounds()
        const path: any[] = []
        const place = (p: MapPt, color: string) => {
          const pos = new kakao.maps.LatLng(p.lat, p.lng)
          new kakao.maps.CustomOverlay({ map, position: pos, yAnchor: 1, content: pin(color, p.label) })
          bounds.extend(pos)
          path.push(pos)
        }
        if (delivery) place(delivery, '#2563eb')
        if (pod) place(pod, '#f97316')
        if (path.length === 2) {
          new kakao.maps.Polyline({ map, path, strokeWeight: 3, strokeColor: '#ef4444', strokeOpacity: 0.85, strokeStyle: 'shortdash' })
          map.setBounds(bounds, 48, 48, 48, 48)
        }
      })
      .catch(() => { if (!cancelled) setError('지도를 불러오지 못했습니다.') })
    return () => { cancelled = true }
  }, [delivery?.lat, delivery?.lng, pod?.lat, pod?.lng])

  if (error) {
    return <div className="flex h-56 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">{error}</div>
  }
  return (
    <div className="relative">
      <div ref={elRef} className="h-56 w-full rounded-lg border border-gray-200" />
      <div className="absolute left-2 top-2 flex flex-col gap-1 text-[11px]">
        {delivery && <span className="inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 font-semibold text-blue-600 shadow"><span className="h-2 w-2 rounded-full bg-blue-600" />배송지</span>}
        {pod && <span className="inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 font-semibold text-orange-600 shadow"><span className="h-2 w-2 rounded-full bg-orange-500" />기사 완료위치</span>}
      </div>
      {distanceM != null && distanceM > 0 && (
        <div className={`absolute right-2 top-2 rounded px-2 py-1 text-xs font-bold shadow ${distanceM >= 30 ? 'bg-red-600 text-white' : 'bg-white/90 text-gray-700'}`}>
          거리 {distText(distanceM)}
        </div>
      )}
    </div>
  )
}
