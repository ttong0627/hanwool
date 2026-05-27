import { cn, toDisplayStatus, DISPLAY_STATUS_LABEL, DISPLAY_STATUS_COLOR } from '@/lib/utils'

export function StatusBadge({ status }: { status: string }) {
  const display = toDisplayStatus(status)
  return (
    <span className={cn('badge', DISPLAY_STATUS_COLOR[display] || 'bg-gray-100 text-gray-600')}>
      {DISPLAY_STATUS_LABEL[display] || status}
    </span>
  )
}
