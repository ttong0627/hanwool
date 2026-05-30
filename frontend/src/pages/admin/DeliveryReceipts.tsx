import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ImageIcon, Printer, Search } from 'lucide-react'
import api from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface ReceiptOrder {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  dong: string
  delivery_address: string
  items_desc?: string
  quantity: number
  request?: string
  delivered_at?: string | null
  delivery_photo_url?: string | null
  delivery_signature_url?: string | null
  driver_name?: string | null
  driver_phone?: string | null
}

function todayLocalStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function mediaUrl(path?: string | null) {
  if (!path) return ''
  return path.startsWith('http') ? path : path
}

function Thumb({ src, label }: { src?: string | null; label: string }) {
  if (!src) return <span className="text-xs text-gray-300">-</span>
  const url = mediaUrl(src)
  return (
    <button
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-700"
    >
      <img src={url} alt={label} className="h-9 w-12 rounded object-cover" />
      <ImageIcon className="h-3.5 w-3.5" />
    </button>
  )
}

export function DeliveryReceipts() {
  const today = todayLocalStr()
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: rows = [], isLoading } = useQuery<ReceiptOrder[]>({
    queryKey: ['delivery-receipts', dateFrom, dateTo],
    queryFn: () =>
      api.get('/documents/delivery-receipts', {
        params: { date_from: dateFrom || undefined, date_to: dateTo || undefined },
      }).then((r) => r.data),
  })

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter((row) =>
      [row.order_no, row.customer_name, row.customer_phone, row.dong, row.delivery_address, row.items_desc, row.driver_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    )
  }, [rows, search])

  async function fetchReceiptsPdf(): Promise<Blob> {
    const r = await api.get('/documents/delivery-receipts.pdf', {
      params: { date_from: dateFrom || undefined, date_to: dateTo || undefined },
      responseType: 'blob',
    })
    return r.data as Blob
  }
  async function handlePrint() {
    if (busy) return
    try {
      setBusy(true)
      const url = URL.createObjectURL(await fetchReceiptsPdf())
      const w = window.open(url, '_blank')
      if (!w) { URL.revokeObjectURL(url); alert('팝업이 차단되었습니다. 팝업을 허용해 주세요.') }
    } catch { alert('수령확인증 생성에 실패했습니다.') } finally { setBusy(false) }
  }
  async function handleDownloadPdf() {
    if (busy) return
    try {
      setBusy(true)
      const url = URL.createObjectURL(await fetchReceiptsPdf())
      const a = document.createElement('a')
      a.href = url
      a.download = `배송수령확인증_${dateFrom}_${dateTo}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch { alert('PDF 저장에 실패했습니다.') } finally { setBusy(false) }
  }

  return (
    <div className="p-6 space-y-4 page-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">배송 수령증</h1>
          <p className="text-sm text-gray-500 mt-0.5">일자별 배송 완료 내역과 사진, 서명을 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={handlePrint} className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-50">
            <Printer className="h-4 w-4" />인쇄
          </button>
          <button type="button" disabled={busy} onClick={handleDownloadPdf} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
            <Download className="h-4 w-4" />{busy ? '생성 중…' : 'PDF 저장'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-36" />
          <span className="text-gray-400">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-36" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="주문번호, 이름, 연락처, 주소 검색"
              className="input w-72 pl-8"
            />
          </div>
          <div className="ml-auto text-sm text-gray-500">총 {filtered.length.toLocaleString()}건</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-[120px_90px_120px_80px_1.4fr_120px_55px_120px_120px_90px_90px] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
          <div>주문번호</div>
          <div>이름</div>
          <div>연락처</div>
          <div>배송동</div>
          <div>주소</div>
          <div>물품</div>
          <div>수량</div>
          <div>요청사항</div>
          <div>배송시간</div>
          <div>사진</div>
          <div>서명</div>
        </div>
        {isLoading && <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>}
        {!isLoading && filtered.length === 0 && <div className="py-16 text-center text-sm text-gray-400">배송 완료 내역이 없습니다.</div>}
        {!isLoading && filtered.map((row) => (
          <div key={row.id} className="grid grid-cols-[120px_90px_120px_80px_1.4fr_120px_55px_120px_120px_90px_90px] gap-2 border-t border-gray-100 px-3 py-2 text-xs items-center">
            <div className="font-semibold text-brand-700">{row.order_no}</div>
            <div className="font-medium text-gray-900">{row.customer_name}</div>
            <div className="tabular-nums text-gray-600">{row.customer_phone}</div>
            <div>{row.dong}</div>
            <div className="truncate text-gray-700" title={row.delivery_address}>{row.delivery_address}</div>
            <div className="truncate" title={row.items_desc}>{row.items_desc || '-'}</div>
            <div>{row.quantity}</div>
            <div className="truncate" title={row.request}>{row.request || '-'}</div>
            <div>{row.delivered_at ? formatDate(row.delivered_at, 'MM/dd HH:mm') : '-'}</div>
            <div><Thumb src={row.delivery_photo_url} label="배송 사진" /></div>
            <div><Thumb src={row.delivery_signature_url} label="서명" /></div>
          </div>
        ))}
      </div>
    </div>
  )
}
