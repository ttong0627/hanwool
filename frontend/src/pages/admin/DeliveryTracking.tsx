import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Camera, ListOrdered, MapPin, Phone, RefreshCw, Route, Search, Truck, X } from 'lucide-react'
import api from '@/lib/api'
import { StatusBadge } from '@/components/StatusBadge'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
const MARKET_LAT = 37.4069688196691
const MARKET_LNG = 127.248444387416

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

function markerBg(status: string): string {
  switch (status) {
    case 'delivered': return '#22c55e'
    case 'delayed':   return '#ef4444'
    case 'in_transit': return '#f97316'
    case 'assigned':
    case 'picked_up': return '#2563eb'
    default: return '#9ca3af'
  }
}

function hasCoord(o: Order) {
  return typeof o.lat === 'number' && typeof o.lng === 'number'
}

// 투명 1×1 PNG (base64) — 클릭 영역만 제공, 시각적으로 보이지 않음
const TRANSPARENT_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function pinHtml(bg: string, seq: number | string, label: string, selected: boolean) {
  const sz = selected ? 52 : 44
  const fs = selected ? 20 : 17
  const tri = selected ? 13 : 11
  return `<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:0;">
    <div style="margin-bottom:5px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;background:rgba(0,0,0,.82);color:#fff;font-size:10px;font-weight:700;border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,.22);">${label}</div>
    <div style="display:flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};border:${selected ? 4 : 3}px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.38);">
      <span style="color:#fff;font-size:${fs}px;font-weight:900;line-height:1;">${seq}</span>
    </div>
    <div style="width:0;height:0;border-left:${tri}px solid transparent;border-right:${tri}px solid transparent;border-top:${tri + 1}px solid ${bg};"></div>
  </div>`
}

