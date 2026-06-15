import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, MapPin, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { KakaoAddressSearch, type AddressResult } from '@/components/KakaoAddressSearch'

// 백엔드 SERVICE_DONGS와 동일한 18개 배송 허용 동
const SERVICE_DONGS = [
  '경안동', '송정동', '쌍령동', '탄벌동', '고산동', '매산동', '목동', '목현동', '문형동',
  '삼동', '양벌동', '역동', '장지동', '중대동', '직동', '추자동', '태전동', '회덕동',
]

interface ReviewOrder {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  delivery_address: string
  raw_address: string | null
  standard_road_address: string | null
  jibun_address: string | null
  legal_emd: string | null
  dong: string | null
  detail_address: string | null
  match_status: string | null
  match_score: number | null
  lat: number | null
  lng: number | null
  created_at: string | null
}

const STATUS_LABEL: Record<string, string> = {
  not_found: '매칭 실패',
  needs_review: '확인 필요',
}

// 18개 서비스동이 아니어도 실제 감지된 동을 그대로 사용(저장 허용)
function pickDong(dongName?: string | null): string {
  return dongName || ''
}

function ReviewCard({ order, onConfirmed }: { order: ReviewOrder; onConfirmed: (id: number) => void }) {
  const [chosen, setChosen] = useState<AddressResult | null>(null)
  const [roadAddress, setRoadAddress] = useState(order.standard_road_address || '')
  const [serviceDong, setServiceDong] = useState(pickDong(order.legal_emd || order.dong))
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = (r: AddressResult) => {
    setChosen(r)
    setRoadAddress(r.road_address || r.address_name || '')
    const dong = pickDong(r.dong_name)
    if (dong) setServiceDong(dong)
    setError(null)
  }

  const handleConfirm = async () => {
    setError(null)
    if (!roadAddress.trim()) { setError('정확한 주소를 검색해서 선택하세요.'); return }
    if (!serviceDong) { setError('배송동을 선택하세요.'); return }
    // 좌표가 없으면 서버가 표준주소로 지오코딩하므로 막지 않는다
    const lat = chosen?.lat ?? order.lat ?? undefined
    const lng = chosen?.lng ?? order.lng ?? undefined

    setSaving(true)
    try {
      await api.post(`/orders/${order.id}/address-confirm`, {
        standard_road_address: roadAddress.trim(),
        service_dong: serviceDong,
        lat,
        lng,
        jibun_address: chosen?.jibun_address || order.jibun_address || null,
        legal_emd: chosen?.dong_name || order.legal_emd || null,
        memo: memo.trim() || null,
        save_override: true,
      })
      onConfirmed(order.id)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '확정에 실패했습니다. 다시 시도하세요.')
    } finally {
      setSaving(false)
    }
  }

  const inputAddress = order.raw_address || order.delivery_address || '(주소 없음)'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-mono text-gray-400">{order.order_no}</span>
        <span className="text-sm font-semibold text-gray-800">{order.customer_name}</span>
        <span className="text-xs text-gray-500">{order.customer_phone}</span>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          order.match_status === 'not_found' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
        }`}>
          <AlertCircle className="h-3 w-3" />
          {STATUS_LABEL[order.match_status || ''] || order.match_status}
        </span>
      </div>

      {/* 입력 주소 (담당자 판단 근거) */}
      <div className="rounded-lg bg-gray-50 px-3 py-2 mb-3">
        <div className="text-[11px] text-gray-400 mb-0.5">접수 입력 주소</div>
        <div className="text-sm text-gray-800 break-keep">{inputAddress}</div>
        {order.detail_address && (
          <div className="text-xs text-gray-500 mt-0.5">상세: {order.detail_address}</div>
        )}
        {order.standard_road_address && (
          <div className="text-[11px] text-gray-400 mt-1">
            현재 추정: {order.standard_road_address}
            {order.match_score != null && ` (신뢰도 ${Math.round(order.match_score * 100)}%)`}
          </div>
        )}
      </div>

      {/* 정확 주소 검색·확정 */}
      <div className="space-y-2">
        <KakaoAddressSearch
          value={roadAddress}
          onChange={setRoadAddress}
          onSelect={handleSelect}
          placeholder="정확한 도로명/지번 주소 검색"
        />
        <div className="flex items-center gap-2">
          <input
            list="service-dong-list"
            value={serviceDong}
            onChange={(e) => setServiceDong(e.target.value)}
            placeholder="배송동 (18개 외도 입력 가능)"
            className="w-40 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <datalist id="service-dong-list">
            {SERVICE_DONGS.map((d) => <option key={d} value={d} />)}
          </datalist>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모(선택) — 예: 경비실 수령"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        {chosen?.lat != null && (
          <div className="flex items-center gap-1 text-[11px] text-emerald-600">
            <MapPin className="h-3 w-3" /> 좌표 확보됨 ({chosen.lat.toFixed(5)}, {chosen.lng?.toFixed(5)})
          </div>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          주소 확정
        </button>
      </div>
    </div>
  )
}

export function AddressReview() {
  const [orders, setOrders] = useState<ReviewOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/orders/address-review')
      setOrders(data.items || [])
    } catch (e: any) {
      setError(e?.response?.data?.detail || '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleConfirmed = (id: number) => {
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">주소 확인 대기</h1>
          <p className="text-sm text-gray-500">
            로컬 DB·Kakao로 정확히 매칭하지 못한 주문입니다. 정확한 주소를 검색해 확정하세요.
          </p>
        </div>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" /> 새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
          <p className="mt-2 text-sm font-medium text-gray-600">확인 대기 중인 주소가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-gray-600">총 {orders.length}건 대기</div>
          {orders.map((o) => (
            <ReviewCard key={o.id} order={o} onConfirmed={handleConfirmed} />
          ))}
        </div>
      )}
    </div>
  )
}
