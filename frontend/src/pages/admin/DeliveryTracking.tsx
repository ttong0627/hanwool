import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bike, Clock3, MapPin, RefreshCw, Search, Truck } from 'lucide-react'
import api from '@/lib/api'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate, STATUS_LABEL } from '@/lib/utils'

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
  driver_id?: number
  created_at: string
  assigned_at?: string | null
  picked_up_at?: string | null
  delivered_at?: string | null
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
  updated_at?: string | null
}

const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit', 'delayed']

function StatTile({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Truck }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        <Icon className="w-4 h-4 text-brand-500" />
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

export function DeliveryTracking() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  const {
    data: orders = [],
    isLoading: ordersLoading,
    refetch: refetchOrders,
    isFetching: ordersFetching,
  } = useQuery<Order[]>({
    queryKey: ['delivery-tracking-orders'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['delivery-tracking-drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const {
    data: locations = [],
    refetch: refetchLocations,
    isFetching: locationsFetching,
  } = useQuery<DriverLocation[]>({
    queryKey: ['delivery-driver-locations'],
    queryFn: () => api.get('/deliveries/drivers/locations').then((r) => r.data),
    refetchInterval: 20_000,
  })

  const driverMap = useMemo(
    () => Object.fromEntries(drivers.map((driver) => [driver.id, driver])),
    [drivers]
  )

  const locationMap = useMemo(
    () => Object.fromEntries(locations.map((location) => [location.order_id, location])),
    [locations]
  )

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return orders
      .filter((order) => ACTIVE_STATUSES.includes(order.status))
      .filter((order) => !status || order.status === status)
      .filter((order) => {
        if (!keyword) return true
        return [
          order.order_no,
          order.customer_name,
          order.customer_phone,
          order.dong,
          order.delivery_address,
          driverMap[order.driver_id ?? -1]?.name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
  }, [driverMap, orders, search, status])

  const assigned = orders.filter((order) => order.status === 'assigned').length
  const pickedUp = orders.filter((order) => order.status === 'picked_up').length
  const inTransit = orders.filter((order) => order.status === 'in_transit').length
  const delayed = orders.filter((order) => order.status === 'delayed').length

  const refresh = () => {
    refetchOrders()
    refetchLocations()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-500" />
            배송확인
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">오늘 진행 중인 배송과 기사 위치를 확인합니다</p>
        </div>
        <button
          onClick={refresh}
          className="btn-secondary flex items-center gap-1.5 text-sm"
          disabled={ordersFetching || locationsFetching}
        >
          <RefreshCw className={`w-4 h-4 ${(ordersFetching || locationsFetching) ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="배정" value={assigned} icon={Truck} />
        <StatTile label="픽업" value={pickedUp} icon={Bike} />
        <StatTile label="배송중" value={inTransit} icon={MapPin} />
        <StatTile label="지연" value={delayed} icon={Clock3} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="주문번호, 고객, 기사, 주소 검색"
              className="input pl-8 w-72 max-w-full"
            />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="input w-40">
            <option value="">진행 전체</option>
            {ACTIVE_STATUSES.map((value) => (
              <option key={value} value={value}>{STATUS_LABEL[value] || value}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1.1fr_1fr_1.4fr_0.9fr_1fr] gap-3 px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-500">
          <div>주문</div>
          <div>상태</div>
          <div>배송지</div>
          <div>기사</div>
          <div>위치 갱신</div>
        </div>

        {ordersLoading && (
          <div className="py-16 text-center text-gray-400">배송 정보를 불러오는 중입니다.</div>
        )}

        {!ordersLoading && filtered.length === 0 && (
          <div className="py-16 text-center text-gray-400">진행 중인 배송이 없습니다.</div>
        )}

        {!ordersLoading && filtered.map((order) => {
          const driver = driverMap[order.driver_id ?? -1]
          const location = locationMap[order.id]
          return (
            <div
              key={order.id}
              className="grid grid-cols-[1.1fr_1fr_1.4fr_0.9fr_1fr] gap-3 px-4 py-3 border-t border-gray-100 text-sm items-center"
            >
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate">{order.order_no}</div>
                <div className="text-xs text-gray-500 truncate">{order.customer_name} · {order.customer_phone}</div>
              </div>
              <div>
                <StatusBadge status={order.status} />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-gray-800 truncate">{order.dong}</div>
                <div className="text-xs text-gray-500 truncate">{order.delivery_address}</div>
              </div>
              <div className="min-w-0">
                {driver ? (
                  <>
                    <div className="font-medium text-gray-900 truncate">{driver.name}</div>
                    <div className="text-xs text-gray-500 truncate">{driver.phone}</div>
                  </>
                ) : (
                  <span className="text-gray-400">미배정</span>
                )}
              </div>
              <div className="min-w-0">
                {location ? (
                  <>
                    <div className="text-gray-900">{location.updated_at ? formatDate(location.updated_at) : '위치 수신'}</div>
                    <div className="text-xs text-gray-500">
                      {location.lat && location.lng ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : '좌표 없음'}
                    </div>
                  </>
                ) : (
                  <span className="text-gray-400">위치 미수신</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
