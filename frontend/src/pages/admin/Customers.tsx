import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, Search, X, Edit2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '@/lib/api'
import { DONG_LIST, formatDate, formatPhone } from '@/lib/utils'
import { KakaoAddressSearch } from '@/components/KakaoAddressSearch'

interface Customer {
  id: number
  name: string
  phone: string
  dong?: string
  address?: string
  is_active: boolean
  created_at: string
}

const PAGE_SIZE = 20

function CreateCustomerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', phone: '', dong: '', address: '', password: '' })

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', { ...form, role: 'customer', password: form.password || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      onClose()
    },
  })

  const valid = form.name.trim() && form.phone.trim()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">신규 고객 등록</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">성명 <span className="text-red-500">*</span></label>
              <input
                className="input w-full"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 <span className="text-red-500">*</span></label>
              <input
                className="input w-full"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
                placeholder="010-0000-0000"
              />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">상세 주소</label>
            <KakaoAddressSearch
              value={form.address}
              onChange={(addr) => setForm((f) => ({ ...f, address: addr }))}
              placeholder="주소 검색"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              앱 로그인 비밀번호 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              className="input w-full"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="미입력 시 앱 로그인 불가"
            />
            <p className="text-xs text-gray-400 mt-1">8자 이상 · 고객이 배송 추적 앱을 사용할 경우에만 설정</p>
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!valid || createMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {createMutation.isPending ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditCustomerModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: customer.name,
    dong: customer.dong || '',
    address: customer.address || '',
  })

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/users/${customer.id}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">고객 정보 수정</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
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
              placeholder="주소 검색"
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

export function Customers() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')
  const [dongFilter, setDongFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/users', { params: { role: 'customer' } }).then((r) => r.data),
    staleTime: 30_000,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })

  const filtered = customers.filter((c) => {
    if (!showInactive && !c.is_active) return false
    if (dongFilter && c.dong !== dongFilter) return false
    if (search) {
      const q = search.replace(/-/g, '')
      return c.name.includes(search) || c.phone.replace(/-/g, '').includes(q)
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const resetPage = () => setPage(1)

  return (
    <div className="p-6 space-y-4">
      {showCreate && <CreateCustomerModal onClose={() => setShowCreate(false)} />}
      {editing && <EditCustomerModal customer={editing} onClose={() => setEditing(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-500" />
            고객 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            전체 {customers.filter((c) => c.is_active).length.toLocaleString()}명 활성
            {customers.filter((c) => !c.is_active).length > 0 &&
              ` · 비활성 ${customers.filter((c) => !c.is_active).length.toLocaleString()}명`}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />신규 고객 등록
        </button>
      </div>

      <div className="card flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 w-full"
            placeholder="이름·전화번호 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage() }}
          />
        </div>
        <select
          className="input w-32"
          value={dongFilter}
          onChange={(e) => { setDongFilter(e.target.value); resetPage() }}
        >
          <option value="">전체 동</option>
          {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => { setShowInactive(e.target.checked); resetPage() }}
            className="rounded"
          />
          비활성 포함
        </label>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length.toLocaleString()}건</span>
      </div>

      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      {!isLoading && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="pb-3 pr-4 font-medium">성명</th>
                <th className="pb-3 pr-4 font-medium">연락처</th>
                <th className="pb-3 pr-4 font-medium">동</th>
                <th className="pb-3 pr-4 font-medium">주소</th>
                <th className="pb-3 pr-4 font-medium">등록일</th>
                <th className="pb-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b last:border-0 hover:bg-gray-50 transition-colors ${!c.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="py-3 pr-4 font-medium text-gray-900">{c.name}</td>
                  <td className="py-3 pr-4 text-gray-600 tabular-nums">{c.phone}</td>
                  <td className="py-3 pr-4">
                    {c.dong
                      ? <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-100">{c.dong}</span>
                      : <span className="text-xs text-gray-300">-</span>}
                  </td>
                  <td className="py-3 pr-4 text-gray-500 text-xs max-w-xs truncate">{c.address || '-'}</td>
                  <td className="py-3 pr-4 text-gray-400 text-xs tabular-nums">{formatDate(c.created_at)}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(c)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                        title="수정"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate({ id: c.id, is_active: !c.is_active })}
                        className={`p-1.5 rounded-lg transition-colors ${c.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                        title={c.is_active ? '비활성화' : '활성화'}
                      >
                        {c.is_active
                          ? <ToggleRight className="w-4 h-4" />
                          : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {paged.length === 0 && (
            <div className="text-center text-gray-400 py-10">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>검색 결과가 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 tabular-nums">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
