import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Camera, CheckCircle2, ListOrdered, MapPin, Phone, RefreshCw, Route, Search, Truck, X } from 'lucide-react'
import api from '@/lib/api'
import { StatusBadge } from '@/components/StatusBadge'
import { DriverTone, getDriverTone } from '@/lib/driverColors'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
// 경안시장: 경기도 광주시 경안동 33-16 (Nominatim 검증 좌표)
const MARKET_LAT = 37.4090
const MARKET_LNG = 127.2574

// 동 표시 순서 (배차 우선순위 동일)
const DONG_ORDER = ['경안동', '탄벌동', '송정동', '쌍령동']

type KakaoAny = any
type DriverFilter = number | 'all' | 'unassigned'
type StatusFilter = 'all' | 'in_transit' | 'delivered' | 'delayed'

interface Order {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  status: string
  dong: string
  delivery_address: string
  items_desc?: string
  quantity: number
  sequence?: number
  driver_id?: number | null
  driver_name?: string | null
  driver_phone?: string | null
  request?: string | null
  lat?: number | null
  lng?: number | null
  pod_lat?: number | null
  pod_lng?: number | null
  delivery_photo_path?: string | null
  delivery_photo_url?: string | null
  delivery_signature_url?: string | null
  created_at: string
  delivered_at?: string | null
  picked_up_at?: string | null
}

interface Driver {
  id: number
  name: string
  phone: string
  is_active: boolean
}

interface DriverLocation {
  driver_id: number
  order_id: number
  order_no: string
  dong: string
  lat: number | null
  lng: number | null
  updated_at: string | null
}

function hasCoord(o: Order) {
  return typeof o.lat === 'number' && typeof o.lng === 'number'
}

// 투명 1×1 PNG — 클릭 영역 전용 (Kakao 기본 핀 숨김)
const TRANSPARENT_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function makePinEl(
  bg: string,
  seq: number | string,
  label: string,
  selected: boolean,
  isDelayed: boolean,
  onClick: () => void,
  gradient?: string,
  shadowColor?: string,
): HTMLDivElement {
  const sz = selected ? 54 : 44
  const fs = selected ? 21 : 17
  const tri = selected ? 14 : 11
  const border = selected ? 4 : 3
  const isDriver = bg !== '#9ca3af'
  const labelBg = isDelayed
    ? 'rgba(185,28,28,.92)'
    : (selected && isDriver) ? bg : 'rgba(0,0,0,.82)'
  const prefix = isDelayed ? '⚠ ' : ''
  const pinBg = (selected && gradient) ? gradient : bg
  const glow = (selected && shadowColor)
    ? `0 6px 28px ${shadowColor}, 0 2px 8px rgba(0,0,0,.28)`
    : '0 4px 16px rgba(0,0,0,.40)'
  const outline = isDelayed
    ? ';outline:3px dashed #ef4444;outline-offset:2px'
    : (selected && isDriver)
      ? `;outline:4px solid ${bg};outline-offset:3px`
      : ''
  const el = document.createElement('div')
  el.style.cssText = 'pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:0;cursor:pointer;user-select:none;touch-action:manipulation;'
  el.setAttribute('role', 'button')
  el.setAttribute('tabindex', '0')
  el.setAttribute('aria-label', `${seq}번 ${label}`)
  el.innerHTML = `
    <div style="margin-bottom:5px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 9px;background:${labelBg};color:#fff;font-size:10px;font-weight:700;border-radius:5px;box-shadow:0 2px 6px rgba(0,0,0,.28);">${prefix}${label}</div>
    <div style="display:flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:50%;background:${pinBg};border:${border}px solid #fff;box-shadow:${glow}${outline};">
      <span style="color:#fff;font-size:${fs}px;font-weight:900;line-height:1;">${seq}</span>
    </div>
    <div style="width:0;height:0;border-left:${tri}px solid transparent;border-right:${tri}px solid transparent;border-top:${tri + 1}px solid ${bg};"></div>
  `
  const select = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    onClick()
  }
  el.addEventListener('click', select)
  el.addEventListener('pointerdown', (e) => e.stopPropagation())
  el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true })
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') select(e)
  })
  return el
}

