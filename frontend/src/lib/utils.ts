import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string, fmt = 'MM/dd HH:mm') {
  if (!iso) return ''
  return format(parseISO(iso), fmt, { locale: ko })
}

export const STATUS_LABEL: Record<string, string> = {
  pending: '접수대기',
  assigned: '기사배정',
  picked_up: '픽업완료',
  in_transit: '배송중',
  delivered: '배달완료',
  cancelled: '취소',
  delayed: '지연',
}

export const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  picked_up: 'bg-yellow-100 text-yellow-700',
  in_transit: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  delayed: 'bg-purple-100 text-purple-700',
}

// 3단계 표시: pending·assigned·picked_up → 픽업대기 / in_transit → 배송중 / delivered → 배송완료
export function toDisplayStatus(status: string): string {
  if (['pending', 'assigned', 'picked_up'].includes(status)) return 'pickup_waiting'
  return status
}

export const DISPLAY_STATUS_LABEL: Record<string, string> = {
  pickup_waiting: '픽업대기',
  in_transit: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
  delayed: '지연',
}

export const DISPLAY_STATUS_COLOR: Record<string, string> = {
  pickup_waiting: 'bg-yellow-100 text-yellow-700',
  in_transit: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  delayed: 'bg-purple-100 text-purple-700',
}

// 필터 드롭다운용 3단계 옵션
export const STATUS_FILTER_OPTIONS = [
  { value: 'pending,assigned,picked_up', label: '픽업대기' },
  { value: 'in_transit', label: '배송중' },
  { value: 'delivered', label: '배송완료' },
]

export const DONG_LIST = ['경안동', '송정동', '쌍령동', '탄벌동']

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export function detectDong(address: string): string | null {
  for (const dong of DONG_LIST) {
    if (address.includes(dong)) return dong
  }
  return null
}

/**
 * 주소 앞의 시/도 prefix 제거 + 앞뒤 공백 제거
 * "경기도 광주시 경안천로 121" → "경안천로 121"
 * "광주시 경안천로 121"        → "경안천로 121"
 * "  경안천로 121  "           → "경안천로 121"
 */
export function normalizeAddress(addr: string): string {
  let s = addr.trim()
  s = s.replace(/^경기도\s*/, '')   // "경기도 " 또는 "경기도" 제거
  s = s.replace(/^광주시\s+/, '')   // "광주시 " 제거 (공백 필수: 도로명과 구분)
  return s.trim()
}
