import { cn, STATUS_COLOR, STATUS_LABEL } from '@/lib/utils'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('badge', STATUS_COLOR[status] || 'bg-gray-100 text-gray-600')}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}
