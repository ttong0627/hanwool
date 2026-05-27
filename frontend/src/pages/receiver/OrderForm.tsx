import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, ChevronDown, X, AlertTriangle, Lock, Store } from 'lucide-react'
import api from '@/lib/api'
import { DONG_LIST, formatPhone, detectDong } from '@/lib/utils'
import { KakaoAddressSearch, type AddressResult } from '@/components/KakaoAddressSearch'

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
  birth_year?: number
  age?: number
  is_elderly?: boolean
}

interface MarketStatus {
  is_market_day: boolean
  reception_open: boolean
  message: string
  next_market_date: string | null
  days_until_next: number
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

  const { data: marketStatus } = useQuery<MarketStatus>({
    queryKey: ['market-status'],
    queryFn: () => api.get('/admin/market-status').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const isLocked = marketStatus ? (!marketStatus.is_market_day || !marketStatus.reception_open) : false

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

  const handleAddressSelect = (result: AddressResult) => {
    const addr = result.road_address || result.address_name
    setAddressValue(addr)
    setValue('delivery_address', addr)
    if (result.dong_name) {
      const matched = DONG_LIST.find(d =>
        result.dong_name === d || result.dong_name?.includes(d) || d.includes(result.dong_name ?? '')
      )
      if (matched) setValue('dong', matched)
    }
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

  const elderlyWarning = selectedCustomer && selectedCustomer.age !== undefined && !selectedCustomer.is_elderly

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">신규 주문 접수</h1>

      {/* 장날/접수시간 상태 배너 */}
      {marketStatus && (
        <div className={`mb-4 flex items-center gap-3 border rounded-xl px-4 py-3 ${
          marketStatus.reception_open
            ? 'bg-green-50 border-green-300 text-green-800'
            : marketStatus.is_market_day
            ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
            : 'bg-red-50 border-red-300 text-red-800'
        }`}>
          {isLocked ? <Lock className="w-4 h-4 shrink-0" /> : <Store className="w-4 h-4 shrink-0" />}
          <span className="text-sm font-semibold">{marketStatus.message}</span>
          {marketStatus.reception_open && (
            <span className="ml-auto text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">접수 가능</span>
          )}
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl p-4">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">
            접수 완료! 접수번호: <span className="text-brand-700">{success}</span>
          </span>
        </div>
      )}

      <form
        onSubmit={handleSubmit((d) => createMutation.mutate(d))}
        className={`card space-y-4 ${isLocked ? 'opacity-60 pointer-events-none select-none' : ''}`}
      >
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
                    {c.is_elderly && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">65세↑</span>
                    )}
                    {c.age !== undefined && !c.is_elderly && (
                      <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                        {c.age}세
                      </span>
                    )}
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
              {selectedCustomer.is_elderly && (
                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">65세 이상 ✓</span>
              )}
            </div>
          )}
        </div>

        {/* 65세 미만 경고 */}
        {elderlyWarning && (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            <div className="text-sm text-orange-700">
              <span className="font-semibold">수혜 자격 확인 필요</span> —{' '}
              {selectedCustomer?.name}님 ({selectedCustomer?.age}세)은 65세 미만입니다.
              담당자 승인 후 접수하세요.
            </div>
          </div>
        )}

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
                onSelect={handleAddressSelect}
                placeholder="도로명·지번·건물명 입력 후 선택"
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
          disabled={createMutation.isPending || isLocked}
          className="btn-primary w-full py-3 text-base disabled:opacity-40"
        >
          {isLocked ? '접수 불가 (장날 11:00~15:00만 접수)' : createMutation.isPending ? '접수 중...' : '주문 접수'}
        </button>

        {createMutation.isError && (
          <p className="text-sm text-red-600 text-center">
            {(createMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '접수 중 오류가 발생했습니다.'}
          </p>
        )}
      </form>
    </div>
  )
}
