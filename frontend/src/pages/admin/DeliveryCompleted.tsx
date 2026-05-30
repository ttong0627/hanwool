import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, CheckCircle2, Clock, Truck, ImageIcon, AlertTriangle, X, MapPin,
  Calendar, Maximize2, Map as MapIcon, Phone,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PodMap } from '@/components/PodMap'

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
  notes?: string | null
  driver_name?: string | null
  delivery_photo_url?: string | null
  delivery_signature_url?: string | null
  delivered_at?: string | null
  lat?: number | null
  lng?: number | null
  pod_lat?: number | null
  pod_lng?: number | null
  coord_mismatch?: boolean
  coord_distance_m?: number | null
}

type StatusFilter = 'all' | 'delivered' | 'pending' | 'mismatch'

const PENDING_LABELS: Record<string, string> = {
  pending: '대기',
  assigned: '배정',
  picked_up: '픽업완료',
  in_transit: '배송중',
  delayed: '지연',
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDistance(m?: number | null): string {
  if (m == null) return ''
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
}

/** /orders 를 날짜범위로 전 페이지 수집(완료 검수용). page_size=100, 최대 20페이지 안전장치 */
async function fetchCompleted(dateFrom: string, dateTo: string): Promise<OverviewOrder[]> {
  const pageSize = 100
  let page = 1
  let total = Infinity
  const all: OverviewOrder[] = []
  while (all.length < total && page <= 20) {
    const { data } = await api.get('/orders', {
      params: { date_from: dateFrom || undefined, date_to: dateTo || undefined, page, page_size: pageSize },
    })
    const items: OverviewOrder[] = data.items ?? []
    all.push(...items)
    total = data.total ?? all.length
    if (items.length < pageSize) break
    page += 1
  }
  return all
}

function Thumb({ src, onClick }: { src?: string | null; onClick?: () => void }) {
  if (!src) return <span className="text-xs text-gray-300">-</span>
  return (
    <button
      type="button"
      onClick={onClick}
      title="사진 크게 보기"
      className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700"
    >
      <img src={src} alt="배송 사진" className="h-9 w-12 rounded object-cover" />
      <ImageIcon className="h-3.5 w-3.5" />
    </button>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'green' | 'gray' | 'brand' | 'red' }) {
  const color =
    tone === 'green' ? 'text-emerald-600'
    : tone === 'gray' ? 'text-gray-500'
    : tone === 'red' ? 'text-red-600'
    : 'text-brand-700'
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-gray-400">{label}</div>
      <div className={`mt-0.5 text-2xl font-black ${color}`}>{value}</div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-16 shrink-0 text-gray-400">{label}</span>
      <span className="flex-1 text-gray-800">{children}</span>
    </div>
  )
}