function MapView({
  orders,
  driverLocations,
  driverToneMap,
  selectedId,
  onSelect,
  viewportKey,
}: {
  orders: Order[]
  driverLocations: DriverLocation[]
  driverToneMap: Map<number, DriverTone>
  selectedId?: number
  onSelect: (order: Order) => void
  viewportKey: string
}) {
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoAny | null>(null)
  const markersRef = useRef<KakaoAny[]>([])
  const overlaysRef = useRef<KakaoAny[]>([])
  const driverOverlaysRef = useRef<KakaoAny[]>([])
  const startOverlayRef = useRef<KakaoAny | null>(null)
  const lineRef = useRef<KakaoAny | null>(null)
  const lastFitKeyRef = useRef('')
  const lastCenteredIdRef = useRef<number | undefined>()
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState('')

  // SDK 초기화
  useEffect(() => {
    if (!KAKAO_MAP_KEY || !mapEl.current) return
    const scriptId = 'kakao-maps-sdk'
    const init = () => {
      const kakao = (window as any).kakao
      if (!kakao?.maps) return
      kakao.maps.load(() => {
        if (!mapEl.current || mapRef.current) return
        mapRef.current = new kakao.maps.Map(mapEl.current, {
          center: new kakao.maps.LatLng(MARKET_LAT, MARKET_LNG),
          level: 5,
        })
        setReady(true)
      })
    }
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`
      script.async = true
      script.onload = init
      script.onerror = () => setMapError('카카오 지도 SDK를 불러오지 못했습니다. JavaScript 키와 도메인 등록을 확인해 주세요.')
      document.head.appendChild(script)
    } else {
      init()
    }
  }, [])

  // 경안시장 출발 마커 (항상 표시)
  useEffect(() => {
    if (!ready || !mapRef.current || !(window as any).kakao?.maps) return
    startOverlayRef.current?.setMap(null)
    const pos = new (window as any).kakao.maps.LatLng(MARKET_LAT, MARKET_LNG)
    startOverlayRef.current = new (window as any).kakao.maps.CustomOverlay({
      position: pos,
      xAnchor: 0.5,
      yAnchor: 1.0,
      content: `
        <style>
          @keyframes mktPulse {
            0%   { transform: translate(-50%,-50%) scale(1);   opacity: .55; }
            70%  { transform: translate(-50%,-50%) scale(2.2); opacity: 0;   }
            100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0;   }
          }
          @keyframes mktPulse2 {
            0%   { transform: translate(-50%,-50%) scale(1);   opacity: .35; }
            70%  { transform: translate(-50%,-50%) scale(2.8); opacity: 0;   }
            100% { transform: translate(-50%,-50%) scale(2.8); opacity: 0;   }
          }
        </style>
        <div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:0;position:relative;">
          <!-- 펄스 링 1 -->
          <div style="position:absolute;top:38px;left:50%;width:54px;height:54px;border-radius:50%;background:rgba(249,115,22,.5);animation:mktPulse 2s ease-out infinite;"></div>
          <!-- 펄스 링 2 -->
          <div style="position:absolute;top:38px;left:50%;width:54px;height:54px;border-radius:50%;background:rgba(249,115,22,.3);animation:mktPulse2 2s .5s ease-out infinite;"></div>
          <!-- 라벨 -->
          <div style="
            margin-bottom:8px;
            padding:5px 14px;
            background:linear-gradient(135deg,#ea580c,#f97316);
            color:#fff;
            font-size:13px;
            font-weight:900;
            border-radius:99px;
            white-space:nowrap;
            box-shadow:0 4px 18px rgba(234,88,12,.65);
            border:2px solid rgba(255,255,255,.55);
            letter-spacing:-.2px;
          ">&#127978; 경안시장 출발</div>
          <!-- 사각 마커 본체 (주문핀과 다른 형태) -->
          <div style="
            position:relative;z-index:1;
            width:58px;height:58px;
            background:linear-gradient(145deg,#f97316,#ea580c);
            border:4px solid #fff;
            border-radius:12px;
            box-shadow:0 10px 30px rgba(249,115,22,.7), 0 2px 8px rgba(0,0,0,.25);
            display:flex;align-items:center;justify-content:center;
            transform:rotate(0deg);
          ">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <!-- 꼬리 -->
          <div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-top:16px solid #ea580c;margin-top:-1px;"></div>
        </div>`,
    })
    startOverlayRef.current.setMap(mapRef.current)
  }, [ready])

  // 주문 핀 마커 + 경로선
  useEffect(() => {
    if (!ready || !mapRef.current || !(window as any).kakao?.maps) return
    markersRef.current.forEach((m) => m.setMap(null))
    overlaysRef.current.forEach((o) => o.setMap(null))
    lineRef.current?.setMap(null)
    markersRef.current = []
    overlaysRef.current = []
    lineRef.current = null
    const kakao = (window as any).kakao

    const coordOrders = orders.filter(hasCoord)
    const shouldFit = lastFitKeyRef.current !== viewportKey
    if (coordOrders.length === 0) {
      if (shouldFit) {
        lastFitKeyRef.current = viewportKey
        mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(MARKET_LAT, MARKET_LNG))
      }
      return
    }

    const bounds = new kakao.maps.LatLngBounds()
    const path: KakaoAny[] = []

    coordOrders.forEach((order, index) => {
      const pos = new kakao.maps.LatLng(order.lat, order.lng)
      bounds.extend(pos)
      path.push(pos)

      const isSelected = selectedId === order.id
      const isDelayed = order.status === 'delayed'
      const tone = order.driver_id ? (driverToneMap.get(order.driver_id) ?? null) : null
      const bg = tone ? tone.primary : '#9ca3af'
      const seq = order.sequence ?? index + 1
      const label = `${order.customer_name} · ${order.quantity}개`

      const pinEl = makePinEl(bg, seq, label, isSelected, isDelayed, () => onSelect(order), tone?.gradient, tone?.shadow)

      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        xAnchor: 0.5,
        yAnchor: 1.0,
        content: pinEl,
        zIndex: isSelected ? 10000 : 100 + Number(seq || 0),
      })
      overlay.setMap(mapRef.current)
      overlaysRef.current.push(overlay)
    })

    if (path.length >= 2) {
      const routeLine = new (window as any).kakao.maps.Polyline({
        path,
        strokeWeight: 3,
        strokeColor: '#94a3b8',
        strokeOpacity: 0.5,
        strokeStyle: 'dashed',
      })
      routeLine.setMap(mapRef.current)
      lineRef.current = routeLine
    }
    if (shouldFit) {
      mapRef.current.setBounds(bounds)
      lastFitKeyRef.current = viewportKey
    }
  }, [orders, driverToneMap, ready, selectedId, viewportKey])

  // 기사 실시간 위치 핀
  useEffect(() => {
    if (!ready || !mapRef.current || !(window as any).kakao?.maps) return
    driverOverlaysRef.current.forEach((o) => o.setMap(null))
    driverOverlaysRef.current = []

    const latest = new Map<number, DriverLocation>()
    driverLocations.forEach((loc) => {
      if (loc.lat !== null && loc.lng !== null) latest.set(loc.driver_id, loc)
    })

    latest.forEach((loc) => {
      const pos = new (window as any).kakao.maps.LatLng(loc.lat, loc.lng)
      const driverTone = driverToneMap.get(loc.driver_id)
      const driverColor = driverTone?.primary ?? '#7c3aed'
      const driverGrad = driverTone?.gradient ?? driverColor
      const driverShadow = driverTone?.shadow ?? 'rgba(124,58,237,.35)'
      const overlay = new (window as any).kakao.maps.CustomOverlay({
        position: pos,
        xAnchor: 0.5,
        yAnchor: 1.0,
        content: `<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:0;">
          <div style="margin-bottom:5px;padding:3px 8px;background:${driverGrad};color:#fff;font-size:10px;font-weight:700;border-radius:5px;white-space:nowrap;box-shadow:0 2px 8px ${driverShadow};opacity:.97;">기사 위치</div>
          <div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:${driverGrad};border:3px solid white;box-shadow:0 4px 18px ${driverShadow};font-size:22px;">🚗</div>
          <div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-top:13px solid ${driverColor};"></div>
        </div>`,
      })
      overlay.setMap(mapRef.current)
      driverOverlaysRef.current.push(overlay)
    })
  }, [driverLocations, driverToneMap, ready])

  // 선택 주문 지도 중심 이동
  useEffect(() => {
    if (!selectedId) { lastCenteredIdRef.current = undefined; return }
    if (lastCenteredIdRef.current === selectedId) return
    const sel = orders.find((o) => o.id === selectedId)
    if (!ready || !mapRef.current || !sel || !hasCoord(sel) || !(window as any).kakao?.maps) return
    lastCenteredIdRef.current = selectedId
    mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(sel.lat, sel.lng))
  }, [orders, ready, selectedId])

  const coordCount = orders.filter(hasCoord).length
  const noCoordCount = orders.length - coordCount

  return (
    <div className="map-premium relative" style={{ height: 'calc(100vh - 320px)', minHeight: '480px' }}>
      <div ref={mapEl} className="h-full w-full" />

      {/* 지도 키 없음 / SDK 로드 실패 — 전체 덮개 */}
      {(!KAKAO_MAP_KEY || !!mapError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm p-6 text-center">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-7 w-7 text-gray-300" />
            </div>
            <div className="text-sm font-semibold text-gray-700">
              {!KAKAO_MAP_KEY ? '지도 키가 설정되지 않았습니다.' : mapError}
            </div>
            <div className="mt-1 text-xs text-gray-400">서버 .env에 KAKAO_MAP_KEY를 설정하면 실시간 지도가 표시됩니다.</div>
          </div>
        </div>
      )}

      {/* 좌표 없는 주문 안내 — 소형 배너 (지도는 계속 표시) */}
      {coordCount === 0 && !mapError && !!KAKAO_MAP_KEY && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg">
            <MapPin className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <span className="text-gray-700 font-medium">좌표가 저장된 주문이 없습니다.</span>
            <span className="text-gray-400 text-xs">주문관리에서 주소를 저장하면 핀이 표시됩니다.</span>
          </div>
        </div>
      )}

      {/* 글래스모피즘 범례 패널 */}
      <div className="glass-panel absolute bottom-3 left-3 rounded-xl px-3.5 py-2.5 text-[11px]">
        <div className="flex items-center gap-2.5 text-gray-600 mb-1.5">
          <span className="font-semibold text-gray-700">좌표</span>
          <span className="tabular-nums font-bold text-gray-900">{coordCount}</span>
          <span className="text-gray-400">/</span>
          <span className="tabular-nums text-gray-600">{orders.length}건</span>
          {noCoordCount > 0 && (
            <span className="font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md">
              미설정 {noCoordCount}건
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span style={{ background: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' }} className="inline-block h-2.5 w-2.5 rounded-full" />
            <span className="text-gray-600">경안시장</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ background: '#9ca3af' }} className="inline-block h-2.5 w-2.5 rounded-full" />
            <span className="text-gray-500">미배정</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" style={{ border: '1.5px dashed #ef4444' }} />
            <span className="text-red-500">지연</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export function DeliveryTracking() {
  const [selectedDriverId, setSelectedDriverId] = useState<DriverFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>()
  const [search, setSearch] = useState('')
  const [showConfirmSeq, setShowConfirmSeq] = useState(false)
  const [podPreviewUrl, setPodPreviewUrl] = useState<string | null>(null)
  const [seqToast, setSeqToast] = useState<string | null>(null)
  const rowRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const listRef = useRef<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()

  const { data: orders = [], isLoading, refetch, isFetching } = useQuery<Order[]>({
    queryKey: ['delivery-tracking-orders'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['delivery-tracking-drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: driverLocations = [] } = useQuery<DriverLocation[]>({
    queryKey: ['driver-locations'],
    queryFn: () => api.get('/deliveries/drivers/locations').then((r) => r.data),
    refetchInterval: 10_000,
  })

  // 지연 알림 WebSocket
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket
    try {
      ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${token}`)
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'delay_alert') {
            queryClient.invalidateQueries({ queryKey: ['delivery-tracking-orders'] })
          }
        } catch { /* ignore */ }
      }
    } catch { /* WS 미지원 환경 */ }
    return () => ws?.close()
  }, [queryClient])

  const autoSequenceMutation = useMutation({
    mutationFn: () => api.post('/orders/sequence/auto').then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-tracking-orders'] })
      const msg = (data?.changed ?? 0) > 0
        ? `${data.changed}개 배송 순번이 최적화되었습니다.`
        : data?.updated === 0
          ? '배정된 주문이 없습니다. 먼저 배차를 실행해 주세요.'
          : '이미 최적 경로입니다.'
      setSeqToast(msg)
      setTimeout(() => setSeqToast(null), 4000)
    },
  })

  const regeocodeAllMutation = useMutation({
    mutationFn: () => api.post('/orders/regeocode-unresolved').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-tracking-orders'] }),
  })

  const visibleOrders = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled'),
    [orders]
  )

  // 오늘 배송에 참여 중인 기사 목록 (주문 순서대로 안정적으로 색상 부여)
  const driverGroups = useMemo(() => {
    const countByDriver = new Map<number, number>()
    visibleOrders.forEach((o) => {
      if (o.driver_id) countByDriver.set(o.driver_id, (countByDriver.get(o.driver_id) ?? 0) + 1)
    })
    return drivers
      .filter((d) => countByDriver.has(d.id))
      .map((d) => ({ ...d, count: countByDriver.get(d.id) ?? 0 }))
  }, [drivers, visibleOrders])

  // 기사 ID → 고유 색상 매핑 (driver.id 기반 — 모든 메뉴에서 동일한 색상)
  const driverColorMap = useMemo(() => {
    const map = new Map<number, string>()
    driverGroups.forEach((d) => map.set(d.id, getDriverTone(d.id).primary))
    return map
  }, [driverGroups])

  const driverToneMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof getDriverTone>>()
    driverGroups.forEach((d) => map.set(d.id, getDriverTone(d.id)))
    return map
  }, [driverGroups])

  const unassignedCount = visibleOrders.filter((o) => !o.driver_id).length
  const delayedCount = visibleOrders.filter((o) => o.status === 'delayed').length
  const inProgressCount = visibleOrders.filter((o) =>
    ['assigned', 'picked_up', 'in_transit'].includes(o.status)
  ).length
  const noCoordCount = visibleOrders.filter((o) => !hasCoord(o)).length

  // 동별 현황 — 경안동/탄벌동/송정동/쌍령동 고정 순서
  const dongStats = useMemo(() => {
    const map = new Map<string, { total: number; delivered: number; active: number; delayed: number }>()
    visibleOrders.forEach((o) => {
      const curr = map.get(o.dong) ?? { total: 0, delivered: 0, active: 0, delayed: 0 }
      curr.total++
      if (o.status === 'delivered') curr.delivered++
      else if (o.status === 'delayed') curr.delayed++
      else if (['assigned', 'picked_up', 'in_transit'].includes(o.status)) curr.active++
      map.set(o.dong, curr)
    })
    return DONG_ORDER
      .filter((dong) => map.has(dong))
      .map((dong) => [dong, map.get(dong)!] as const)
  }, [visibleOrders])

  const selectedOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return visibleOrders
      .filter((o) => {
        if (selectedDriverId === 'all') return true
        if (selectedDriverId === 'unassigned') return !o.driver_id
        return o.driver_id === selectedDriverId
      })
      .filter((o) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'in_transit') return ['assigned', 'picked_up', 'in_transit'].includes(o.status)
        return o.status === statusFilter
      })
      .filter((o) => {
        if (!keyword) return true
        return [o.order_no, o.customer_name, o.customer_phone, o.dong, o.delivery_address, o.items_desc, o.driver_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(keyword))
      })
      .sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999))
  }, [search, selectedDriverId, statusFilter, visibleOrders])

  const selectedOrder = selectedOrders.find((o) => o.id === selectedOrderId)
  const handleMapSelect = useCallback((order: Order) => setSelectedOrderId(order.id), [])
  const viewportKey = String(selectedDriverId)

  // 핀 클릭 시 명단 리스트 스크롤 — 선택 아이템을 컨테이너 중앙에 위치
  useEffect(() => {
    if (!selectedOrderId) return
    // React 렌더 완료 후 실행 (requestAnimationFrame × 2 = 다음 페인트 후)
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = rowRefs.current[selectedOrderId]
        const container = listRef.current
        if (!el || !container) return
        const elRect = el.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const scrollTop =
          container.scrollTop +
          elRect.top -
          containerRect.top -
          container.clientHeight / 2 +
          el.offsetHeight / 2
        container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [selectedOrderId])

  return (
    <div className="space-y-4 p-6 page-fade-in">
      {/* 순번 적용 결과 토스트 */}
      {seqToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Route className="h-4 w-4 text-brand-400 shrink-0" />
            {seqToast}
          </div>
        </div>
      )}
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Truck className="h-6 w-6 text-brand-500" />
            배송 확인
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">기사 실시간 위치 · 배송 상태 · 경로를 확인합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {noCoordCount > 0 && (
            <button
              onClick={() => regeocodeAllMutation.mutate()}
              disabled={regeocodeAllMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-60"
            >
              <MapPin className="h-4 w-4" />
              좌표 미설정 {noCoordCount}건 재처리
              {regeocodeAllMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            </button>
          )}
          <button
            onClick={() => setShowConfirmSeq(true)}
            className="btn-primary flex items-center gap-1.5 text-sm"
            disabled={autoSequenceMutation.isPending}
          >
            <ListOrdered className="h-4 w-4" />배송 순번 적용
          </button>
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm" disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />새로고침
          </button>
        </div>
      </div>

      {/* 지연 알림 배너 */}
      {delayedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <span className="text-sm font-semibold text-red-800">
            지연 주문 {delayedCount}건이 발생했습니다. 기사에게 즉시 연락하세요.
          </span>
        </div>
      )}

      {/* 동별 현황 카드 — 경안동/탄벌동/송정동/쌍령동 고정 순서 */}
      {dongStats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {dongStats.map(([dong, stat]) => {
            const rate = stat.total ? Math.round((stat.delivered / stat.total) * 100) : 0
            return (
              <div key={dong} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{dong}</span>
                  {stat.delayed > 0 && (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">지연 {stat.delayed}</span>
                  )}
                </div>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-xl font-black text-gray-900">{stat.delivered}</span>
                  <span className="mb-0.5 text-xs text-gray-500">/ {stat.total}건</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${rate}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-gray-500">
                  <span>완료율 {rate}%</span>
                  {stat.active > 0 && <span className="text-orange-600">진행 {stat.active}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 필터 바 — 프리미엄 글래스 카드 */}
      <div className="card-elevated rounded-xl p-4 space-y-3">
        {/* 기사 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-400 tracking-wide uppercase">기사</span>
          {/* 전체 */}
          <button
            onClick={() => { setSelectedDriverId('all'); setSelectedOrderId(undefined) }}
            className={`driver-chip transition-all ${
              selectedDriverId === 'all'
                ? 'driver-chip-active border-brand-400 bg-brand-50 text-brand-700 shadow-[0_0_0_3px_rgba(249,115,22,0.10)]'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            전체 · {visibleOrders.length}건
          </button>
          {/* 미배정 */}
          {unassignedCount > 0 && (
            <button
              onClick={() => { setSelectedDriverId('unassigned'); setSelectedOrderId(undefined) }}
              className={`driver-chip transition-all ${
                selectedDriverId === 'unassigned'
                  ? 'driver-chip-active border-gray-400 bg-gray-100 text-gray-800'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400 shrink-0" />
              미배정 · {unassignedCount}건
            </button>
          )}
          {/* 기사별 */}
          {driverGroups.map((driver) => {
            const tone = driverToneMap.get(driver.id) ?? getDriverTone(driver.id)
            const color = tone.primary
            const isActive = selectedDriverId === driver.id
            return (
              <button
                key={driver.id}
                onClick={() => { setSelectedDriverId(driver.id); setSelectedOrderId(undefined) }}
                style={isActive
                  ? { borderColor: tone.border, background: tone.wash, boxShadow: `0 10px 24px ${tone.shadow}` }
                  : { background: 'linear-gradient(135deg, #fff, #f8fafc)' }
                }
                className={`driver-chip transition-all hover:-translate-y-0.5 ${isActive ? 'driver-chip-active' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <span
                  style={{ background: tone.gradient, boxShadow: isActive ? `0 0 0 2px ${tone.border}` : 'none' }}
                  className="h-2.5 w-2.5 rounded-full shrink-0 transition-all"
                />
                <span style={isActive ? { color: tone.text } : {}}>{driver.name}</span>
                <span
                  style={isActive ? { background: tone.soft, color: tone.text } : {}}
                  className={`text-[11px] px-1.5 py-0.5 rounded-full tabular-nums font-bold ${!isActive ? 'text-gray-400' : ''}`}
                >
                  {driver.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* 상태 필터 + 검색 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-400 tracking-wide uppercase">상태</span>
          {([
            { key: 'all', label: '전체' },
            { key: 'in_transit', label: '진행중' },
            { key: 'delivered', label: '완료' },
            { key: 'delayed', label: '지연' },
          ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setStatusFilter(key); setSelectedOrderId(undefined) }}
              className={`driver-chip transition-all ${
                statusFilter === key
                  ? key === 'delayed'
                    ? 'driver-chip-active border-red-400 bg-red-50 text-red-700 shadow-[0_0_0_3px_rgba(239,68,68,0.10)]'
                    : 'driver-chip-active border-brand-400 bg-brand-50 text-brand-700 shadow-[0_0_0_3px_rgba(249,115,22,0.10)]'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
              {key === 'delayed' && delayedCount > 0 && (
                <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white leading-none">
                  {delayedCount}
                </span>
              )}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·주소·기사 검색"
              className="input w-64 pl-8 rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* 지도 + 명단 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MapView
          orders={selectedOrders}
          driverLocations={driverLocations}
          driverToneMap={driverToneMap}
          selectedId={selectedOrderId}
          onSelect={handleMapSelect}
          viewportKey={viewportKey}
        />

        {/* 프리미엄 배송 명단 패널 */}
        <div className="card-elevated rounded-xl overflow-hidden flex flex-col">
          {/* 패널 헤더 */}
          <div
            className="px-4 py-3 border-b border-gray-50"
            style={{ background: 'linear-gradient(90deg, #f8fafc, #ffffff)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-brand-500" />
                  배송 명단
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  <span className="font-semibold tabular-nums text-gray-700">{selectedOrders.length}</span>건 · 배송순번 정렬
                </div>
              </div>
              {delayedCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white">
                  <AlertTriangle className="h-3 w-3" />
                  지연 {delayedCount}
                </span>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="text-center text-sm text-gray-400">
                <div className="skeleton w-8 h-8 rounded-full mx-auto mb-3" />
                불러오는 중...
              </div>
            </div>
          )}
          {!isLoading && selectedOrders.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-16 text-center">
              <div>
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Truck className="h-6 w-6 text-gray-300" />
                </div>
                <div className="text-sm font-medium text-gray-500">표시할 주문이 없습니다.</div>
              </div>
            </div>
          )}

          <div ref={listRef} className="max-h-[calc(100vh-400px)] min-h-[300px] divide-y divide-gray-50/80 overflow-y-auto">
            {selectedOrders.map((order, index) => {
              const isDelayed = order.status === 'delayed'
              const isDelivered = order.status === 'delivered'
              const isSelected = selectedOrderId === order.id
              const driverTone = order.driver_id ? (driverToneMap.get(order.driver_id) ?? getDriverTone(order.driver_id)) : null
              const driverColor = driverTone?.primary ?? '#9ca3af'
              return (
                <button
                  key={order.id}
                  ref={(el) => { rowRefs.current[order.id] = el }}
                  onClick={() => setSelectedOrderId((prev) => prev === order.id ? undefined : order.id)}
                  style={isSelected
                    ? {
                        background: driverTone?.soft ?? 'rgba(156,163,175,0.10)',
                        boxShadow: `inset 4px 0 0 ${driverColor}`,
                        borderBottom: `1px solid ${driverTone?.border ?? 'rgba(156,163,175,0.25)'}`,
                      }
                    : {}
                  }
                  className={`w-full px-3 py-2.5 text-left transition-all duration-150 ${
                    isSelected
                      ? 'ring-0'
                      : isDelayed
                      ? 'bg-red-50/70 hover:bg-red-50 border-l-2 border-l-red-400'
                      : 'hover:bg-gray-50/80'
                  }`}
                >
                  <div className="grid grid-cols-[28px_1fr] items-start gap-2.5">
                    {/* 순번 원 or 체크 아이콘 */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center mt-0.5">
                      {isSelected ? (
                        <CheckCircle2 className="h-6 w-6" style={{ color: driverColor }} />
                      ) : (
                        <div
                          style={{ background: driverTone?.gradient ?? driverColor }}
                          className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                        >
                          {order.sequence ?? index + 1}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-semibold leading-tight ${isDelivered ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {order.customer_name}
                        </span>
                        <StatusBadge status={order.status} />
                        {isDelayed && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                      </div>
                      <div className="truncate text-[11px] text-gray-500 mt-0.5">{order.delivery_address}</div>
                      <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-gray-400">
                        <span className="truncate">{order.items_desc || '물품'} · {order.quantity}개</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {order.driver_id && (
                            <span style={{ background: driverTone?.gradient ?? driverColor }} className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
                          )}
                          <span className="truncate max-w-[72px]">{order.driver_name || '미배정'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 선택 주문 상세 패널 */}
      {selectedOrder && (
        <div className={`rounded-lg border p-4 ${selectedOrder.status === 'delayed' ? 'border-red-300 bg-red-50' : 'border-brand-200 bg-brand-50'}`}>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Route className={`h-5 w-5 ${selectedOrder.status === 'delayed' ? 'text-red-600' : 'text-brand-600'}`} />
              <span className={`font-bold ${selectedOrder.status === 'delayed' ? 'text-red-900' : 'text-brand-900'}`}>
                {selectedOrder.sequence ?? '-'}번 · {selectedOrder.customer_name}
              </span>
              <StatusBadge status={selectedOrder.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-700">{selectedOrder.delivery_address}</span>
              <span className="text-gray-700">{selectedOrder.dong}</span>
              <span className="text-gray-700">{selectedOrder.items_desc || '물품'} · {selectedOrder.quantity}개</span>
              {selectedOrder.driver_name && (
                <span className="flex items-center gap-1 text-gray-700">
                  {selectedOrder.driver_id && (
                    <span
                      style={{ background: driverToneMap.get(selectedOrder.driver_id)?.primary }}
                      className="inline-block h-2.5 w-2.5 rounded-full"
                    />
                  )}
                  기사: {selectedOrder.driver_name}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedOrder.customer_phone && (
                <a
                  href={`tel:${selectedOrder.customer_phone}`}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="h-3.5 w-3.5" />
                  고객 {selectedOrder.customer_phone}
                </a>
              )}
              {selectedOrder.driver_phone && (
                <a
                  href={`tel:${selectedOrder.driver_phone}`}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="h-3.5 w-3.5" />
                  기사 {selectedOrder.driver_phone}
                </a>
              )}
              {selectedOrder.delivery_photo_url && (
                <button
                  onClick={() => setPodPreviewUrl(selectedOrder.delivery_photo_url!)}
                  className="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  <Camera className="h-3.5 w-3.5" />
                  배송 완료 사진
                </button>
              )}
              {selectedOrder.delivery_signature_url && (
                <button
                  onClick={() => setPodPreviewUrl(selectedOrder.delivery_signature_url!)}
                  className="flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Camera className="h-3.5 w-3.5" />
                  수령인 서명
                </button>
              )}
            </div>
            {selectedOrder.request && (
              <div className="w-full rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                요청사항: {selectedOrder.request}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 자동 순번 재적용 확인 모달 */}
      {showConfirmSeq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <h3 className="font-bold text-gray-900">배송 순번 재적용</h3>
            </div>
            <p className="mb-2 text-sm text-gray-600">
              현재 진행 중인 배송이{' '}
              <span className="font-bold text-orange-600">{inProgressCount}건</span> 있습니다.
            </p>
            <p className="mb-5 text-sm text-gray-600">
              순번을 재정렬하면 <strong>기사 앱의 배송 목록 순서가 변경</strong>됩니다.
              계속하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmSeq(false)} className="btn-secondary flex-1">취소</button>
              <button
                onClick={() => { setShowConfirmSeq(false); autoSequenceMutation.mutate() }}
                className="btn-primary flex-1"
              >
                재적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POD 사진 미리보기 모달 */}
      {podPreviewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPodPreviewUrl(null)}
        >
          <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPodPreviewUrl(null)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={podPreviewUrl}
              alt="배송 완료 사진"
              className="h-auto max-h-[80vh] w-full rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}
