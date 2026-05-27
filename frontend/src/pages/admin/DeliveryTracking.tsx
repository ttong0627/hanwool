import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock3, ListOrdered, MapPin, RefreshCw, Route, Search, Truck } from 'lucide-react'
import api from '@/lib/api'
import { StatusBadge } from '@/components/StatusBadge'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
const MARKET_LAT = 37.4069688196691
const MARKET_LNG = 127.248444387416

type KakaoAny = any
type DriverFilter = number | 'all' | 'unassigned'

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
  created_at: string
  delivered_at?: string | null
}

interface Driver {
  id: number
  name: string
  phone: string
  is_active: boolean
}

function estimateMinutes(index: number) {
  return Math.max(8, index * 7 + 5)
}

function hasCoord(order: Order) {
  return typeof order.lat === 'number' && typeof order.lng === 'number'
}

function MapView({
  orders,
  selectedId,
  onSelect,
  viewportKey,
}: {
  orders: Order[]
  selectedId?: number
  onSelect: (order: Order) => void
  viewportKey: string
}) {
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoAny | null>(null)
  const markersRef = useRef<KakaoAny[]>([])
  const overlaysRef = useRef<KakaoAny[]>([])
  const lineRef = useRef<KakaoAny | null>(null)
  const lastFitKeyRef = useRef('')
  const lastCenteredOrderIdRef = useRef<number | undefined>()
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState('')

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

  useEffect(() => {
    if (!ready || !mapRef.current || !(window as any).kakao?.maps) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    lineRef.current?.setMap(null)
    markersRef.current = []
    overlaysRef.current = []
    lineRef.current = null

    const coordOrders = orders.filter(hasCoord)
    const shouldFitBounds = lastFitKeyRef.current !== viewportKey
    if (coordOrders.length === 0) {
      if (shouldFitBounds) {
        lastFitKeyRef.current = viewportKey
        mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(MARKET_LAT, MARKET_LNG))
      }
      return
    }

    const bounds = new (window as any).kakao.maps.LatLngBounds()
    const path: KakaoAny[] = []
    coordOrders.forEach((order, index) => {
      const pos = new (window as any).kakao.maps.LatLng(order.lat, order.lng)
      bounds.extend(pos)
      path.push(pos)
      const isSelected = selectedId === order.id
      const marker = new (window as any).kakao.maps.Marker({ position: pos, map: mapRef.current })
      const overlay = new (window as any).kakao.maps.CustomOverlay({
        position: pos,
        xAnchor: 0.5,
        yAnchor: 0.22,
        content: `<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:74px;">
          <span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:${isSelected ? '#f97316' : '#2563eb'};color:white;font-size:12px;font-weight:900;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,.28);">${order.sequence ?? index + 1}</span>
          <span style="max-width:98px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:4px;background:#111827;color:white;padding:2px 5px;font-size:10px;font-weight:800;line-height:1.2;box-shadow:0 2px 6px rgba(0,0,0,.2);">${order.customer_name} · ${order.quantity}개</span>
          <span style="max-width:74px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:3px;background:#111827;color:white;padding:1px 4px;font-size:9px;font-weight:700;line-height:1.15;box-shadow:0 2px 5px rgba(0,0,0,.16);">${order.dong || ''}</span>
        </div>`,
      })
      marker.setMap(mapRef.current)
      ;(window as any).kakao.maps.event.addListener(marker, 'click', () => onSelect(order))
      overlay.setMap(mapRef.current)
      markersRef.current.push(marker)
      overlaysRef.current.push(overlay)
    })

    if (path.length >= 2) {
      const routeLine = new (window as any).kakao.maps.Polyline({
        path,
        strokeWeight: 4,
        strokeColor: '#f97316',
        strokeOpacity: 0.85,
        strokeStyle: 'solid',
      })
      routeLine.setMap(mapRef.current)
      lineRef.current = routeLine
    }
    if (shouldFitBounds) {
      mapRef.current.setBounds(bounds)
      lastFitKeyRef.current = viewportKey
    }
  }, [orders, ready, selectedId, viewportKey])

  useEffect(() => {
    if (!selectedId) {
      lastCenteredOrderIdRef.current = undefined
      return
    }
    if (lastCenteredOrderIdRef.current === selectedId) return
    const selected = orders.find((order) => order.id === selectedId)
    if (!ready || !mapRef.current || !selected || !hasCoord(selected) || !(window as any).kakao?.maps) return
    lastCenteredOrderIdRef.current = selectedId
    mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(selected.lat, selected.lng))
  }, [orders, ready, selectedId])

  const coordCount = orders.filter(hasCoord).length

  return (
    <div className="relative h-[620px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
      <div ref={mapEl} className="h-full w-full" />
      {(!KAKAO_MAP_KEY || mapError || coordCount === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-6 text-center">
          <div>
            <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <div className="text-sm font-semibold text-gray-700">
              {!KAKAO_MAP_KEY ? '지도 키가 설정되지 않았습니다.' : mapError || '좌표가 저장된 주문이 없습니다.'}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              주문관리에서 저장된 lat/lng가 있으면 이 화면에 바로 표시됩니다.
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 rounded bg-white/95 px-3 py-2 text-xs text-gray-600 shadow">
        좌표 {coordCount}/{orders.length}건 · 경로선 표시
      </div>
    </div>
  )
}

export function DeliveryTracking() {
  const [selectedDriverId, setSelectedDriverId] = useState<DriverFilter>('all')
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>()
  const [search, setSearch] = useState('')
  const rowRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const queryClient = useQueryClient()

  const { data: orders = [], isLoading, refetch, isFetching } = useQuery<Order[]>({
    queryKey: ['delivery-tracking-orders'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
    refetchInterval: 20_000,
  })

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['delivery-tracking-drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const autoSequenceMutation = useMutation({
    mutationFn: () => api.post('/orders/sequence/auto').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-tracking-orders'] }),
  })

  const visibleOrders = useMemo(
    () => orders.filter((order) => order.status !== 'cancelled'),
    [orders]
  )

  const driverGroups = useMemo(() => {
    const countByDriver = new Map<number, number>()
    visibleOrders.forEach((order) => {
      if (order.driver_id) countByDriver.set(order.driver_id, (countByDriver.get(order.driver_id) ?? 0) + 1)
    })
    return drivers.filter((driver) => countByDriver.has(driver.id)).map((driver) => ({
      ...driver,
      count: countByDriver.get(driver.id) ?? 0,
    }))
  }, [drivers, visibleOrders])

  const unassignedCount = visibleOrders.filter((order) => !order.driver_id).length

  const selectedOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return visibleOrders
      .filter((order) => {
        if (selectedDriverId === 'all') return true
        if (selectedDriverId === 'unassigned') return !order.driver_id
        return order.driver_id === selectedDriverId
      })
      .filter((order) => {
        if (!keyword) return true
        return [order.order_no, order.customer_name, order.customer_phone, order.dong, order.delivery_address, order.items_desc, order.driver_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
      .sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999))
  }, [search, selectedDriverId, visibleOrders])

  const selectedOrder = selectedOrders.find((order) => order.id === selectedOrderId)
  const handleMapSelect = useCallback((order: Order) => setSelectedOrderId(order.id), [])
  const viewportKey = String(selectedDriverId)

  useEffect(() => {
    if (!selectedOrderId) return
    rowRefs.current[selectedOrderId]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedOrderId])

  return (
    <div className="p-6 space-y-4 page-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-500" />
            배송 확인
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">오늘 주문의 지도 좌표, 기사별 명단, 순번, 경로와 예상 시간을 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => autoSequenceMutation.mutate()} className="btn-primary flex items-center gap-1.5 text-sm" disabled={autoSequenceMutation.isPending}>
            <ListOrdered className="w-4 h-4" />배송 순번 적용
          </button>
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm" disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />새로고침
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setSelectedDriverId('all'); setSelectedOrderId(undefined) }}
            className={`rounded-lg border px-3 py-2 text-sm ${selectedDriverId === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 text-gray-600'}`}
          >
            전체
          </button>
          {unassignedCount > 0 && (
            <button
              onClick={() => { setSelectedDriverId('unassigned'); setSelectedOrderId(undefined) }}
              className={`rounded-lg border px-3 py-2 text-sm ${selectedDriverId === 'unassigned' ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 text-gray-600'}`}
            >
              미배정 · {unassignedCount}건
            </button>
          )}
          {driverGroups.map((driver) => (
            <button
              key={driver.id}
              onClick={() => { setSelectedDriverId(driver.id); setSelectedOrderId(undefined) }}
              className={`rounded-lg border px-3 py-2 text-sm ${selectedDriverId === driver.id ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 text-gray-600'}`}
            >
              {driver.name} · {driver.count}건
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="리스트 검색" className="input w-72 pl-8" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MapView orders={selectedOrders} selectedId={selectedOrderId} onSelect={handleMapSelect} viewportKey={viewportKey} />

        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="font-bold text-gray-900">기사별 명단</div>
            <div className="text-xs text-gray-500">총 {selectedOrders.length}건 · 배송순번 정렬</div>
          </div>
          {isLoading && <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>}
          {!isLoading && selectedOrders.length === 0 && <div className="py-16 text-center text-sm text-gray-400">표시할 주문이 없습니다.</div>}
          <div className="max-h-[620px] overflow-y-auto divide-y divide-gray-100">
            {selectedOrders.map((order, index) => (
              <button
                key={order.id}
                ref={(el) => { rowRefs.current[order.id] = el }}
                onClick={() => setSelectedOrderId(order.id)}
                className={`w-full px-3 py-2 text-left transition-colors ${selectedOrderId === order.id ? 'bg-brand-50 ring-1 ring-inset ring-brand-300' : 'hover:bg-gray-50'}`}
              >
                <div className="grid grid-cols-[32px_1fr_42px] items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-black text-white">{order.sequence ?? index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-gray-900">{order.customer_name}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="truncate text-[11px] text-gray-500">{order.delivery_address}</div>
                  </div>
                  <div className="text-right text-[11px] font-bold text-brand-700">{estimateMinutes(index + 1)}분</div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 pl-8 text-[11px] text-gray-500">
                  <span className="truncate">{order.items_desc || '물품'} · {order.quantity}개</span>
                  <span className="shrink-0 truncate">{order.driver_name || '미배정'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedOrder && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Route className="h-5 w-5 text-brand-600" />
            <div className="font-bold text-brand-900">{selectedOrder.sequence ?? '-'}번 {selectedOrder.customer_name}</div>
            <div className="text-sm text-brand-700">{selectedOrder.items_desc || '물품'} · {selectedOrder.quantity}개</div>
            <div className="text-sm text-brand-700"><Clock3 className="inline h-4 w-4" /> 예상 {estimateMinutes(selectedOrders.findIndex((o) => o.id === selectedOrder.id) + 1)}분</div>
            <div className="text-sm text-brand-700">{selectedOrder.delivery_address}</div>
          </div>
        </div>
      )}
    </div>
  )
}
