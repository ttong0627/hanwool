import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, X, AlertTriangle, Lock, Store,
  User, Phone, MapPin, ShoppingBag, MessageSquare, ClipboardList,
} from 'lucide-react'
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

// ── IME 배지 ─────────────────────────────────────────────────────────────────
type ImeType = 'ko' | 'tel' | 'num'

const IME_CONFIG: Record<ImeType, { badge: string; color: string }> = {
  ko:  { badge: '🇰🇷 한글', color: 'bg-blue-500' },
  tel: { badge: '📞 전화',  color: 'bg-slate-500' },
  num: { badge: '🔢 숫자',  color: 'bg-amber-500' },
}

function ImeBadge({ active, type }: { active: boolean; type: ImeType }) {
  const { badge, color } = IME_CONFIG[type]
  return (
    <span
      className={`text-[9px] font-black text-white px-2 py-px rounded-full select-none pointer-events-none transition-all duration-200 whitespace-nowrap ${color} ${
        active ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
      }`}
    >
      {badge}
    </span>
  )
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 rounded-t-2xl">
        <span className="text-brand-500">{icon}</span>
        <span className="text-sm font-bold text-gray-700">{title}</span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  )
}

function FieldLabel({
  children,
  required,
  imeType,
  focused,
}: {
  children: React.ReactNode
  required?: boolean
  imeType?: ImeType
  focused?: boolean
}) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-sm font-semibold text-gray-700">
        {children}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {imeType && <ImeBadge active={!!focused} type={imeType} />}
    </div>
  )
}

