import { useRef, useCallback, useState, useEffect } from 'react'
import {
  Plus, Trash2, CheckCircle, AlertCircle, Loader2, Search,
  ClipboardPaste, MapPin, AlertTriangle, Save,
} from 'lucide-react'
import api from '@/lib/api'
import { KakaoAddressSearch } from '@/components/KakaoAddressSearch'
import { useAuthStore } from '@/store/authStore'
import type { StagingRow, ColKey, AddrStatus, DongStatus } from './types'
import { EMPTY_ROW, DONG_LIST, COL_KEYS, COL_LABELS, COL_WIDTHS } from './types'
import { formatPhone, detectDong } from '@/lib/utils'

type CellRef = HTMLInputElement | HTMLSelectElement | null

const VALID_DONGS = new Set<string>(DONG_LIST)

function AddrIcon({ status }: { status: AddrStatus }) {
  if (status === 'validating') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
  if (status === 'valid') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />
  if (status === 'invalid') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
  return null
}

function RowStatusDot({ row }: { row: StagingRow }) {
  if (row.savedOrderId) return <span title="저장 완료" className="text-green-500 text-xs">✓</span>
  if (row.submitStatus === 'pending') return <Loader2 className="w-3 h-3 text-orange-400 animate-spin" />
  if (row.submitStatus === 'error') return <span title={row.submitError} className="text-red-400 text-xs">!</span>
  return <span className="text-gray-300 text-xs">●</span>
}

const addrTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export function ManualTab() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const [rows, setRows] = useState<StagingRow[]>(() => [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()])
  const cellRefs = useRef<CellRef[][]>([])
  const [kakaoRow, setKakaoRow] = useState<number | null>(null)
  const activeCell = useRef<{ row: number; col: number }>({ row: 0, col: 0 })

  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current[row]?.[col]
    if (el) { el.focus(); if ('select' in el) el.select() }
  }, [])

  const addRow = useCallback(() => {
    setRows([...rows, EMPTY_ROW()])
  }, [rows, setRows])

  const updateCell = useCallback((rowIdx: number, key: ColKey, value: string | number) => {
    setRows(rows.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r))
  }, [rows, setRows])

  const deleteRow = useCallback((rowIdx: number) => {
    setRows(rows.filter((_, i) => i !== rowIdx))
  }, [rows, setRows])

  // ── 자동저장 (행 완성 즉시) ────────────────────────────────────────────────
  const autoSaveRow = useCallback(async (rowIdx: number) => {
    const row = rows[rowIdx]
    if (!row) return
    if (row.savedOrderId) return
    if (!row.customer_name || !row.customer_phone || !row.delivery_address || !row.dong) return
    if (row.addrStatus !== 'valid') return
    if (row.dongStatus === 'out-of-zone' && !row.dongOverride) return

    // pending 표시
    setRows(rows.map((r, i) => i === rowIdx ? { ...r, submitStatus: 'pending' } : r))
    try {
      const res = await api.post('/orders/single', {
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        delivery_address: row.delivery_address,
        dong: row.dong,
        items_desc: row.items_desc || undefined,
        item_code: row.item_code || undefined,
        quantity: row.quantity,
        request: row.request || undefined,
        lat: row.lat,
        lng: row.lng,
        dong_override: row.dongOverride ?? false,
      })
      setRows((prev) =>
        prev.map((r, i) =>
          i === rowIdx
            ? { ...r, savedOrderId: res.data.id, submitStatus: 'success', submitError: undefined }
            : r
        )
      )
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '저장 실패'
      setRows((prev) =>
        prev.map((r, i) =>
          i === rowIdx ? { ...r, submitStatus: 'error', submitError: msg } : r
        )
      )
    }
  }, [rows, setRows])

  // 행 상태 감시 → 완성되면 1200ms 디바운스 후 자동저장
  useEffect(() => {
    rows.forEach((row, rowIdx) => {
      if (row.savedOrderId) return
      const isReady =
        row.customer_name &&
        row.customer_phone &&
        row.delivery_address &&
        row.dong &&
        row.addrStatus === 'valid' &&
        (row.dongStatus !== 'out-of-zone' || row.dongOverride)

      if (!isReady) return
      if (row.submitStatus === 'pending' || row.submitStatus === 'success') return

      clearTimeout(saveTimers[row._id])
      saveTimers[row._id] = setTimeout(() => autoSaveRow(rowIdx), 1200)
    })
  }, [rows]) // eslint-disable-line

  // ── 주소 변경 — 즉시 dong 감지 + geocoding debounce ─────────────────────
  const handleAddressChange = useCallback((rowIdx: number, value: string) => {
    const detected = detectDong(value)
    const updates: Partial<StagingRow> = { delivery_address: value, savedOrderId: undefined, submitStatus: undefined }
    if (detected) updates.dong = detected

    const rowId = rows[rowIdx]?._id ?? String(rowIdx)
    clearTimeout(addrTimers[rowId])

    if (!value || value.length < 5) {
      setRows(rows.map((r, i) => i === rowIdx ? { ...r, ...updates, addrStatus: 'idle', dongStatus: undefined, dong: '경안동' } : r))
      return
    }

    setRows(rows.map((r, i) => i === rowIdx ? { ...r, ...updates, addrStatus: 'validating' } : r))

    addrTimers[rowId] = setTimeout(async () => {
      try {
        const res = await api.get('/orders/geocode', { params: { address: value } })
        const { lat, lng, address_name } = res.data
        const refinedDong = detectDong(address_name ?? value)
        const dongStatus: DongStatus = refinedDong ? 'valid' : 'out-of-zone'
        setRows(
          rows.map((r, i) =>
            i === rowIdx
              ? {
                  ...r,
                  addrStatus: 'valid' as AddrStatus,
                  lat, lng,
                  delivery_address: address_name ?? value,
                  addrRefined: address_name,
                  dongStatus,
                  ...(refinedDong ? { dong: refinedDong } : {}),
                  savedOrderId: undefined,
                  submitStatus: undefined,
                }
              : r
          )
        )
      } catch {
        setRows(rows.map((r, i) => i === rowIdx ? { ...r, addrStatus: 'invalid' as AddrStatus, dongStatus: 'out-of-zone' } : r))
      }
    }, 600)
  }, [rows, setRows])

  // 카카오 주소 검색 결과
  const handleAddressSelect = useCallback((rowIdx: number, addr: string) => {
    const dong = detectDong(addr) ?? rows[rowIdx].dong
    const dongStatus: DongStatus = detectDong(addr) ? 'valid' : 'out-of-zone'
    setRows(rows.map((r, i) =>
      i === rowIdx
        ? { ...r, delivery_address: addr, addrStatus: 'valid', dong, dongStatus, savedOrderId: undefined, submitStatus: undefined }
        : r
    ))
    setKakaoRow(null)
    const colIdx = COL_KEYS.indexOf('delivery_address')
    setTimeout(() => focusCell(rowIdx, colIdx + 1), 50)
  }, [rows, setRows, focusCell])

  // 배송동(index 2)은 자동감지 표시 전용 — 포커스 건너뜀
  const DONG_COL = COL_KEYS.indexOf('dong')
  const nextCol = (cur: number, dir: 1 | -1) => {
    let n = cur + dir
    if (n === DONG_COL) n += dir
    return Math.max(0, Math.min(COL_KEYS.length - 1, n))
  }
  const LAST_COL = COL_KEYS.length - 1

  // 키보드 내비게이션: 엔터 → 오른쪽, 마지막 셀 엔터 → 다음 행 첫 셀
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
      const maxRow = rows.length - 1

      switch (e.key) {
        case 'Enter': {
          e.preventDefault()
          if (colIdx === LAST_COL) {
            // 요청사항 → 다음 행 첫 셀
            if (rowIdx === maxRow) addRow()
            setTimeout(() => focusCell(rowIdx + 1, 0), 20)
          } else {
            // 나머지 → 오른쪽 셀 (dong 건너뜀)
            focusCell(rowIdx, nextCol(colIdx, 1))
          }
          break
        }
        case 'ArrowDown':
          e.preventDefault()
          if (rowIdx < maxRow) focusCell(rowIdx + 1, colIdx)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (rowIdx > 0) focusCell(rowIdx - 1, colIdx)
          break
        case 'Tab':
          e.preventDefault()
          if (!e.shiftKey) {
            if (colIdx === LAST_COL) {
              if (rowIdx === maxRow) addRow()
              setTimeout(() => focusCell(rowIdx + 1, 0), 20)
            } else {
              focusCell(rowIdx, nextCol(colIdx, 1))
            }
          } else {
            if (colIdx === 0 && rowIdx > 0) {
              focusCell(rowIdx - 1, LAST_COL)
            } else if (colIdx > 0) {
              focusCell(rowIdx, nextCol(colIdx, -1))
            }
          }
          break
        case 'ArrowRight':
          if ((e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value?.length) {
            e.preventDefault()
            const n = nextCol(colIdx, 1)
            if (n > colIdx) focusCell(rowIdx, n)
          }
          break
        case 'ArrowLeft':
          if ((e.target as HTMLInputElement).selectionStart === 0) {
            e.preventDefault()
            const n = nextCol(colIdx, -1)
            if (n < colIdx) focusCell(rowIdx, n)
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
          const dongStatus: DongStatus = detected ? 'valid' : 'out-of-zone'
          newRows[rowIdx] = {
            ...newRows[rowIdx],
            delivery_address: val,
            dongStatus,
            savedOrderId: undefined,
            submitStatus: undefined,
            ...(detected ? { dong: detected } : {}),
          }
        } else {
          newRows[rowIdx] = { ...newRows[rowIdx], [key]: val }
        }
      })
    })
    setRows(newRows)
  }, [rows, setRows])

  const handlePaste = useCallback((e: React.ClipboardEvent, startRow: number, startCol: number) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    applyTsvPaste(text, startRow, startCol)
  }, [applyTsvPaste])

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      applyTsvPaste(text, activeCell.current.row, activeCell.current.col)
    } catch { /* 권한 거부 */ }
  }

  const addBatch = () => {
    setRows([...rows, ...Array.from({ length: 5 }, () => EMPTY_ROW())])
  }

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
          <Save className="w-3.5 h-3.5 text-green-500" />
          <span>필수 항목 입력 + 주소 확인 완료 시 자동 저장 | Ctrl+V 붙여넣기</span>
        </div>
        <button
          type="button"
          onClick={handleClipboardPaste}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 px-3 py-1.5 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors shrink-0"
          title="클립보드에서 엑셀 데이터 붙여넣기"
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
              const isOutOfZone = row.dongStatus === 'out-of-zone' && !row.dongOverride

              return (
                <tr
                  key={row._id}
                  className={`border-b border-gray-100 ${
                    row.savedOrderId ? 'bg-green-50' :
                    isOutOfZone ? 'bg-red-50 border-l-4 border-l-red-400' :
                    row.submitStatus === 'error' ? 'bg-red-50' : 'hover:bg-brand-50/30'
                  }`}
                >
                  {/* 행 번호 + 저장 상태 */}
                  <td className="text-center text-xs text-gray-400 border-r border-gray-200 py-0.5 select-none">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{rowIdx + 1}</span>
                      <RowStatusDot row={row} />
                    </div>
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
                          <div className="flex flex-col items-center justify-center px-1 py-1 gap-0.5 min-h-[36px]">
                            {!row.delivery_address ? (
                              <span className="text-[9px] text-gray-300 text-center leading-tight">주소<br/>입력 후</span>
                            ) : row.addrStatus === 'validating' ? (
                              <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                            ) : row.dongStatus === 'out-of-zone' ? (
                              <>
                                <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap">
                                  <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />지역 외
                                </span>
                                {isAdmin && !row.dongOverride && (
                                  <button
                                    type="button"
                                    onClick={() => setRows(rows.map((r, i) =>
                                      i === rowIdx ? { ...r, dongOverride: true, submitStatus: undefined, savedOrderId: undefined } : r
                                    ))}
                                    className="text-[9px] text-amber-700 underline hover:text-amber-900 leading-none"
                                  >
                                    강제등록
                                  </button>
                                )}
                                {row.dongOverride && (
                                  <span className="text-[9px] text-amber-600 font-semibold leading-none">{row.dong} ✓</span>
                                )}
                              </>
                            ) : row.dong ? (
                              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {row.dong}
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-300">—</span>
                            )}
                          </div>
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

      {/* 지역 외 경고 배너 */}
      {rows.some((r) => r.dongStatus === 'out-of-zone' && !r.dongOverride) && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            서비스 지역 외 주소가 {rows.filter((r) => r.dongStatus === 'out-of-zone' && !r.dongOverride).length}건 있습니다.
            {isAdmin ? ' 배송동 열의 "강제 등록" 체크박스로 허용할 수 있습니다.' : ' 관리자에게 문의하세요.'}
          </span>
        </div>
      )}

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
