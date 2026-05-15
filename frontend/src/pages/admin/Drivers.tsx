import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Truck, UserPlus } from 'lucide-react'
import { useState } from 'react'
import api from '@/lib/api'

interface Driver { id: number; name: string; phone: string; is_active: boolean }

export function Drivers() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', password: '' })

  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const { data: driverStats } = useQuery({
    queryKey: ['driver-stats'],
    queryFn: () => api.get('/admin/stats/drivers').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/users', { ...data, role: 'driver' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drivers'] }); setShowForm(false) },
  })

  const statsMap = (driverStats || []).reduce((acc: Record<number, { total: number; delivered: number }>, s: { driver_id: number; total: number; delivered: number }) => {
    acc[s.driver_id] = s; return acc
  }, {})

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6 text-brand-500" />기사 관리</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />기사 등록
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <h2 className="font-semibold">새 기사 등록</h2>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">이름</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></div>
            <div><label className="label">전화번호</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></div>
            <div><label className="label">비밀번호</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate(form)} disabled={!form.name || !form.phone} className="btn-primary">등록</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">취소</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(drivers || []).map((driver: Driver) => {
          const stats = statsMap[driver.id] || { total: 0, delivered: 0 }
          return (
            <div key={driver.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center">
                    <Truck className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <div className="font-semibold">{driver.name}</div>
                    <div className="text-xs text-gray-500">{driver.phone}</div>
                  </div>
                </div>
                <span className={`badge ${driver.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {driver.is_active ? '활성' : '비활성'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-brand-600">{stats.total}</div>
                  <div className="text-xs text-gray-500">오늘 배정</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-green-600">{stats.delivered}</div>
                  <div className="text-xs text-gray-500">완료</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
