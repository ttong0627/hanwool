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

export const DONG_LIST = ['경안동', '송정동', '쌍령동', '탄벌동']
