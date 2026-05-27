import { useQuery } from '@tanstack/react-query'
import { useCallback, useState, useEffect } from 'react'
import {
  Package, Truck, CheckCircle, Clock, AlertCircle,
  MapPin, WifiOff, CalendarDays, Store, TrendingUp,
} from 'lucide-react'
import api from '@/lib/api'
import { useWebSocket, LOCATION_TIMEOUT } from '@/hooks/useWebSocket'
import { OrderCard } from '@/components/OrderCard'
import { KakaoDriverMap } from '@/components/KakaoDriverMap'

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined

interface MarketStatus {
  is_market_day: boolean
  reception_open: boolean
  message: string
  next_market_date: string | null
  days_until_next: number
}

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

// ── 통계 카드 (/ui-ux-pro-max § Style, §Typography) ──────────────
function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
  accent,
}: {
  label: string
  value: number
  icon: React.ElementType
  gradient: string
  accent: string
}) {
  return (
    <div className="card card-hover relative overflow-hidden group">
      {/* 상단 액센트 바 */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent} opacity-70`} />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-3xl font-black tabular-nums tracking-tight text-gray-900">
            {value.toLocaleString('ko-KR')}
          </div>
          <div className="text-xs font-medium text-gray-500 mt-1">{label}</div>
        </div>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${gradient} shadow-sm group-hover:scale-110 transition-transform duration-200`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
        <TrendingUp className="w-3 h-3" />
        <span>오늘 기준</span>
      </div>
    </div>
  )
}

