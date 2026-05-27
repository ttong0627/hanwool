import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Download, X, Truck, Pencil, Trash2,
  ChevronLeft, ChevronRight, QrCode, FileSpreadsheet,
  TableProperties, ClipboardList,
} from 'lucide-react'
import api from '@/lib/api'
import { OrderCard } from '@/components/OrderCard'
import { DONG_LIST, STATUS_LABEL } from '@/lib/utils'
import { QrTab } from './orders/QrTab'
import { ExcelTab } from './orders/ExcelTab'
import { ManualTab } from './orders/ManualTab'

/* ── 타입 ──────────────────────────────────────────────────────────────────── */
interface Order {
  id: number; order_no: string; customer_name: string; customer_phone: string
  status: string; dong: string; delivery_address: string; items_desc?: string
  quantity: number; sequence?: number; created_at: string; driver_id?: number
  delivery_photo_url?: string | null; notes?: string; request?: string; weight_estimate?: string
}
interface Driver { id: number; name: string; phone: string }

/* ── 기사 배정 모달 ─────────────────────────────────────────────────────────── */
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
            <button key={d.id} onClick={() => setSelected(d.id)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${selected === d.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <p className={`font-semibold text-sm ${selected === d.id ? 'text-brand-700' : 'text-gray-900'}`}>{d.name}</p>
                </div>
                <p className="text-xs text-gray-500">{d.phone}</p>
              </div>
              {selected === d.id && <span className="text-brand-600 text-xs font-bold">선택됨</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">취소</button>
          <button disabled={!selected} onClick={() => selected && onConfirm(selected)} className="btn-primary flex-1 disabled:opacity-40">배정 확정</button>
        </div>
      </div>
    </div>
  )
}

/* ── 주문 수정 모달 ─────────────────────────────────────────────────────────── */
function EditModal({ order, onConfirm, onClose }: {
  order: Order; onConfirm: (data: Partial<Order>) => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    delivery_address: order.delivery_address, dong: order.dong,
    items_desc: order.items_desc ?? '', quantity: order.quantity,
    notes: order.notes ?? '', request: order.request ?? '', weight_estimate: order.weight_estimate ?? '',
  })
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">주문 수정</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{order.order_no} · {order.customer_name}님</p>
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
              <input value={form.items_desc} onChange={(e) => set('items_desc', e.target.value)} className="input" />
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
              <input value={form.request} onChange={(e) => set('request', e.target.value)} className="input" />
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

/* ── 취소 확인 다이얼로그 ────────────────────────────────────────────────────── */
function CancelDialog({ order, onConfirm, onClose }: { order: Order; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold mb-2">주문 취소</h2>
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <p className="font-semibold">{order.order_no}</p>
          <p className="text-gray-500">{order.customer_name} · {order.dong}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">닫기</button>
          <button onClick={onConfirm} className="flex-1 py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm">취소 확정</button>
        </div>
      </div>
    </div>
  )
}

/* ── 엑셀 업로드 모달 ────────────────────────────────────────────────────────── */
function ExcelModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: '88vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">엑셀 업로드</h2>
              <p className="text-xs text-gray-400">파일 업로드 + 컬럼 매핑 후 서버 저장</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <ExcelTab onClose={onClose} />
        </div>
      </div>
    </div>
  )
}

