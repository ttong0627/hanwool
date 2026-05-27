import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import api from '@/lib/api'
import { getDriverColor } from '@/lib/driverColors'

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

  return (
    <section className="card space-y-3">
      <h2 className="font-bold text-gray-800 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-brand-500" />
        오늘 배송 현황
      </h2>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '전체',    value: total,        cls: 'text-gray-700',   bg: 'bg-gray-50'   },
          { label: '미배정',  value: undispatched,  cls: 'text-orange-700', bg: 'bg-orange-50' },
          { label: '진행중',  value: inProgress,    cls: 'text-blue-700',   bg: 'bg-blue-50'   },
          { label: '완료',    value: done,          cls: 'text-green-700',  bg: 'bg-green-50'  },
        ].map(({ label, value, cls, bg }) => (
          <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
            <div className={`text-2xl font-black ${cls}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {delayed > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          지연 {delayed}건이 감지됐습니다. 배송 확인이 필요합니다.
        </div>
      )}

      {Object.keys(by_dong).length > 0 && (
        <div>
          <div className="text-xs text-gray-500 font-semibold mb-1.5">진행 중인 동별 건수</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(by_dong).map(([dong, count]) => (
              <span key={dong} className="text-xs bg-gray-100 px-2.5 py-1 rounded-full text-gray-700 font-medium">
                {dong} <span className="text-brand-600 font-bold">{count}</span>건
              </span>
            ))}
          </div>
        </div>
      )}

      {dispatch_runs.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 font-semibold mb-1.5">오늘 배차 이력</div>
          <div className="space-y-1.5">
            {dispatch_runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                    run.is_auto ? 'bg-gray-100 text-gray-600' : 'bg-brand-100 text-brand-700'
                  }`}>
                    {run.is_auto ? '자동' : '관리자'}
                  </span>
                  <span className="text-gray-700">기사 {run.driver_count}명 / {run.order_count}건</span>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {drivers.map((driver, index) => {
        const selectedIndex = selectedDriverIds.indexOf(driver.id)
        const isSelected = selectedIndex >= 0
        const color = getDriverColor(driver.id)
        return (
          <button
            key={driver.id}
            onClick={() => onToggle(driver.id)}
            style={isSelected ? { borderColor: color, backgroundColor: `${color}12` } : {}}
            className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
              isSelected ? '' : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div
              style={isSelected ? { background: color } : {}}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                isSelected ? 'text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isSelected ? selectedIndex + 1 : index + 1}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{driver.name}</div>
              <div className="text-xs text-gray-500 truncate">{driver.phone}</div>
            </div>
            {isSelected && (
              <span
                style={{ background: color }}
                className="ml-auto flex-shrink-0 h-2.5 w-2.5 rounded-full"
              />
            )}
          </button>
        )
      })}
      {drivers.length === 0 && (
        <div className="col-span-full py-8 text-center text-gray-400">활성 기사가 없습니다.</div>
      )}
      {selectedDriverIds.length > maxCount && (
        <div className="col-span-full text-sm text-red-600">선택 기사 수를 확인해 주세요.</div>
      )}
    </div>
  )
}

