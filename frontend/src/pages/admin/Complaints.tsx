import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, MessageSquareWarning, Plus, X, Search, Phone, Smartphone, UserRound } from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  received: '접수',
  processing: '처리중',
  resolved: '처리완료',
}
const STATUS_COLORS: Record<string, string> = {
  received: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
}
const CHANNEL_LABELS: Record<string, string> = { phone: '전화', app: '앱', visit: '방문' }

interface Complaint {
  id: number
  order_id?: number
  customer_name: string
  customer_phone: string
  channel: string
  content: string
  status: string
  handler_id?: number
  result?: string
  result_channel?: string
  created_at: string
  resolved_at?: string
}

interface Customer {
  id: number
  name: string
  phone: string
  dong: string
}

// ── 민원 접수 모달 ──────────────────────────────────────────────
function NewComplaintModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', channel: 'phone', content: '', order_id: '',
  })
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-list'],
    queryFn: () => api.get('/users', { params: { role: 'customer' } }).then((r) => r.data),
    staleTime: 60_000,
  })

  const filtered = search.length >= 2
    ? customers.filter((c) =>
        c.name.includes(search) || c.phone.replace(/-/g, '').includes(search.replace(/-/g, ''))
      ).slice(0, 8)
    : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectCustomer = (c: Customer) => {
    setForm((f) => ({ ...f, customer_name: c.name, customer_phone: c.phone }))
    setSearch(c.name)
    setShowDropdown(false)
  }

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post('/complaints/', {
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        channel: data.channel,
        content: data.content,
        order_id: data.order_id ? parseInt(data.order_id) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] })
      onClose()
    },
  })

  const valid = form.customer_name.trim() && form.customer_phone.trim() && form.content.trim()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">민원 접수</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* 고객 검색 */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">고객 검색</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9 w-full"
                placeholder="이름 또는 전화번호 (2자 이상)"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
              />
            </div>
            {showDropdown && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 mt-1 overflow-hidden">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={() => selectCustomer(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-brand-50 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{c.dong}</span>
                    </div>
                    <span className="text-sm text-gray-500">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 직접 입력 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">성명 <span className="text-red-500">*</span></label>
              <input
                className="input w-full"
                value={form.customer_name}
                onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 <span className="text-red-500">*</span></label>
              <input
                className="input w-full"
                value={form.customer_phone}
                onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
                placeholder="010-0000-0000"
              />
            </div>
          </div>

          {/* 채널 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">접수 채널</label>
            <div className="flex gap-2">
              {(['phone', 'app', 'visit'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setForm((f) => ({ ...f, channel: ch }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.channel === ch ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
                >
                  {ch === 'phone' && <Phone className="w-3.5 h-3.5 inline mr-1" />}
                  {ch === 'app' && <Smartphone className="w-3.5 h-3.5 inline mr-1" />}
                  {ch === 'visit' && <UserRound className="w-3.5 h-3.5 inline mr-1" />}
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>

          {/* 주문번호 (선택) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">관련 주문 ID <span className="text-gray-400 font-normal">(선택)</span></label>
            <input
              className="input w-full"
              type="number"
              value={form.order_id}
              onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
              placeholder="주문 ID (없으면 공란)"
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">민원 내용 <span className="text-red-500">*</span></label>
            <textarea
              className="input w-full resize-none"
              rows={4}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="민원 내용을 입력하세요"
            />
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => createMutation.mutate(form)}
            disabled={!valid || createMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {createMutation.isPending ? '접수 중...' : '민원 접수'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 처리 완료 모달 ──────────────────────────────────────────────
function ResolveModal({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const qc = useQueryClient()
  const [result, setResult] = useState('')
  const [resultChannel, setResultChannel] = useState('phone')

  const resolveMutation = useMutation({
    mutationFn: () =>
      api.put(`/complaints/${complaint.id}`, {
        status: 'resolved',
        result: result.trim(),
        result_channel: resultChannel,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">처리 완료 등록</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
            <span className="font-medium">{complaint.customer_name}</span> · {complaint.customer_phone}
            <p className="mt-1 text-gray-500 line-clamp-2">{complaint.content}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">처리 결과 <span className="text-red-500">*</span></label>
            <textarea
              className="input w-full resize-none"
              rows={4}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="처리 결과를 상세히 입력하세요"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">결과 전달 방법</label>
            <div className="flex gap-2">
              {(['phone', 'app'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setResultChannel(ch)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${resultChannel === ch ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => resolveMutation.mutate()}
            disabled={!result.trim() || resolveMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {resolveMutation.isPending ? '등록 중...' : '처리 완료 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export function Complaints() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [resolving, setResolving] = useState<Complaint | null>(null)

  const { data: complaints = [], isLoading } = useQuery<Complaint[]>({
    queryKey: ['complaints', filter],
    queryFn: () => api.get('/complaints', { params: { status: filter || undefined } }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const processingMutation = useMutation({
    mutationFn: (id: number) => api.put(`/complaints/${id}`, { status: 'processing' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaints'] }),
  })

  const downloadPdf = (id: number) => {
    const token = localStorage.getItem('access_token')
    fetch(`/api/v1/documents/complaint/${id}.pdf`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `complaint_${id}.pdf`
        a.click()
      })
  }

  const displayed = search
    ? complaints.filter((c) => c.customer_name.includes(search) || c.customer_phone.includes(search))
    : complaints

  const counts = {
    '': complaints.length,
    received: complaints.filter((c) => c.status === 'received').length,
    processing: complaints.filter((c) => c.status === 'processing').length,
    resolved: complaints.filter((c) => c.status === 'resolved').length,
  }

  return (
    <div className="p-6 space-y-4">
      {showNew && <NewComplaintModal onClose={() => setShowNew(false)} />}
      {resolving && <ResolveModal complaint={resolving} onClose={() => setResolving(null)} />}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareWarning className="w-6 h-6 text-brand-500" />
            민원 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">접수·처리·결과 관리</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          민원 접수
        </button>
      </div>

      {/* 필터 + 검색 */}
      <div className="card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2">
          {(['', 'received', 'processing', 'resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s === '' ? '전체' : STATUS_LABELS[s]}
              <span className={`ml-1.5 text-xs ${filter === s ? 'text-brand-100' : 'text-gray-400'}`}>
                {counts[s as keyof typeof counts] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 w-48"
            placeholder="이름·전화번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 목록 */}
      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      <div className="space-y-3">
        {displayed.map((c) => (
          <div key={c.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-gray-900">{c.customer_name}</span>
                  <span className="text-gray-400 text-sm">{c.customer_phone}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                  <span className="text-xs text-gray-400">#{c.id}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                {c.result && (
                  <div className="mt-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-600 font-medium mb-0.5">처리 결과</p>
                    <p className="text-sm text-green-800">{c.result}</p>
                    {c.result_channel && (
                      <p className="text-xs text-green-500 mt-0.5">전달 방법: {CHANNEL_LABELS[c.result_channel] ?? c.result_channel}</p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-gray-400">접수 {formatDate(c.created_at)}</span>
                  {c.resolved_at && (
                    <span className="text-xs text-gray-400">완료 {formatDate(c.resolved_at)}</span>
                  )}
                </div>
              </div>
              <span className={`badge shrink-0 ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
            </div>

            {c.status !== 'resolved' && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {c.status === 'received' && (
                  <button
                    onClick={() => processingMutation.mutate(c.id)}
                    disabled={processingMutation.isPending}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    처리중으로 변경
                  </button>
                )}
                <button
                  onClick={() => setResolving(c)}
                  className="btn-primary text-xs py-1 px-3"
                >
                  처리 완료 등록
                </button>
                <button
                  onClick={() => downloadPdf(c.id)}
                  className="btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />확인증 PDF
                </button>
              </div>
            )}

            {c.status === 'resolved' && (
              <div className="mt-3">
                <button
                  onClick={() => downloadPdf(c.id)}
                  className="btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />확인증 PDF
                </button>
              </div>
            )}
          </div>
        ))}

        {!isLoading && displayed.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            <MessageSquareWarning className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>민원이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
