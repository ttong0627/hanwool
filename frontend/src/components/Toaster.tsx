import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToastStore, type ToastItem } from '@/store/toastStore'

const CONFIG: Record<ToastItem['type'], {
  icon: React.ElementType
  bg: string
  border: string
  text: string
  iconColor: string
  bar: string
}> = {
  success: {
    icon: CheckCircle,
    bg: 'bg-white',
    border: 'border-green-200',
    text: 'text-gray-800',
    iconColor: 'text-green-500',
    bar: 'bg-green-400',
  },
  error: {
    icon: XCircle,
    bg: 'bg-white',
    border: 'border-red-200',
    text: 'text-gray-800',
    iconColor: 'text-red-500',
    bar: 'bg-red-400',
  },
  info: {
    icon: Info,
    bg: 'bg-white',
    border: 'border-blue-200',
    text: 'text-gray-800',
    iconColor: 'text-blue-500',
    bar: 'bg-blue-400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-white',
    border: 'border-amber-200',
    text: 'text-gray-800',
    iconColor: 'text-amber-500',
    bar: 'bg-amber-400',
  },
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const remove = useToastStore((s) => s.remove)
  const [exiting, setExiting] = useState(false)
  const cfg = CONFIG[toast.type]
  const Icon = cfg.icon

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => remove(toast.id), 250)
  }

  useEffect(() => {
    const t = setTimeout(() => setExiting(true), 3500)
    const t2 = setTimeout(() => remove(toast.id), 3750)
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [toast.id, remove])

  return (
    <div
      className={`
        relative flex items-start gap-3 px-4 py-3.5 rounded-xl shadow-lg border
        max-w-sm w-full overflow-hidden
        ${cfg.bg} ${cfg.border} ${cfg.text}
      `}
      style={{
        animation: exiting
          ? 'toastOut 250ms cubic-bezier(0.4,0,1,1) forwards'
          : 'toastIn 300ms cubic-bezier(0.16,1,0.3,1) forwards',
      }}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${cfg.iconColor}`} />
      <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={dismiss}
        className="shrink-0 p-0.5 rounded hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="알림 닫기"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {/* Progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-0.5 ${cfg.bar} opacity-60`}
        style={{ animation: 'progressBar 3.8s linear forwards' }}
      />
    </div>
  )
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 items-end pointer-events-none"
      aria-live="polite"
      aria-label="알림"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} />
        </div>
      ))}
    </div>
  )
}
