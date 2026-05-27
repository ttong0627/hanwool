import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Download, X, Truck, Pencil, Trash2,
  ChevronLeft, ChevronRight, QrCode, FileSpreadsheet,
  TableProperties, ClipboardList, AlertTriangle, MapPin,
  CheckCircle2, ChevronDown, ChevronUp, RefreshCw, RotateCcw,
  History,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'

async function downloadPdf(url: string, filename: string) {
  const token = localStorage.getItem('access_token')
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) { alert('다운로드 실패: ' + res.status); return }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
import { StatusBadge } from '@/components/StatusBadge'
import { DONG_LIST, STATUS_FILTER_OPTIONS, formatDate } from '@/lib/utils'
import { QrTab } from './orders/QrTab'
import { ExcelTab } from './orders/ExcelTab'
import { ManualTab } from './orders/ManualTab'

/* ── 타입 ──────────────────────────────────────────────────────────────────── */
interface Order {
  id: number; order_no: string; customer_name: string; customer_phone: string
  status: string; dong: string; delivery_address: string; items_desc?: string
  quantity: number; sequence?: number; created_at: string; driver_id?: number
  delivery_photo_url?: string | null; notes?: string; request?: string; weight_estimate?: string
  // 주소 검증 필드
  match_status?: string; service_dong?: string; standard_road_address?: string
  match_score?: number; coord_source?: string
}
interface Driver { id: number; name: string; phone: string }
interface OrderHistoryItem {
  id: number
  order_no: string
  event_type: string
  from_status?: string | null
  to_status?: string | null
  actor_role?: string | null
  driver_id?: number | null
  note?: string | null
  created_at?: string | null
}

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

/* ── 재접수 확인 다이얼로그 ─────────────────────────────────────────────────── */
function RestoreDialog({ order, onConfirm, onClose }: { order: Order; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold mb-1">재접수 처리</h2>
        <p className="text-sm text-gray-500 mb-3">취소된 주문을 픽업대기 상태로 다시 접수합니다.</p>
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <p className="font-semibold">{order.order_no}</p>
          <p className="text-gray-500">{order.customer_name} · {order.dong}</p>
          <p className="text-gray-400 text-xs mt-0.5">{order.delivery_address}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">닫기</button>
          <button onClick={onConfirm} className="flex-1 py-2 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm">재접수</button>
        </div>
      </div>
    </div>
  )
}

/* ── 완전 삭제 확인 다이얼로그 ──────────────────────────────────────────────── */
function CancelDialog({ order, onConfirm, onClose }: { order: Order; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold mb-1">주문 완전 삭제</h2>
        <div className="flex items-center gap-1.5 text-xs text-red-600 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          DB에서 완전히 제거됩니다. 복구할 수 없습니다.
        </div>
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <p className="font-semibold">{order.order_no}</p>
          <p className="text-gray-500">{order.customer_name} · {order.dong}</p>
          <p className="text-gray-400 text-xs mt-0.5">{order.delivery_address}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">취소</button>
          <button onClick={onConfirm} className="flex-1 py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm">완전 삭제</button>
        </div>
      </div>
    </div>
  )
}

