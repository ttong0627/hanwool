import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Loader2,
  MapPin,
  Route,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react'
import api from '@/lib/api'
import { getDriverTone } from '@/lib/driverColors'
import { DONG_LIST } from '@/lib/utils'

interface Driver {
  id: number
  name: string
  phone: string
  is_active: boolean
}

interface DispatchOrderItem {
  id: number
  sequence: number
  dong: string
  customer_name: string
  delivery_address: string
  quantity: number
  status: string
}

interface DriverGroup {
  driver_id: number
  dongs: string[]
  order_count: number
  orders: DispatchOrderItem[]
}

interface DispatchResult {
  groups: DriverGroup[]
  total: number
}

interface DispatchRecommendation {
  driver_count: number
  dong_groups: string[][]
  groups: {
    index: number
    dongs: string[]
    order_count: number
  }[]
  uncovered_dongs: string[]
}

interface DispatchPayload {
  driver_ids: number[]
  dong_groups?: string[][]
}

interface DispatchRequest {
  id: number
  requested_by_driver_name: string
  requested_by_driver_phone: string
  total_orders: number
  pending_orders: number
  recommended_driver_count: number
  message?: string
  created_at?: string
  status: string
}

interface TodayStatus {
  total: number
  by_status: {
    pending: number
    assigned: number
    picked_up: number
    in_transit: number
    delivered: number
    delayed: number
  }
  by_dong: Record<string, number>
  dispatch_runs: {
    id: number
    driver_count: number
    order_count: number
    is_auto: boolean
    notes: string | null
    executed_at: string | null
  }[]
}

const DRIVER_COUNT_OPTIONS = [
  { n: 1, title: '1명', desc: '총관리자가 1명 처리로 판단한 경우' },
  { n: 2, title: '2명', desc: '60건 전후 물량을 나눌 때 권장' },
  { n: 3, title: '3명', desc: '동별 편차가 크거나 지연 위험이 있을 때' },
  { n: 4, title: '4명', desc: '4개 동을 최대한 분리 배정' },
]

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:    { label: '대기',   cls: 'bg-gray-100 text-gray-600' },
  assigned:   { label: '배정',   cls: 'bg-blue-100 text-blue-700' },
  picked_up:  { label: '픽업',   cls: 'bg-yellow-100 text-yellow-700' },
  in_transit: { label: '배송중', cls: 'bg-orange-100 text-orange-700' },
  delivered:  { label: '완료',   cls: 'bg-green-100 text-green-700' },
  cancelled:  { label: '취소',   cls: 'bg-red-100 text-red-500' },
  delayed:    { label: '지연',   cls: 'bg-red-100 text-red-700' },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

