import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, CheckCircle } from 'lucide-react'
import api from '@/lib/api'
import { DONG_LIST } from '@/lib/utils'

interface FormData {
  customer_name: string
  customer_phone: string
  delivery_address: string
  dong: string
  items_desc: string
  quantity: number
  request: string
  notes: string
  weight_estimate: string
}

export function OrderForm() {
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({
    defaultValues: { quantity: 1, dong: '경안동' }
  })
  const qc = useQueryClient()
  const [success, setSuccess] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/orders', data),
    onSuccess: (res) => {
      setSuccess(res.data.order_no)
      reset({ quantity: 1, dong: '경안동' })
      qc.invalidateQueries({ queryKey: ['orders-today'] })
      setTimeout(() => setSuccess(null), 4000)
    },
  })

  const searchCustomer = async () => {
    const phone = watch('customer_phone')
    if (!phone) return
    setSearching(true)
    try {
      const res = await api.get('/users/search/phone', { params: { phone } })
      if (res.data) {
        setValue('customer_name', res.data.name)
        setValue('dong', res.data.dong || '경안동')
        setValue('delivery_address', res.data.address || '')
      }
    } catch { /* noop */ }
    setSearching(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">신규 주문 접수</h1>

      {success && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl p-4">
          <CheckCircle className="w-5 h-5" />
          <span className="font-semibold">접수 완료! 접수번호: <span className="text-brand-700">{success}</span></span>
        </div>
      )}

      <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">전화번호 *</label>
            <div className="flex gap-1.5">
              <input {...register('customer_phone', { required: true })} type="tel" placeholder="01012345678" className="input" />
              <button type="button" onClick={searchCustomer} disabled={searching} className="btn-secondary text-xs px-2 shrink-0 flex items-center gap-1">
                <Search className="w-3 h-3" />조회
              </button>
            </div>
          </div>
          <div>
            <label className="label">성명 *</label>
            <input {...register('customer_name', { required: true })} placeholder="홍길동" className="input" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">배송 동 *</label>
            <select {...register('dong', { required: true })} className="input">
              {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">배송 주소 *</label>
            <input {...register('delivery_address', { required: true })} placeholder="상세 주소 입력" className="input" />
          </div>
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

        <button type="submit" disabled={createMutation.isPending} className="btn-primary w-full py-3 text-base">
          {createMutation.isPending ? '접수 중...' : '주문 접수'}
        </button>
      </form>
    </div>
  )
}
