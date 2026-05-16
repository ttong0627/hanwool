import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer, QrCode, FileText, CheckSquare, Square, Download } from 'lucide-react'
import api from '@/lib/api'
import { StatusBadge } from '@/components/StatusBadge'
import { DONG_LIST } from '@/lib/utils'

interface Order {
  id: number; order_no: string; customer_name: string
  dong: string; delivery_address: string; items_desc?: string
  quantity: number; status: string; sequence?: number
}

export function LabelPrint() {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dongFilter, setDongFilter] = useState('')

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['orders-today-label'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const filtered = dongFilter ? orders.filter((o) => o.dong === dongFilter) : orders
  const printable = filtered.filter((o) => !['cancelled', 'delivered'].includes(o.status))

  const toggleOne = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleAll = () =>
    setSelected(selected.size === printable.length ? new Set() : new Set(printable.map((o) => o.id)))

  const allSelected = printable.length > 0 && selected.size === printable.length
  const targetIds = selected.size > 0 ? [...selected] : printable.map((o) => o.id)

  const downloadPdf = async (url: string, defaultName: string) => {
    const token = localStorage.getItem('access_token')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)

    // Electron 데스크탑: 저장 경로 선택 다이얼로그
    if (window.electron?.isDesktop) {
      const filePath = await window.electron.savePdfDialog(defaultName)
      if (filePath) {
        const arrayBuffer = await blob.arrayBuffer()
        // ArrayBuffer → base64 경유로 저장 (IPC 대신 a태그 다운로드 fallback)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = defaultName
        a.click()
        await window.electron.openPath(filePath)
      }
      return
    }

    // 웹 브라우저: 자동 다운로드
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = defaultName
    a.click()
  }

  const openLabels = () => {
    const ids = targetIds.join(',')
    const url = `/api/v1/documents/labels.pdf${ids ? `?order_ids=${ids}` : ''}`
    downloadPdf(url, `labels_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const openDeliveryList = () => {
    downloadPdf('/api/v1/documents/delivery-list.pdf', `delivery_list_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div className="p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="w-6 h-6 text-brand-500" />
            라벨 · 명단 출력
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">오늘 배송 주문 기준</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openDeliveryList} className="btn-secondary flex items-center gap-1.5 text-sm">
            <FileText className="w-4 h-4" />배송 명단 PDF
          </button>
        </div>
      </div>

      {/* 필터 + 선택 툴바 */}
      <div className="card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <select value={dongFilter} onChange={(e) => { setDongFilter(e.target.value); setSelected(new Set()) }} className="input w-32">
            <option value="">전체 동</option>
            {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            {allSelected
              ? <CheckSquare className="w-4 h-4 text-brand-600" />
              : <Square className="w-4 h-4" />}
            전체 선택
          </button>
          {selected.size > 0 && (
            <span className="text-sm text-brand-600 font-medium">{selected.size}건 선택됨</span>
          )}
        </div>

        <button
          onClick={openLabels}
          disabled={printable.length === 0}
          className="btn-primary flex items-center gap-2 disabled:opacity-40"
        >
          <Printer className="w-4 h-4" />
          {selected.size > 0 ? `선택 ${selected.size}건 라벨 인쇄` : `전체 ${printable.length}건 라벨 인쇄`}
        </button>
      </div>

      {/* 주문 목록 */}
      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      {!isLoading && printable.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          <QrCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>인쇄할 주문이 없습니다</p>
        </div>
      )}

      <div className="space-y-2">
        {printable.map((order) => {
          const isChecked = selected.has(order.id)
          return (
            <div
              key={order.id}
              onClick={() => toggleOne(order.id)}
              className={`card flex items-center gap-4 cursor-pointer transition-all ${isChecked ? 'border-brand-400 bg-brand-50 shadow-sm' : 'hover:border-gray-300'}`}
            >
              {/* 체크박스 */}
              <div className="shrink-0">
                {isChecked
                  ? <CheckSquare className="w-5 h-5 text-brand-600" />
                  : <Square className="w-5 h-5 text-gray-300" />}
              </div>

              {/* 순번 */}
              {order.sequence && (
                <div className="w-8 h-8 rounded-full bg-brand-500 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {order.sequence}
                </div>
              )}

              {/* 내용 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-brand-700 text-sm">{order.order_no}</span>
                  <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-100">{order.dong}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="font-semibold text-gray-900">{order.customer_name}</p>
                <p className="text-sm text-gray-500 truncate">{order.delivery_address}</p>
                {order.items_desc && (
                  <p className="text-xs text-gray-400">{order.items_desc} · {order.quantity}개</p>
                )}
              </div>

              {/* 개별 라벨 다운로드 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  downloadPdf(`/api/v1/documents/labels.pdf?order_ids=${order.id}`, `label_${order.order_no}.pdf`)
                }}
                className="shrink-0 p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                title="이 주문만 라벨 인쇄"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>

      {/* 취소/완료 주문 (접혀 있음) */}
      {filtered.filter((o) => ['cancelled', 'delivered'].includes(o.status)).length > 0 && (
        <details className="mt-2">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            취소·완료 주문 ({filtered.filter((o) => ['cancelled', 'delivered'].includes(o.status)).length}건) — 라벨 출력 제외
          </summary>
          <div className="mt-2 space-y-2 opacity-50">
            {filtered
              .filter((o) => ['cancelled', 'delivered'].includes(o.status))
              .map((order) => (
                <div key={order.id} className="card flex items-center gap-3">
                  <span className="font-bold text-sm text-gray-500">{order.order_no}</span>
                  <span className="text-sm text-gray-500">{order.customer_name}</span>
                  <StatusBadge status={order.status} />
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  )
}
