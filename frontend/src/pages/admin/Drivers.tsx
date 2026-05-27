import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  Clock,
  Edit2,
  Loader2,
  Trash2,
  Truck,
  UserPlus,
  X,
  ToggleLeft,
  ToggleRight,
  Phone,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { getDriverTone } from '@/lib/driverColors'

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

interface DriverForm {
  name: string
  phone: string
  password: string
}

function DriverModal({ driver, onClose }: { driver?: Driver; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<DriverForm>({
    name: driver?.name ?? '',
    phone: driver?.phone ?? '',
    password: '',
  })

  const mutation = useMutation({
    mutationFn: () => {
      if (driver) {
        const payload: Partial<DriverForm> = { name: form.name.trim(), phone: form.phone.trim() }
        if (form.password.trim()) payload.password = form.password.trim()
        return api.put(`/users/${driver.id}`, payload)
      }
      return api.post('/users', { ...form, role: 'driver' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] })
      qc.invalidateQueries({ queryKey: ['driver-stats'] })
      onClose()
    },
  })

  const valid =
    form.name.trim().length > 0 &&
    form.phone.trim().length >= 10 &&
    (driver || form.password.trim().length >= 8) &&
    (!form.password.trim() || form.password.trim().length >= 8)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ animation: 'slideUpModal 250ms cubic-bezier(0.16,1,0.3,1)' }}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <Truck className="w-4 h-4 text-brand-500" />
            </div>
            <h2 className="font-bold text-lg text-gray-900">{driver ? '기사 정보 수정' : '기사 등록'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="label">이름</span>
            <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="홍길동" />
          </label>
          <label className="block">
            <span className="label">전화번호</span>
            <input className="input" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="010-0000-0000" />
          </label>
          <label className="block">
            <span className="label">{driver ? '새 비밀번호' : '비밀번호'}</span>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder={driver ? '변경할 때만 입력' : '8자 이상'} />
          </label>
          {mutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(mutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '저장 중 문제가 발생했습니다.'}
            </p>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} className="flex-1 btn-primary disabled:opacity-40 flex items-center justify-center gap-2">
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {driver ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => api.put(`/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] })
      qc.invalidateQueries({ queryKey: ['driver-stats'] })
    },
  })

  const statsMap = driverStats.reduce<Record<number, DriverStat>>((acc, stat) => {
    acc[stat.driver_id] = stat
    return acc
  }, {})

  const activeCount = drivers.filter((d) => d.is_active).length

  const confirmDelete = (driver: Driver) => {
    if (window.confirm(`${driver.name} 기사를 삭제할까요?`)) deleteMutation.mutate(driver.id)
  }

  return (
    <div className="p-6 space-y-5 page-fade-in">
      {showCreate && <DriverModal onClose={() => setShowCreate(false)} />}
      {editing && <DriverModal driver={editing} onClose={() => setEditing(null)} />}

      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 text-gray-900">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
              <Truck className="w-4.5 h-4.5 text-white" />
            </div>
            기사 관리
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-0.5">
            전체 <span className="font-bold text-gray-700">{drivers.length}명</span> · 활성{' '}
            <span className="font-bold text-green-600">{activeCount}명</span>
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />
          기사 등록
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map((i) => (
            <div key={i} className="card-elevated rounded-xl overflow-hidden">
              <div className="skeleton h-1.5 w-full" />
              <div className="p-4 space-y-3">
                <div className="skeleton h-10 w-10 rounded-2xl" />
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {drivers.map((driver) => {
          const stats = statsMap[driver.id] || { total: 0, delivered: 0 }
          const progressPct = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0
          const tone = getDriverTone(driver.id)
          const color = tone.primary
          const isActive = driver.is_active

          return (
            <div
              key={driver.id}
              className="card-elevated rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
              style={isActive ? { borderColor: tone.border, boxShadow: `0 16px 38px ${tone.shadow}` } : {}}
            >
              {/* 컬러 그래디언트 상단 바 */}
              <div
                style={{ background: isActive ? tone.gradient : '#e5e7eb' }}
                className="h-[6px] w-full"
              />

              <div className="p-4" style={isActive ? { background: tone.wash } : {}}>
                {/* 헤더: 아바타 + 이름 + 액션 */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {/* 프리미엄 아바타 */}
                    <div
                      style={{
                        background: isActive ? tone.gradient : '#f3f4f6',
                        border: `2px solid ${isActive ? 'rgba(255,255,255,0.9)' : '#e5e7eb'}`,
                        boxShadow: isActive ? `0 8px 20px ${tone.shadow}` : 'none',
                      }}
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all"
                    >
                      <Truck style={{ color: isActive ? '#fff' : '#9ca3af' }} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-[15px] leading-tight">{driver.name}</span>
                        <span
                          style={isActive ? { background: tone.soft, color: tone.text, borderColor: tone.border } : {}}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isActive ? '' : 'bg-gray-100 text-gray-400 border-gray-200'
                          }`}
                        >
                          {isActive ? '활성' : '비활성'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                        <Phone className="w-3 h-3" />
                        {driver.phone}
                      </div>
                    </div>
                  </div>

                  {/* 액션 버튼들 */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => setEditing(driver)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                      title="수정"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: driver.id, is_active: !driver.is_active })}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isActive ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'
                      }`}
                      title={isActive ? '비활성화' : '활성화'}
                    >
                      {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => confirmDelete(driver)}
                      className="p-1.5 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 통계 */}
                <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                  <div
                    style={{ background: isActive ? tone.soft : '#f9fafb', borderColor: isActive ? tone.border : '#f9fafb' }}
                    className="rounded-xl p-3 border"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Clock className="w-3.5 h-3.5" style={{ color: isActive ? tone.text : '#9ca3af' }} />
                      <span className="text-[11px] text-gray-500 font-medium">오늘 배정</span>
                    </div>
                    <div className="text-[22px] font-black tabular-nums leading-none" style={{ color: isActive ? tone.text : '#9ca3af' }}>
                      {stats.total}
                    </div>
                  </div>
                  <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-50">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[11px] text-gray-500 font-medium">완료</span>
                    </div>
                    <div className="text-[22px] font-black tabular-nums leading-none text-emerald-600">
                      {stats.delivered}
                    </div>
                  </div>
                </div>

                {/* 진행바 */}
                {stats.total > 0 ? (
                  <div className="mb-3">
                    <div className="flex justify-between items-center text-[11px] mb-1.5">
                      <span className="text-gray-500">배송 진행률</span>
                      <span className="font-bold tabular-nums" style={{ color: tone.text }}>{progressPct}%</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${progressPct}%`,
                          background: tone.gradient,
                          boxShadow: progressPct > 0 ? `0 0 12px ${tone.shadow}` : 'none',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 h-2.5 bg-gray-100 rounded-full" />
                )}

                {/* 푸터 */}
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-50">
                  <span>등록 {formatDate(driver.created_at)}</span>
                  <div
                    style={{ background: tone.soft, color: tone.text, borderColor: tone.border }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold"
                  >
                    <span
                      style={{ background: isActive ? color : '#9ca3af' }}
                      className="w-1.5 h-1.5 rounded-full"
                    />
                    기사 #{driver.id}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {!isLoading && drivers.length === 0 && (
          <div className="col-span-full text-center py-20 text-gray-400">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Truck className="w-8 h-8 opacity-30" />
            </div>
            <p className="font-medium">등록된 기사가 없습니다.</p>
            <p className="text-sm mt-1">기사 등록 버튼으로 추가해 주세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}