export function OrderForm() {
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({
    defaultValues: { quantity: 1, dong: '경안동' },
  })
  const qc = useQueryClient()
  const [success, setSuccess] = useState<string | null>(null)
  const [phoneQuery, setPhoneQuery] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [addressValue, setAddressValue] = useState('')
  const [focused, setFocused] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fo = (f: string) => setFocused(f)
  const fb = () => setFocused(null)

  const { data: marketStatus } = useQuery<MarketStatus>({
    queryKey: ['market-status'],
    queryFn: () => api.get('/admin/market-status').then((r) => r.data),
    refetchInterval: 60_000,
  })
  const isLocked = marketStatus
    ? !marketStatus.is_market_day || !marketStatus.reception_open
    : false

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/users', { params: { role: 'customer' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const query = phoneQuery || nameQuery
  const filtered =
    query.length >= 2
      ? customers
          .filter(
            (c) =>
              c.phone.replace(/-/g, '').includes(query.replace(/-/g, '')) ||
              c.name.includes(query),
          )
          .slice(0, 8)
      : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
      const matched = DONG_LIST.find(
        (d) =>
          result.dong_name === d ||
          result.dong_name?.includes(d) ||
          d.includes(result.dong_name ?? ''),
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
      setTimeout(() => setSuccess(null), 5000)
    },
  })

  const elderlyWarning =
    selectedCustomer && selectedCustomer.age !== undefined && !selectedCustomer.is_elderly
  const currentWeight = watch('weight_estimate')

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-4">
      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shadow-md shadow-brand-200 shrink-0">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">신규 주문 접수</h1>
          <p className="text-xs text-gray-400 mt-0.5">경안시장 집배송 서비스</p>
        </div>
      </div>

      {/* ── 장날 상태 배너 ────────────────────────────────────────────────── */}
      {marketStatus && (
        <div
          className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border-2 transition-colors ${
            marketStatus.reception_open
              ? 'bg-green-50 border-green-200 text-green-800'
              : marketStatus.is_market_day
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {isLocked ? (
            <Lock className="w-5 h-5 shrink-0" />
          ) : (
            <Store className="w-5 h-5 shrink-0" />
          )}
          <span className="text-sm font-semibold leading-snug" style={{ wordBreak: 'keep-all' }}>
            {marketStatus.message}
          </span>
          {marketStatus.reception_open && (
            <span className="ml-auto shrink-0 text-xs bg-green-500 text-white px-3 py-1 rounded-full font-bold">
              접수 가능
            </span>
          )}
        </div>
      )}

      {/* ── 접수 완료 메시지 ──────────────────────────────────────────────── */}
      {success && (
        <div className="flex items-center gap-3 bg-green-50 border-2 border-green-200 text-green-700 rounded-2xl px-4 py-4">
          <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-base">접수 완료!</p>
            <p className="text-sm">
              접수번호:{' '}
              <span className="font-bold text-brand-700 text-base">{success}</span>
            </p>
          </div>
        </div>
      )}

      {/* ── 폼 ───────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit((d) => createMutation.mutate(d))}
        className={`space-y-4 transition-opacity duration-300 ${
          isLocked ? 'opacity-40 pointer-events-none select-none' : ''
        }`}
      >
        {/* hidden */}
        <input type="hidden" {...register('customer_phone')} />
        <input type="hidden" {...register('customer_name')} />
        <input type="hidden" {...register('customer_id')} />
        <input type="hidden" {...register('delivery_address')} />

        {/* ══ 섹션 1: 고객 정보 ═══════════════════════════════════════════ */}
        <SectionCard icon={<User className="w-4 h-4" />} title="고객 정보">
          {/* 고객 검색 */}
          <div ref={dropdownRef} className="relative">
            <p className="text-xs text-gray-500 font-medium mb-2">전화번호 또는 이름으로 기존 고객 검색</p>
            <div className="flex gap-2">
              {/* 전화번호 */}
              <div className="flex-1">
                <FieldLabel imeType="tel" focused={focused === 'phone'}>
                  전화번호
                </FieldLabel>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="tel"
                    lang="en"
                    placeholder="010-0000-0000"
                    value={phoneQuery}
                    onChange={(e) => handlePhoneInput(e.target.value)}
                    onFocus={() => {
                      fo('phone')
                      if (query.length >= 2) setShowDropdown(true)
                    }}
                    onBlur={fb}
                    className="input pl-9 pr-8 text-base w-full transition-shadow duration-200 focus:shadow-md focus:shadow-brand-100"
                  />
                  {phoneQuery && (
                    <button
                      type="button"
                      onClick={clearCustomer}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {/* 이름 */}
              <div className="flex-1">
                <FieldLabel imeType="ko" focused={focused === 'name'}>
                  이름
                </FieldLabel>
                <input
                  type="text"
                  lang="ko"
                  placeholder="홍길동"
                  value={nameQuery}
                  onChange={(e) => {
                    setNameQuery(e.target.value)
                    setPhoneQuery('')
                    setValue('customer_name', e.target.value)
                    setShowDropdown(true)
                    if (selectedCustomer) setSelectedCustomer(null)
                  }}
                  onFocus={() => {
                    fo('name')
                    if (query.length >= 2) setShowDropdown(true)
                  }}
                  onBlur={fb}
                  className="input text-base w-full transition-shadow duration-200 focus:shadow-md focus:shadow-brand-100"
                />
              </div>
            </div>

            {/* 검색 드롭다운 */}
            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full px-4 py-3.5 text-left hover:bg-brand-50 flex items-center justify-between border-b border-gray-100 last:border-0 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0 group-hover:bg-brand-200 transition-colors">
                        <User className="w-4 h-4 text-brand-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-gray-900">{c.name}</span>
                          {c.is_elderly && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                              65세↑
                            </span>
                          )}
                          {c.age !== undefined && !c.is_elderly && (
                            <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                              {c.age}세
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{c.phone}</p>
                      </div>
                    </div>
                    <span className="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-full font-semibold shrink-0 ml-2">
                      {c.dong}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 선택된 고객 배지 */}
          {selectedCustomer && (
            <div className="flex items-center gap-3 bg-brand-50 border-2 border-brand-200 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-brand-900 text-base">{selectedCustomer.name}</p>
                <p className="text-xs text-brand-600">
                  {selectedCustomer.phone} · {selectedCustomer.dong}
                </p>
              </div>
              {selectedCustomer.is_elderly && (
                <span className="text-xs bg-blue-500 text-white px-2.5 py-1 rounded-full font-bold shrink-0">
                  ✓ 65세↑
                </span>
              )}
              <button
                type="button"
                onClick={clearCustomer}
                className="text-brand-300 hover:text-brand-600 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 65세 미만 경고 */}
          {elderlyWarning && (
            <div className="flex items-start gap-3 bg-orange-50 border-2 border-orange-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div className="text-sm text-orange-800" style={{ wordBreak: 'keep-all' }}>
                <p className="font-bold">수혜 자격 확인 필요</p>
                <p>
                  {selectedCustomer?.name}님 ({selectedCustomer?.age}세)은 65세 미만입니다.
                  담당자 승인 후 접수하세요.
                </p>
              </div>
            </div>
          )}

          {/* 신규 고객 입력 */}
          {!selectedCustomer &&
            (nameQuery.length > 0 || phoneQuery.length > 0) &&
            filtered.length === 0 && (
              <div className="grid grid-cols-2 gap-3 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
                <p className="col-span-2 text-xs font-bold text-amber-700">
                  신규 고객 — 정보를 직접 입력하세요
                </p>
                <div>
                  <FieldLabel imeType="tel" focused={focused === 'new_phone'}>
                    전화번호 *
                  </FieldLabel>
                  <input
                    type="tel"
                    inputMode="tel"
                    lang="en"
                    value={phoneQuery}
                    onChange={(e) => {
                      const f = formatPhone(e.target.value)
                      setPhoneQuery(f)
                      setValue('customer_phone', f)
                    }}
                    onFocus={() => fo('new_phone')}
                    onBlur={fb}
                    className="input text-base w-full transition-shadow focus:shadow-md focus:shadow-brand-100"
                  />
                </div>
                <div>
                  <FieldLabel imeType="ko" focused={focused === 'new_name'}>
                    성명 *
                  </FieldLabel>
                  <input
                    type="text"
                    lang="ko"
                    value={nameQuery}
                    onChange={(e) => {
                      setNameQuery(e.target.value)
                      setValue('customer_name', e.target.value)
                    }}
                    onFocus={() => fo('new_name')}
                    onBlur={fb}
                    className="input text-base w-full transition-shadow focus:shadow-md focus:shadow-brand-100"
                  />
                </div>
              </div>
            )}
        </SectionCard>

        {/* ══ 섹션 2: 배송 정보 ═══════════════════════════════════════════ */}
        <SectionCard icon={<MapPin className="w-4 h-4" />} title="배송 정보">
          <div className="grid grid-cols-3 gap-3">
            {/* 배송 동 */}
            <div>
              <FieldLabel required>배송 동</FieldLabel>
              <select
                {...register('dong', { required: true })}
                className="input text-base font-semibold cursor-pointer hover:border-brand-400 transition-colors"
              >
                {DONG_LIST.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            {/* 배송 주소 */}
            <div className="col-span-2">
              <FieldLabel imeType="ko" focused={focused === 'address'} required>
                배송 주소
              </FieldLabel>
              <div
                onFocus={() => fo('address')}
                onBlur={fb}
              >
                <KakaoAddressSearch
                  value={addressValue}
                  onChange={handleAddressChange}
                  onSelect={handleAddressSelect}
                  placeholder="도로명·지번·건물명 입력 후 선택"
                />
              </div>
            </div>
          </div>
          {addressValue && (
            <div className="flex items-center gap-2 bg-brand-50 rounded-xl px-3 py-2.5 border border-brand-100">
              <MapPin className="w-3.5 h-3.5 text-brand-500 shrink-0" />
              <p className="text-xs text-brand-700 font-medium truncate">{addressValue}</p>
            </div>
          )}
        </SectionCard>

        {/* ══ 섹션 3: 물품 정보 ═══════════════════════════════════════════ */}
        <SectionCard icon={<ShoppingBag className="w-4 h-4" />} title="물품 정보">
          {/* 물품 내역 + 수량 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <FieldLabel imeType="ko" focused={focused === 'items'}>
                물품 내역
              </FieldLabel>
              <input
                {...register('items_desc')}
                type="text"
                lang="ko"
                placeholder="쌀 10kg, 된장 1개..."
                onFocus={() => fo('items')}
                onBlur={fb}
                className="input text-base w-full transition-shadow duration-200 focus:shadow-md focus:shadow-brand-100"
              />
            </div>
            <div>
              <FieldLabel imeType="num" focused={focused === 'qty'}>
                수량
              </FieldLabel>
              <input
                {...register('quantity', { valueAsNumber: true, min: 1 })}
                type="number"
                inputMode="numeric"
                lang="en"
                min={1}
                onFocus={() => fo('qty')}
                onBlur={fb}
                className="input text-base text-center font-bold w-full transition-shadow duration-200 focus:shadow-md focus:shadow-brand-100"
              />
            </div>
          </div>

          {/* 무게 추정 — 라디오 카드 */}
          <div>
            <FieldLabel>무게 추정</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: '가벼움 (5kg 미만)', label: '가벼움', sub: '5kg 미만', emoji: '🪶' },
                { value: '보통 (5~15kg)',     label: '보통',   sub: '5~15kg',   emoji: '📦' },
                { value: '무거움 (15kg 이상)', label: '무거움', sub: '15kg 이상', emoji: '🏋️' },
              ].map(({ value, label, sub, emoji }) => (
                <label
                  key={value}
                  className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 cursor-pointer transition-all duration-200 select-none ${
                    currentWeight === value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm shadow-brand-100'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50/40'
                  }`}
                >
                  <input
                    type="radio"
                    {...register('weight_estimate')}
                    value={value}
                    className="sr-only"
                  />
                  <span className="text-xl leading-none">{emoji}</span>
                  <span className="font-bold text-sm">{label}</span>
                  <span className="text-[10px] opacity-70">{sub}</span>
                </label>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ══ 섹션 4: 추가 정보 ═══════════════════════════════════════════ */}
        <SectionCard icon={<MessageSquare className="w-4 h-4" />} title="추가 정보">
          <div>
            <FieldLabel imeType="ko" focused={focused === 'request'}>
              요청사항
            </FieldLabel>
            <input
              {...register('request')}
              type="text"
              lang="ko"
              placeholder="문 앞 두기, 경비실 맡기기, 부재 시 연락..."
              onFocus={() => fo('request')}
              onBlur={fb}
              className="input text-base w-full transition-shadow duration-200 focus:shadow-md focus:shadow-brand-100"
            />
          </div>
          <div>
            <FieldLabel imeType="ko" focused={focused === 'notes'}>
              비고
            </FieldLabel>
            <input
              {...register('notes')}
              type="text"
              lang="ko"
              placeholder="추가 메모사항"
              onFocus={() => fo('notes')}
              onBlur={fb}
              className="input text-base w-full transition-shadow duration-200 focus:shadow-md focus:shadow-brand-100"
            />
          </div>
        </SectionCard>

        {/* ── 접수 버튼 ─────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={createMutation.isPending || isLocked}
          className="
            w-full py-4 text-base font-bold rounded-2xl
            bg-brand-500 text-white
            shadow-lg shadow-brand-200
            hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-300 hover:-translate-y-0.5
            active:scale-[0.98] active:shadow-md
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0
            transition-all duration-200
          "
        >
          {isLocked
            ? '🔒 접수 불가 (장날 11:00~15:00만 가능)'
            : createMutation.isPending
            ? '접수 중...'
            : '주문 접수하기'}
        </button>

        {createMutation.isError && (
          <div className="flex items-center gap-2 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">
              {(
                createMutation.error as {
                  response?: { data?: { detail?: string } }
                }
              )?.response?.data?.detail || '접수 중 오류가 발생했습니다.'}
            </p>
          </div>
        )}
      </form>
    </div>
  )
}
