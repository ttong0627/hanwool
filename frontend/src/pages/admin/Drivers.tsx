import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Truck, UserPlus, X, Edit2, ToggleLeft, ToggleRight, CheckCircle, Clock } from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface Driver {
  id: number
  name: string
  phone: string
  dong?: string
  is_active: boolean
  created_at: string
}

interface DriverStat {
  driver_id: number
  total: number
  delivered: number
}

// ── 기사 등록 모달 ──────────────────────────────────────────────
function CreateDriverModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', phone: '', password: '' })

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', { ...form, role: 'driver' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] })
      onClose()
    },
  })

  const valid = form.name.trim() && form.phone.trim() && form.password.trim()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">기사 등록</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
            <input className="input w-full" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="홍길동" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 <span className="text-red-500">*</span></label>
            <input className="input w-full" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span className="text-red-500">*</span></label>
            <input className="input w-full" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="앱 로그인 비밀번호" />
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

// ── 기사 편집 모달 ──────────────────────────────────────────────
function EditDriverModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(driver.name)

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/users/${driver.id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">기사 정보 수정</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input className="input w-full" value={driver.phone} disabled className="bg-gray-50 text-gray-400 cursor-not-allowed" />
            <p className="text-xs text-gray-400 mt-1">전화번호 변경은 관리자에게 문의하세요.</p>
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {updateMutation.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export function Drivers() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const { data: driverStats = [] } = useQuery<DriverStat[]>({
    queryKey: ['driver-stats'],
    queryFn: () => api.get('/admin/stats/drivers').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  })

  const statsMap = driverStats.reduce<Record<number, DriverStat>>((acc, s) => {
    acc[s.driver_id] = s; return acc
  }, {})

  const activeCount = drivers.filter((d) => d.is_active).length

  return (
    <div className="p-6 space-y-4">
      {showCreate && <CreateDriverModal onClose={() => setShowCreate(false)} />}
      {editing && <EditDriverModal driver={editing} onClose={() => setEditing(null)} />}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-500" />
            기사 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            전체 {drivers.length}명 · 활성 {activeCount}명
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />기사 등록
        </button>
      </div>

      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      {/* 기사 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {drivers.map((driver) => {
          const stats = statsMap[driver.id] || { total: 0, delivered: 0 }
          const progressPct = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0

          return (
            <div
              key={driver.id}
              className={`card border-l-4 ${driver.is_active ? 'border-brand-400' : 'border-gray-200'}`}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${driver.is_active ? 'bg-brand-100' : 'bg-gray-100'}`}>
                    <Truck className={`w-5 h-5 ${driver.is_active ? 'text-brand-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{driver.name}</div>
                    <div className="text-xs text-gray-500">{driver.phone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(driver)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                    title="수정"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: driver.id, is_active: !driver.is_active })}
                    className={`p-1.5 rounded-lg transition-colors ${driver.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                    title={driver.is_active ? '비활성화' : '활성화'}
                  >
                    {driver.is_active
                      ? <ToggleRight className="w-5 h-5" />
                      : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 오늘 통계 */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Clock className="w-3.5 h-3.5 text-brand-400" />
                    <span className="text-xs text-gray-500">오늘 배정</span>
                  </div>
                  <div className="text-xl font-bold text-brand-600">{stats.total}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-gray-500">완료</span>
                  </div>
                  <div className="text-xl font-bold text-green-600">{stats.delivered}</div>
                </div>
              </div>

              {/* 진행률 바 */}
              {stats.total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>진행률</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-2 text-xs text-gray-400">등록일 {formatDate(driver.created_at)}</div>
            </div>
          )
        })}

        {!isLoading && drivers.length === 0 && (
          <div className="col-span-full text-center text-gray-400 py-16">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>등록된 기사가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
