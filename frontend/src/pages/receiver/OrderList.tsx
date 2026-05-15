import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { OrderCard } from '@/components/OrderCard'
import { useCallback } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'

export function ReceiverOrderList() {
  const qc = useQueryClient()
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders-today'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
  })

  const handleWsMessage = useCallback(() => qc.invalidateQueries({ queryKey: ['orders-today'] }), [qc])
  useWebSocket('orders', handleWsMessage)

  const assignMutation = useMutation({
    mutationFn: ({ orderId, driverId }: { orderId: number; driverId: number }) =>
      api.put(`/orders/${orderId}/assign`, null, { params: { driver_id: driverId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders-today'] }),
  })

  const pending = (orders || []).filter((o: { status: string }) => o.status === 'pending')
  const active = (orders || []).filter((o: { status: string }) => ['assigned', 'picked_up', 'in_transit'].includes(o.status))
  const done = (orders || []).filter((o: { status: string }) => o.status === 'delivered')

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">오늘 배송 명단 ({(orders || []).length}건)</h1>
        <div className="flex gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['orders-today'] })} className="btn-secondary flex items-center gap-1.5 text-sm">
            <RefreshCw className="w-4 h-4" />새로고침
          </button>
          <button onClick={() => window.open('/api/v1/documents/delivery-list.pdf')} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download className="w-4 h-4" />명단 PDF
          </button>
          <button onClick={() => window.open('/api/v1/documents/labels.pdf')} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download className="w-4 h-4" />QR 라벨
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />접수대기 ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((order: { id: number; order_no: string; customer_name: string; customer_phone: string; status: string; dong: string; delivery_address: string; items_desc?: string; quantity: number; sequence?: number; created_at: string; driver_id?: number }) => (
              <OrderCard
                key={order.id}
                order={order}
                actions={
                  <button
                    onClick={() => {
                      const id = prompt('배정할 기사 ID:')
                      if (id) assignMutation.mutate({ orderId: order.id, driverId: parseInt(id) })
                    }}
                    className="btn-primary text-xs py-1 w-full"
                  >
                    기사 배정
                  </button>
                }
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-500" />배송 진행중 ({active.length})
          </h2>
          <div className="space-y-2">
            {active.map((order: { id: number; order_no: string; customer_name: string; customer_phone: string; status: string; dong: string; delivery_address: string; items_desc?: string; quantity: number; sequence?: number; created_at: string; driver_id?: number }) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />배달 완료 ({done.length})
          </h2>
          <div className="space-y-2">
            {done.map((order: { id: number; order_no: string; customer_name: string; customer_phone: string; status: string; dong: string; delivery_address: string; items_desc?: string; quantity: number; sequence?: number; created_at: string; driver_id?: number }) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
