import { MapPin, Phone, Package, Clock, Camera } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { formatDate } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

interface Order {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  status: string
  dong: string
  delivery_address: string
  items_desc?: string
  quantity: number
  sequence?: number
  created_at: string
  driver_id?: number
  delivery_photo_url?: string | null
}

interface Props {
  order: Order
  onClick?: () => void
  actions?: React.ReactNode
}

export function OrderCard({ order, onClick, actions }: Props) {
  return (
    <div
      className="card hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {order.sequence && (
            <span className="w-6 h-6 bg-brand-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
              {order.sequence}
            </span>
          )}
          <span className="font-bold text-brand-700">{order.order_no}</span>
          <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{order.dong}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="space-y-1 text-sm text-gray-600">
        <div className="flex items-center gap-1.5 font-semibold text-gray-900">
          <span className="text-base">{order.customer_name}</span>
          <span className="text-gray-400">·</span>
          <Phone className="w-3 h-3" />
          <span>{order.customer_phone}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 mt-0.5 text-brand-500 shrink-0" />
          <span>{order.delivery_address}</span>
        </div>
        {order.items_desc && (
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-gray-400" />
            <span>{order.items_desc} ({order.quantity}개)</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          <span>{formatDate(order.created_at)}</span>
        </div>
      </div>

      {order.delivery_photo_url && (
        <div className="mt-3">
          <a
            href={`${API_BASE}${order.delivery_photo_url}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800"
          >
            <Camera className="w-3.5 h-3.5" />
            <img
              src={`${API_BASE}${order.delivery_photo_url}`}
              alt="배송 완료 사진"
              className="h-16 w-24 object-cover rounded-lg border border-gray-200 ml-1"
            />
          </a>
        </div>
      )}

      {actions && <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>{actions}</div>}
    </div>
  )
}
