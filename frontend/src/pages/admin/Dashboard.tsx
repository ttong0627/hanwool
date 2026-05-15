import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Package, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import api from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { OrderCard } from '@/components/OrderCard'

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  )
}

export function Dashboard() {
  const { data: stats, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: todayOrders } = useQuery({
    queryKey: ['orders-today'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const handleWsMessage = useCallback(() => refetch(), [refetch])
  useWebSocket('admin', handleWsMessage)

  const inProgress = (todayOrders || []).filter((o: { status: string }) =>
    ['assigned', 'picked_up', 'in_transit'].includes(o.status)
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">실시간 현황</h1>
        <p className="text-sm text-gray-500">{stats?.today} 기준</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="오늘 총 주문" value={stats?.total_orders_today ?? 0} icon={Package} color="bg-blue-500" />
        <StatCard label="배달 완료" value={stats?.delivered_today ?? 0} icon={CheckCircle} color="bg-green-500" />
        <StatCard label="배송 진행중" value={stats?.in_progress ?? 0} icon={Truck} color="bg-brand-500" />
        <StatCard label="접수 대기" value={stats?.pending ?? 0} icon={Clock} color="bg-yellow-500" />
      </div>

      {stats?.open_complaints > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="font-medium">미처리 민원 {stats.open_complaints}건이 있습니다.</span>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">진행중인 배송 ({inProgress.length}건)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {inProgress.map((order: { id: number; order_no: string; customer_name: string; customer_phone: string; status: string; dong: string; delivery_address: string; items_desc?: string; quantity: number; sequence?: number; created_at: string; driver_id?: number }) => (
            <OrderCard key={order.id} order={order} />
          ))}
          {inProgress.length === 0 && (
            <p className="text-gray-400 text-sm col-span-full">진행중인 배송이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