/* ── 주문 목록 탭 ──────────────────────────────────────────────────────────── */
function OrderListTab() {
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
    mutationFn: ({ orderId, data }: { orderId: number; data: object }) => api.put(`/orders/${orderId}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setEditTarget(null) },
  })
  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => api.delete(`/orders/${orderId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setCancelTarget(null) },
  })

  const items: Order[] = (data?.items ?? []).filter((o: Order) =>
    !search || o.customer_name.includes(search) || o.order_no.includes(search)
  )
  const resetFilters = () => { setDong(''); setStatus(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(1) }
  const hasFilter = !!(dong || status || search || dateFrom || dateTo)

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="이름 또는 접수번호" className="input pl-8 w-48" />
          </div>
          <select value={dong} onChange={(e) => { setDong(e.target.value); setPage(1) }} className="input w-32">
            <option value="">전체 동</option>
            {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input w-32">
            <option value="">전체 상태</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="input w-36" />
          <span className="text-gray-400">~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="input w-36" />
          {hasFilter && <button onClick={resetFilters} className="flex items-center gap-1 text-sm text-gray-500"><X className="w-4 h-4" />초기화</button>}
          <div className="ml-auto flex gap-2">
            <button onClick={() => window.open('/api/v1/documents/delivery-list.pdf')} className="btn-secondary flex items-center gap-1.5 text-xs px-2.5">
              <Download className="w-3.5 h-3.5" />배송명단
            </button>
            <button onClick={() => window.open('/api/v1/documents/labels.pdf')} className="btn-secondary flex items-center gap-1.5 text-xs px-2.5">
              <Download className="w-3.5 h-3.5" />QR라벨
            </button>
          </div>
        </div>
        {data && <p className="text-xs text-gray-400">총 {data.total}건</p>}
      </div>

      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      <div className="space-y-3">
        {items.map((order) => (
          <OrderCard key={order.id} order={order}
            actions={
              <div className="flex gap-2 flex-wrap">
                {!['delivered', 'cancelled'].includes(order.status) && (
                  <button onClick={() => setAssignTarget(order)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" />
                    {order.driver_id ? `${driverMap[order.driver_id] ?? '기사'} 재배정` : '기사 배정'}
                  </button>
                )}
                {order.status === 'pending' && (
                  <button onClick={() => setEditTarget(order)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" />수정
                  </button>
                )}
                {['pending', 'assigned'].includes(order.status) && (
                  <button onClick={() => setCancelTarget(order)} className="text-xs py-1.5 px-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" />취소
                  </button>
                )}
              </div>
            }
          />
        ))}
      </div>

      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary px-3 py-2 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm text-gray-600">{page} / {data.total_pages}</span>
          <button disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)} className="btn-secondary px-3 py-2 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}

      {assignTarget && (
        <AssignModal order={assignTarget} drivers={drivers}
          onConfirm={(driverId) => assignMutation.mutate({ orderId: assignTarget.id, driverId })}
          onClose={() => setAssignTarget(null)} />
      )}
      {editTarget && (
        <EditModal order={editTarget}
          onConfirm={(data) => editMutation.mutate({ orderId: editTarget.id, data })}
          onClose={() => setEditTarget(null)} />
      )}
      {cancelTarget && (
        <CancelDialog order={cancelTarget}
          onConfirm={() => cancelMutation.mutate(cancelTarget.id)}
          onClose={() => setCancelTarget(null)} />
      )}
    </div>
  )
}

/* ── 메인 컴포넌트 ────────────────────────────────────────────────────────── */
type TabKey = 'list' | 'qr' | 'manual'

const TABS: { key: TabKey; icon: React.ElementType; label: string; desc: string }[] = [
  { key: 'list',   icon: ClipboardList,  label: '주문 목록',  desc: '접수된 주문 조회·관리' },
  { key: 'qr',     icon: QrCode,         label: 'QR 촬영',   desc: '카메라로 QR 스캔 입력' },
  { key: 'manual', icon: TableProperties, label: '직접 입력', desc: '스프레드시트 방식 입력' },
]

export function Orders() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabKey>('manual')
  const [excelModalOpen, setExcelModalOpen] = useState(false)

  const activeTab = TABS.find((t) => t.key === tab)!

  return (
    <div className="p-6 max-w-5xl page-fade-in">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">주문 관리</h1>
          <p className="text-sm text-gray-500">배송 요청 접수 · 조회 · 관리</p>
        </div>
      </div>

      {/* 탭 내비게이션 */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {TABS.map(({ key, icon: Icon, label, desc }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl border-2 p-3 text-left transition-all ${
              tab === key
                ? 'border-brand-500 bg-brand-50 shadow-sm'
                : 'border-gray-200 hover:border-brand-300 bg-white'
            }`}
          >
            <div className={`flex items-center gap-2 mb-1 ${tab === key ? 'text-brand-600' : 'text-gray-500'}`}>
              <Icon className="w-4 h-4" />
              <span className={`font-bold text-sm ${tab === key ? 'text-brand-700' : 'text-gray-700'}`}>{label}</span>
            </div>
            <p className="text-xs text-gray-400 leading-snug">{desc}</p>
          </button>
        ))}

        {/* 엑셀 업로드 — 모달로 열기 */}
        <button
          onClick={() => setExcelModalOpen(true)}
          className="rounded-xl border-2 p-3 text-left transition-all border-gray-200 hover:border-brand-300 bg-white hover:bg-brand-50"
        >
          <div className="flex items-center gap-2 mb-1 text-gray-500">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="font-bold text-sm text-gray-700">엑셀 업로드</span>
          </div>
          <p className="text-xs text-gray-400 leading-snug">파일 업로드 + 컬럼 매핑</p>
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="card">
        {tab !== 'list' && (
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
            <activeTab.icon className="w-5 h-5 text-brand-500" />
            <div>
              <h2 className="font-bold text-gray-800">{activeTab.label}</h2>
              <p className="text-xs text-gray-400">{activeTab.desc}</p>
            </div>
          </div>
        )}

        {tab === 'list' && <OrderListTab />}
        {tab === 'qr' && <QrTab />}
        {tab === 'manual' && <ManualTab />}
      </div>

      {/* 엑셀 업로드 모달 */}
      {excelModalOpen && (
        <ExcelModal onClose={() => {
          setExcelModalOpen(false)
          qc.invalidateQueries({ queryKey: ['orders'] })
        }} />
      )}
    </div>
  )
}