/* ── 엑셀 업로드 모달 ────────────────────────────────────────────────────────── */
function HistoryModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { data: histories = [], isLoading } = useQuery<OrderHistoryItem[]>({
    queryKey: ['order-history', order.id],
    queryFn: () => api.get(`/orders/${order.id}/history`).then((r) => r.data),
  })

  const eventLabel: Record<string, string> = {
    created: '주문 접수',
    assigned: '기사 배정',
    status_changed: '상태 변경',
    delivered: '배송 완료',
    cancelled: '주문 취소',
    transferred: '기사 인계',
    hard_deleted: '완전 삭제',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[86vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">주문 이력</h2>
            <p className="text-sm text-gray-500">{order.order_no} · {order.customer_name}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {isLoading ? (
          <div className="text-center text-gray-400 py-8 text-sm">불러오는 중...</div>
        ) : histories.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">저장된 이력이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {histories.map((h) => (
              <div key={h.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-gray-900">{eventLabel[h.event_type] || h.event_type}</div>
                  <div className="text-xs text-gray-400">{h.created_at ? formatDate(h.created_at, 'MM/dd HH:mm') : '-'}</div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {(h.from_status || h.to_status) && <span>{h.from_status || '-'} → {h.to_status || '-'}</span>}
                  {h.driver_id ? <span className="ml-2">기사 #{h.driver_id}</span> : null}
                  {h.actor_role ? <span className="ml-2">처리자 {h.actor_role}</span> : null}
                </div>
                {h.note && <div className="text-xs text-gray-500 mt-1">{h.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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

/* ── 주소 검증 배지 ─────────────────────────────────────────────────────────── */
function MatchBadge({ status }: { status?: string }) {
  if (!status || status === 'matched') return null
  if (status === 'needs_review')
    return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="w-2.5 h-2.5" />검토필요</span>
  if (status === 'not_found')
    return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"><AlertTriangle className="w-2.5 h-2.5" />미확인</span>
  return null
}

/* ── 주소 검토 이슈 라벨 ────────────────────────────────────────────────────── */
function MatchIssueLabel({ order }: { order: Order }) {
  const { match_status, service_dong, dong } = order
  if (!match_status || match_status === 'matched') return null
  let text: string
  let cls: string
  if (match_status === 'not_found') {
    text = '주소 불명'; cls = 'bg-red-100 text-red-700'
  } else if (service_dong && service_dong !== dong) {
    text = `동 불일치→${service_dong}`; cls = 'bg-amber-100 text-amber-700'
  } else {
    text = '좌표 미확인'; cls = 'bg-amber-100 text-amber-700'
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>
      <AlertTriangle className="w-2.5 h-2.5" />{text}
    </span>
  )
}

function matchIssueText(order: Order): string {
  if (!order.match_status || order.match_status === 'matched') return ''
  if (order.match_status === 'not_found') return '입력한 주소를 도로명 DB에서 찾을 수 없습니다'
  if (order.service_dong && order.service_dong !== order.dong)
    return `입력 동(${order.dong})과 검증 동(${order.service_dong})이 다릅니다`
  return '좌표(위/경도)를 확인할 수 없습니다'
}

/* ── 압축형 주문 행 ──────────────────────────────────────────────────────── */
function CompactRow({ order, driverMap, onAssign, onEdit, onDelete, onRestore, onHistory }: {
  order: Order; driverMap: Record<number, string>
  onAssign: () => void; onEdit: () => void; onDelete: () => void; onRestore: () => void; onHistory: () => void
}) {
  const userRole = useAuthStore((s) => s.user?.role ?? '')
  const hasIssue = order.match_status && order.match_status !== 'matched'

  // 수정 가능: pending → 누구나(receiver+) / picked_up → super_admin만 / 그 외 잠금
  const canEdit = order.status === 'pending' || (order.status === 'picked_up' && userRole === 'super_admin')
  // 삭제 가능: pending·assigned → admin+ / picked_up → super_admin만 / cancelled → admin+ / in_transit·delivered 잠금
  const canDelete = ['pending', 'assigned'].includes(order.status) ||
    (order.status === 'picked_up' && userRole === 'super_admin') ||
    (order.status === 'cancelled' && ['admin', 'super_admin'].includes(userRole))

  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 transition-colors text-sm ${hasIssue ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-gray-50'}`}>
      {/* 순번 */}
      <div className="w-5 shrink-0 text-center">
        {order.sequence
          ? <span className="w-5 h-5 bg-brand-500 text-white text-[10px] font-bold rounded-full inline-flex items-center justify-center">{order.sequence}</span>
          : null}
      </div>
      {/* 접수번호 + 동 */}
      <div className="w-36 shrink-0">
        <span className="font-bold text-brand-700 text-xs block truncate">{order.order_no}</span>
        <span className="text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded-full">{order.dong}</span>
      </div>
      {/* 상태 배지 — 독립 열 */}
      <div className="w-24 shrink-0 flex flex-col gap-0.5 items-start">
        <StatusBadge status={order.status} />
        <MatchIssueLabel order={order} />
      </div>
      {/* 고객 */}
      <div className="w-28 shrink-0">
        <div className="font-semibold text-gray-900 truncate">{order.customer_name}</div>
        <div className="text-xs text-gray-400">{order.customer_phone}</div>
      </div>
      {/* 주소 + 물품 */}
      <div className="flex-1 min-w-0">
        <p className="text-gray-700 truncate">{order.delivery_address}</p>
        <div className="flex items-center gap-2">
          {order.items_desc && <p className="text-xs text-gray-400 truncate">{order.items_desc} · {order.quantity}개</p>}
          {hasIssue && <p className="text-[10px] text-amber-600 truncate">{matchIssueText(order)}</p>}
        </div>
      </div>
      {/* 기사 */}
      {order.driver_id && driverMap[order.driver_id] && (
        <div className="w-14 shrink-0 text-xs text-brand-600 font-medium truncate text-center">{driverMap[order.driver_id]}</div>
      )}
      {/* 시간 */}
      <div className="w-20 shrink-0 text-xs text-gray-400 text-right">{formatDate(order.created_at, 'MM/dd HH:mm')}</div>
      {/* 액션 */}
      <div className="flex gap-1 shrink-0">
        <button title="주문 이력" onClick={onHistory}
          className="p-1.5 rounded-lg border border-gray-200 hover:border-brand-400 hover:text-brand-600 text-gray-400 transition-colors">
          <History className="w-3.5 h-3.5" />
        </button>
        {order.status === 'cancelled' ? (
          <>
            <button title="재접수" onClick={onRestore}
              className="p-1.5 rounded-lg border border-brand-200 hover:bg-brand-50 text-brand-400 hover:text-brand-600 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            {canDelete && (
              <button title="DB 삭제" onClick={onDelete}
                className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        ) : (
          <>
            {!['delivered'].includes(order.status) && (
              <button title="기사 배정" onClick={onAssign}
                className="p-1.5 rounded-lg border border-gray-200 hover:border-brand-400 hover:text-brand-600 text-gray-400 transition-colors">
                <Truck className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && (
              <button title="수정" onClick={onEdit}
                className="p-1.5 rounded-lg border border-gray-200 hover:border-brand-400 hover:text-brand-600 text-gray-400 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDelete && (
              <button title="완전 삭제" onClick={onDelete}
                className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── 배송동 경고 패널 (오늘 주문 중 주소 검토 필요 항목) ─────────────────────── */
function StagingPanel({ onFixed }: { onFixed: () => void }) {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const qc = useQueryClient()

  const [expanded, setExpanded] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchDong, setBatchDong] = useState('')
  const [saving, setSaving] = useState(false)
  const [editTarget, setEditTarget] = useState<Order | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [geocodingIds, setGeocodingIds] = useState<Set<number>>(new Set())
  const [batchGeocoding, setBatchGeocoding] = useState(false)
  const autoTriggered = useRef(false)

  const editMutation = useMutation({
    mutationFn: ({ orderId, data }: { orderId: number; data: object }) =>
      api.put(`/orders/${orderId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
      setEditTarget(null)
      onFixed()
    },
  })
  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => api.delete(`/orders/${orderId}/hard`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
      setCancelTarget(null)
    },
  })

  const today = new Date().toISOString().split('T')[0]
  const { data: todayData } = useQuery({
    queryKey: ['orders-today-flagged'],
    queryFn: () => api.get('/orders', {
      params: { date_from: today, date_to: today, page_size: 100 }
    }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const flagged: Order[] = (todayData?.items ?? []).filter(
    (o: Order) => o.match_status === 'needs_review' || o.match_status === 'not_found'
  )

  // 패널 최초 로드 시 자동 재매칭 트리거
  useEffect(() => {
    if (autoTriggered.current || flagged.length === 0) return
    autoTriggered.current = true
    api.post('/orders/regeocode-unresolved').then(() => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['orders'] })
        qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
      }, 7000)
    }).catch(() => {})
  }, [flagged.length, qc])

  const handleGeocode = async (order: Order) => {
    setGeocodingIds((prev) => new Set(prev).add(order.id))
    try {
      await api.post(`/orders/${order.id}/regeocode`)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
      onFixed()
    } catch {
      // silent
    } finally {
      setGeocodingIds((prev) => { const s = new Set(prev); s.delete(order.id); return s })
    }
  }

  const handleBatchGeocode = async () => {
    setBatchGeocoding(true)
    try {
      await api.post('/orders/regeocode-unresolved')
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['orders'] })
        qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
        setBatchGeocoding(false)
      }, 7000)
    } catch {
      setBatchGeocoding(false)
    }
  }

  const toggle = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectAll = () => setSelectedIds(new Set(flagged.map((o) => o.id)))
  const clearAll = () => setSelectedIds(new Set())

  const handleBatchFix = async () => {
    if (!batchDong || selectedIds.size === 0) return
    setSaving(true)
    try {
      await Promise.all(
        [...selectedIds].map((id) => api.put(`/orders/${id}`, { dong: batchDong }))
      )
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders-today-flagged'] })
      setSelectedIds(new Set())
      setBatchDong('')
      onFixed()
    } finally {
      setSaving(false)
    }
  }

  if (flagged.length === 0) return null

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 overflow-hidden mb-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left flex-1"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="font-bold text-amber-800 text-sm">배송동 검토 필요 — {flagged.length}건</span>
          <span className="text-xs text-amber-600">주소 자동 매칭 실패 또는 좌표 미확인</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-amber-600 ml-1" /> : <ChevronDown className="w-4 h-4 text-amber-600 ml-1" />}
        </button>
        <button
          onClick={handleBatchGeocode}
          disabled={batchGeocoding}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-60 transition-colors shrink-0"
        >
          <RefreshCw className={`w-3 h-3 ${batchGeocoding ? 'animate-spin' : ''}`} />
          {batchGeocoding ? '매칭 중…' : '전체 자동 매칭'}
        </button>
      </div>

      {/* 수정 / 삭제 모달 */}
      {editTarget && (
        <EditModal
          order={editTarget}
          onConfirm={(data) => editMutation.mutate({ orderId: editTarget.id, data })}
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

      {expanded && (
        <div className="border-t border-amber-200 px-4 py-3 space-y-3">
          {/* 배치 동 수정 (admin 전용) */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-amber-200 p-3">
              <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-amber-800 shrink-0">배치 동 수정:</span>
              <select
                value={batchDong}
                onChange={(e) => setBatchDong(e.target.value)}
                className="input text-xs py-1 px-2 h-7 w-28"
              >
                <option value="">동 선택</option>
                {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button
                onClick={selectAll}
                className="text-xs text-amber-700 underline hover:text-amber-900"
              >전체 선택</button>
              {selectedIds.size > 0 && (
                <>
                  <button onClick={clearAll} className="text-xs text-gray-500 underline">선택 해제</button>
                  <button
                    onClick={handleBatchFix}
                    disabled={!batchDong || saving}
                    className="ml-auto btn-primary text-xs py-1 px-3 disabled:opacity-40"
                  >
                    {saving ? '저장 중…' : `${selectedIds.size}건 동 변경`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* 검토 필요 주문 목록 */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {flagged.map((order) => (
              <div
                key={order.id}
                onClick={() => isAdmin && toggle(order.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-sm transition-colors ${
                  selectedIds.has(order.id)
                    ? 'border-amber-400 bg-amber-100'
                    : 'border-amber-100 bg-white hover:border-amber-300'
                } ${isAdmin ? 'cursor-pointer' : ''}`}
              >
                {isAdmin && (
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${
                    selectedIds.has(order.id) ? 'border-amber-500 bg-amber-500' : 'border-gray-300'
                  }`}>
                    {selectedIds.has(order.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{order.customer_name}</span>
                    <span className="text-xs text-gray-500">{order.order_no}</span>
                    <MatchBadge status={order.match_status} />
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{order.dong}</span>
                    {order.service_dong && order.service_dong !== order.dong && (
                      <span className="text-xs text-amber-700">→ 검증동: {order.service_dong}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{order.standard_road_address ?? order.delivery_address}</p>
                </div>
                {/* 좌표 매칭 / 수정 / 삭제 버튼 */}
                {(() => {
                  const role = user?.role ?? ''
                  const stagingCanEdit = order.status === 'pending' || (order.status === 'picked_up' && role === 'super_admin')
                  const stagingCanDelete = ['pending', 'assigned'].includes(order.status) ||
                    (order.status === 'picked_up' && role === 'super_admin')
                  const isGeocoding = geocodingIds.has(order.id)
                  return (
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleGeocode(order)}
                        disabled={isGeocoding}
                        title="Kakao API로 좌표 재매칭"
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-60 transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${isGeocoding ? 'animate-spin' : ''}`} />
                        {isGeocoding ? '매칭 중' : '좌표 매칭'}
                      </button>
                      {stagingCanEdit && (
                        <button
                          onClick={() => setEditTarget(order)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />수정
                        </button>
                      )}
                      {stagingCanDelete && (
                        <button
                          onClick={() => setCancelTarget(order)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-red-200 bg-white text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />삭제
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 주문 목록 탭 ──────────────────────────────────────────────────────────── */
function todayLocalStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function OrderListTab() {
  const qc = useQueryClient()
  const today = todayLocalStr()
  const [dong, setDong] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [page, setPage] = useState(1)
  const [assignTarget, setAssignTarget] = useState<Order | null>(null)
  const [editTarget, setEditTarget] = useState<Order | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Order | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Order | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { dong, status, page, dateFrom, dateTo }],
    queryFn: () => api.get('/orders', {
      params: { dong: dong || undefined, status: status || undefined, page, page_size: 100, date_from: dateFrom || undefined, date_to: dateTo || undefined }
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
    mutationFn: (orderId: number) => api.delete(`/orders/${orderId}/hard`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setCancelTarget(null) },
  })
  const restoreMutation = useMutation({
    mutationFn: (orderId: number) => api.put(`/orders/${orderId}/status`, null, { params: { status: 'pending' } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setRestoreTarget(null) },
  })

  const items: Order[] = (data?.items ?? []).filter((o: Order) => {
    if (!search) return true
    const q = search.replace(/-/g, '')
    return (
      o.customer_name.includes(search) ||
      o.order_no.includes(search) ||
      (o.customer_phone ?? '').replace(/-/g, '').includes(q)
    )
  })

  // 목록 로드 시 좌표 미확인 주문 자동 백그라운드 매칭 (세션 1회)
  const autoGeoRef = useRef(false)
  useEffect(() => {
    if (autoGeoRef.current || !data?.items?.length) return
    const hasUnresolved = data.items.some(
      (o: Order) => !o.match_status || o.match_status !== 'matched'
    )
    if (!hasUnresolved) return
    autoGeoRef.current = true
    api.post('/orders/regeocode-unresolved').then(() => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['orders'] }), 8000)
    }).catch(() => {})
  }, [data, qc])

  const resetFilters = () => { setDong(''); setStatus(''); setSearch(''); setDateFrom(today); setDateTo(today); setPage(1) }
  const hasFilter = !!(dong || status || search || dateFrom !== today || dateTo !== today)

  const setRange = (days: number) => {
    const from = new Date()
    from.setDate(from.getDate() - days)
    const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
    setDateFrom(fromStr); setDateTo(today); setPage(1)
  }

  return (
    <div>
      <StagingPanel onFixed={() => qc.invalidateQueries({ queryKey: ['orders'] })} />

      {/* ── 고정 필터 바 (탭 헤더 48px 아래에 고정) ── */}
      <div className="sticky top-[48px] z-20 bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-2 mb-3 -mx-6 mx-0">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="이름·끝번호4자리·접수번호" className="input pl-7 w-44 text-xs py-1.5" />
          </div>
          <select value={dong} onChange={(e) => { setDong(e.target.value); setPage(1) }} className="input w-28 text-xs py-1.5">
            <option value="">전체 동</option>
            {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input w-28 text-xs py-1.5">
            <option value="">전체 상태</option>
            {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button onClick={() => { setDateFrom(today); setDateTo(today); setPage(1) }}
              className={`text-xs px-2 py-1 rounded border transition-colors ${dateFrom === today && dateTo === today ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 hover:border-brand-300'}`}>
              오늘
            </button>
            <button onClick={() => setRange(7)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-brand-300 transition-colors">1주</button>
            <button onClick={() => setRange(30)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-brand-300 transition-colors">1달</button>
          </div>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="input w-32 text-xs py-1.5" />
          <span className="text-gray-300 text-xs">~</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="input w-32 text-xs py-1.5" />
          {hasFilter && (
            <button onClick={resetFilters} className="text-gray-400 hover:text-gray-600 transition-colors" title="필터 초기화">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {data && <span className="text-xs text-gray-400 whitespace-nowrap">총 {data.total}건</span>}
            <button onClick={() => downloadPdf('/api/v1/documents/delivery-list.pdf', `배송명단_${dateFrom}.pdf`)} className="btn-secondary flex items-center gap-1 text-xs px-2 py-1">
              <Download className="w-3 h-3" />배송명단
            </button>
            <button onClick={() => downloadPdf('/api/v1/documents/labels.pdf', `QR라벨_${dateFrom}.pdf`)} className="btn-secondary flex items-center gap-1 text-xs px-2 py-1">
              <Download className="w-3 h-3" />QR라벨
            </button>
          </div>
        </div>
      </div>

      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 bg-white">
        {items.map((order) => (
          <CompactRow
            key={order.id}
            order={order}
            driverMap={driverMap}
            onAssign={() => setAssignTarget(order)}
            onEdit={() => setEditTarget(order)}
            onDelete={() => setCancelTarget(order)}
            onRestore={() => setRestoreTarget(order)}
            onHistory={() => setHistoryTarget(order)}
          />
        ))}
        {items.length === 0 && !isLoading && (
          <div className="text-center text-gray-400 py-12 text-sm">조회된 주문이 없습니다.</div>
        )}
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
      {restoreTarget && (
        <RestoreDialog order={restoreTarget}
          onConfirm={() => restoreMutation.mutate(restoreTarget.id)}
          onClose={() => setRestoreTarget(null)} />
      )}
      {historyTarget && (
        <HistoryModal order={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </div>
  )
}

/* ── 메인 컴포넌트 ────────────────────────────────────────────────────────── */
type TabKey = 'list' | 'manual' | 'qr'

export function Orders() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabKey>('list')
  const [excelModalOpen, setExcelModalOpen] = useState(false)

  const tabBtn = (key: TabKey, Icon: React.ElementType, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
        ${tab === key ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />{label}
    </button>
  )

  return (
    <div className="page-fade-in">
      {/* ── 상단 고정: 타이틀 + 탭 ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
              <ClipboardList className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-black text-gray-900 text-sm">주문 관리</span>
          </div>
          <div className="h-4 w-px bg-gray-200 shrink-0" />
          <div className="flex items-center gap-1 flex-wrap">
            {tabBtn('list', ClipboardList, '주문목록')}
            {tabBtn('manual', TableProperties, '직접입력')}
            <button
              onClick={() => setExcelModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-all whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />엑셀업로드
            </button>
            {tabBtn('qr', QrCode, 'QR촬영')}
          </div>
        </div>
      </div>

      {/* ── 탭 콘텐츠 ── */}
      <div className="max-w-5xl mx-auto px-6 py-4">
        {tab === 'list' && <OrderListTab />}
        {tab === 'qr' && (
          <div className="card-elevated rounded-xl p-5">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
                <QrCode className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-gray-800">QR 촬영</h2>
                <p className="text-xs text-gray-400">카메라로 QR 스캔 입력</p>
              </div>
            </div>
            <QrTab />
          </div>
        )}
        {tab === 'manual' && (
          <div className="card-elevated rounded-xl p-5">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-sm">
                <TableProperties className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-gray-800">직접 입력</h2>
                <p className="text-xs text-gray-400">스프레드시트 방식 입력</p>
              </div>
            </div>
            <ManualTab />
          </div>
        )}
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
