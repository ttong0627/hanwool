import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, X, ChevronLeft, ChevronRight, Truck, Pencil, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { OrderCard } from '@/components/OrderCard'
import { DONG_LIST, STATUS_LABEL } from '@/lib/utils'

interface Order {
  id: number; order_no: string; customer_name: string; customer_phone: string
  status: string; dong: string; delivery_address: string; items_desc?: string
  quantity: number; sequence?: number; created_at: string; driver_id?: number
  delivery_photo_url?: string | null; notes?: string; request?: string
  weight_estimate?: string
}
interface Driver { id: number; name: string; phone: string }

// ── 기사 배정 모달 ─────────────────────────────────────────────────────────────
function AssignModal({ order, drivers, onConfirm, onClose }: {
  order: Order; drivers: Driver[]
  onConfirm: (driverId: number) => void; onClose: () => void
}) {
  const [selected, setSelected] = useState<number | null>(order.driver_id ?? null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">기사 배정</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{order.order_no} · {order.customer_name}님</p>
        <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
          {drivers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">등록된 기사가 없습니다.</p>}
          {drivers.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${selected === d.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="text-left">
                <p className={`font-semibold text-sm ${selected === d.id ? 'text-brand-700' : 'text-gray-900'}`}>{d.name}</p>
                <p className="text-xs text-gray-500">{d.phone}</p>
              </div>
              {selected === d.id && <span className="text-brand-600 text-xs font-bold">선택됨</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">취소</button>
          <button
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            className="btn-primary flex-1 disabled:opacity-40"
          >
            배정 확정
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 주문 수정 모달 ─────────────────────────────────────────────────────────────
function EditModal({ order, onConfirm, onClose }: {
  order: Order
  onConfirm: (data: Partial<Order>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    delivery_address: order.delivery_address,
    dong: order.dong,
    items_desc: order.items_desc ?? '',
    quantity: order.quantity,
    notes: order.notes ?? '',
    request: order.request ?? '',
    weight_estimate: order.weight_estimate ?? '',
  })
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">주문 수정</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{order.order_no} · {order.customer_name}님 (접수대기 상태만 수정 가능)</p>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">배송 동</label>
              <select value={form.dong} onChange={(e) => set('dong', e.target.value)} className="input">
                {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">배송 주소</label>
              <input value={form.delivery_address} onChange={(e) => set('delivery_address', e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="label">물품 내역</label>
              <input value={form.items_desc} onChange={(e) => set('items_desc', e.target.value)} className="input" placeholder="쌀 10kg, 된장 1개..." />
            </div>
            <div>
              <label className="label">수량</label>
              <input type="number" min={1} value={form.quantity} onChange={(e) => set('quantity', parseInt(e.target.value) || 1)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">무게 추정</label>
              <select value={form.weight_estimate} onChange={(e) => set('weight_estimate', e.target.value)} className="input">
                <option value="">선택</option>
                <option value="가벼움 (5kg 미만)">가벼움 (5kg 미만)</option>
                <option value="보통 (5~15kg)">보통 (5~15kg)</option>
                <option value="무거움 (15kg 이상)">무거움 (15kg 이상)</option>
              </select>
            </div>
            <div>
              <label className="label">요청사항</label>
              <input value={form.request} onChange={(e) => set('request', e.target.value)} className="input" placeholder="문 앞, 경비실..." />
            </div>
          </div>
          <div>
            <label className="label">비고</label>
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)} className="input" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">취소</button>
          <button onClick={() => onConfirm(form)} className="btn-primary flex-1">저장</button>
        </div>
      </div>
    </div>
  )
}

// ── 취소 확인 다이얼로그 ───────────────────────────────────────────────────────
function CancelDialog({ order, onConfirm, onClose }: {
  order: Order; onConfirm: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold mb-2">주문 취소</h2>
        <p className="text-sm text-gray-600 mb-1">아래 주문을 취소하시겠습니까?</p>
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <p className="font-semibold text-gray-900">{order.order_no}</p>
          <p className="text-gray-600">{order.customer_name} · {order.dong}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">닫기</button>
          <button onClick={onConfirm} className="flex-1 py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors">
            취소 확정
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function Orders() {
  const qc = useQueryClient()
  const [dong, setDong] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [assignTarget, setAssignTarget] = useState<Order | null>(null)
  const [editTarget, setEditTarget] = useState<Order | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { dong, status, page, dateFrom, dateTo }],
    queryFn: () => api.get('/orders', {
      params: { dong: dong || undefined, status: status || undefined, page, page_size: 20, date_from: dateFrom || undefined, date_to: dateTo || undefined }
    }).then((r) => r.data),
  })

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d.name]))

  const assignMutation = useMutation({
    mutationFn: ({ orderId, driverId }: { orderId: number; driverId: number }) =>
      api.put(`/orders/${orderId}/assign`, null, { params: { driver_id: driverId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setAssignTarget(null) },
  })

  const editMutation = useMutation({
    mutationFn: ({ orderId, data }: { orderId: number; data: object }) =>
      api.put(`/orders/${orderId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setEditTarget(null) },
  })

  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => api.delete(`/orders/${orderId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setCancelTarget(null) },
  })

  // 검색어 클라이언트 필터 (이름 or 접수번호)
  const items: Order[] = (data?.items ?? []).filter((o: Order) =>
    !search || o.customer_name.includes(search) || o.order_no.includes(search)
  )

  const resetFilters = () => { setDong(''); setStatus(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(1) }
  const hasFilter = !!(dong || status || search || dateFrom || dateTo)

  return (
    <div className="p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">주문 관리</h1>
          {data && <p className="text-sm text-gray-500 mt-0.5">총 {data.total}건</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.open('/api/v1/documents/delivery-list.pdf')} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download className="w-4 h-4" />배송 명단
          </button>
          <button onClick={() => window.open('/api/v1/documents/labels.pdf')} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download className="w-4 h-4" />QR 라벨
          </button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="card space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="이름 또는 접수번호 검색"
              className="input pl-8 w-52"
            />
          </div>
          <select value={dong} onChange={(e) => { setDong(e.target.value); setPage(1) }} className="input w-36">
            <option value="">전체 동</option>
            {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input w-36">
            <option value="">전체 상태</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="input w-36" />
          <span className="text-gray-400 text-sm">~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="input w-36" />
          {hasFilter && (
            <button onClick={resetFilters} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />초기화
            </button>
          )}
        </div>
      </div>

      {/* 주문 목록 */}
      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      <div className="space-y-3">
        {items.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            actions={
              <div className="flex gap-2 flex-wrap w-full">
                {/* 기사 배정 / 재배정 */}
                {!['delivered', 'cancelled'].includes(order.status) && (
                  <button
                    onClick={() => setAssignTarget(order)}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    {order.driver_id ? `${driverMap[order.driver_id] ?? '기사'} 재배정` : '기사 배정'}
                  </button>
                )}

                {/* 수정 (pending만) */}
                {order.status === 'pending' && (
                  <button
                    onClick={() => setEditTarget(order)}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />수정
                  </button>
                )}

                {/* 수령증 */}
                <button
                  onClick={() => window.open(`/api/v1/documents/receipt/${order.id}.pdf`)}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  수령증
                </button>

                {/* 취소 */}
                {!['delivered', 'cancelled'].includes(order.status) && (
                  <button
                    onClick={() => setCancelTarget(order)}
                    className="text-xs py-1.5 px-3 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />취소
                  </button>
                )}

                {/* 배정된 기사 표시 */}
                {order.driver_id && driverMap[order.driver_id] && (
                  <span className="text-xs text-gray-400 self-center ml-auto">
                    담당: {driverMap[order.driver_id]}
                  </span>
                )}
              </div>
            }
          />
        ))}

        {!isLoading && items.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            <p className="text-lg mb-1">주문이 없습니다</p>
            {hasFilter && <p className="text-sm">필터를 초기화해 보세요</p>}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-between text-sm text-gray-500 pt-2">
          <span>{(page - 1) * 20 + 1} – {Math.min(page * 20, data.total)} / {data.total}건</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-brand-50 text-brand-700 rounded-lg font-medium">{page}</span>
            <button disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 모달들 */}
      {assignTarget && (
        <AssignModal
          order={assignTarget}
          drivers={drivers}
          onConfirm={(driverId) => assignMutation.mutate({ orderId: assignTarget.id, driverId })}
          onClose={() => setAssignTarget(null)}
        />
      )}
      {editTarget && editTarget.status === 'pending' && (
        <EditModal
          order={editTarget}
          onConfirm={(formData) => editMutation.mutate({ orderId: editTarget.id, data: formData })}
          onClose={() => setEditTarget(null)}
        />
      )}
      {cancelTarget && (
        <CancelDialog
          order={cancelTarget}
          onConfirm={() => cancelMutation.mutate(cancelTarget.id)}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  )
}