/* ── 확인 모달 ────────────────────────────────────────────────────── */
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-gray-900">배차 실행 확인</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600">
          {pending > 0
            ? <><span className="font-bold text-gray-900">미배정 {pending}건</span>을 기사 <span className="font-bold text-gray-900">{driverCount}명</span>에게 배정합니다.</>
            : <>선택한 기사 <span className="font-bold text-gray-900">{driverCount}명</span>에게 배차를 실행합니다.</>
          }
        </p>

        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
          {selectedDriverIds.map((id, idx) => {
            const color = getDriverColor(id)
            return (
              <div key={id} className="flex items-center gap-2 text-sm text-gray-700">
                <div
                  style={{ background: color }}
                  className="w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                >
                  {idx + 1}
                </div>
                <span style={{ color }} className="font-semibold">
                  {driverMap[id]?.name ?? `기사 #${id}`}
                </span>
              </div>
            )
          })}
        </div>

        {isRequest && (
          <div className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
            기사 추가 배정 요청에 대한 응답으로 배차를 실행합니다.
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
          >
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

  const activeDrivers = drivers.filter((d) => d.is_active)
  const driverMap = useMemo(
    () => Object.fromEntries(drivers.map((d) => [d.id, d])),
    [drivers],
  )
  const selectedRequest = requests.find((r) => r.id === activeRequestId) ?? requests[0]

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['orders-today'] })
    qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
    qc.invalidateQueries({ queryKey: ['delivery-tracking-orders'] })
    qc.invalidateQueries({ queryKey: ['dispatch-requests', 'pending'] })
    refetchStatus()
  }

  const dispatchMutation = useMutation({
    mutationFn: (driver_ids: number[]) => api.post('/orders/dispatch', { driver_ids }).then((r) => r.data),
    onSuccess: (data: DispatchResult) => { setDispatchResult(data); refreshAll() },
  })

  const resolveMutation = useMutation({
    mutationFn: ({ requestId, driver_ids }: { requestId: number; driver_ids: number[] }) =>
      api.post(`/admin/dispatch-requests/${requestId}/resolve`, { driver_ids }).then((r) => r.data),
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
  }

  const canRun = selectedDriverIds.length === driverCount
  const isSubmitting = dispatchMutation.isPending || resolveMutation.isPending

  const handleDispatchClick = () => {
    if (!canRun) return
    setShowConfirm(true)
  }

  const handleConfirm = () => {
    setShowConfirm(false)
    if (selectedRequest) {
      resolveMutation.mutate({ requestId: selectedRequest.id, driver_ids: selectedDriverIds })
    } else {
      dispatchMutation.mutate(selectedDriverIds)
    }
  }

  return (
    <div className="p-6 max-w-6xl space-y-5 page-fade-in">
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center">
          <Route className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">배차 관리</h1>
          <p className="text-sm text-gray-500">총관리자 판단에 따라 기사 수를 정하고 오늘 배송을 배정합니다.</p>
        </div>
      </div>

      {/* 오늘 배송 현황 */}
      {todayStatus && <TodayStatusCard data={todayStatus} />}

      {/* 배차 요청 알림 */}
      {selectedRequest && (
        <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="font-bold text-orange-900">기사 추가/분배 결정 요청</div>
              <p className="text-sm text-orange-700">
                {selectedRequest.requested_by_driver_name} 기사 요청 · 총 {selectedRequest.total_orders}건 · 미배정 {selectedRequest.pending_orders}건
              </p>
            </div>
            <div className="text-sm font-semibold text-orange-800">
              권장 {selectedRequest.recommended_driver_count}명
            </div>
          </div>
          <p className="mt-3 text-sm text-orange-700">
            40건 초과 물량은 자동 배정하지 않습니다. 기사 수와 담당자를 아래에서 직접 결정해 주세요.
          </p>
        </div>
      )}

      {/* 배차 설정 */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        <section className="card space-y-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-500" />
            기사 수 결정
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {DRIVER_COUNT_OPTIONS.map((option) => (
              <button
                key={option.n}
                onClick={() => selectCount(option.n)}
                className={`rounded-lg border-2 p-3 text-left transition-all ${
                  driverCount === option.n ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
                }`}
              >
                <div className="text-xl font-black text-gray-900">{option.title}</div>
                <div className="text-xs text-gray-500 mt-1 leading-snug">{option.desc}</div>
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            선택한 기사 순서가 배차 우선순서입니다. 배정 후 기사가 "업무 시작"을 누르면 배송이 시작됩니다.
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand-500" />
              기사 선택
            </h2>
            <span className="text-sm text-gray-500">{selectedDriverIds.length} / {driverCount}명 선택</span>
          </div>

          {driversLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
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

          <button
            onClick={handleDispatchClick}
            disabled={!canRun || isSubmitting}
            className="btn-primary w-full py-4 text-base font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Route className="w-5 h-5" />}
            {selectedRequest ? '총관리자 결정으로 배정 승인' : '오늘 배송 배정 실행'}
          </button>

          {(dispatchMutation.isError || resolveMutation.isError) && (
            <p className="text-sm text-red-600 text-center">
              {((dispatchMutation.error || resolveMutation.error) as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                '배차 처리 중 오류가 발생했습니다.'}
            </p>
          )}
        </section>
      </div>

      {/* 대기 중인 요청 목록 (2개 이상일 때) */}
      {requests.length > 1 && (
        <section className="card">
          <h2 className="font-bold text-gray-800 mb-3">대기 중인 요청</h2>
          <div className="divide-y divide-gray-100">
            {requests.map((request) => (
              <button
                key={request.id}
                onClick={() => setActiveRequestId(request.id)}
                className={`w-full flex items-center justify-between gap-3 py-3 text-left ${
                  selectedRequest?.id === request.id ? 'text-brand-700' : 'text-gray-700'
                }`}
              >
                <span>{request.requested_by_driver_name} · {request.total_orders}건</span>
                <span className="text-xs text-gray-400">권장 {request.recommended_driver_count}명</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 배차 결과 */}
      {dispatchResult && (
        <section className="space-y-4">
          <div className="card bg-brand-50 border-brand-200">
            <div className="flex items-center gap-2 text-brand-700 font-bold text-xl">
              <CheckCircle className="w-6 h-6" />
              배정 완료
            </div>
            <p className="text-sm text-brand-700 mt-1">
              총 {dispatchResult.total}건을 {dispatchResult.groups.length}명 기사에게 배정했습니다.
              기사 앱에서 "업무 시작"을 누르면 배송이 시작됩니다.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {dispatchResult.groups.map((group) => {
              const driver = driverMap[group.driver_id]
              const color = getDriverColor(group.driver_id)
              return (
                <div key={group.driver_id} className="card border-l-4" style={{ borderLeftColor: color }}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span style={{ background: color }} className="inline-block h-3 w-3 rounded-full shrink-0" />
                      <div>
                        <div className="font-bold text-gray-900">{driver?.name ?? `기사 #${group.driver_id}`}</div>
                        <div className="text-xs text-gray-500">{group.dongs.join(', ')}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black" style={{ color }}>{group.order_count}</div>
                      <div className="text-xs text-gray-400">건</div>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    {group.orders.map((order) => (
                      <div key={order.id} className="flex items-center gap-3 py-2">
                        <div
                          style={{ background: color }}
                          className="w-7 h-7 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0"
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
                            <span className="text-xs text-gray-500 truncate">{order.delivery_address}</span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 flex-shrink-0">x{order.quantity}</div>
                      </div>
                    ))}
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
