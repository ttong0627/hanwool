import { useQuery } from '@tanstack/react-query'
import { useCallback, useState, useEffect } from 'react'
import {
  Package, Truck, CheckCircle, Clock, AlertCircle,
  MapPin, WifiOff, CalendarDays, Store, TrendingUp,
  LayoutDashboard,
} from 'lucide-react'
import api from '@/lib/api'
import { useWebSocket, LOCATION_TIMEOUT } from '@/hooks/useWebSocket'
import { OrderCard } from '@/components/OrderCard'
import { KakaoDriverMap } from '@/components/KakaoDriverMap'
import { getDriverColor } from '@/lib/driverColors'

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

// ── 통계 카드 ─────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
  glowColor,
}: {
  label: string
  value: number
  icon: React.ElementType
  gradient: string
  glowColor: string
}) {
  return (
    <div className="card-elevated rounded-xl p-4 relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[32px] font-black tabular-nums tracking-tight text-gray-900 leading-none">
            {value.toLocaleString('ko-KR')}
          </div>
          <div className="text-xs font-medium text-gray-500 mt-1.5">{label}</div>
        </div>
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${gradient} shadow-sm group-hover:scale-110 transition-transform duration-200 shrink-0`}
          style={{ boxShadow: `0 4px 12px ${glowColor}` }}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 text-[11px] text-gray-400 font-medium">
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
  onFocus,
}: {
  driver: DriverStatus
  location: DriverLocation | null
  onFocus?: (loc: { lat: number; lng: number }) => void
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])

  const isOnline = location && now - location.timestamp < LOCATION_TIMEOUT
  const elapsed = location ? Math.floor((now - location.timestamp) / 1000) : null
  const color = getDriverColor(driver.id)

  return (
    <div
      onClick={isOnline && location && onFocus ? () => onFocus({ lat: location.lat, lng: location.lng }) : undefined}
      className={`card-elevated rounded-xl p-3.5 flex items-center gap-3 ${isOnline && location ? 'cursor-pointer hover:ring-2 hover:ring-brand-200' : ''}`}
      style={isOnline ? { boxShadow: `inset 3px 0 0 ${color}, 0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)` } : {}}
    >
      <div
        style={isOnline ? { background: `${color}15`, color } : {}}
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isOnline ? '' : 'bg-gray-100'}`}
      >
        {isOnline
          ? <MapPin className="w-4 h-4" />
          : <WifiOff className="w-4 h-4 text-gray-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-900 text-sm">{driver.name}</div>
        {isOnline && location ? (
          <>
            <div className="text-xs text-gray-400 truncate tabular-nums mt-0.5">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </div>
            <div className="text-xs font-semibold mt-0.5" style={{ color }}>
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
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-bold shrink-0 hover:underline transition-colors"
          style={{ color }}
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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 p-4 text-white"
        style={{ boxShadow: '0 4px 20px rgba(22,163,74,0.25)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-16 translate-x-10 pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm">{status.message}</div>
            <div className="text-xs text-green-100 mt-0.5">16:30까지 주문 접수 가능합니다</div>
          </div>
          <span className="text-xs font-bold bg-white text-green-700 rounded-full px-3 py-1.5 shrink-0 shadow-sm">
            접수 중
          </span>
        </div>
      </div>
    )
  }

  if (status.is_market_day) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 p-4 text-white"
        style={{ boxShadow: '0 4px 20px rgba(249,115,22,0.25)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-16 translate-x-10 pointer-events-none" />
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
    <div className="card-elevated rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
        <CalendarDays className="w-5 h-5 text-gray-400" />
      </div>
      <div>
        <div className="font-semibold text-sm text-gray-700">{status.message}</div>
        {status.next_market_date && (
          <div className="text-xs text-gray-400 mt-0.5">
            다음 장날 <span className="font-semibold text-gray-600">{status.next_market_date}</span>
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
  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number } | null>(null)

  const handleWsMessage = useCallback(
    (data: unknown) => {
      const msg = data as { type?: string; driver_id?: number; lat?: number; lng?: number; timestamp?: number }
      if (msg?.type === 'location' && msg.driver_id && msg.lat && msg.lng) {
        setDriverLocations((prev) => {
          const next = new Map(prev)
          // 폰/서버 시계 오차를 피하려고 "대시보드가 받은 시각"을 기준으로 통일한다.
          next.set(msg.driver_id!, {
            driver_id: msg.driver_id!,
            lat: msg.lat!,
            lng: msg.lng!,
            timestamp: Date.now(),
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

  // 진입/주기 백필 — WS가 없거나 새로고침·재접속해도 마지막 위치가 사라지지 않게 한다.
  // 서버가 준 age_seconds(서버 기준 경과초)를 대시보드 시각 체계로 환산해 머지(더 최신 WS값은 유지).
  const { data: backfill } = useQuery<{ driver_id: number; lat: number; lng: number; age_seconds: number }[]>({
    queryKey: ['driver-locations-backfill'],
    queryFn: () => api.get('/deliveries/drivers/locations').then((r) => r.data),
    refetchInterval: 20_000,
  })

  useEffect(() => {
    if (!backfill?.length) return
    setDriverLocations((prev) => {
      const next = new Map(prev)
      const now = Date.now()
      for (const loc of backfill) {
        if (loc.driver_id == null || loc.lat == null || loc.lng == null) continue
        const ts = now - Math.max(0, loc.age_seconds) * 1000
        const existing = next.get(loc.driver_id)
        // 이미 더 최신(실시간 WS) 값이 있으면 덮어쓰지 않는다.
        if (existing && existing.timestamp >= ts) continue
        next.set(loc.driver_id, { driver_id: loc.driver_id, lat: loc.lat, lng: loc.lng, timestamp: ts })
      }
      return next
    })
  }, [backfill])

  const inProgress = (todayOrders || []).filter((o: { status: string }) =>
    ['assigned', 'picked_up', 'in_transit'].includes(o.status),
  )

  const onlineCount = drivers.filter((d) => {
    const loc = driverLocations.get(d.id)
    return loc && Date.now() - loc.timestamp < LOCATION_TIMEOUT
  }).length

  const STAT_CARDS = [
    {
      label: '오늘 총 주문',
      value: stats?.total_orders_today ?? 0,
      icon: Package,
      gradient: 'bg-gradient-to-br from-blue-400 to-blue-600',
      glowColor: 'rgba(59,130,246,0.25)',
    },
    {
      label: '배달 완료',
      value: stats?.delivered_today ?? 0,
      icon: CheckCircle,
      gradient: 'bg-gradient-to-br from-green-400 to-emerald-600',
      glowColor: 'rgba(34,197,94,0.25)',
    },
    {
      label: '배송 진행중',
      value: stats?.in_progress ?? 0,
      icon: Truck,
      gradient: 'bg-gradient-to-br from-orange-400 to-brand-600',
      glowColor: 'rgba(249,115,22,0.25)',
    },
    {
      label: '접수 대기',
      value: stats?.pending ?? 0,
      icon: Clock,
      gradient: 'bg-gradient-to-br from-amber-400 to-yellow-500',
      glowColor: 'rgba(245,158,11,0.25)',
    },
  ]

  return (
    <div className="p-6 space-y-6 page-fade-in">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
          <LayoutDashboard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">실시간 현황</h1>
          <p className="text-sm text-gray-400 mt-0.5">{stats?.today ?? '—'} 기준</p>
        </div>
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
        <div className="flex items-center gap-2.5 card-elevated rounded-xl p-4 border-l-4 border-red-400">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-sm text-gray-700">
            미처리 민원 <strong className="text-red-600">{stats.open_complaints}건</strong>이 있습니다.
          </span>
        </div>
      )}

      {/* 기사 위치 현황 */}
      {drivers.length > 0 && (
        <section className="space-y-3">
          <div className="section-title">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
              <MapPin className="w-3 h-3 text-white" />
            </div>
            기사 위치 현황
            <span className="ml-1 text-xs font-normal text-gray-400">
              · 온라인 <span className="font-bold text-emerald-600">{onlineCount}</span>/{drivers.length}명
            </span>
          </div>

          <div className="map-premium">
            <KakaoDriverMap
              apiKey={KAKAO_MAP_KEY}
              focusTarget={focusTarget}
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
                onFocus={(loc) => setFocusTarget(loc)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400">* 30초 이상 신호 없으면 오프라인으로 표시됩니다.</p>
        </section>
      )}

      {/* 진행중인 배송 */}
      <section className="space-y-3">
        <div className="section-title">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
            <Truck className="w-3 h-3 text-white" />
          </div>
          진행중인 배송
          <span
            className={`ml-1 text-xs font-bold px-2 py-0.5 rounded-full ${
              inProgress.length > 0 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
            }`}
          >
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
            <div className="col-span-full card-elevated rounded-xl text-center py-14 text-gray-400">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Truck className="w-7 h-7 opacity-30" />
              </div>
              <p className="text-sm font-medium">현재 진행중인 배송이 없습니다.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
