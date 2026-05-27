import { useRef, useCallback, useState, useEffect } from 'react'
import {
  Plus, Trash2, CheckCircle, AlertCircle, Loader2, Search, ClipboardPaste
} from 'lucide-react'
import api from '@/lib/api'
import { KakaoAddressSearch } from '@/components/KakaoAddressSearch'
import type { StagingRow, ColKey, AddrStatus } from './types'
import { EMPTY_ROW, DONG_LIST, COL_KEYS, COL_LABELS, COL_WIDTHS, WEIGHT_OPTIONS } from './types'
import { formatPhone, detectDong } from '@/lib/utils'

interface Props {
  rows: StagingRow[]
  onChange: (rows: StagingRow[]) => void
}

type CellRef = HTMLInputElement | HTMLSelectElement | null

function AddrIcon({ status }: { status: AddrStatus }) {
  if (status === 'validating') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
  if (status === 'valid') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />
  if (status === 'invalid') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
  return null
}

// 전역 debounce 타이머
const addrTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export function ManualTab({ rows, onChange }: Props) {
  const cellRefs = useRef<CellRef[][]>([])
  const [kakaoRow, setKakaoRow] = useState<number | null>(null)

  // 셀 포커스 이동
  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current[row]?.[col]
    if (el) { el.focus(); if ('select' in el) el.select() }
  }, [])

  // 행 추가 (Enter를 마지막 행에서 눌렀을 때)
  const addRow = useCallback(() => {
    onChange([...rows, EMPTY_ROW()])
  }, [rows, onChange])

  const updateCell = useCallback((rowIdx: number, key: ColKey, value: string | number) => {
    onChange(rows.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r))
  }, [rows, onChange])

  const deleteRow = useCallback((rowIdx: number) => {
    onChange(rows.filter((_, i) => i !== rowIdx))
  }, [rows, onChange])

  // 주소 검증 (debounce 600ms)
  const validateAddress = useCallback((rowIdx: number, address: string) => {
    const rowId = rows[rowIdx]?._id ?? String(rowIdx)
    clearTimeout(addrTimers[rowId])

    if (!address || address.length < 5) {
      onChange(rows.map((r, i) => i === rowIdx ? { ...r, addrStatus: 'idle' } : r))
      return
    }

    onChange(rows.map((r, i) => i === rowIdx ? { ...r, addrStatus: 'validating' } : r))

    addrTimers[rowId] = setTimeout(async () => {
      try {
        const res = await api.get('/orders/geocode', { params: { address } })
        const { lat, lng, address_name } = res.data
        onChange(
          rows.map((r, i) =>
            i === rowIdx
              ? { ...r, addrStatus: 'valid' as AddrStatus, lat, lng, delivery_address: address_name ?? address, addrRefined: address_name }
              : r
          )
        )
      } catch {
        onChange(
          rows.map((r, i) => i === rowIdx ? { ...r, addrStatus: 'invalid' as AddrStatus } : r)
        )
      }
    }, 600)
  }, [rows, onChange])

  // 주소 카카오 팝업 결과
  const handleAddressSelect = (rowIdx: number, addr: string) => {
    const dong = detectDong(addr) ?? rows[rowIdx].dong
    onChange(rows.map((r, i) =>
      i === rowIdx
        ? { ...r, delivery_address: addr, addrStatus: 'valid', dong }
        : r
    ))
    setKakaoRow(null)
    // 다음 셀로 포커스
    const colIdx = COL_KEYS.indexOf('delivery_address')
    setTimeout(() => focusCell(rowIdx, colIdx + 1), 50)
  }

  // 키보드 내비게이션
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
      const maxRow = rows.length - 1
      const maxCol = COL_KEYS.length - 1

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          if (rowIdx === maxRow) addRow()
          setTimeout(() => focusCell(rowIdx + 1, colIdx), 20)
          break
        case 'ArrowDown':
          e.preventDefault()
          if (rowIdx < maxRow) focusCell(rowIdx + 1, colIdx)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (rowIdx > 0) focusCell(rowIdx - 1, colIdx)
          break
        case 'Tab':
          if (!e.shiftKey) {
            if (colIdx === maxCol) { e.preventDefault(); if (rowIdx === maxRow) addRow(); setTimeout(() => focusCell(rowIdx + 1, 0), 20) }
          } else {
            if (colIdx === 0 && rowIdx > 0) { e.preventDefault(); focusCell(rowIdx - 1, maxCol) }
          }
          break
        case 'ArrowRight':
          if ((e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value?.length) {
            e.preventDefault()
            if (colIdx < maxCol) focusCell(rowIdx, colIdx + 1)
          }
          break
        case 'ArrowLeft':
          if ((e.target as HTMLInputElement).selectionStart === 0) {
            e.preventDefault()
            if (colIdx > 0) focusCell(rowIdx, colIdx - 1)
          }
          break
        case 'Delete':
          if (e.ctrlKey) { e.preventDefault(); deleteRow(rowIdx) }
          break
      }
    },
    [rows, addRow, focusCell, deleteRow]
  )

  // 클립보드 붙여넣기 (엑셀에서 복사한 내용)
  const handlePaste = useCallback((e: React.ClipboardEvent, startRow: number, startCol: number) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return

    e.preventDefault()
    const pastedRows = text.trim().split('\n').map((line) => line.split('\t'))

    const newRows = [...rows]
    pastedRows.forEach((cells, ri) => {
      const rowIdx = startRow + ri
      if (rowIdx >= newRows.length) newRows.push(EMPTY_ROW())
      cells.forEach((cell, ci) => {
        const colIdx = startCol + ci
        const key = COL_KEYS[colIdx]
        if (!key) return
        newRows[rowIdx] = { ...newRows[rowIdx], [key]: cell.trim() }
      })
    })
    onChange(newRows)
  }, [rows, onChange])

  // 5행씩 추가
  const addBatch = () => {
    onChange([...rows, ...Array.from({ length: 5 }, () => EMPTY_ROW())])
  }

  // 빈 행 초기화
  useEffect(() => {
    if (rows.length === 0) onChange([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()])
  }, []) // eslint-disable-line

  return (
    <div className="space-y-3">
      {/* 카카오 주소 팝업 (모달) */}
      {kakaoRow !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">주소 검색</h3>
              <button onClick={() => setKakaoRow(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <KakaoAddressSearch
              value={rows[kakaoRow]?.delivery_address ?? ''}
              onChange={(addr) => handleAddressSelect(kakaoRow, addr)}
              placeholder="주소 검색"
            />
          </div>
        </div>
      )}

      {/* 툴바 */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <ClipboardPaste className="w-3.5 h-3.5" />
        <span>엑셀에서 복사 후 셀에 Ctrl+V로 붙여넣기 가능 | Enter/방향키로 셀 이동 | Ctrl+Delete로 행 삭제</span>
      </div>

      {/* 스프레드시트 그리드 */}
      <div className="border border-gray-200 rounded-xl overflow-auto" style={{ maxHeight: 480 }}>
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 36 }} />
            {COL_KEYS.map((k) => <col key={k} style={{ width: COL_WIDTHS[k] }} />)}
            <col style={{ width: 36 }} />
          </colgroup>

          {/* 헤더 */}
          <thead className="sticky top-0 z-10 bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="text-center text-gray-400 font-normal text-xs py-2 border-r border-gray-200">#</th>
              {COL_KEYS.map((k) => (
                <th key={k} className="text-left px-2 py-2 text-xs font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap overflow-hidden">
                  {COL_LABELS[k]}
                </th>
              ))}
              <th />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => {
              if (!cellRefs.current[rowIdx]) cellRefs.current[rowIdx] = []
              return (
                <tr
                  key={row._id}
                  className={`border-b border-gray-100 ${
                    row.submitStatus === 'success' ? 'bg-green-50' :
                    row.submitStatus === 'error' ? 'bg-red-50' : 'hover:bg-brand-50/30'
                  }`}
                >
                  {/* 행 번호 */}
                  <td className="text-center text-xs text-gray-400 border-r border-gray-200 py-0.5 select-none">
                    {rowIdx + 1}
                  </td>

                  {COL_KEYS.map((key, colIdx) => {
                    const isAddr = key === 'delivery_address'
                    const isDong = key === 'dong'
                    const isWeight = key === 'weight_estimate'
                    const isQty = key === 'quantity'
                    const isPhone = key === 'customer_phone'

                    const cellCls = `
                      w-full h-full px-1.5 py-1 text-sm bg-transparent outline-none
                      focus:ring-2 focus:ring-brand-400 focus:ring-inset
                      ${isAddr && row.addrStatus === 'valid' ? 'bg-green-50' : ''}
                      ${isAddr && row.addrStatus === 'invalid' ? 'bg-red-50' : ''}
                    `

                    return (
                      <td key={key} className="border-r border-gray-100 p-0 relative">
                        {isAddr ? (
                          <div className="flex items-center gap-0.5 pr-1">
                            <input
                              ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                              className={cellCls + ' flex-1'}
                              value={row.delivery_address}
                              onChange={(e) => {
                                updateCell(rowIdx, 'delivery_address', e.target.value)
                                validateAddress(rowIdx, e.target.value)
                              }}
                              onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                              onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                              placeholder="주소 입력 또는 검색"
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => setKakaoRow(rowIdx)}
                              className="p-0.5 text-gray-400 hover:text-brand-600 flex-shrink-0"
                              title="주소 검색"
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                            <AddrIcon status={row.addrStatus} />
                          </div>
                        ) : isDong ? (
                          <select
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            className={cellCls}
                            value={row.dong}
                            onChange={(e) => updateCell(rowIdx, 'dong', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                          >
                            {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        ) : isWeight ? (
                          <select
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            className={cellCls}
                            value={row.weight_estimate}
                            onChange={(e) => updateCell(rowIdx, 'weight_estimate', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                          >
                            {WEIGHT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : isQty ? (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            type="number"
                            min={1}
                            className={cellCls + ' text-center'}
                            value={row.quantity}
                            onChange={(e) => updateCell(rowIdx, 'quantity', Number(e.target.value))}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          />
                        ) : isPhone ? (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            type="tel"
                            className={cellCls}
                            value={row.customer_phone}
                            onChange={(e) => updateCell(rowIdx, 'customer_phone', formatPhone(e.target.value))}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          />
                        ) : (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            className={cellCls}
                            value={String(row[key] ?? '')}
                            onChange={(e) => updateCell(rowIdx, key, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          />
                        )}
                      </td>
                    )
                  })}

                  {/* 행 삭제 */}
                  <td className="text-center py-0.5">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => deleteRow(rowIdx)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 행 추가 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 px-3 py-1.5 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          1행 추가
        </button>
        <button
          onClick={addBatch}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          5행 추가
        </button>
      </div>
    </div>
  )
}
