import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock3, ListOrdered, MapPin, RefreshCw, Route, Search, Truck } from 'lucide-react'
import api from '@/lib/api'
import { StatusBadge } from '@/components/StatusBadge'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined
const MARKET_LAT = 37.4069688196691
const MARKET_LNG = 127.248444387416
const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit', 'delayed']

type KakaoAny = any

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
  driver_id?: number
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

function MapView({
  orders,
  selectedId,
  onSelect,
}: {
  orders: Order[]
  selectedId?: number
  onSelect: (order: Order) => void
}) {
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoAny | null>(null)
  const markersRef = useRef<KakaoAny[]>([])
  const overlaysRef = useRef<KakaoAny[]>([])
  const lineRef = useRef<KakaoAny | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!KAKAO_MAP_KEY || !mapEl.current) return
    const scriptId = 'kakao-maps-sdk'
    const init = () => {
      const kakao = (window as any).kakao
      kakao?.maps.load(() => {
      if (!mapEl.current || mapRef.current) return
      mapRef.current = new (window as any).kakao.maps.Map(mapEl.current, {
        center: new (window as any).kakao.maps.LatLng(MARKET_LAT, MARKET_LNG),
        level: 5,
      })
      setReady(true)
      })
    }
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`
      script.onload = init
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

    const coordOrders = orders.filter((order) => order.lat && order.lng)
    if (coordOrders.length === 0) return

    const bounds = new (window as any).kakao.maps.LatLngBounds()
    const path: KakaoAny[] = []
    coordOrders.forEach((order, index) => {
      const pos = new (window as any).kakao.maps.LatLng(order.lat!, order.lng!)
      bounds.extend(pos)
      path.push(pos)
      const isSelected = selectedId === order.id
      const marker = new (window as any).kakao.maps.Marker({ position: pos, map: mapRef.current })
      const overlay = new (window as any).kakao.maps.CustomOverlay({
        position: pos,
        yAnchor: 1.35,
        content: `<button style="border:0;border-radius:10px;padding:6px 8px;background:${isSelected ? '#f97316' : '#111827'};color:white;font-size:12px;font-weight:800;box-shadow:0 6px 14px rgba(0,0,0,.18);white-space:nowrap;">${order.sequence ?? index + 1}. ${order.customer_name} · ${order.quantity}개 · ${estimateMinutes(index + 1)}분</button>`,
      })
      marker.setMap(mapRef.current)
      (window as any).kakao.maps.event.addListener(marker, 'click', () => onSelect(order))
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
    mapRef.current.setBounds(bounds)
  }, [onSelect, orders, ready, selectedId])

  useEffect(() => {
    const selected = orders.find((order) => order.id === selectedId)
    if (!ready || !mapRef.current || !selected?.lat || !selected.lng || !(window as any).kakao?.maps) return
    mapRef.current.setCenter(new (window as any).kakao.maps.LatLng(selected.lat, selected.lng))
  }, [orders, ready, selectedId])

  return (
    <div className="relative h-[520px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
      <div ref={mapEl} className="h-full w-full" />
      {!KAKAO_MAP_KEY && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">지도 키가 설정되지 않았습니다.</div>
      )}
      {orders.length > 0 && (
        <div className="absolute bottom-3 left-3 rounded bg-white/95 px-3 py-2 text-xs text-gray-600 shadow">
          좌표 {orders.filter((order) => order.lat && order.lng).length}/{orders.length}건 · 경로선 표시
        </div>
      )}
      <div className="hidden">
        {orders.map((order) => (
          <button key={order.id} onClick={() => onSelect(order)}>{order.order_no}</button>
        ))}
      </div>
    </div>
  )
}

export function DeliveryTracking() {
  const [selectedDriverId, setSelectedDriverId] = useState<number | 'all'>('all')
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>()
  const [search, setSearch] = useState('')
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

  const activeOrders = useMemo(
    () => orders.filter((order) => ACTIVE_STATUSES.includes(order.status) && order.driver_id),
    [orders]
  )
  const driverGroups = useMemo(() => {
    const countByDriver = new Map<number, number>()
    activeOrders.forEach((order) => countByDriver.set(order.driver_id!, (countByDriver.get(order.driver_id!) ?? 0) + 1))
    return drivers.filter((driver) => countByDriver.has(driver.id)).map((driver) => ({
      ...driver,
      count: countByDriver.get(driver.id) ?? 0,
    }))
  }, [activeOrders, drivers])

  const selectedOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return activeOrders
      .filter((order) => selectedDriverId === 'all' || order.driver_id === selectedDriverId)
      .filter((order) => {
        if (!keyword) return true
        return [order.order_no, order.customer_name, order.customer_phone, order.dong, order.delivery_address, order.items_desc, order.driver_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
      .sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999))
  }, [activeOrders, search, selectedDriverId])

  const selectedOrder = selectedOrders.find((order) => order.id === selectedOrderId)

  return (
    <div className="p-6 space-y-4 page-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-500" />
            배송 확인
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">기사별 배송 명단, 지도 좌표, 순번, 경로와 예상 시간을 확인합니다.</p>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4"><div className="text-sm text-gray-500">배송중</div><div className="text-2xl font-bold text-gray-900">{activeOrders.length}</div></div>
        <div className="rounded-lg border border-gray-200 bg-white p-4"><div className="text-sm text-gray-500">기사</div><div className="text-2xl font-bold text-gray-900">{driverGroups.length}</div></div>
        <div className="rounded-lg border border-gray-200 bg-white p-4"><div className="text-sm text-gray-500">좌표</div><div className="text-2xl font-bold text-gray-900">{activeOrders.filter((o) => o.lat && o.lng).length}</div></div>
        <div className="rounded-lg border border-gray-200 bg-white p-4"><div className="text-sm text-gray-500">완료</div><div className="text-2xl font-bold text-green-600">{orders.filter((o) => o.status === 'delivered').length}</div></div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setSelectedDriverId('all'); setSelectedOrderId(undefined) }}
            className={`rounded-lg border px-3 py-2 text-sm ${selectedDriverId === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 text-gray-600'}`}
          >
            전체 기사
          </button>
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_420px]">
        <MapView orders={selectedOrders} selectedId={selectedOrderId} onSelect={(order) => setSelectedOrderId(order.id)} />

        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="font-bold text-gray-900">기사별 명단</div>
            <div className="text-xs text-gray-500">총 {selectedOrders.length}건 · 순번순</div>
          </div>
          {isLoading && <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>}
          {!isLoading && selectedOrders.length === 0 && <div className="py-16 text-center text-sm text-gray-400">표시할 배송 명단이 없습니다.</div>}
          <div className="max-h-[470px] overflow-y-auto divide-y divide-gray-100">
            {selectedOrders.map((order, index) => (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`w-full p-3 text-left transition-colors ${selectedOrderId === order.id ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white">{order.sequence ?? index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">{order.customer_name}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="text-xs text-gray-500 truncate">{order.order_no} · {order.customer_phone}</div>
                  </div>
                  <div className="text-right text-xs text-brand-700 font-semibold">{estimateMinutes(index + 1)}분</div>
                </div>
                <div className="mt-2 flex items-start gap-1 text-xs text-gray-600">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="line-clamp-2">{order.delivery_address}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{order.items_desc || '물품'} · {order.quantity}개</span>
                  <span>{order.driver_name} {order.driver_phone ? `· ${order.driver_phone}` : ''}</span>
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