function DetailModal({ order, onClose, onZoom }: { order: OverviewOrder | null; onClose: () => void; onZoom: (src: string) => void }) {
  const [showMap, setShowMap] = useState(false)
  if (!order) return null
  const isDelivered = order.status === 'delivered'
  const addr = `${order.delivery_address ?? ''}${order.detail_address ? ` ${order.detail_address}` : ''}`.trim()
  const hasAddr = order.lat != null && order.lng != null
  const hasPod = order.pod_lat != null && order.pod_lng != null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <div className="text-base font-bold text-gray-900">{order.customer_name} · {order.dong}</div>
            <div className="text-xs text-gray-400">{order.order_no}{order.sequence ? ` · 순번 ${order.sequence}` : ''}</div>
          </div>
          <button type="button" title="닫기" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {/* 완료 사진 (클릭 시 크게) */}
          {order.delivery_photo_url ? (
            <button
              type="button"
              onClick={() => order.delivery_photo_url && onZoom(order.delivery_photo_url)}
              className="group relative block w-full"
              title="크게 보기"
            >
              <img src={order.delivery_photo_url} alt="배송 완료 사진" className="max-h-72 w-full bg-gray-900 object-contain" />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
                <Maximize2 className="h-3.5 w-3.5" />크게 보기
              </span>
            </button>
          ) : (
            <div className="flex h-40 items-center justify-center bg-gray-50 text-sm text-gray-400">완료 사진 없음</div>
          )}

          <div className="space-y-2.5 px-5 py-4">
            <div className="flex items-center gap-2">
              {isDelivered
                ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />배송 완료</span>
                : <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500"><Clock className="h-3.5 w-3.5" />{PENDING_LABELS[order.status] ?? '미완료'}</span>}
              {order.delivered_at && <span className="text-xs text-gray-500">완료 {formatDate(order.delivered_at, 'MM/dd HH:mm')}</span>}
            </div>

            <InfoRow label="연락처"><span className="tabular-nums">{order.customer_phone || '-'}</span></InfoRow>
            <InfoRow label="주소"><span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />{addr || order.dong}</span></InfoRow>
            <InfoRow label="물품">{order.items_desc ? `${order.items_desc} · ${order.quantity ?? 1}개` : '-'}</InfoRow>
            <InfoRow label="요청사항"><span className={order.request ? 'font-medium text-brand-700' : 'text-gray-400'}>{order.request || '없음'}</span></InfoRow>
            {order.notes ? <InfoRow label="메모">{order.notes}</InfoRow> : null}
            <InfoRow label="기사"><span className="inline-flex items-center gap-1"><Truck className="h-4 w-4 text-gray-400" />{order.driver_name || '-'}</span></InfoRow>
            {order.delivery_signature_url && (
              <InfoRow label="서명">
                <button
                  type="button"
                  title="서명 크게 보기"
                  onClick={() => order.delivery_signature_url && onZoom(order.delivery_signature_url)}
                  className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1 hover:border-brand-300"
                >
                  <img src={order.delivery_signature_url} alt="수령인 서명" className="h-8 w-20 rounded bg-white object-contain" />
                  <Maximize2 className="h-3.5 w-3.5 text-gray-500" />
                </button>
              </InfoRow>
            )}

            {/* 기사 POD 좌표 + 지도 */}
            <InfoRow label="기사 좌표">
              {hasPod ? (
                <button type="button" onClick={() => setShowMap((v) => !v)} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200">
                  <MapIcon className="h-3.5 w-3.5" />
                  {order.pod_lat!.toFixed(5)}, {order.pod_lng!.toFixed(5)} · {showMap ? '지도 닫기' : '지도 보기'}
                </button>
              ) : <span className="text-gray-400">완료 GPS 없음</span>}
            </InfoRow>

            {order.coord_mismatch && (
              <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                완료 위치가 배송지에서 <b>{formatDistance(order.coord_distance_m)}</b> 떨어져 있습니다. 배송지 확인이 필요합니다.
              </div>
            )}

            {showMap && (hasPod || hasAddr) && (
              <PodMap
                delivery={hasAddr ? { lat: order.lat!, lng: order.lng!, label: '배송지' } : null}
                pod={hasPod ? { lat: order.pod_lat!, lng: order.pod_lng!, label: '기사 완료' } : null}
                distanceM={order.coord_distance_m}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button type="button" title="닫기" aria-label="닫기" onClick={onClose} className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20">
        <X className="h-6 w-6" />
      </button>
      <img src={src} alt="배송 완료 사진 확대" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

export function DeliveryCompleted() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [detail, setDetail] = useState<OverviewOrder | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const { data: rows = [], isLoading } = useQuery<OverviewOrder[]>({
    queryKey: ['delivery-completed', dateFrom, dateTo],
    queryFn: () => fetchCompleted(dateFrom, dateTo),
    refetchInterval: 20000,
  })

  const active = useMemo(() => rows.filter((r) => r.status !== 'cancelled'), [rows])
  const deliveredCount = useMemo(() => active.filter((r) => r.status === 'delivered').length, [active])
  const mismatchCount = useMemo(() => active.filter((r) => r.coord_mismatch).length, [active])
  const pendingCount = active.length - deliveredCount
  const rate = active.length ? Math.round((deliveredCount / active.length) * 100) : 0

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return active
      .filter((r) => {
        if (statusFilter === 'delivered') return r.status === 'delivered'
        if (statusFilter === 'pending') return r.status !== 'delivered'
        if (statusFilter === 'mismatch') return !!r.coord_mismatch
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
    { key: 'mismatch', label: '⚠ 좌표불일치' },
  ]

  return (
    <div className="p-6 space-y-4 page-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">배송 완료</h1>
        <p className="text-sm text-gray-500 mt-0.5">기간을 지정해 배송 완료 현황·증빙(사진·완료시각·기사 위치)을 검색·확인합니다.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="전체" value={active.length} tone="brand" />
        <StatCard label="완료" value={deliveredCount} tone="green" />
        <StatCard label="미완료" value={pendingCount} tone="gray" />
        <StatCard label="완료율" value={`${rate}%`} tone="brand" />
        <StatCard label="좌표불일치" value={mismatchCount} tone="red" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input type="date" title="시작일" aria-label="시작일" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} className="input w-36" />
            <span className="text-gray-400">~</span>
            <input type="date" title="종료일" aria-label="종료일" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} className="input w-36" />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 연락처, 주소, 동, 주문번호 검색"
              className="input w-64 pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === key
                    ? key === 'mismatch' ? 'bg-red-600 text-white' : 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                <Thumb src={row.delivery_photo_url} onClick={() => row.delivery_photo_url && setLightbox(row.delivery_photo_url)} />
              </div>
            </div>
          )
        })}
      </div>

      <DetailModal order={detail} onClose={() => setDetail(null)} onZoom={(src) => setLightbox(src)} />
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