// ── 기사 위치 카드 ────────────────────────────────────────────────
function DriverLocationCard({
  driver,
  location,
}: {
  driver: DriverStatus
  location: DriverLocation | null
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])

  const isOnline = location && now - location.timestamp < LOCATION_TIMEOUT
  const elapsed = location ? Math.floor((now - location.timestamp) / 1000) : null

  return (
    <div className={`card card-hover flex items-center gap-3 border-l-[3px] ${isOnline ? 'border-l-green-400' : 'border-l-gray-200'}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isOnline ? 'bg-green-100' : 'bg-gray-100'}`}>
        {isOnline
          ? <MapPin className="w-4 h-4 text-green-600" />
          : <WifiOff className="w-4 h-4 text-gray-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-sm">{driver.name}</div>
        {isOnline && location ? (
          <>
            <div className="text-xs text-gray-500 truncate tabular-nums">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </div>
            <div className="text-xs text-green-600 font-medium mt-0.5">
              {elapsed !== null && elapsed < 60
                ? `${elapsed}초 전`
                : `${Math.floor((elapsed ?? 0) / 60)}분 전`} 업데이트
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-400 mt-0.5">
            {elapsed !== null
              ? `${Math.floor(elapsed / 60)}분 이상 신호 없음`
              : '위치 정보 없음'}
          </div>
        )}
      </div>
      {isOnline && location && (
        <a
          href={`https://map.kakao.com/link/map/${driver.name},${location.lat},${location.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:text-brand-700 font-semibold shrink-0 hover:underline"
          aria-label={`${driver.name} 기사 카카오맵에서 보기`}
        >
          지도
        </a>
      )}
    </div>
  )
}

// ── 장날 배너 ─────────────────────────────────────────────────────
function MarketStatusBanner({ status }: { status: MarketStatus }) {
  if (status.reception_open) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 p-4 text-white shadow-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-12 translate-x-8" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm">{status.message}</div>
            <div className="text-xs text-green-100 mt-0.5">15:00까지 주문 접수 가능합니다</div>
          </div>
          <span className="text-xs font-bold bg-white text-green-700 rounded-full px-3 py-1 shrink-0 shadow-sm">
            접수 중
          </span>
        </div>
      </div>
    )
  }

  if (status.is_market_day) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 p-4 text-white shadow-md">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-12 translate-x-8" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm">{status.message}</div>
            <div className="text-xs text-amber-100 mt-0.5">오늘은 장날입니다</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 flex items-center gap-3">
      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
        <CalendarDays className="w-5 h-5 text-gray-400" />
      </div>
      <div>
        <div className="font-semibold text-sm text-gray-700">{status.message}</div>
        {status.next_market_date && (
          <div className="text-xs text-gray-400 mt-0.5">
            다음 장날 {status.next_market_date}
            {status.days_until_next > 0 && ` (${status.days_until_next}일 후)`}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 메인 ──────────────────────────────────────────────────────────
export function Dashboard() {
  const { data: stats, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: marketStatus } = useQuery<MarketStatus>({
    queryKey: ['market-status'],
    queryFn: () => api.get('/admin/market-status').then((r) => r.data),
    refetchInterval: 60_000,
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

  const [driverLocations, setDriverLocations] = useState<Map<number, DriverLocation>>(new Map())

  const handleWsMessage = useCallback(
    (data: unknown) => {
      const msg = data as { type?: string; driver_id?: number; lat?: number; lng?: number; timestamp?: number }
      if (msg?.type === 'location' && msg.driver_id && msg.lat && msg.lng) {
        setDriverLocations((prev) => {
          const next = new Map(prev)
          next.set(msg.driver_id!, {
            driver_id: msg.driver_id!,
            lat: msg.lat!,
            lng: msg.lng!,
            timestamp: msg.timestamp ?? Date.now(),
          })
          return next
        })
      } else {
        refetch()
      }
    },
    [refetch],
  )

  useWebSocket('admin', handleWsMessage)
  useWebSocket('driver-location', handleWsMessage)

  const inProgress = (todayOrders || []).filter((o: { status: string }) =>
    ['assigned', 'picked_up', 'in_transit'].includes(o.status),
  )

  const STAT_CARDS = [
    {
      label: '오늘 총 주문',
      value: stats?.total_orders_today ?? 0,
      icon: Package,
      gradient: 'bg-gradient-to-br from-blue-400 to-blue-600',
      accent: 'bg-blue-400',
    },
    {
      label: '배달 완료',
      value: stats?.delivered_today ?? 0,
      icon: CheckCircle,
      gradient: 'bg-gradient-to-br from-green-400 to-emerald-600',
      accent: 'bg-green-400',
    },
    {
      label: '배송 진행중',
      value: stats?.in_progress ?? 0,
      icon: Truck,
      gradient: 'bg-gradient-to-br from-orange-400 to-brand-600',
      accent: 'bg-brand-400',
    },
    {
      label: '접수 대기',
      value: stats?.pending ?? 0,
      icon: Clock,
      gradient: 'bg-gradient-to-br from-amber-400 to-yellow-500',
      accent: 'bg-amber-400',
    },
  ]

  return (
    <div className="p-6 space-y-6 page-fade-in">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">실시간 현황</h1>
        <p className="text-sm text-gray-400 mt-0.5">{stats?.today ?? '—'} 기준</p>
      </div>

      {/* 장날 배너 */}
      {marketStatus && <MarketStatusBanner status={marketStatus} />}

      {/* 통계 카드 그리드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      {/* 민원 알림 */}
      {stats?.open_complaints > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="font-medium text-sm">
            미처리 민원 <strong>{stats.open_complaints}건</strong>이 있습니다.
          </span>
        </div>
      )}

      {/* 기사 위치 현황 */}
      {drivers.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-brand-500" />
            <h2 className="text-base font-bold text-gray-800">기사 위치 현황</h2>
            <span className="text-xs text-gray-400 font-normal">
              · 온라인 {drivers.filter((d) => {
                const loc = driverLocations.get(d.id)
                return loc && Date.now() - loc.timestamp < LOCATION_TIMEOUT
              }).length}/{drivers.length}명
            </span>
          </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {drivers.map((driver) => (
              <DriverLocationCard
                key={driver.id}
                driver={driver}
                location={driverLocations.get(driver.id) ?? null}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">* 30초 이상 신호 없으면 오프라인으로 표시됩니다.</p>
        </section>
      )}

      {/* 진행중인 배송 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-4 h-4 text-brand-500" />
          <h2 className="text-base font-bold text-gray-800">진행중인 배송</h2>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${inProgress.length > 0 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
            {inProgress.length}건
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {inProgress.map((order: {
            id: number; order_no: string; customer_name: string; customer_phone: string;
            status: string; dong: string; delivery_address: string; items_desc?: string;
            quantity: number; sequence?: number; created_at: string; driver_id?: number
          }) => (
            <OrderCard key={order.id} order={order} />
          ))}
          {inProgress.length === 0 && (
            <div className="col-span-full text-center py-10 text-gray-400">
              <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">현재 진행중인 배송이 없습니다.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
