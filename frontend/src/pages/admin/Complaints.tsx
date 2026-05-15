import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, MessageSquareWarning } from 'lucide-react'
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

export function Complaints() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')

  const { data: complaints } = useQuery({
    queryKey: ['complaints', filter],
    queryFn: () => api.get('/complaints', { params: { status: filter || undefined } }).then((r) => r.data),
  })

  const resolveMutation = useMutation({
    mutationFn: ({ id, result }: { id: number; result: string }) =>
      api.put(`/complaints/${id}`, { status: 'resolved', result }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complaints'] }),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareWarning className="w-6 h-6 text-brand-500" />민원 관리
        </h1>
      </div>

      <div className="card flex gap-2">
        {['', 'received', 'processing', 'resolved'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {s === '' ? '전체' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {complaints?.map((c: { id: number; customer_name: string; customer_phone: string; channel: string; content: string; status: string; result?: string; created_at: string; resolved_at?: string }) => (
          <div key={c.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">{c.customer_name}</span>
                  <span className="text-gray-400 text-sm">{c.customer_phone}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{c.channel === 'phone' ? '전화' : '앱'}</span>
                </div>
                <p className="text-sm text-gray-700">{c.content}</p>
                {c.result && <p className="text-sm text-green-700 mt-1">처리결과: {c.result}</p>}
                <p className="text-xs text-gray-400 mt-1">{formatDate(c.created_at)}</p>
              </div>
              <span className={`badge ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
            </div>
            {c.status !== 'resolved' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const result = prompt('처리 결과를 입력하세요:')
                    if (result) resolveMutation.mutate({ id: c.id, result })
                  }}
                  className="btn-primary text-xs py-1 px-3"
                >
                  처리 완료
                </button>
                <button onClick={() => window.open(`/api/v1/documents/complaint/${c.id}.pdf`)} className="btn-secondary text-xs py-1 px-3">
                  <Download className="w-3 h-3 inline mr-1" />확인증
                </button>
              </div>
            )}
          </div>
        ))}
        {complaints?.length === 0 && (
          <p className="text-center text-gray-400 py-8">민원이 없습니다.</p>
        )}
      </div>
    </div>
  )
}
