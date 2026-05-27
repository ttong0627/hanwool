import { useState } from 'react'
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Search, X, Edit2, ShieldCheck, Phone, MapPin,
  Package, CheckCircle, Calendar, ChevronLeft, ChevronRight,
  Clock, Star, UserCheck, ArrowLeft, Truck,
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from '@/store/toastStore'
import { DONG_LIST, formatPhone } from '@/lib/utils'
import { KakaoAddressSearch, type AddressResult } from '@/components/KakaoAddressSearch'
import { useAuthStore } from '@/store/authStore'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer {
  id: number
  role?: string
  name: string
  phone: string
  dong?: string
  address?: string
  birth_year?: number
  age?: number
  is_elderly?: boolean
  is_active: boolean
  created_at: string
  order_count: number
  last_order_at?: string
}

interface OrderItem {
  id: number
  order_no: string
  status: string
  dong: string
  delivery_address: string
  items_desc?: string
  quantity: number
  market_date?: string
  created_at: string
  delivered_at?: string
  driver_name?: string
  driver_phone?: string
}

interface CustomerDetail extends Customer {
  delivered_count: number
  this_year_count: number
  orders: OrderItem[]
  order_total: number
  order_page: number
}

interface CustomerListResponse {
  items: Customer[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:    { label: '대기', cls: 'bg-gray-100 text-gray-600' },
  assigned:   { label: '배정', cls: 'bg-blue-100 text-blue-700' },
  picked_up:  { label: '픽업', cls: 'bg-indigo-100 text-indigo-700' },
  in_transit: { label: '배송중', cls: 'bg-yellow-100 text-yellow-700' },
  delivered:  { label: '완료', cls: 'bg-green-100 text-green-700' },
  cancelled:  { label: '취소', cls: 'bg-red-100 text-red-600' },
}

function relativeDate(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff < 30) return `${diff}일 전`
  if (diff < 365) return `${Math.floor(diff / 30)}개월 전`
  return `${Math.floor(diff / 365)}년 전`
}

