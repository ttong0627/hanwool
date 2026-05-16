import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, ChevronDown, X } from 'lucide-react'
import api from '@/lib/api'
import { DONG_LIST, formatPhone, detectDong } from '@/lib/utils'
import { KakaoAddressSearch } from '@/components/KakaoAddressSearch'

interface FormData {
  customer_name: string
  customer_phone: string
  customer_id?: number
  delivery_address: string
  dong: string
  items_desc: string
  quantity: number
  request: string
  notes: string
  weight_estimate: string
}

interface Customer {
  id: number
  name: string
  phone: string
  dong: string
  address: string
}

export function OrderForm() {
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({
    defaultValues: { quantity: 1, dong: '경안동' }
  })
  const qc = useQueryClient()
  const [success, setSuccess] = useState<string | null>(null)
  const [phoneQuery, setPhoneQuery] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [addressValue, setAddressValue] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/users', { params: { role: 'customer' } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const query = phoneQuery || nameQuery
  const filtered = query.length >= 2
    ? customers.filter(c =>
        c.phone.replace(/-/g, '').includes(query.replace(/-/g, '')) ||
        c.name.includes(query)
      ).slice(0, 8)
    : []

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setPhoneQuery(c.phone)
    setNameQuery(c.name)
    setValue('customer_phone', c.phone)
    setValue('customer_name', c.name)
    setValue('customer_id', c.id)
    setValue('dong', c.dong || '경안동')
    const addr = c.address || ''
    setAddressValue(addr)
    setValue('delivery_address', addr)
    setShowDropdown(false)
  }

  const clearCustomer = () => {
    setSelectedCustomer(null)
    setPhoneQuery('')
    setNameQuery('')
    setAddressValue('')
    setValue('customer_phone', '')
    setValue('customer_name', '')
    setValue('customer_id', undefined)
    setValue('delivery_address', '')
  }

  const handleAddressChange = (addr: string) => {
    setAddressValue(addr)
    setValue('delivery_address', addr)
    const dong = detectDong(addr)
    if (dong) setValue('dong', dong)
  }

  const handlePhoneInput = (raw: string) => {
    const formatted = formatPhone(raw)
    setPhoneQuery(formatted)
    setNameQuery('')
    setValue('customer_phone', formatted)
    setShowDropdown(true)
    if (selectedCustomer) setSelectedCustomer(null)
  }

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/orders', data),
    onSuccess: (res) => {
      setSuccess(res.data.order_no)
      reset({ quantity: 1, dong: '경안동' })
      clearCustomer()
      qc.invalidateQueries({ queryKey: ['orders-today'] })
      setTimeout(() => setSuccess(null), 4000)
    },
  })

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">신규 주문 접수</h1>

      {success && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl p-4">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">
            접수 완료! 접수번호: <span className="text-brand-700">{success}</span>
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="card space-y-4">

        {/* 고객 검색 */}
        <div ref={dropdownRef} className="relative">
          <label className="label">고객 검색 (전화번호 또는 이름)</label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input
                type="tel"
                placeholder="전화번호 입력 (숫자만 가능)"
                value={phoneQuery}
                onChange={(e) => handlePhoneInput(e.target.value)}
                onFocus={() => query.length >= 2 && setShowDropdown(true)}
                className="input pr-8"
              />
              {phoneQuery && (
                <button
                  type="button"
                  onClick={clearCustomer}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="이름으로 검색..."
                value={nameQuery}
                onChange={(e) => {
                  setNameQuery(e.target.value)
                  setPhoneQuery('')
                  setValue('customer_name', e.target.value)
                  setShowDropdown(true)
                  if (selectedCustomer) setSelectedCustomer(null)
                }}
                onFocus={() => query.length >= 2 && setShowDropdown(true)}
                className="input"
              />
            </div>
          </div>

          {showDropdown && filtered.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className="w-full px-4 py-3 text-left hover:bg-brand-50 flex items-center justify-between border-b border-gray-100 last:border-0 transition-colors"
                >
                  <div>
                    <span className="font-semibold text-gray-900">{c.name}</span>
                    <span className="ml-2 text-sm text-gray-500">{c.phone}</span>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">{c.dong}</span>
                    <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedCustomer && (
            <div className="mt-2 flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-sm">
              <CheckCircle className="w-4 h-4 text-brand-600 shrink-0" />
              <span className="text-brand-800 font-medium">{selectedCustomer.name}</span>
              <span className="text-brand-600">{selectedCustomer.phone}</span>
              <span className="text-brand-500 text-xs">· {selectedCustomer.dong}</span>
            </div>
          )}
        </div>

        <input type="hidden" {...register('customer_phone')} />
        <input type="hidden" {...register('customer_name')} />
        <input type="hidden" {...register('customer_id')} />
        <input type="hidden" {...register('delivery_address')} />

        {/* 신규 고객 */}
        {!selectedCustomer && (nameQuery.length > 0 || phoneQuery.length > 0) && filtered.length === 0 && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="col-span-2 text-xs text-amber-700 font-medium">신규 고객 — 아래 정보를 직접 입력하세요</p>
            <div>
              <label className="label">전화번호 *</label>
              <input
                value={phoneQuery}
                onChange={(e) => {
                  const f = formatPhone(e.target.value)
                  setPhoneQuery(f)
                  setValue('customer_phone', f)
                }}
                type="tel"
                className="input"
              />
            </div>
            <div>
              <label className="label">성명 *</label>
              <input
                value={nameQuery}
                onChange={(e) => { setNameQuery(e.target.value); setValue('customer_name', e.target.value) }}
                type="text"
                className="input"
              />
            </div>
          </div>
        )}

        {/* 배송 동 + 주소 검색 */}
        <div>
          <div className="grid grid-cols-3 gap-3 mb-2">
            <div>
              <label className="label">배송 동 *</label>
              <select {...register('dong', { required: true })} className="input">
                {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">배송 주소 *</label>
              <KakaoAddressSearch
                value={addressValue}
                onChange={handleAddressChange}
                placeholder="주소 검색 버튼으로 입력"
              />
            </div>
          </div>
          {addressValue && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 truncate">
              📍 {addressValue}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">물품 내역</label>
            <input {...register('items_desc')} placeholder="쌀 10kg, 된장 1개..." className="input" />
          </div>
          <div>
            <label className="label">수량</label>
            <input {...register('quantity', { valueAsNumber: true, min: 1 })} type="number" min={1} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">무게 추정</label>
            <select {...register('weight_estimate')} className="input">
              <option value="">선택</option>
              <option value="가벼움 (5kg 미만)">가벼움 (5kg 미만)</option>
              <option value="보통 (5~15kg)">보통 (5~15kg)</option>
              <option value="무거움 (15kg 이상)">무거움 (15kg 이상)</option>
            </select>
          </div>
          <div>
            <label className="label">요청사항</label>
            <input {...register('request')} placeholder="문 앞 두기, 경비실 맡기기..." className="input" />
          </div>
        </div>

        <div>
          <label className="label">비고</label>
          <input {...register('notes')} placeholder="추가 메모" className="input" />
        </div>

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="btn-primary w-full py-3 text-base"
        >
          {createMutation.isPending ? '접수 중...' : '주문 접수'}
        </button>
      </form>
    </div>
  )
}
