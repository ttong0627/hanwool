import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, CheckCircle2, Clock, Truck, ImageIcon, AlertTriangle, X, MapPin,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface OverviewOrder {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  dong: string
  delivery_address: string
  detail_address?: string | null
  status: string
  sequence?: number | null
  items_desc?: string | null
  quantity?: number | null
  request?: string | null
  driver_name?: string | null
  delivery_photo_url?: string | null
  delivered_at?: string | null
  coord_mismatch?: boolean
  coord_distance_m?: number | null
}

type StatusFilter = 'all' | 'delivered' | 'pending'

const PENDING_LABELS: Record<string, string> = {
  pending: '대기',
  assigned: '배정',
  picked_up: '픽업완료',
  in_transit: '배송중',
  delayed: '지연',
}

function formatDistance(m?: number | null): string {
  if (m == null) return ''
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
}

function Thumb({ src, onClick }: { src?: string | null; onClick?: () => void }) {
  if (!src) return <span className="text-xs text-gray-300">-</span>
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700"
    >
      <img src={src} alt="배송 사진" className="h-9 w-12 rounded object-cover" />
      <ImageIcon className="h-3.5 w-3.5" />
    </button>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'green' | 'gray' | 'brand' }) {
  const color = tone === 'green' ? 'text-emerald-600' : tone === 'gray' ? 'text-gray-500' : 'text-brand-700'
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-gray-400">{label}</div>
      <div className={`mt-0.5 text-2xl font-black ${color}`}>{value}</div>
    </div>
  )
}

function DetailModal({ order, onClose }: { order: OverviewOrder | null; onClose: () => void }) {
  if (!order) return null
  const isDelivered = order.status === 'delivered'
  const addr = `${order.delivery_address ?? ''}${order.detail_address ? ` ${order.detail_address}` : ''}`.trim()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <div className="text-base font-bold text-gray-900">{order.customer_name} · {order.dong}</div>
            <div className="text-xs text-gray-400">{order.order_no}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {order.delivery_photo_url ? (
          <img src={order.delivery_photo_url} alt="배송 완료 사진" className="max-h-72 w-full bg-gray-50 object-contain" />
        ) : (
          <div className="flex h-40 items-center justify-center bg-gray-50 text-sm text-gray-400">완료 사진 없음</div>
        )}

        <div className="space-y-2 px-5 py-4 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span className="text-gray-700">{addr || order.dong}</span>
          </div>
          {order.items_desc && (
            <div className="text-gray-700">📦 {order.items_desc} · {order.quantity ?? 1}개</div>
          )}
          <div className="flex items-center gap-2">
            {isDelivered
              ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />배송 완료</span>
              : <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500"><Clock className="h-3.5 w-3.5" />{PENDING_LABELS[order.status] ?? '미완료'}</span>}
            {order.delivered_at && <span className="text-xs text-gray-500">{formatDate(order.delivered_at, 'MM/dd HH:mm')}</span>}
          </div>
          {order.driver_name && <div className="text-xs text-gray-500">기사: {order.driver_name}</div>}
          {order.coord_mismatch && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              완료 위치가 배송지에서 {formatDistance(order.coord_distance_m)} 떨어져 있습니다. 배송지 확인이 필요합니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DeliveryCompleted() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [detail, setDetail] = useState<OverviewOrder | null>(null)

  const { data: rows = [], isLoading } = useQuery<OverviewOrder[]>({
    queryKey: ['delivery-completed-overview'],
    queryFn: () => api.get('/orders/today/overview').then((r) => r.data),
    refetchInterval: 15000,
  })

  const active = useMemo(() => rows.filter((r) => r.status !== 'cancelled'), [rows])
  const deliveredCount = useMemo(() => active.filter((r) => r.status === 'delivered').length, [active])
  const pendingCount = active.length - deliveredCount
  const rate = active.length ? Math.round((deliveredCount / active.length) * 100) : 0

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return active
      .filter((r) => {
        if (statusFilter === 'delivered') return r.status === 'delivered'
        if (statusFilter === 'pending') return r.status !== 'delivered'
        return true
      })
      .filter((r) => {
        if (!keyword) return true
        return [r.order_no, r.customer_name, r.customer_phone, r.dong, r.delivery_address]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(keyword))
      })
      .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999))
  }, [active, search, statusFilter])

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'delivered', label: '완료' },
    { key: 'pending', label: '미완료' },
  ]

  return (
    <div className="p-6 space-y-4 page-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">배송 완료</h1>
        <p className="text-sm text-gray-500 mt-0.5">오늘 배송 완료 현황을 검색해 확인합니다. (15초마다 자동 갱신)</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="전체" value={active.length} tone="brand" />
        <StatCard label="완료" value={deliveredCount} tone="green" />
        <StatCard label="미완료" value={pendingCount} tone="gray" />
        <StatCard label="완료율" value={`${rate}%`} tone="brand" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 연락처, 주소, 동, 주문번호 검색"
              className="input w-72 pl-8"
            />
          </div>
          <div className="flex gap-1">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-sm text-gray-500">총 {filtered.length.toLocaleString()}건</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-[44px_110px_90px_120px_70px_1.4fr_84px_96px_80px_72px] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
          <div>순번</div>
          <div>주문번호</div>
          <div>이름</div>
          <div>연락처</div>
          <div>배송동</div>
          <div>주소</div>
          <div>상태</div>
          <div>완료시각</div>
          <div>기사</div>
          <div>사진</div>
        </div>
        {isLoading && <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>}
        {!isLoading && filtered.length === 0 && <div className="py-16 text-center text-sm text-gray-400">표시할 주문이 없습니다.</div>}
        {!isLoading && filtered.map((row) => {
          const isDelivered = row.status === 'delivered'
          return (
            <div
              key={row.id}
              onClick={() => setDetail(row)}
              className="grid cursor-pointer grid-cols-[44px_110px_90px_120px_70px_1.4fr_84px_96px_80px_72px] items-center gap-2 border-t border-gray-100 px-3 py-2 text-xs hover:bg-gray-50"
            >
              <div className="font-bold text-gray-400">{row.sequence ?? '-'}</div>
              <div className="font-semibold text-brand-700">{row.order_no}</div>
              <div className="font-medium text-gray-900">{row.customer_name}</div>
              <div className="tabular-nums text-gray-600">{row.customer_phone}</div>
              <div>{row.dong}</div>
              <div className="truncate text-gray-700" title={row.delivery_address}>
                {row.delivery_address}
                {row.coord_mismatch && (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-red-50 px-1 py-0.5 text-[10px] font-semibold text-red-600">
                    <AlertTriangle className="h-3 w-3" />{formatDistance(row.coord_distance_m)}
                  </span>
                )}
              </div>
              <div>
                {isDelivered
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />완료</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-500"><Clock className="h-3 w-3" />{PENDING_LABELS[row.status] ?? '미완료'}</span>}
              </div>
              <div className="text-gray-600">{row.delivered_at ? formatDate(row.delivered_at, 'MM/dd HH:mm') : '-'}</div>
              <div className="flex items-center gap-1 truncate text-gray-600"><Truck className="h-3 w-3 shrink-0 text-gray-400" />{row.driver_name || '-'}</div>
              <div onClick={(e) => e.stopPropagation()}>
                <Thumb src={row.delivery_photo_url} onClick={() => row.delivery_photo_url && window.open(row.delivery_photo_url, '_blank', 'noopener,noreferrer')} />
              </div>
            </div>
          )
        })}
      </div>

      <DetailModal order={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