/* ── 오늘 현황 카드 ──────────────────────────────────────────────── */
function TodayStatusCard({ data }: { data: TodayStatus }) {
  const { by_status, by_dong, total, dispatch_runs } = data
  const undispatched = by_status.pending
  const inProgress   = (by_status.assigned ?? 0) + (by_status.picked_up ?? 0) + (by_status.in_transit ?? 0)
  const done         = by_status.delivered
  const delayed      = by_status.delayed ?? 0

  const stats = [
    { label: '전체',   value: total,        color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
    { label: '미배정', value: undispatched,  color: '#ea580c', bg: 'rgba(234,88,12,0.08)'  },
    { label: '진행중', value: inProgress,    color: '#2563eb', bg: 'rgba(37,99,235,0.08)'  },
    { label: '완료',   value: done,          color: '#16a34a', bg: 'rgba(22,163,74,0.08)'  },
  ]

  return (
    <section className="card-elevated rounded-xl p-5 space-y-4">
      <div className="section-title">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
          <BarChart3 className="w-3.5 h-3.5 text-white" />
        </div>
        오늘 배송 현황
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {stats.map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-xl p-3 text-center" style={{ background: bg }}>
            <div className="text-[26px] font-black tabular-nums leading-none" style={{ color }}>{value}</div>
            <div className="text-[11px] text-gray-500 mt-1 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {delayed > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          지연 <span className="font-bold">{delayed}건</span>이 감지됐습니다. 배송 확인이 필요합니다.
        </div>
      )}

      {Object.keys(by_dong).length > 0 && (
        <div>
          <div className="text-[11px] text-gray-400 font-semibold mb-2 uppercase tracking-wide">진행 중인 동별 건수</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(by_dong).map(([dong, count]) => (
              <span key={dong} className="text-xs bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full text-gray-700 font-medium">
                {dong} <span className="text-brand-600 font-bold">{count}</span>건
              </span>
            ))}
          </div>
        </div>
      )}

      {dispatch_runs.length > 0 && (
        <div className="pt-3 border-t border-gray-50">
          <div className="text-[11px] text-gray-400 font-semibold mb-2 uppercase tracking-wide">오늘 배차 이력</div>
          <div className="space-y-2">
            {dispatch_runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between text-xs rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    run.is_auto ? 'bg-gray-200 text-gray-600' : 'bg-brand-100 text-brand-700'
                  }`}>
                    {run.is_auto ? '자동' : '관리자'}
                  </span>
                  <span className="text-gray-700 font-medium">기사 {run.driver_count}명 / {run.order_count}건</span>
                </div>
                {run.executed_at && (
                  <span className="text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(run.executed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* ── 기사 선택 그리드 ─────────────────────────────────────────────── */
function DriverSelectGrid({
  drivers,
  selectedDriverIds,
  maxCount,
  onToggle,
}: {
  drivers: Driver[]
  selectedDriverIds: number[]
  maxCount: number
  onToggle: (id: number) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
      {drivers.map((driver, index) => {
        const selectedIndex = selectedDriverIds.indexOf(driver.id)
        const isSelected = selectedIndex >= 0
        const tone = getDriverTone(driver.id)
        return (
          <button
            key={driver.id}
            onClick={() => onToggle(driver.id)}
            style={isSelected
              ? { borderColor: tone.border, background: tone.wash, boxShadow: `0 12px 28px ${tone.shadow}` }
              : { background: 'linear-gradient(135deg, #fff, #f8fafc)' }
            }
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150 hover:-translate-y-0.5 ${
              isSelected ? '' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
            }`}
          >
            <div
              style={isSelected ? { background: tone.gradient, boxShadow: `0 2px 10px ${tone.shadow}` } : {}}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 transition-all ${
                isSelected ? 'text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {isSelected ? selectedIndex + 1 : index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-gray-900 truncate text-[15px]">{driver.name}</div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{driver.phone}</div>
            </div>
            {isSelected && (
              <div
                style={{ background: tone.soft, color: tone.text, borderColor: tone.border }}
                className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-bold"
              >
                #{selectedIndex + 1}
              </div>
            )}
          </button>
        )
      })}
      {drivers.length === 0 && (
        <div className="col-span-full py-10 text-center text-gray-400">
          <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">활성 기사가 없습니다.</p>
        </div>
      )}
      {selectedDriverIds.length > maxCount && (
        <div className="col-span-full text-sm text-red-600">선택 기사 수를 확인해 주세요.</div>
      )}
    </div>
  )
}

