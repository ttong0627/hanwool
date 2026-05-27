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
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface Driver {
  id: number
  name: string
  phone: string
  dong?: string
  role: string
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

function DriverModal({
  driver,
  onClose,
}: {
  driver?: Driver
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<DriverForm>({
    name: driver?.name ?? '',
    phone: driver?.phone ?? '',
    password: '',
  })

  const mutation = useMutation({
    mutationFn: () => {
      if (driver) {
        const payload: Partial<DriverForm> = {
          name: form.name.trim(),
          phone: form.phone.trim(),
        }
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-bold text-lg">{driver ? '기사 정보 수정' : '기사 등록'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">이름</span>
            <input
              className="input w-full"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="홍길동"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">전화번호</span>
            <input
              className="input w-full"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="010-0000-0000"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">
              {driver ? '새 비밀번호' : '비밀번호'}
            </span>
            <input
              className="input w-full"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder={driver ? '변경할 때만 입력' : '8자 이상'}
            />
          </label>

          {mutation.isError && (
            <p className="text-sm text-red-600">
              {(mutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                '저장 중 문제가 발생했습니다.'}
            </p>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40 flex items-center justify-center gap-2"
          >
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
    queryFn: () => api.get('/users', { params: { role: 'driver,admin,super_admin' } }).then((r) => r.data),
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

  const activeCount = drivers.filter((driver) => driver.is_active).length
  const isAdminRole = (role: string) => role === 'admin' || role === 'super_admin'

  const confirmDelete = (driver: Driver) => {
    if (window.confirm(`${driver.name} 기사를 삭제할까요? 삭제된 기사는 배정 목록에 표시되지 않습니다.`)) {
      deleteMutation.mutate(driver.id)
    }
  }

  return (
    <div className="p-6 space-y-4 page-fade-in">
      {showCreate && <DriverModal onClose={() => setShowCreate(false)} />}
      {editing && <DriverModal driver={editing} onClose={() => setEditing(null)} />}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-500" />
            기사 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            전체 {drivers.length}명 · 활성 {activeCount}명
          </p>
          <p className="text-xs text-purple-600 mt-0.5">관리자는 별도 등록 없이 기사 겸직 가능</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />
          기사 등록
        </button>
      </div>

      {isLoading && <div className="text-center text-gray-400 py-12">기사 목록을 불러오는 중입니다.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {drivers.map((driver) => {
          const stats = statsMap[driver.id] || { total: 0, delivered: 0 }
          const progressPct = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0

          return (
            <div
              key={driver.id}
              className={`card border-l-4 ${driver.is_active ? 'border-brand-400' : 'border-gray-200'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${driver.is_active ? 'bg-brand-100' : 'bg-gray-100'}`}>
                    <Truck className={`w-5 h-5 ${driver.is_active ? 'text-brand-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="font-semibold text-gray-900 truncate">{driver.name}</div>
                      {isAdminRole(driver.role) && (
                        <span className="text-[9px] font-bold px-1 py-px rounded bg-purple-100 text-purple-700 shrink-0">
                          {driver.role === 'super_admin' ? '최고관리자' : '관리자'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{driver.phone}</div>
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
                    {driver.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  {!isAdminRole(driver.role) && (
                    <button
                      onClick={() => confirmDelete(driver)}
                      className="p-1.5 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-600"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Clock className="w-3.5 h-3.5 text-brand-400" />
                    <span className="text-xs text-gray-500">오늘 배정</span>
                  </div>
                  <div className="text-xl font-bold text-brand-600">{stats.total}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-gray-500">완료</span>
                  </div>
                  <div className="text-xl font-bold text-green-600">{stats.delivered}</div>
                </div>
              </div>

              {stats.total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>진행률</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <span>등록일 {formatDate(driver.created_at)}</span>
                <span className={driver.is_active ? 'text-green-600' : 'text-gray-400'}>
                  {driver.is_active ? '활성' : '비활성'}
                </span>
              </div>
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
