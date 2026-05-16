import { useQuery } from '@tanstack/react-query'
import { useCallback, useState, useEffect, useRef } from 'react'
import { Package, Truck, CheckCircle, Clock, AlertCircle, MapPin, WifiOff } from 'lucide-react'
import api from '@/lib/api'
import { useWebSocket, LOCATION_TIMEOUT } from '@/hooks/useWebSocket'
import { OrderCard } from '@/components/OrderCard'
import { KakaoDriverMap } from '@/components/KakaoDriverMap'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined

interface DriverLocation {
  driver_id: number
  lat: number
  lng: number
  timestamp: number
}

interface DriverStatus {
  id: number
  name: string
  phone: string
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  )
}

function DriverLocationCard({ driver, location }: { driver: DriverStatus; location: DriverLocation | null }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])

  const isOnline = location && (now - location.timestamp) < LOCATION_TIMEOUT
  const elapsed = location ? Math.floor((now - location.timestamp) / 1000) : null

  return (
    <div className={`card flex items-center gap-3 border-l-4 ${isOnline ? 'border-green-400' : 'border-gray-300'}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isOnline ? 'bg-green-100' : 'bg-gray-100'}`}>
        {isOnline
          ? <MapPin className="w-5 h-5 text-green-600" />
          : <WifiOff className="w-5 h-5 text-gray-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-sm">{driver.name}</div>
        {isOnline && location ? (
          <>
            <div className="text-xs text-gray-500 truncate">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </div>
            <div className="text-xs text-green-600 font-medium">
              {elapsed !== null && elapsed < 60 ? `${elapsed}초 전` : `${Math.floor((elapsed ?? 0) / 60)}분 전`} 업데이트
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-400">
            {elapsed !== null ? `${Math.floor(elapsed / 60)}분 이상 위치 없음` : '위치 정보 없음'}
          </div>
        )}
      </div>
      {isOnline && location && (
        <a
          href={`https://map.kakao.com/link/map/${driver.name},${location.lat},${location.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0"
        >
          지도보기
        </a>
      )}
    </div>
  )
}

export function Dashboard() {
  const { data: stats, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: todayOrders } = useQuery({
    queryKey: ['orders-today'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const { data: drivers = [] } = useQuery<DriverStatus[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // 기사별 최신 위치 (driver_id → DriverLocation)
  const [driverLocations, setDriverLocations] = useState<Map<number, DriverLocation>>(new Map())

  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as { type?: string; driver_id?: number; lat?: number; lng?: number; timestamp?: number }
    if (msg?.type === 'location' && msg.driver_id && msg.lat && msg.lng) {
      setDriverLocations((prev) => {
        const next = new Map(prev)
        next.set(msg.driver_id!, { driver_id: msg.driver_id!, lat: msg.lat!, lng: msg.lng!, timestamp: msg.timestamp ?? Date.now() })
        return next
      })
    } else {
      refetch()
    }
  }, [refetch])

  useWebSocket('admin', handleWsMessage)
  useWebSocket('driver-location', handleWsMessage)

  const inProgress = (todayOrders || []).filter((o: { status: string }) =>
    ['assigned', 'picked_up', 'in_transit'].includes(o.status)
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">실시간 현황</h1>
        <p className="text-sm text-gray-500">{stats?.today} 기준</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="오늘 총 주문" value={stats?.total_orders_today ?? 0} icon={Package} color="bg-blue-500" />
        <StatCard label="배달 완료" value={stats?.delivered_today ?? 0} icon={CheckCircle} color="bg-green-500" />
        <StatCard label="배송 진행중" value={stats?.in_progress ?? 0} icon={Truck} color="bg-brand-500" />
        <StatCard label="접수 대기" value={stats?.pending ?? 0} icon={Clock} color="bg-yellow-500" />
      </div>

      {stats?.open_complaints > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="font-medium">미처리 민원 {stats.open_complaints}건이 있습니다.</span>
        </div>
      )}

      {/* 기사 위치 현황 */}
      {drivers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-brand-500" />
            기사 위치 현황
          </h2>

          {/* 카카오맵 실시간 지도 */}
          <div className="mb-4">
            <KakaoDriverMap
              apiKey={KAKAO_MAP_KEY}
              drivers={drivers
                .map((d) => {
                  const loc = driverLocations.get(d.id)
                  if (!loc) return null
                  return { driver_id: d.id, name: d.name, lat: loc.lat, lng: loc.lng, timestamp: loc.timestamp }
                })
                .filter(Boolean) as { driver_id: number; name: string; lat: number; lng: number; timestamp: number }[]}
            />
          </div>

          {/* 기사별 상태 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drivers.map((driver) => (
              <DriverLocationCard
                key={driver.id}
                driver={driver}
                location={driverLocations.get(driver.id) ?? null}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * 30초 이상 신호 없으면 위치 없음으로 표시됩니다.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">진행중인 배송 ({inProgress.length}건)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {inProgress.map((order: { id: number; order_no: string; customer_name: string; customer_phone: string; status: string; dong: string; delivery_address: string; items_desc?: string; quantity: number; sequence?: number; created_at: string; driver_id?: number }) => (
            <OrderCard key={order.id} order={order} />
          ))}
          {inProgress.length === 0 && (
            <p className="text-gray-400 text-sm col-span-full">진행중인 배송이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
