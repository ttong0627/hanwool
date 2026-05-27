import { useRef, useCallback, useState, useEffect } from 'react'
import {
  Plus, Trash2, CheckCircle, AlertCircle, Loader2, Search,
  ClipboardPaste, MapPin,
} from 'lucide-react'
import api from '@/lib/api'
import { KakaoAddressSearch } from '@/components/KakaoAddressSearch'
import type { StagingRow, ColKey, AddrStatus } from './types'
import { EMPTY_ROW, DONG_LIST, COL_KEYS, COL_LABELS, COL_WIDTHS } from './types'
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

const addrTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export function ManualTab({ rows, onChange }: Props) {
  const cellRefs = useRef<CellRef[][]>([])
  const [kakaoRow, setKakaoRow] = useState<number | null>(null)

  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current[row]?.[col]
    if (el) { el.focus(); if ('select' in el) el.select() }
  }, [])

  const addRow = useCallback(() => {
    onChange([...rows, EMPTY_ROW()])
  }, [rows, onChange])

  const updateCell = useCallback((rowIdx: number, key: ColKey, value: string | number) => {
    onChange(rows.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r))
  }, [rows, onChange])

  const deleteRow = useCallback((rowIdx: number) => {
    onChange(rows.filter((_, i) => i !== rowIdx))
  }, [rows, onChange])

  // 주소 변경 — 즉시 dong 감지 + geocoding debounce
  const handleAddressChange = useCallback((rowIdx: number, value: string) => {
    const detected = detectDong(value)
    const updates: Partial<StagingRow> = { delivery_address: value }
    if (detected) updates.dong = detected

    const rowId = rows[rowIdx]?._id ?? String(rowIdx)
    clearTimeout(addrTimers[rowId])

    if (!value || value.length < 5) {
      onChange(rows.map((r, i) => i === rowIdx ? { ...r, ...updates, addrStatus: 'idle' } : r))
      return
    }

    onChange(rows.map((r, i) => i === rowIdx ? { ...r, ...updates, addrStatus: 'validating' } : r))

    addrTimers[rowId] = setTimeout(async () => {
      try {
        const res = await api.get('/orders/geocode', { params: { address: value } })
        const { lat, lng, address_name } = res.data
        const refinedDong = detectDong(address_name ?? value)
        onChange(
          rows.map((r, i) =>
            i === rowIdx
              ? {
                  ...r,
                  addrStatus: 'valid' as AddrStatus,
                  lat, lng,
                  delivery_address: address_name ?? value,
                  addrRefined: address_name,
                  ...(refinedDong ? { dong: refinedDong } : {}),
                }
              : r
          )
        )
      } catch {
        onChange(rows.map((r, i) => i === rowIdx ? { ...r, addrStatus: 'invalid' as AddrStatus } : r))
      }
    }, 600)
  }, [rows, onChange])

  // 카카오 주소 검색 결과
  const handleAddressSelect = useCallback((rowIdx: number, addr: string) => {
    const dong = detectDong(addr) ?? rows[rowIdx].dong
    onChange(rows.map((r, i) =>
      i === rowIdx
        ? { ...r, delivery_address: addr, addrStatus: 'valid', dong }
        : r
    ))
    setKakaoRow(null)
    const colIdx = COL_KEYS.indexOf('delivery_address')
    setTimeout(() => focusCell(rowIdx, colIdx + 1), 50)
  }, [rows, onChange, focusCell])

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
            if (colIdx === maxCol) {
              e.preventDefault()
              if (rowIdx === maxRow) addRow()
              setTimeout(() => focusCell(rowIdx + 1, 0), 20)
            }
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

  // TSV 파싱 공통 함수 (엑셀 붙여넣기)
  const applyTsvPaste = useCallback((text: string, startRow: number, startCol: number) => {
    if (!text.trim()) return
    const pastedRows = text.trim().split('\n').map((line) => line.split('\t'))
    const newRows = [...rows]

    pastedRows.forEach((cells, ri) => {
      const rowIdx = startRow + ri
      if (rowIdx >= newRows.length) newRows.push(EMPTY_ROW())
      cells.forEach((cell, ci) => {
        const colIdx = startCol + ci
        const key = COL_KEYS[colIdx]
        if (!key) return
        const val = cell.trim()
        if (key === 'customer_phone') {
          newRows[rowIdx] = { ...newRows[rowIdx], [key]: formatPhone(val) }
        } else if (key === 'quantity') {
          newRows[rowIdx] = { ...newRows[rowIdx], [key]: parseInt(val) || 1 }
        } else if (key === 'dong') {
          const detected = detectDong(val) ?? val
          newRows[rowIdx] = { ...newRows[rowIdx], dong: detected }
        } else if (key === 'delivery_address') {
          const detected = detectDong(val)
          newRows[rowIdx] = {
            ...newRows[rowIdx],
            delivery_address: val,
            ...(detected ? { dong: detected } : {}),
          }
        } else {
          newRows[rowIdx] = { ...newRows[rowIdx], [key]: val }
        }
      })
    })
    onChange(newRows)
  }, [rows, onChange])

  // 셀 레벨 붙여넣기
  const handlePaste = useCallback((e: React.ClipboardEvent, startRow: number, startCol: number) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    applyTsvPaste(text, startRow, startCol)
  }, [applyTsvPaste])

  // 클립보드 버튼 — 현재 포커스 셀 위치 기준, 없으면 (0,0)
  const activeCell = useRef<{ row: number; col: number }>({ row: 0, col: 0 })
  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      applyTsvPaste(text, activeCell.current.row, activeCell.current.col)
    } catch {
      // 권한 거부 — 셀 클릭 후 Ctrl+V 안내
    }
  }

  const addBatch = () => {
    onChange([...rows, ...Array.from({ length: 5 }, () => EMPTY_ROW())])
  }

  useEffect(() => {
    if (rows.length === 0) onChange([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()])
  }, []) // eslint-disable-line

  return (
    <div className="space-y-3">
      {/* 카카오 주소 검색 모달 */}
      {kakaoRow !== null && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand-500" />
                주소 검색
              </h3>
              <button onClick={() => setKakaoRow(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>엑셀에서 복사 후 셀에 Ctrl+V로 붙여넣기 가능 | Enter/방향키로 셀 이동 | Ctrl+Delete로 행 삭제</span>
        </div>
        <button
          type="button"
          onClick={handleClipboardPaste}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 px-3 py-1.5 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors shrink-0"
          title="클립보드에서 엑셀 데이터 붙여넣기 (1행 1열부터 채움)"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          클립보드 붙여넣기
        </button>
      </div>

      {/* 스프레드시트 그리드 */}
      <div className="border border-gray-200 rounded-xl overflow-auto" style={{ maxHeight: 480 }}>
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 36 }} />
            {COL_KEYS.map((k) => <col key={k} style={{ width: COL_WIDTHS[k] }} />)}
            <col style={{ width: 36 }} />
          </colgroup>

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
                  <td className="text-center text-xs text-gray-400 border-r border-gray-200 py-0.5 select-none">
                    {rowIdx + 1}
                  </td>

                  {COL_KEYS.map((key, colIdx) => {
                    const isAddr = key === 'delivery_address'
                    const isDong = key === 'dong'
                    const isQty = key === 'quantity'
                    const isPhone = key === 'customer_phone'
                    const isCode = key === 'item_code'

                    const cellCls = `
                      w-full h-full px-1.5 py-1 text-sm bg-transparent outline-none
                      focus:ring-2 focus:ring-brand-400 focus:ring-inset
                      ${isAddr && row.addrStatus === 'valid' ? 'text-green-700' : ''}
                      ${isAddr && row.addrStatus === 'invalid' ? 'text-red-600' : ''}
                    `

                    return (
                      <td key={key} className="border-r border-gray-100 p-0 relative">
                        {isAddr ? (
                          <div className="flex items-center gap-0.5 pr-1">
                            <input
                              ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                              className={cellCls + ' flex-1'}
                              value={row.delivery_address}
                              onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                              onChange={(e) => handleAddressChange(rowIdx, e.target.value)}
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
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                            onChange={(e) => updateCell(rowIdx, 'dong', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                          >
                            {DONG_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        ) : isQty ? (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            type="number"
                            min={1}
                            className={cellCls + ' text-center'}
                            value={row.quantity}
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
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
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                            onChange={(e) => updateCell(rowIdx, 'customer_phone', formatPhone(e.target.value))}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          />
                        ) : isCode ? (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            type="text"
                            inputMode="numeric"
                            className={cellCls + ' text-center font-mono'}
                            value={row.item_code}
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                            onChange={(e) => updateCell(rowIdx, 'item_code', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                            placeholder="—"
                          />
                        ) : (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            className={cellCls}
                            value={String(row[key] ?? '')}
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                            onChange={(e) => updateCell(rowIdx, key, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          />
                        )}
                      </td>
                    )
                  })}

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