/* ── 확인 모달 ────────────────────────────────────────────────────── */
function DriverDongRecommendation({
  driverCount,
  selectedDriverIds,
  driverMap,
  dongGroups,
  recommendation,
  todayStatus,
  onMoveDong,
  onReset,
}: {
  driverCount: number
  selectedDriverIds: number[]
  driverMap: Record<number, Driver>
  dongGroups: string[][]
  recommendation?: DispatchRecommendation
  todayStatus?: TodayStatus
  onMoveDong: (dong: string, toGroupIndex: number) => void
  onReset: () => void
}) {
  const assignedDongCount = new Set(dongGroups.flat()).size
  const missingDongs = DONG_LIST.filter((dong) => !dongGroups.some((group) => group.includes(dong)))
  const gridClass = driverCount >= 4 ? 'xl:grid-cols-4' : driverCount === 3 ? 'xl:grid-cols-3' : 'lg:grid-cols-2'

  return (
    <section className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="section-title mb-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <Route className="w-3.5 h-3.5 text-white" />
          </div>
          {driverCount}명 추천 동 구성
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-bold text-brand-600 bg-brand-50 border border-brand-100 rounded-lg px-2.5 py-1.5 hover:bg-brand-100 transition-colors"
        >
          추천 복원
        </button>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 ${gridClass} gap-3`}>
        {Array.from({ length: driverCount }, (_, groupIndex) => {
          const driverId = selectedDriverIds[groupIndex]
          const tone = driverId ? getDriverTone(driverId) : getDriverTone(groupIndex + 1)
          const dongs = dongGroups[groupIndex] ?? []
          const orderCount = dongs.reduce((sum, dong) => sum + (todayStatus?.by_dong?.[dong] ?? 0), 0)

          return (
            <div
              key={groupIndex}
              className="rounded-xl border-2 p-3.5"
              style={{ borderColor: tone.border, background: tone.wash }}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-gray-400">기사 {groupIndex + 1}</div>
                  <div className="font-black text-gray-900 truncate">
                    {driverId ? driverMap[driverId]?.name ?? `기사 #${driverId}` : '기사 선택 전'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black tabular-nums" style={{ color: tone.text }}>{orderCount}</div>
                  <div className="text-[10px] text-gray-400 font-bold">건</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {dongs.map((dong) => {
                  const count = todayStatus?.by_dong?.[dong] ?? 0
                  return (
                    <button
                      key={dong}
                      type="button"
                      onClick={() => onMoveDong(dong, (groupIndex + 1) % driverCount)}
                      className="text-xs font-bold rounded-full border px-2.5 py-1.5 bg-white/80 hover:bg-white hover:-translate-y-0.5 transition-all"
                      style={{ borderColor: tone.border, color: tone.text }}
                      title="클릭하면 반대 기사 그룹으로 이동합니다"
                    >
                      {dong}
                      {count > 0 && <span className="ml-1 text-[10px] opacity-70">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl bg-gray-50 px-3.5 py-2.5 text-xs text-gray-500 leading-relaxed">
        추천 구성은 18개 동 중 <span className="font-bold text-gray-800">{assignedDongCount}</span>개 동을 미리 선택합니다.
        동 버튼을 누르면 다음 기사 그룹으로 이동하고, 주문 수는 오늘 미완료 주문 기준입니다.
        {recommendation?.uncovered_dongs?.length ? (
          <span className="ml-1 text-red-600 font-bold">미포함 동: {recommendation.uncovered_dongs.join(', ')}</span>
        ) : null}
        {missingDongs.length > 0 && (
          <span className="ml-1 text-red-600 font-bold">화면 미배정 동: {missingDongs.join(', ')}</span>
        )}
      </div>
    </section>
  )
}

function ConfirmModal({
  driverCount,
  selectedDriverIds,
  driverMap,
  todayStatus,
  isRequest,
  onConfirm,
  onCancel,
}: {
  driverCount: number
  selectedDriverIds: number[]
  driverMap: Record<number, Driver>
  todayStatus?: TodayStatus
  isRequest: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const pending = todayStatus?.by_status.pending ?? 0
  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-sm w-full">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <Route className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">배차 실행 확인</h3>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            {pending > 0
              ? <><span className="font-bold text-gray-900">미배정 {pending}건</span>을 기사 <span className="font-bold text-gray-900">{driverCount}명</span>에게 배정합니다.</>
              : <>선택한 기사 <span className="font-bold text-gray-900">{driverCount}명</span>에게 배차를 실행합니다.</>
            }
          </p>

          <div className="rounded-xl space-y-1.5" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)', padding: '12px 14px' }}>
            {selectedDriverIds.map((id, idx) => {
              const tone = getDriverTone(id)
              return (
                <div key={id} className="flex items-center gap-2.5 text-sm">
                  <div
                    style={{ background: tone.gradient, boxShadow: `0 2px 8px ${tone.shadow}` }}
                    className="w-6 h-6 rounded-lg text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                  >
                    {idx + 1}
                  </div>
                  <span style={{ color: tone.text }} className="font-bold">
                    {driverMap[id]?.name ?? `기사 #${id}`}
                  </span>
                </div>
              )
            })}
          </div>

          {isRequest && (
            <div className="text-xs text-orange-700 bg-orange-50 rounded-xl px-3.5 py-2.5 border border-orange-100">
              기사 추가 배정 요청에 대한 응답으로 배차를 실행합니다.
            </div>
          )}
        </div>

        <div className="flex gap-2.5 p-5 pt-0">
          <button onClick={onCancel} className="flex-1 btn-secondary">취소</button>
          <button onClick={onConfirm} className="flex-1 btn-primary flex items-center justify-center gap-2">
            <Zap className="w-4 h-4" />
            배정 실행
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 메인 컴포넌트 ────────────────────────────────────────────────── */
export function DeliveryDispatch() {
  const qc = useQueryClient()
  const [driverCount, setDriverCount] = useState(1)
  const [selectedDriverIds, setSelectedDriverIds] = useState<number[]>([])
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [dongGroups, setDongGroups] = useState<string[][]>([])

  const { data: drivers = [], isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const { data: requests = [] } = useQuery<DispatchRequest[]>({
    queryKey: ['dispatch-requests', 'pending'],
    queryFn: () => api.get('/admin/dispatch-requests', { params: { status_filter: 'pending' } }).then((r) => r.data),
    refetchInterval: 20_000,
  })

  const { data: todayStatus, refetch: refetchStatus } = useQuery<TodayStatus>({
    queryKey: ['dispatch-today-status'],
    queryFn: () => api.get('/orders/dispatch/today-status').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: dispatchRecommendation } = useQuery<DispatchRecommendation>({
    queryKey: ['dispatch-recommendation', driverCount],
    queryFn: () => api.get('/orders/dispatch/recommendation', { params: { driver_count: driverCount } }).then((r) => r.data),
    enabled: driverCount >= 2 && driverCount <= 4,
    staleTime: 60_000,
  })

  const activeDrivers = drivers.filter((d) => d.is_active)
  const driverMap = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.id, d])),
    [drivers],
  )
  const selectedRequest = requests.find((r) => r.id === activeRequestId) ?? requests[0]

  useEffect(() => {
    if (driverCount < 2 || driverCount > 4) return
    if (!dispatchRecommendation?.dong_groups?.length) return
    setDongGroups(dispatchRecommendation.dong_groups.map((group) => [...group]))
  }, [driverCount, dispatchRecommendation])

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['orders-today'] })
    qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
    qc.invalidateQueries({ queryKey: ['delivery-tracking-orders'] })
    qc.invalidateQueries({ queryKey: ['dispatch-requests', 'pending'] })
    refetchStatus()
  }

  const dispatchMutation = useMutation({
    mutationFn: (payload: DispatchPayload) => api.post('/orders/dispatch', payload).then((r) => r.data),
    onSuccess: (data: DispatchResult) => { setDispatchResult(data); refreshAll() },
  })

  const resolveMutation = useMutation({
    mutationFn: ({ requestId, payload }: { requestId: number; payload: DispatchPayload }) =>
      api.post(`/admin/dispatch-requests/${requestId}/resolve`, payload).then((r) => r.data),
    onSuccess: (data) => { setDispatchResult(data.dispatch); setActiveRequestId(null); refreshAll() },
  })

  const toggleDriver = (id: number) => {
    setSelectedDriverIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id)
      if (prev.length >= driverCount) return [...prev.slice(1), id]
      return [...prev, id]
    })
  }

  const selectCount = (count: number) => {
    setDriverCount(count)
    setSelectedDriverIds((prev) => prev.slice(0, count))
    if (count < 2 || count > 4) setDongGroups([])
  }

  const resetRecommendedDongGroups = () => {
    if (dispatchRecommendation?.dong_groups?.length) {
      setDongGroups(dispatchRecommendation.dong_groups.map((group) => [...group]))
    }
  }

  const moveDongToGroup = (dong: string, toGroupIndex: number) => {
    setDongGroups((prev) => {
      const next = Array.from({ length: driverCount }, (_, index) => prev[index] ? [...prev[index]] : [])
      for (let index = 0; index < next.length; index += 1) {
        next[index] = next[index].filter((value) => value !== dong)
      }
      next[toGroupIndex] = [...next[toGroupIndex], dong].sort((a, b) => DONG_LIST.indexOf(a) - DONG_LIST.indexOf(b))
      return next
    })
  }

  const dispatchPayload: DispatchPayload = {
    driver_ids: selectedDriverIds,
    ...(driverCount >= 2 && driverCount <= 4 ? { dong_groups: dongGroups } : {}),
  }

  const isRecommendedDongReady = driverCount < 2 || driverCount > 4 || new Set(dongGroups.flat()).size === DONG_LIST.length
  const canRun = selectedDriverIds.length === driverCount && isRecommendedDongReady
  const isSubmitting = dispatchMutation.isPending || resolveMutation.isPending

  const handleDispatchClick = () => {
    if (!canRun) return
    setShowConfirm(true)
  }

  const handleConfirm = () => {
    setShowConfirm(false)
    if (selectedRequest) {
      resolveMutation.mutate({ requestId: selectedRequest.id, payload: dispatchPayload })
    } else {
      dispatchMutation.mutate(dispatchPayload)
    }
  }

  return (
    <div className="p-6 max-w-6xl space-y-5 page-fade-in">
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
          <Route className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">배차 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">총관리자 판단에 따라 기사 수를 정하고 오늘 배송을 배정합니다.</p>
        </div>
      </div>

      {/* 오늘 배송 현황 */}
      {todayStatus && <TodayStatusCard data={todayStatus} />}

      {/* 배차 요청 알림 */}
      {selectedRequest && (
        <div className="card-elevated rounded-xl overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-amber-400" />
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-[240px]">
                <div className="font-bold text-gray-900 text-[15px]">기사 추가/분배 결정 요청</div>
                <p className="text-sm text-gray-600 mt-0.5">
                  {selectedRequest.requested_by_driver_name} 기사 요청 · 총 {selectedRequest.total_orders}건 · 미배정{' '}
                  <span className="font-bold text-orange-600">{selectedRequest.pending_orders}건</span>
                </p>
              </div>
              <div className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: 'rgba(234,88,12,0.1)', color: '#ea580c' }}>
                권장 {selectedRequest.recommended_driver_count}명
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              40건 초과 물량은 자동 배정하지 않습니다. 기사 수와 담당자를 아래에서 직접 결정해 주세요.
            </p>
          </div>
        </div>
      )}

      {/* 배차 설정 */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        {/* 기사 수 결정 */}
        <section className="card-elevated rounded-xl p-5 space-y-4">
          <div className="section-title">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            기사 수 결정
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {DRIVER_COUNT_OPTIONS.map((option) => (
              <button
                key={option.n}
                onClick={() => selectCount(option.n)}
                style={driverCount === option.n
                  ? { borderColor: '#f97316', background: 'rgba(249,115,22,0.06)', boxShadow: '0 0 0 1px rgba(249,115,22,0.25)' }
                  : {}
                }
                className={`rounded-xl border-2 p-3.5 text-left transition-all duration-150 ${
                  driverCount === option.n ? '' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                }`}
              >
                <div className={`text-[22px] font-black leading-none ${driverCount === option.n ? 'text-brand-600' : 'text-gray-700'}`}>
                  {option.title}
                </div>
                <div className="text-[11px] text-gray-400 mt-1.5 leading-snug">{option.desc}</div>
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-gray-50 px-3.5 py-2.5 text-xs text-gray-500 leading-relaxed">
            선택한 기사 순서가 배차 우선순서입니다. 배정 후 기사가 "업무 시작"을 누르면 배송이 시작됩니다.
          </div>
        </section>

        {/* 기사 선택 */}
        <section className="card-elevated rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="section-title mb-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                <Truck className="w-3.5 h-3.5 text-white" />
              </div>
              기사 선택
            </div>
            <span className="text-sm text-gray-400 font-medium">
              <span className={selectedDriverIds.length === driverCount ? 'text-brand-600 font-bold' : 'text-gray-600 font-bold'}>
                {selectedDriverIds.length}
              </span>
              {' / '}
              {driverCount}명
            </span>
          </div>

          {driversLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              기사 목록을 불러오는 중입니다.
            </div>
          ) : (
            <DriverSelectGrid
              drivers={activeDrivers}
              selectedDriverIds={selectedDriverIds}
              maxCount={driverCount}
              onToggle={toggleDriver}
            />
          )}

          {driverCount >= 2 && driverCount <= 4 && (
            <DriverDongRecommendation
              driverCount={driverCount}
              selectedDriverIds={selectedDriverIds}
              driverMap={driverMap}
              dongGroups={dongGroups}
              recommendation={dispatchRecommendation}
              todayStatus={todayStatus}
              onMoveDong={moveDongToGroup}
              onReset={resetRecommendedDongGroups}
            />
          )}

          <button
            onClick={handleDispatchClick}
            disabled={!canRun || isSubmitting}
            className="btn-primary w-full py-3.5 text-[15px] font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isSubmitting
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Zap className="w-5 h-5" />
            }
            {selectedRequest ? '총관리자 결정으로 배정 승인' : '오늘 배송 배정 실행'}
          </button>

          {(dispatchMutation.isError || resolveMutation.isError) && (
            <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl px-3 py-2">
              {((dispatchMutation.error || resolveMutation.error) as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                '배차 처리 중 오류가 발생했습니다.'}
            </p>
          )}
        </section>
      </div>

      {/* 대기 중인 요청 목록 (2개 이상일 때) */}
      {requests.length > 1 && (
        <section className="card-elevated rounded-xl p-5">
          <div className="section-title mb-3">대기 중인 요청</div>
          <div className="divide-y divide-gray-50">
            {requests.map((request) => (
              <button
                key={request.id}
                onClick={() => setActiveRequestId(request.id)}
                className={`w-full flex items-center justify-between gap-3 py-3 text-left transition-colors rounded-lg px-2 hover:bg-gray-50 ${
                  selectedRequest?.id === request.id ? 'text-brand-700 font-semibold' : 'text-gray-700'
                }`}
              >
                <span className="text-sm">{request.requested_by_driver_name} · {request.total_orders}건</span>
                <span className="text-xs text-gray-400">권장 {request.recommended_driver_count}명</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 배차 결과 */}
      {dispatchResult && (
        <section className="space-y-4">
          {/* 성공 배너 */}
          <div className="card-elevated rounded-xl overflow-hidden">
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 to-green-500" />
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-gray-900 text-[15px]">배정 완료</div>
                <p className="text-sm text-gray-500 mt-0.5">
                  총 <span className="font-bold text-emerald-600">{dispatchResult.total}건</span>을{' '}
                  <span className="font-bold text-gray-700">{dispatchResult.groups.length}명</span> 기사에게 배정했습니다.
                  기사 앱에서 "업무 시작"을 누르면 배송이 시작됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* 기사별 결과 카드 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {dispatchResult.groups.map((group) => {
              const driver = driverMap[group.driver_id]
              const tone = getDriverTone(group.driver_id)
              return (
                <div
                  key={group.driver_id}
                  className="card-elevated rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
                  style={{ borderColor: tone.border, boxShadow: `0 14px 32px ${tone.shadow}` }}
                >
                  {/* 드라이버 컬러 상단 스트립 */}
                  <div
                    style={{ background: tone.gradient }}
                    className="h-[5px] w-full"
                  />
                  <div className="p-4" style={{ background: tone.wash }}>
                    {/* 헤더 */}
                    <div className="flex items-center justify-between gap-3 mb-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          style={{
                            background: tone.gradient,
                            border: '2px solid rgba(255,255,255,0.9)',
                            boxShadow: `0 8px 18px ${tone.shadow}`,
                          }}
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        >
                          <Truck className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-[15px]">{driver?.name ?? `기사 #${group.driver_id}`}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{group.dongs.join(', ')}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[28px] font-black tabular-nums leading-none" style={{ color: tone.text }}>{group.order_count}</div>
                        <div className="text-[10px] text-gray-400 font-medium">건</div>
                      </div>
                    </div>

                    {/* 주문 목록 */}
                    <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto rounded-xl" style={{ border: '1px solid rgba(0,0,0,0.04)' }}>
                      {group.orders.map((order) => (
                        <div key={order.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                          <div
                            style={{ background: tone.gradient, boxShadow: `0 2px 8px ${tone.shadow}` }}
                            className="w-6 h-6 rounded-lg text-white text-[11px] font-black flex items-center justify-center flex-shrink-0"
                          >
                            {order.sequence}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-gray-900 truncate">{order.customer_name}</span>
                              <StatusBadge status={order.status} />
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-400 truncate">{order.delivery_address}</span>
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-400 flex-shrink-0 font-medium">×{order.quantity}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 배차 실행 확인 모달 */}
      {showConfirm && (
        <ConfirmModal
          driverCount={driverCount}
          selectedDriverIds={selectedDriverIds}
          driverMap={driverMap}
          todayStatus={todayStatus}
          isRequest={!!selectedRequest}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}
