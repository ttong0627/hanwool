import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, Filter } from 'lucide-react'
import api from '@/lib/api'
import { OrderCard } from '@/components/OrderCard'
import { StatusBadge } from '@/components/StatusBadge'
import { DONG_LIST, STATUS_LABEL } from '@/lib/utils'

export function Orders() {
  const qc = useQueryClient()
  const [dong, setDong] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data } = useQuery({
    queryKey: ['orders', { dong, status, page }],
    queryFn: () => api.get('/orders', { params: { dong, status, page, page_size: 20 } }).then((r) => r.data),
  })

  const assignMutation = useMutation({
    mutationFn: ({ orderId, driverId }: { orderId: number; driverId: number }) =>
      api.put(`/orders/${orderId}/assign`, null, { params: { driver_id: driverId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => api.delete(`/orders/${orderId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const downloadList = () => window.open('/api/v1/documents/delivery-list.pdf')
  const downloadLabels = () => window.open('/api/v1/documents/labels.pdf')

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">주문 관리</h1>
        <div className="flex gap-2">
          <button onClick={downloadList} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download className="w-4 h-4" />배송 명단 PDF
          </button>
          <button onClick={downloadLabels} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download className="w-4 h-4" />QR 라벨 PDF
          </button>
        </div>
      </div>

      <div className="card flex gap-3 flex-wrap">
        <select value={dong} onChange={(e) => { setDong(e.target.value); setPage(1) }} className="input w-36">
          <option value="">전체 동</option>
          {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input w-36">
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {data?.items?.map((order: { id: number; order_no: string; customer_name: string; customer_phone: string; status: string; dong: string; delivery_address: string; items_desc?: string; quantity: number; sequence?: number; created_at: string; driver_id?: number; delivery_photo_url?: string | null }) => (
          <OrderCard
            key={order.id}
            order={order}
            actions={
              <div className="flex gap-2 w-full">
                {order.status === 'pending' && (
                  <button
                    onClick={() => {
                      const driverId = prompt('배정할 기사 ID:')
                      if (driverId) assignMutation.mutate({ orderId: order.id, driverId: parseInt(driverId) })
                    }}
                    className="btn-primary text-xs py-1 px-2"
                  >
                    기사 배정
                  </button>
                )}
                <button onClick={() => window.open(`/api/v1/documents/receipt/${order.id}.pdf`)} className="btn-secondary text-xs py-1 px-2">
                  수령증
                </button>
                {!['delivered', 'cancelled'].includes(order.status) && (
                  <button onClick={() => cancelMutation.mutate(order.id)} className="text-xs py-1 px-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-200">
                    취소
                  </button>
                )}
              </div>
            }
          />
        ))}
      </div>

      {data && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>총 {data.total}건</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs py-1 px-3 disabled:opacity-40">이전</button>
            <span className="px-2 py-1">{page}</span>
            <button disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs py-1 px-3 disabled:opacity-40">다음</button>
          </div>
        </div>
      )}
    </div>
  )
}
