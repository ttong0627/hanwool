import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Truck, MapPin, ArrowRight, ArrowLeftRight,
  CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Loader2, Route
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
  can_transfer_to: number[]
  orders: DispatchOrderItem[]
}

interface DispatchResult {
  groups: DriverGroup[]
  total: number
}

const DONG_COLORS: Record<string, string> = {
  경안동: 'bg-orange-100 text-orange-700 border-orange-200',
  송정동: 'bg-blue-100 text-blue-700 border-blue-200',
  쌍령동: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  탄벌동: 'bg-purple-100 text-purple-700 border-purple-200',
}

const DONG_BG: Record<string, string> = {
  경안동: 'bg-orange-500',
  송정동: 'bg-blue-500',
  쌍령동: 'bg-emerald-500',
  탄벌동: 'bg-purple-500',
}

const DRIVER_COUNT_OPTIONS = [
  { n: 1, label: '1명', desc: '전체 4개동 순차 배송' },
  { n: 2, label: '2명', desc: '경안+쌍령 / 송정+탄벌' },
  { n: 3, label: '3명', desc: '최소 2개동 묶음 + 각 1개동' },
  { n: 4, label: '4명', desc: '동별 1:1 배정' },
]

function DongBadge({ dong }: { dong: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${DONG_COLORS[dong] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {dong}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: '대기',
    assigned: '배정',
    picked_up: '픽업',
    in_transit: '이동중',
    delivered: '완료',
    cancelled: '취소',
  }
  const colors: Record<string, string> = {
    pending: 'text-gray-500 bg-gray-100',
    assigned: 'text-blue-600 bg-blue-100',
    picked_up: 'text-orange-600 bg-orange-100',
    in_transit: 'text-brand-600 bg-brand-100',
    delivered: 'text-green-600 bg-green-100',
    cancelled: 'text-red-500 bg-red-100',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[status] || 'text-gray-500 bg-gray-100'}`}>
      {map[status] || status}
    </span>
  )
}

function DriverCard({
  group,
  driverName,
  drivers,
  onTransfer,
  transferring,
}: {
  group: DriverGroup
  driverName: string
  drivers: Driver[]
  onTransfer: (orderId: number, toDriverId: number) => void
  transferring: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const [transferTarget, setTransferTarget] = useState<number | null>(null)

  const transferableDrivers = drivers.filter((d) => group.can_transfer_to.includes(d.id))
  const hasImbalance = group.can_transfer_to.length > 0

  return (
    <div className={`rounded-2xl border-2 ${hasImbalance ? 'border-orange-300' : 'border-gray-200'} bg-white shadow-sm overflow-hidden`}>
      {/* 헤더 */}
      <div className={`px-5 py-4 ${hasImbalance ? 'bg-orange-50' : 'bg-gray-50'} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
            {driverName.slice(0, 1)}
          </div>
          <div>
            <div className="font-bold text-gray-900">{driverName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {group.dongs.map((d) => <DongBadge key={d} dong={d} />)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-black text-brand-600">{group.order_count}</div>
            <div className="text-xs text-gray-400">건</div>
          </div>
          {hasImbalance && (
            <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              물량 많음
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
        </div>
      </div>

      {/* 동별 진행 바 */}
      <div className="px-5 py-2 bg-white border-b border-gray-100 flex gap-1 h-2">
        {group.dongs.map((dong) => {
          const dCount = group.orders.filter((o) => o.dong === dong).length
          const ratio = group.order_count > 0 ? (dCount / group.order_count) * 100 : 0
          return (
            <div
              key={dong}
              style={{ width: `${ratio}%` }}
              className={`h-full rounded-full ${DONG_BG[dong] || 'bg-gray-400'} transition-all`}
              title={`${dong} ${dCount}건`}
            />
          )
        })}
      </div>

      {/* 주문 목록 */}
      {expanded && (
        <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
          {group.orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors"
            >
              {/* 순번 */}
              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-black flex items-center justify-center flex-shrink-0">
                {order.sequence}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <DongBadge dong={order.dong} />
                  <span className="font-semibold text-sm text-gray-900 truncate">{order.customer_name}</span>
                  <StatusBadge status={order.status} />
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-500 truncate">{order.delivery_address}</span>
                </div>
              </div>

              {/* 수량 */}
              <div className="text-xs text-gray-400 flex-shrink-0">×{order.quantity}</div>

              {/* 이관 버튼 (물량 많은 동 + 마지막 20% 순번) */}
              {hasImbalance && order.sequence > Math.ceil(group.order_count * 0.8) && transferableDrivers.length > 0 && (
                <div className="flex-shrink-0">
                  {transferTarget === order.id ? (
                    <div className="flex gap-1">
                      {transferableDrivers.map((td) => (
                        <button
                          key={td.id}
                          disabled={transferring}
                          onClick={() => { onTransfer(order.id, td.id); setTransferTarget(null) }}
                          className="text-xs px-2 py-1 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-1"
                        >
                          {transferring ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          → {td.name}
                        </button>
                      ))}
                      <button onClick={() => setTransferTarget(null)} className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-lg">
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setTransferTarget(order.id)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                      title="이관"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DeliveryDispatch() {
  const qc = useQueryClient()
  const [driverCount, setDriverCount] = useState(1)
  const [selectedDriverIds, setSelectedDriverIds] = useState<number[]>([])
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null)
  const [step, setStep] = useState<'select' | 'result'>('select')

  const { data: drivers = [], isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const activeDrivers = drivers.filter((d) => d.is_active)

  const dispatchMutation = useMutation({
    mutationFn: (driver_ids: number[]) =>
      api.post('/orders/dispatch', { driver_ids }).then((r) => r.data),
    onSuccess: (data: DispatchResult) => {
      setDispatchResult(data)
      setStep('result')
      qc.invalidateQueries({ queryKey: ['orders-today'] })
    },
  })

  const transferMutation = useMutation({
    mutationFn: ({ orderId, toDriverId }: { orderId: number; toDriverId: number }) =>
      api.post(`/orders/${orderId}/transfer`, { to_driver_id: toDriverId, reason: '배송 부하 조정' }),
    onSuccess: () => {
      if (dispatchResult && selectedDriverIds.length > 0) {
        dispatchMutation.mutate(selectedDriverIds)
      }
    },
  })

  const toggleDriver = (id: number) => {
    setSelectedDriverIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= driverCount) return [...prev.slice(1), id]
      return [...prev, id]
    })
  }

  const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d]))

  const handleDispatch = () => {
    if (selectedDriverIds.length !== driverCount) return
    dispatchMutation.mutate(selectedDriverIds)
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
          <Route className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">배차 관리</h1>
          <p className="text-sm text-gray-500">기사 수를 선택하고 배송순번을 자동 배정합니다</p>
        </div>
      </div>

      {step === 'select' && (
        <div className="space-y-6">
          {/* 기사 수 선택 */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-500" />
              배차 기사 수 선택
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {DRIVER_COUNT_OPTIONS.map(({ n, label, desc }) => (
                <button
                  key={n}
                  onClick={() => { setDriverCount(n); setSelectedDriverIds([]) }}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    driverCount === n
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-brand-300'
                  }`}
                >
                  <div className={`text-3xl font-black mb-1 ${driverCount === n ? 'text-brand-600' : 'text-gray-700'}`}>
                    {label}
                  </div>
                  <div className="text-xs text-gray-500 leading-snug">{desc}</div>
                </button>
              ))}
            </div>

            {/* 배차 규칙 안내 */}
            <div className="mt-4 p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
              {driverCount === 1 && (
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" />
                  <span><strong>경안동 → 송정동 → 쌍령동 → 탄벌동</strong> 순서로 전체 배송순번 자동 배정</span>
                </div>
              )}
              {driverCount === 2 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span><strong>1번 기사</strong>: 경안동 → 쌍령동</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span><strong>2번 기사</strong>: 송정동 → 탄벌동</span>
                  </div>
                </div>
              )}
              {driverCount === 3 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand-500" />
                    <span><strong>1번 기사</strong>: 주문 수 가장 적은 2개 동 (자동 계산)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span><strong>2·3번 기사</strong>: 나머지 2개 동 각 1개씩</span>
                  </div>
                </div>
              )}
              {driverCount === 4 && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span><strong>동별 1:1 배정.</strong> 물량이 편중된 동은 마지막 순번 일부를 이관 버튼으로 조정할 수 있습니다.</span>
                </div>
              )}
            </div>
          </div>

          {/* 기사 선택 */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand-500" />
              기사 선택
              <span className="ml-auto text-sm font-normal text-gray-500">
                {selectedDriverIds.length} / {driverCount}명 선택됨
              </span>
            </h2>

            {driversLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                기사 목록 로딩중...
              </div>
            ) : activeDrivers.length === 0 ? (
              <div className="text-center py-8 text-gray-400">활성 기사가 없습니다</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {activeDrivers.map((d, idx) => {
                  const isSelected = selectedDriverIds.includes(d.id)
                  const selIdx = selectedDriverIds.indexOf(d.id)
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleDriver(d.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 hover:border-brand-300 bg-white'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black ${
                        isSelected ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isSelected ? selIdx + 1 : idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{d.name}</div>
                        <div className="text-xs text-gray-500">{d.phone}</div>
                      </div>
                      {isSelected && <CheckCircle className="w-4 h-4 text-brand-500 ml-auto" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 배차 실행 */}
          <button
            onClick={handleDispatch}
            disabled={selectedDriverIds.length !== driverCount || dispatchMutation.isPending}
            className="btn-primary w-full py-4 text-base font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {dispatchMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                배차 계산중...
              </>
            ) : (
              <>
                <Route className="w-5 h-5" />
                배차 시작 — {driverCount}명 기사에게 순번 배정
              </>
            )}
          </button>

          {dispatchMutation.isError && (
            <p className="text-sm text-red-600 text-center">
              {(dispatchMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '배차 중 오류가 발생했습니다.'}
            </p>
          )}
        </div>
      )}

      {step === 'result' && dispatchResult && (
        <div className="space-y-4">
          {/* 결과 요약 헤더 */}
          <div className="card bg-gradient-to-r from-brand-50 to-orange-50 border-brand-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-brand-700 font-black text-xl">
                  <CheckCircle className="w-6 h-6" />
                  배차 완료
                </div>
                <p className="text-sm text-brand-600 mt-1">
                  총 <strong>{dispatchResult.total}건</strong>을 <strong>{dispatchResult.groups.length}명</strong>의 기사에게 배정했습니다
                </p>
              </div>
              <button
                onClick={() => { setStep('select'); setDispatchResult(null) }}
                className="text-sm text-brand-600 hover:text-brand-800 border border-brand-300 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition-colors"
              >
                다시 배차
              </button>
            </div>

            {/* 동별 요약 바 */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(['경안동', '송정동', '쌍령동', '탄벌동'] as const).map((dong) => {
                const count = dispatchResult.groups.flatMap((g) => g.orders).filter((o) => o.dong === dong).length
                const driverGroup = dispatchResult.groups.find((g) => g.dongs.includes(dong))
                const driverName = driverGroup ? driverMap[driverGroup.driver_id]?.name : '-'
                return (
                  <div key={dong} className="bg-white rounded-xl p-3 border border-brand-100 text-center">
                    <DongBadge dong={dong} />
                    <div className="text-2xl font-black text-gray-800 mt-1">{count}건</div>
                    <div className="text-xs text-gray-500 mt-0.5">{driverName}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 기사별 카드 */}
          <div className="grid gap-4">
            {dispatchResult.groups.map((group) => {
              const driver = driverMap[group.driver_id]
              return (
                <DriverCard
                  key={group.driver_id}
                  group={group}
                  driverName={driver?.name || `기사 #${group.driver_id}`}
                  drivers={drivers}
                  onTransfer={(orderId, toDriverId) =>
                    transferMutation.mutate({ orderId, toDriverId })
                  }
                  transferring={transferMutation.isPending}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
