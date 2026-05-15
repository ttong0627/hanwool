import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Search } from 'lucide-react'
import api from '@/lib/api'
import { DONG_LIST } from '@/lib/utils'

interface Customer {
  id: number; name: string; phone: string; dong?: string; address?: string; is_active: boolean
}

export function Customers() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', dong: '', address: '' })

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/users', { params: { role: 'customer' } }).then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/users', { ...data, role: 'customer' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setShowForm(false); setForm({ name: '', phone: '', dong: '', address: '' }) },
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">고객 관리</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />신규 고객 등록
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <h2 className="font-semibold">신규 고객 등록</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">성명</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="홍길동" /></div>
            <div><label className="label">전화번호</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="01012345678" /></div>
            <div>
              <label className="label">거주 동</label>
              <select value={form.dong} onChange={(e) => setForm({ ...form, dong: e.target.value })} className="input">
                <option value="">선택</option>
                {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div><label className="label">주소</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" placeholder="상세 주소" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate(form)} disabled={!form.name || !form.phone} className="btn-primary">등록</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">취소</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-gray-500">
            <th className="pb-2 pr-4">성명</th><th className="pb-2 pr-4">연락처</th>
            <th className="pb-2 pr-4">동</th><th className="pb-2">주소</th>
          </tr></thead>
          <tbody>
            {(customers || []).map((c: Customer) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 pr-4 font-medium">{c.name}</td>
                <td className="py-2 pr-4 text-gray-600">{c.phone}</td>
                <td className="py-2 pr-4"><span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{c.dong || '-'}</span></td>
                <td className="py-2 text-gray-600 text-xs">{c.address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers?.length === 0 && <p className="text-center text-gray-400 py-6">등록된 고객이 없습니다.</p>}
      </div>
    </div>
  )
}