function MapView({
  orders,
  driverLocations,
  selectedId,
  onSelect,
  viewportKey,
}: {
  orders: Order[]
  driverLocations: DriverLocation[]
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
      content: `<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:0;">
        <div style="margin-bottom:5px;padding:3px 9px;background:rgba(120,53,15,.95);color:#fef3c7;font-size:11px;font-weight:800;border-radius:5px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.28);">🏪 경안시장 (출발)</div>
        <div style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:#f59e0b;border:4px solid white;box-shadow:0 4px 16px rgba(0,0,0,.4);font-size:24px;">🏪</div>
        <div style="width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-top:15px solid #f59e0b;"></div>
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

    const coordOrders = orders.filter(hasCoord)
    const shouldFit = lastFitKeyRef.current !== viewportKey
    if (coordOrders.length === 0) {
      if (shouldFit) {
        lastFitKeyRef.current = viewportKey
        mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(MARKET_LAT, MARKET_LNG))
      }
      return
    }

    // 투명 마커 이미지 (클릭 이벤트 전용)
    const emptyImg = new (window as any).kakao.maps.MarkerImage(
      TRANSPARENT_1PX,
      new (window as any).kakao.maps.Size(1, 1)
    )

    const bounds = new (window as any).kakao.maps.LatLngBounds()
    const path: KakaoAny[] = []

    coordOrders.forEach((order, index) => {
      const pos = new (window as any).kakao.maps.LatLng(order.lat, order.lng)
      bounds.extend(pos)
      path.push(pos)

      const isSelected = selectedId === order.id
      const bg = markerBg(order.status)
      const seq = order.sequence ?? index + 1
      const label = `${order.customer_name} · ${order.quantity}개`

      // 투명 마커 — 클릭 이벤트만 처리
      const marker = new (window as any).kakao.maps.Marker({
        position: pos,
        map: mapRef.current,
        image: emptyImg,
        clickable: true,
      })
      ;(window as any).kakao.maps.event.addListener(marker, 'click', () => onSelect(order))

      // 핀 모양 오버레이 — 시각적 표현 (원 + 삼각형 포인터)
      const overlay = new (window as any).kakao.maps.CustomOverlay({
        position: pos,
        xAnchor: 0.5,
        yAnchor: 1.0,
        content: pinHtml(bg, seq, label, isSelected),
      })
      overlay.setMap(mapRef.current)
      markersRef.current.push(marker)
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
  }, [orders, ready, selectedId, viewportKey])

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
      const overlay = new (window as any).kakao.maps.CustomOverlay({
        position: pos,
        xAnchor: 0.5,
        yAnchor: 1.0,
        content: `<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:0;">
          <div style="margin-bottom:5px;padding:3px 8px;background:rgba(109,40,217,.92);color:#fff;font-size:10px;font-weight:700;border-radius:5px;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,.22);">기사 위치</div>
          <div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:#7c3aed;border:3px solid white;box-shadow:0 4px 14px rgba(0,0,0,.38);font-size:22px;">🚗</div>
          <div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-top:13px solid #7c3aed;"></div>
        </div>`,
      })
      overlay.setMap(mapRef.current)
      driverOverlaysRef.current.push(overlay)
    })
  }, [driverLocations, ready])

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
    <div className="relative h-[calc(100vh-320px)] min-h-[480px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
      <div ref={mapEl} className="h-full w-full" />
      {(!KAKAO_MAP_KEY || mapError || coordCount === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-6 text-center">
          <div>
            <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <div className="text-sm font-semibold text-gray-700">
              {!KAKAO_MAP_KEY ? '지도 키가 설정되지 않았습니다.' : mapError || '좌표가 저장된 주문이 없습니다.'}
            </div>
            <div className="mt-1 text-xs text-gray-500">주문관리에서 저장된 좌표가 있으면 이 화면에 표시됩니다.</div>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 rounded bg-white/95 px-3 py-2 text-[11px] shadow">
        <div className="flex items-center gap-3 text-gray-600">
          <span>좌표 {coordCount}/{orders.length}건</span>
          {noCoordCount > 0 && <span className="font-semibold text-orange-600">미설정 {noCoordCount}건</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {([
            { color: '#f59e0b', label: '경안시장(출발)' },
            { color: '#22c55e', label: '완료' },
            { color: '#f97316', label: '진행중' },
            { color: '#ef4444', label: '지연' },
            { color: '#2563eb', label: '배정됨' },
            { color: '#9ca3af', label: '미배정' },
            { color: '#7c3aed', label: '기사위치' },
          ] as const).map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span style={{ background: color }} className="inline-block h-2.5 w-2.5 rounded-full" />
              <span className="text-gray-600">{label}</span>
            </span>
          ))}
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
  const rowRefs = useRef<Record<number, HTMLButtonElement | null>>({})
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

  // 지연 알림 WebSocket 수신 시 주문 목록 즉시 갱신
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
    } catch { /* WS 미지원 환경에서 조용히 무시 */ }
    return () => ws?.close()
  }, [queryClient])

  const autoSequenceMutation = useMutation({
    mutationFn: () => api.post('/orders/sequence/auto').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-tracking-orders'] }),
  })

  const regeocodeAllMutation = useMutation({
    mutationFn: () => api.post('/orders/regeocode-unresolved').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-tracking-orders'] }),
  })

  const visibleOrders = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled'),
    [orders]
  )

  const driverGroups = useMemo(() => {
    const countByDriver = new Map<number, number>()
    visibleOrders.forEach((o) => {
      if (o.driver_id) countByDriver.set(o.driver_id, (countByDriver.get(o.driver_id) ?? 0) + 1)
    })
    return drivers
      .filter((d) => countByDriver.has(d.id))
      .map((d) => ({ ...d, count: countByDriver.get(d.id) ?? 0 }))
  }, [drivers, visibleOrders])

  const unassignedCount = visibleOrders.filter((o) => !o.driver_id).length
  const delayedCount = visibleOrders.filter((o) => o.status === 'delayed').length
  const inProgressCount = visibleOrders.filter((o) =>
    ['assigned', 'picked_up', 'in_transit'].includes(o.status)
  ).length
  const noCoordCount = visibleOrders.filter((o) => !hasCoord(o)).length

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
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total)
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

  useEffect(() => {
    if (!selectedOrderId) return
    rowRefs.current[selectedOrderId]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedOrderId])

  return (
    <div className="p-6 space-y-4 page-fade-in">
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

      {/* 동별 현황 카드 */}
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

      {/* 필터 바 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        {/* 기사 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">기사</span>
          <button
            onClick={() => { setSelectedDriverId('all'); setSelectedOrderId(undefined) }}
            className={`rounded-lg border px-3 py-1.5 text-sm ${selectedDriverId === 'all' ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-gray-200 text-gray-600'}`}
          >
            전체
          </button>
          {unassignedCount > 0 && (
            <button
              onClick={() => { setSelectedDriverId('unassigned'); setSelectedOrderId(undefined) }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${selectedDriverId === 'unassigned' ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-gray-200 text-gray-600'}`}
            >
              미배정 · {unassignedCount}건
            </button>
          )}
          {driverGroups.map((driver) => (
            <button
              key={driver.id}
              onClick={() => { setSelectedDriverId(driver.id); setSelectedOrderId(undefined) }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${selectedDriverId === driver.id ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-gray-200 text-gray-600'}`}
            >
              {driver.name} · {driver.count}건
            </button>
          ))}
        </div>
        {/* 상태 필터 + 검색 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">상태</span>
          {([
            { key: 'all',        label: '전체' },
            { key: 'in_transit', label: '진행중' },
            { key: 'delivered',  label: '완료' },
            { key: 'delayed',    label: '지연' },
          ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setStatusFilter(key); setSelectedOrderId(undefined) }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                statusFilter === key
                  ? key === 'delayed'
                    ? 'border-red-400 bg-red-50 font-semibold text-red-700'
                    : 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              {label}
              {key === 'delayed' && delayedCount > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{delayedCount}</span>
              )}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="리스트 검색"
              className="input w-64 pl-8"
            />
          </div>
        </div>
      </div>

      {/* 지도 + 목록 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MapView
          orders={selectedOrders}
          driverLocations={driverLocations}
          selectedId={selectedOrderId}
          onSelect={handleMapSelect}
          viewportKey={viewportKey}
        />

        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="font-bold text-gray-900">배송 명단</div>
            <div className="text-xs text-gray-500">총 {selectedOrders.length}건 · 배송순번 정렬</div>
          </div>
          {isLoading && <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>}
          {!isLoading && selectedOrders.length === 0 && <div className="py-16 text-center text-sm text-gray-400">표시할 주문이 없습니다.</div>}
          <div className="max-h-[calc(100vh-400px)] min-h-[300px] overflow-y-auto divide-y divide-gray-100">
            {selectedOrders.map((order, index) => {
              const isDelayed = order.status === 'delayed'
              const isDelivered = order.status === 'delivered'
              return (
                <button
                  key={order.id}
                  ref={(el) => { rowRefs.current[order.id] = el }}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`w-full px-3 py-2.5 text-left transition-colors ${
                    selectedOrderId === order.id
                      ? 'bg-brand-50 ring-1 ring-inset ring-brand-300'
                      : isDelayed
                      ? 'bg-red-50 hover:bg-red-100'
                      : 'hover:bg-gray-50'
                  } ${isDelayed ? 'border-l-2 border-l-red-500' : ''}`}
                >
                  <div className="grid grid-cols-[32px_1fr] items-center gap-2">
                    <span
                      style={{ background: markerBg(order.status) }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                    >
                      {order.sequence ?? index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`truncate text-sm font-semibold ${isDelivered ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {order.customer_name}
                        </span>
                        <StatusBadge status={order.status} />
                        {isDelayed && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                      </div>
                      <div className="truncate text-[11px] text-gray-500">{order.delivery_address}</div>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 pl-8 text-[11px] text-gray-500">
                    <span className="truncate">{order.items_desc || '물품'} · {order.quantity}개</span>
                    <span className="shrink-0 truncate">{order.driver_name || '미배정'}</span>
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
                <span className="text-gray-700">기사: {selectedOrder.driver_name}</span>
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
              {selectedOrder.delivery_photo_path && (
                <button
                  onClick={() => setPodPreviewUrl(`/photos/${selectedOrder.delivery_photo_path}`)}
                  className="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  <Camera className="h-3.5 w-3.5" />
                  배송 완료 사진
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
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <h3 className="font-bold text-gray-900">배송 순번 재적용</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              현재 진행 중인 배송이{' '}
              <span className="font-bold text-orange-600">{inProgressCount}건</span> 있습니다.
            </p>
            <p className="text-sm text-gray-600 mb-5">
              순번을 재정렬하면 <strong>기사 앱의 배송 목록 순서가 변경</strong>됩니다.
              계속하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmSeq(false)} className="btn-secondary flex-1">
                취소
              </button>
              <button
                onClick={() => {
                  setShowConfirmSeq(false)
                  autoSequenceMutation.mutate()
                }}
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
          <div className="relative max-h-[90vh] max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
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
