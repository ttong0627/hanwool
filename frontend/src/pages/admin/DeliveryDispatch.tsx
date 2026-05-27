import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  MapPin,
  Route,
  Truck,
  Users,
} from 'lucide-react'
import api from '@/lib/api'

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

const DRIVER_COUNT_OPTIONS = [
  { n: 1, title: '1명', desc: '총관리자가 1명 처리로 판단한 경우' },
  { n: 2, title: '2명', desc: '60건 전후 물량을 나눌 때 권장' },
  { n: 3, title: '3명', desc: '동별 편차가 크거나 지연 위험이 있을 때' },
  { n: 4, title: '4명', desc: '4개 동을 최대한 분리 배정' },
]

function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    pending: '대기',
    assigned: '배정',
    picked_up: '픽업',
    in_transit: '배송중',
    delivered: '완료',
    cancelled: '취소',
    delayed: '지연',
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
      {label[status] || status}
    </span>
  )
}

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
        return (
          <button
            key={driver.id}
            onClick={() => onToggle(driver.id)}
            className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
              isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300 bg-white'
            }`}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black ${
              isSelected ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {isSelected ? selectedIndex + 1 : index + 1}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{driver.name}</div>
              <div className="text-xs text-gray-500 truncate">{driver.phone}</div>
            </div>
            {isSelected && <CheckCircle className="w-4 h-4 text-brand-500 ml-auto" />}
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

export function DeliveryDispatch() {
  const qc = useQueryClient()
  const [driverCount, setDriverCount] = useState(1)
  const [selectedDriverIds, setSelectedDriverIds] = useState<number[]>([])
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null)

  const { data: drivers = [], isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const { data: requests = [] } = useQuery<DispatchRequest[]>({
    queryKey: ['dispatch-requests', 'pending'],
    queryFn: () => api.get('/admin/dispatch-requests', { params: { status_filter: 'pending' } }).then((r) => r.data),
    refetchInterval: 20_000,
  })

  const activeDrivers = drivers.filter((driver) => driver.is_active)
  const driverMap = useMemo(() => Object.fromEntries(drivers.map((driver) => [driver.id, driver])), [drivers])
  const selectedRequest = requests.find((request) => request.id === activeRequestId) || requests[0]

  const dispatchMutation = useMutation({
    mutationFn: (driver_ids: number[]) => api.post('/orders/dispatch', { driver_ids }).then((r) => r.data),
    onSuccess: (data: DispatchResult) => {
      setDispatchResult(data)
      qc.invalidateQueries({ queryKey: ['orders-today'] })
      qc.invalidateQueries({ queryKey: ['dispatch-requests', 'pending'] })
    },
  })

  const resolveMutation = useMutation({
    mutationFn: ({ requestId, driver_ids }: { requestId: number; driver_ids: number[] }) =>
      api.post(`/admin/dispatch-requests/${requestId}/resolve`, { driver_ids }).then((r) => r.data),
    onSuccess: (data) => {
      setDispatchResult(data.dispatch)
      setActiveRequestId(null)
      qc.invalidateQueries({ queryKey: ['dispatch-requests', 'pending'] })
      qc.invalidateQueries({ queryKey: ['orders-today'] })
    },
  })

  const toggleDriver = (id: number) => {
    setSelectedDriverIds((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id)
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

  const runDispatch = () => {
    if (!canRun) return
    if (selectedRequest) {
      resolveMutation.mutate({ requestId: selectedRequest.id, driver_ids: selectedDriverIds })
      return
    }
    dispatchMutation.mutate(selectedDriverIds)
  }

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center">
          <Route className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">배차 관리</h1>
          <p className="text-sm text-gray-500">총관리자 판단에 따라 기사 수를 정하고 오늘 배송을 배정합니다.</p>
        </div>
      </div>

      {selectedRequest && (
        <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center">
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
            40건 초과 물량은 자동 배정하지 않습니다. 60건도 1명이 할지 2명 이상에게 나눌지는 여기서 직접 결정합니다.
          </p>
        </div>
      )}

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
            선택한 기사 순서가 배차 우선순서입니다. 총관리자 요청 알림이 있으면 승인과 동시에 배정됩니다.
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
            onClick={runDispatch}
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

      {dispatchResult && (
        <section className="space-y-4">
          <div className="card bg-brand-50 border-brand-200">
            <div className="flex items-center gap-2 text-brand-700 font-bold text-xl">
              <CheckCircle className="w-6 h-6" />
              배정 완료
            </div>
            <p className="text-sm text-brand-700 mt-1">
              총 {dispatchResult.total}건을 {dispatchResult.groups.length}명 기사에게 배정했습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {dispatchResult.groups.map((group) => {
              const driver = driverMap[group.driver_id]
              return (
                <div key={group.driver_id} className="card">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="font-bold text-gray-900">{driver?.name || `기사 #${group.driver_id}`}</div>
                      <div className="text-xs text-gray-500">{group.dongs.join(', ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-brand-600">{group.order_count}</div>
                      <div className="text-xs text-gray-400">건</div>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    {group.orders.map((order) => (
                      <div key={order.id} className="flex items-center gap-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-black flex items-center justify-center">
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
                        <div className="text-xs text-gray-400">x{order.quantity}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
