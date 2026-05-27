export const DONG_LIST = ['경안동', '송정동', '쌍령동', '탄벌동'] as const
export type Dong = typeof DONG_LIST[number]

export const COL_KEYS = [
  'customer_name',
  'customer_phone',
  'dong',
  'delivery_address',
  'items_desc',
  'item_code',
  'quantity',
  'request',
] as const

export type ColKey = typeof COL_KEYS[number]

export const COL_LABELS: Record<ColKey, string> = {
  customer_name: '성명 *',
  customer_phone: '전화번호 *',
  dong: '배송동 *',
  delivery_address: '주소 *',
  items_desc: '물품내역',
  item_code: '코드',
  quantity: '수량',
  request: '요청사항',
}

export const COL_WIDTHS: Record<ColKey, string | undefined> = {
  customer_name: '76px',
  customer_phone: '112px',
  dong: '84px',
  delivery_address: undefined,  // auto — 남은 공간 전부
  items_desc: '88px',
  item_code: '50px',
  quantity: '46px',
  request: '86px',
}

export type AddrStatus = 'idle' | 'validating' | 'valid' | 'invalid'
export type DongStatus = 'valid' | 'out-of-zone'

export interface StagingRow {
  _id: string
  customer_name: string
  customer_phone: string
  dong: string
  delivery_address: string
  items_desc: string
  item_code: string
  quantity: number
  request: string
  lat?: number
  lng?: number
  addrStatus: AddrStatus
  addrRefined?: string
  standardRoadAddress?: string
  legalEmd?: string
  serviceDong?: string
  matchStatus?: 'matched' | 'needs_review' | 'not_found'
  matchScore?: number
  coordSource?: string
  dongStatus?: DongStatus
  dongOverride?: boolean
  savedOrderId?: number
  submitStatus?: 'pending' | 'success' | 'error'
  submitError?: string
}

export const EMPTY_ROW = (): StagingRow => ({
  _id: crypto.randomUUID(),
  customer_name: '',
  customer_phone: '',
  dong: '경안동',
  delivery_address: '',
  items_desc: '',
  item_code: '',
  quantity: 1,
  request: '',
  addrStatus: 'idle',
})

export const EXCEL_FIELD_OPTIONS: { value: ColKey | ''; label: string }[] = [
  { value: '', label: '— 사용안함 —' },
  { value: 'customer_name', label: '성명' },
  { value: 'customer_phone', label: '전화번호' },
  { value: 'dong', label: '배송동' },
  { value: 'delivery_address', label: '주소' },
  { value: 'items_desc', label: '물품내역' },
  { value: 'item_code', label: '코드' },
  { value: 'quantity', label: '수량' },
  { value: 'request', label: '요청사항' },
]