function fmtDate(iso?: string): string {
  if (!iso) return '-'
  return iso.slice(0, 10)
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditCustomerModal({
  customer,
  onClose,
}: {
  customer: Customer
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: customer.name,
    dong: customer.dong || '',
    address: customer.address || '',
    birth_year: customer.birth_year ? String(customer.birth_year) : '',
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      api.put(`/users/${customer.id}`, {
        ...form,
        birth_year: form.birth_year ? parseInt(form.birth_year) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer-detail', customer.id] })
      toast.success('고객 정보가 수정되었습니다.')
      onClose()
    },
    onError: () => toast.error('저장에 실패했습니다.'),
  })

  const birthYear = parseInt(form.birth_year)
  const age = form.birth_year ? CURRENT_YEAR - birthYear : null
  const isElderly = age !== null && age >= 65

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">고객 정보 수정</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 (변경 불가)</label>
            <input className="input w-full bg-gray-50 text-gray-400 cursor-not-allowed" value={customer.phone} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">성명</label>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              출생연도 <span className="text-gray-400 font-normal text-xs">(65세 이상 검증용)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                type="number"
                min={1920}
                max={CURRENT_YEAR}
                placeholder={`예) ${CURRENT_YEAR - 65}`}
                value={form.birth_year}
                onChange={(e) => setForm((f) => ({ ...f, birth_year: e.target.value }))}
              />
              {age !== null && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${isElderly ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {age}세{isElderly ? ' ✓' : ' ✗'}
                </span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">거주 동</label>
            <select
              className="input w-full"
              value={form.dong}
              onChange={(e) => setForm((f) => ({ ...f, dong: e.target.value }))}
            >
              <option value="">선택</option>
              {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
            <KakaoAddressSearch
              value={form.address}
              onChange={(addr) => setForm((f) => ({ ...f, address: addr }))}
              onSelect={(result: AddressResult) => {
                const addr = result.road_address || result.address_name
                const matchedDong = result.dong_name
                  ? DONG_LIST.find((d) => result.dong_name === d) ?? undefined
                  : undefined
                setForm((f) => ({
                  ...f,
                  address: addr,
                  ...(matchedDong ? { dong: matchedDong } : {}),
                }))
              }}
              placeholder="도로명·지번·건물명 입력 후 선택"
            />
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={!form.name.trim() || updateMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {updateMutation.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Customer Card ─────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  selected,
  onClick,
}: {
  customer: Customer
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        selected ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-brand-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900">{customer.name}</span>
            {customer.is_elderly && (
              <span className="flex items-center gap-0.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                <ShieldCheck className="w-3 h-3" />
                65세↑
              </span>
            )}
            {!customer.is_active && (
              <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">비활성</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 tabular-nums">{customer.phone}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-black text-brand-600">{customer.order_count}</div>
          <div className="text-xs text-gray-400">건</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {customer.dong && (
          <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-100">
            {customer.dong}
          </span>
        )}
        {customer.age && (
          <span className="text-xs text-gray-400">{customer.age}세</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{relativeDate(customer.last_order_at)}</span>
      </div>
    </button>
  )
}

// ─── Customer Detail Panel ────────────────────────────────────────────────────

function CustomerDetailPanel({
  customerId,
  onEdit,
  onBack,
  onPromotedToDriver,
}: {
  customerId: number
  onEdit: (c: Customer) => void
  onBack: () => void
  onPromotedToDriver?: () => void
}) {
  const [orderPage, setOrderPage] = useState(1)
  const [confirmDriver, setConfirmDriver] = useState(false)
  const currentUser = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  const { data: detail, isLoading } = useQuery<CustomerDetail>({
    queryKey: ['customer-detail', customerId, orderPage],
    queryFn: () =>
      api.get(`/admin/customers/${customerId}`, { params: { order_page: orderPage } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const assignDriverMutation = useMutation({
    mutationFn: () => api.put(`/users/${customerId}/role`, { role: 'driver' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      toast.success('기사로 지정되었습니다.')
      setConfirmDriver(false)
      onPromotedToDriver?.()
    },
    onError: () => toast.error('기사 지정에 실패했습니다.'),
  })

  if (isLoading || !detail) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin mx-auto mb-2" />
          불러오는 중...
        </div>
      </div>
    )
  }

  const orderTotalPages = Math.max(1, Math.ceil(detail.order_total / 20))
  const editableCustomer = !detail.role || detail.role === 'customer'

  return (
    <div className="h-full overflow-y-auto">
      {/* 모바일용 뒤로가기 */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-brand-600 mb-4 lg:hidden"
      >
        <ArrowLeft className="w-4 h-4" />
        목록으로
      </button>

      {/* 프로필 헤더 */}
      <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-5 text-white mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold">{detail.name}</h2>
              {detail.is_elderly && (
                <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                  <ShieldCheck className="w-3 h-3" />
                  65세 이상 수혜대상
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 opacity-90">
              <Phone className="w-3.5 h-3.5" />
              <span className="text-sm tabular-nums">{detail.phone}</span>
            </div>
            {detail.dong && (
              <div className="flex items-center gap-1.5 mt-1 opacity-80">
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-sm">{detail.dong} · {detail.address || '주소 없음'}</span>
              </div>
            )}
            {detail.age && (
              <div className="flex items-center gap-1.5 mt-1 opacity-80">
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-sm">{detail.birth_year}년생 · 만 {detail.age}세</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            {editableCustomer && (
            <button
              onClick={() => onEdit(detail)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
              title="수정"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            )}
            {editableCustomer && currentUser?.role === 'super_admin' && (
              <button
                onClick={() => setConfirmDriver(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-xs font-medium"
                title="기사로 지정"
              >
                <Truck className="w-3.5 h-3.5" />
                기사 지정
              </button>
            )}
          </div>
        </div>

        {/* 기사 지정 확인 */}
        {confirmDriver && (
          <div className="mt-3 bg-white/10 rounded-xl p-3 text-sm">
            <p className="font-medium mb-2">
              <strong>{detail.name}</strong>님을 기사로 전환하시겠습니까?
            </p>
            <p className="text-xs opacity-80 mb-3">
              고객 역할이 기사로 변경되며, 모바일 앱으로 로그인합니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDriver(false)}
                className="flex-1 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => assignDriverMutation.mutate()}
                disabled={assignDriverMutation.isPending}
                className="flex-1 py-1.5 bg-white rounded-lg text-brand-700 text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                {assignDriverMutation.isPending ? '처리 중...' : '기사로 지정'}
              </button>
            </div>
          </div>
        )}

        {/* 통계 행 */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: '총 주문', value: detail.order_count, icon: Package },
            { label: '완료', value: detail.delivered_count, icon: CheckCircle },
            { label: '올해', value: detail.this_year_count, icon: Star },
            { label: '마지막 주문', value: relativeDate(detail.last_order_at), icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/10 rounded-xl p-2 text-center">
              <Icon className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <div className="font-bold text-lg leading-none">{value}</div>
              <div className="text-xs opacity-70 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 주문 이력 타임라인 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-brand-500" />
            주문 이력
            <span className="text-sm font-normal text-gray-400">총 {detail.order_total}건</span>
          </h3>
          {orderTotalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                disabled={orderPage === 1}
                className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-500 tabular-nums">{orderPage}/{orderTotalPages}</span>
              <button
                onClick={() => setOrderPage((p) => Math.min(orderTotalPages, p + 1))}
                disabled={orderPage === orderTotalPages}
                className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {detail.orders.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">주문 이력이 없습니다.</div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />
            <div className="space-y-4">
              {detail.orders.map((order) => {
                const st = STATUS_LABEL[order.status] || { label: order.status, cls: 'bg-gray-100 text-gray-500' }
                return (
                  <div key={order.id} className="flex gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 ${
                      order.status === 'delivered' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {order.status === 'delivered'
                        ? <CheckCircle className="w-5 h-5 text-green-600" />
                        : <Package className="w-5 h-5 text-gray-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0 pb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900">{order.order_no}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                        {order.market_date && (
                          <span className="text-xs text-gray-400">{order.market_date} 장날</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{order.delivery_address}</div>
                      {order.items_desc && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{order.items_desc} · {order.quantity}개</div>
                      )}
                      {(order.driver_name || order.driver_phone) && (
                        <div className="text-xs text-brand-600 mt-0.5 truncate">
                          기사 {order.driver_name || '-'} {order.driver_phone ? ` / ${order.driver_phone}` : ''}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1 tabular-nums">
                        접수 {fmtDate(order.created_at)}
                        {order.delivered_at && ` · 완료 ${fmtDate(order.delivered_at)}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Customers() {
  const [search, setSearch] = useState('')
  const [dongFilter, setDongFilter] = useState('')
  const [elderlyOnly, setElderlyOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Customer | null>(null)

  const { data: listData, isLoading } = useQuery<CustomerListResponse>({
    queryKey: ['customers', search, dongFilter, elderlyOnly, page],
    queryFn: () =>
      api.get('/admin/customers', {
        params: { search, dong: dongFilter, elderly_only: elderlyOnly, page, page_size: 30 },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })

  const customers = listData?.items ?? []
  const totalPages = listData?.total_pages ?? 1
  const total = listData?.total ?? 0

  const resetPage = () => setPage(1)

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {editing && <EditCustomerModal customer={editing} onClose={() => setEditing(null)} />}

      {/* 페이지 헤더 */}
      <div className="px-6 py-4 border-b bg-white flex items-center gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-500" />
            고객 관리
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            전체 {total.toLocaleString()}명 · 주문 기록 기준 자동 업데이트
          </p>
        </div>
      </div>

      {/* 검색 필터 */}
      <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 w-full text-sm"
            placeholder="이름·전화번호 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage() }}
          />
        </div>
        <select
          className="input w-28 text-sm"
          value={dongFilter}
          onChange={(e) => { setDongFilter(e.target.value); resetPage() }}
        >
          <option value="">전체 동</option>
          {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={elderlyOnly}
            onChange={(e) => { setElderlyOnly(e.target.checked); resetPage() }}
            className="rounded"
          />
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
          65세↑만
        </label>
      </div>

      {/* 분할 패널 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 왼쪽: 고객 목록 */}
        <div className={`flex flex-col w-full lg:w-80 xl:w-96 border-r bg-gray-50 ${selectedId ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading && (
              <div className="text-center text-gray-400 py-12 text-sm">불러오는 중...</div>
            )}
            {!isLoading && customers.length === 0 && (
              <div className="text-center text-gray-400 py-12">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">검색 결과가 없습니다.</p>
              </div>
            )}
            {customers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                selected={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
              />
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="border-t p-3 flex items-center justify-between bg-white">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30 hover:text-brand-600"
              >
                <ChevronLeft className="w-4 h-4" />
                이전
              </button>
              <span className="text-xs text-gray-400 tabular-nums">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30 hover:text-brand-600"
              >
                다음
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 오른쪽: 상세 패널 */}
        <div className={`flex-1 p-6 overflow-hidden ${!selectedId ? 'hidden lg:flex' : 'flex'}`}>
          {selectedId ? (
            <div className="w-full h-full overflow-y-auto">
              <CustomerDetailPanel
                customerId={selectedId}
                onEdit={setEditing}
                onBack={() => setSelectedId(null)}
                onPromotedToDriver={() => setSelectedId(null)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-full text-gray-300">
              <div className="text-center">
                <Users className="w-16 h-16 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">고객을 선택하면 상세 정보가 표시됩니다.</p>
                <p className="text-xs mt-1 text-gray-400">주문 이력, 배송 현황을 확인하세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
