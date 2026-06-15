import { useRef, useCallback, useState, useEffect } from 'react'
import {
  Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  ClipboardPaste, AlertTriangle, Save, X, Keyboard, ShieldCheck,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { StagingRow, ColKey, AddrStatus, DongStatus } from './types'
import { EMPTY_ROW, DONG_LIST, COL_KEYS, COL_LABELS, COL_WIDTHS } from './types'
import { formatPhone, detectDong, normalizeAddress } from '@/lib/utils'

type CellRef = HTMLInputElement | HTMLSelectElement | null

const VALID_DONGS = new Set<string>(DONG_LIST)

// 한글 자모/완성형 유니코드 범위
const HANGUL_RE = /[ㄱ-ㆎ가-힣]/
const LATIN_RE = /[a-zA-Z]/

function AddrIcon({ status }: { status: AddrStatus }) {
  if (status === 'validating') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
  if (status === 'valid') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />
  if (status === 'invalid') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
  return null
}

function RowStatusDot({ row, onRetry }: { row: StagingRow; onRetry?: () => void }) {
  if (row.savedOrderId) return <span title="저장 완료" className="text-green-500 text-xs">✓</span>
  if (row.submitStatus === 'pending') return <Loader2 className="w-3 h-3 text-orange-400 animate-spin" />
  if (row.submitStatus === 'error') return (
    <button title={`오류: ${row.submitError}\n클릭하면 재시도`} onClick={onRetry}
      className="text-red-400 text-xs hover:text-red-600 font-bold cursor-pointer leading-none">!</button>
  )
  return <span className="text-gray-300 text-xs">●</span>
}

const addrTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

// 컬럼별 IME 메타
const CELL_META: Partial<Record<ColKey, { lang: 'ko' | 'en'; inputMode?: HTMLInputElement['inputMode']; hint: string; hintColor: string; hintBg: string }>> = {
  customer_name:    { lang: 'ko', hint: '한글', hintColor: 'text-blue-700', hintBg: 'bg-blue-100 border-blue-300' },
  customer_phone:   { lang: 'en', inputMode: 'tel',     hint: '전화', hintColor: 'text-slate-600', hintBg: 'bg-slate-100 border-slate-300' },
  delivery_address: { lang: 'ko', hint: '한글', hintColor: 'text-blue-700', hintBg: 'bg-blue-100 border-blue-300' },
  detail_address:   { lang: 'ko', hint: '한글', hintColor: 'text-blue-700', hintBg: 'bg-blue-100 border-blue-300' },
  items_desc:       { lang: 'ko', hint: '한글', hintColor: 'text-blue-700', hintBg: 'bg-blue-100 border-blue-300' },
  // item_code: 자동 일련번호(GA1-0001~) — 직접 입력 불가, 메타 없음
  quantity:         { lang: 'en', inputMode: 'numeric', hint: '숫자', hintColor: 'text-slate-600', hintBg: 'bg-slate-100 border-slate-300' },
  request:          { lang: 'ko', hint: '한글', hintColor: 'text-blue-700', hintBg: 'bg-blue-100 border-blue-300' },
}

export function ManualTab() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const qc = useQueryClient()

  const [rows, setRows] = useState<StagingRow[]>(() => [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const cellRefs = useRef<CellRef[][]>([])
  const activeCell = useRef<{ row: number; col: number }>({ row: 0, col: 0 })

  // ── IME 경고 시스템 ────────────────────────────────────────────────────────
  const [koreanWarn, setKoreanWarn] = useState(false)
  const [warnCell, setWarnCell] = useState<{ row: number; col: number } | null>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout>>()
  // composing 상태 추적: IME 조합 중엔 오감지 방지
  const composingRef = useRef<Record<string, boolean>>({})

  const triggerIMEWarn = useCallback((rowIdx: number, colIdx: number) => {
    setKoreanWarn(true)
    setWarnCell({ row: rowIdx, col: colIdx })
    clearTimeout(warnTimer.current)
    warnTimer.current = setTimeout(() => {
      setKoreanWarn(false)
      setWarnCell(null)
    }, 3500)
  }, [])

  const checkKoreanIME = useCallback((value: string, rowIdx: number, colIdx: number, key: ColKey) => {
    const meta = CELL_META[key]
    if (meta?.lang !== 'ko') return
    const cellKey = `${rowIdx}-${colIdx}`
    if (composingRef.current[cellKey]) return // IME 조합 중이면 스킵
    if (LATIN_RE.test(value) && !HANGUL_RE.test(value.slice(-1))) {
      triggerIMEWarn(rowIdx, colIdx)
    }
  }, [triggerIMEWarn])

  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current[row]?.[col]
    if (el) { el.focus(); if ('select' in el) el.select() }
  }, [])

  const addRow = useCallback(() => {
    setRows(prev => [...prev, EMPTY_ROW()])
  }, [])

  const updateCell = useCallback((rowIdx: number, key: ColKey, value: string | number) => {
    setRows(prev => prev.map((r, i) => i === rowIdx ? {
      ...r, [key]: value,
      // 저장 실패 상태에서 편집하면 재시도 가능하도록 초기화
      ...(r.submitStatus === 'error' && !r.savedOrderId ? { submitStatus: undefined } : {}),
    } : r))
  }, [])

  const deleteRow = useCallback((rowIdx: number) => {
    setRows(prev => prev.filter((_, i) => i !== rowIdx))
  }, [])

  // ── 자동저장 ──────────────────────────────────────────────────────────────
  const autoSaveRow = useCallback(async (rowIdx: number) => {
    const row = rowsRef.current[rowIdx]
    if (!row) return
    if (row.savedOrderId) return
    if (!row.customer_name || !row.customer_phone || !row.delivery_address || !row.dong) return
    if (row.addrStatus === 'idle' || row.addrStatus === 'validating') return

    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, submitStatus: 'pending' } : r))
    try {
      const res = await api.post('/orders/single', {
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        delivery_address: row.addrRefined ?? row.delivery_address,
        detail_address: row.detail_address || undefined,
        dong: row.dong,
        items_desc: row.items_desc || undefined,
        // 물품코드는 서버가 전역 일련번호(GA1-####)로 자동 부여 (마지막 번호+1)
        quantity: row.quantity,
        request: row.request || undefined,
        lat: row.lat,
        lng: row.lng,
        dong_override: true,
        // 행 멱등키: 같은 행을 다시 저장(오타/영문 수정)해도 중복 생성 대신 기존 주문 갱신
        client_row_id: row._id,
      })
      const savedId: number = res.data.id
      setRows(prev => prev.map((r, i) =>
        i === rowIdx ? { ...r, savedOrderId: savedId, item_code: res.data.item_code ?? r.item_code, submitStatus: 'success', submitError: undefined } : r
      ))
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      // 좌표가 없으면 백그라운드에서 Kakao API로 자동 재매칭
      if (!res.data.lat || !res.data.lng) {
        api.post(`/orders/${savedId}/regeocode`)
          .then(() => qc.invalidateQueries({ queryKey: ['orders'] }))
          .catch(() => {})
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '저장 실패'
      setRows(prev => prev.map((r, i) =>
        i === rowIdx ? { ...r, submitStatus: 'error', submitError: msg } : r
      ))
    }
  }, []) // rowsRef.current로 읽으므로 rows 의존성 불필요

  useEffect(() => {
    rows.forEach((row, rowIdx) => {
      if (row.savedOrderId) return
      const isReady =
        row.customer_name && row.customer_phone && row.delivery_address && row.dong &&
        (row.addrStatus === 'valid' || row.addrStatus === 'invalid')
      if (!isReady) return
      if (row.submitStatus === 'pending' || row.submitStatus === 'success' || row.submitStatus === 'error') return
      clearTimeout(saveTimers[row._id])
      saveTimers[row._id] = setTimeout(() => autoSaveRow(rowIdx), 1200)
    })
  }, [rows]) // eslint-disable-line

  // ── 주소 변경 ─────────────────────────────────────────────────────────────
  const handleAddressChange = useCallback((rowIdx: number, rawValue: string) => {
    const value = normalizeAddress(rawValue)
    const detected = detectDong(value)
    const rowId = rowsRef.current[rowIdx]?._id ?? String(rowIdx)
    clearTimeout(addrTimers[rowId])
    if (!value || value.length < 5) {
      setRows(prev => prev.map((r, i) => i === rowIdx ? {
        ...r, delivery_address: value, savedOrderId: undefined, submitStatus: undefined,
        addrStatus: 'idle',
        dongStatus: detected ? (VALID_DONGS.has(detected) ? 'valid' : 'out-of-zone') : undefined,
        dong: detected ?? r.dong, // 기존 dong 값 유지 (cleared → auto-save 실패 방지)
      } : r))
      return
    }
    setRows(prev => prev.map((r, i) => i === rowIdx ? {
      ...r, delivery_address: value, savedOrderId: undefined, submitStatus: undefined,
      addrStatus: 'validating', ...(detected ? { dong: detected } : {}),
    } : r))
    addrTimers[rowId] = setTimeout(async () => {
      try {
        const res = await api.post('/addresses/resolve', { address: value })
        const {
          lat,
          lng,
          standard_road_address,
          legal_emd,
          service_dong,
          match_status,
          match_score,
          coord_source,
        } = res.data
        const displayAddress = standard_road_address ?? value
        const detectedFromAddr = detectDong(displayAddress) ?? detectDong(value)
        const refinedDong = (service_dong && VALID_DONGS.has(service_dong))
          ? service_dong
          : (legal_emd && VALID_DONGS.has(legal_emd))
            ? legal_emd
          : (detectedFromAddr && VALID_DONGS.has(detectedFromAddr)) ? detectedFromAddr : null
        const anyDong = service_dong ?? legal_emd ?? (displayAddress ?? value).match(/([가-힣]+동)/)?.[1] ?? null
        const dongStatus: DongStatus = refinedDong ? 'valid' : 'out-of-zone'
        const addrStatus: AddrStatus = match_status === 'not_found' ? 'invalid' : 'valid'
        setRows(prev => prev.map((r, i) => i === rowIdx ? {
          ...r,
          addrStatus,
          lat,
          lng,
          addrRefined: displayAddress,
          standardRoadAddress: standard_road_address,
          legalEmd: legal_emd,
          serviceDong: service_dong,
          matchStatus: match_status,
          matchScore: match_score,
          coordSource: coord_source,
          dongStatus, dong: refinedDong ?? anyDong ?? r.dong, savedOrderId: undefined, submitStatus: undefined,
        } : r))
      } catch {
        const fallbackDong = detectDong(value)
        const fallbackDongStatus: DongStatus | undefined = fallbackDong
          ? (VALID_DONGS.has(fallbackDong) ? 'valid' : 'out-of-zone') : undefined
        setRows(prev => prev.map((r, i) => i === rowIdx ? {
          ...r, addrStatus: 'invalid' as AddrStatus, dong: fallbackDong ?? r.dong, dongStatus: fallbackDongStatus,
        } : r))
      }
    }, 600)
  }, []) // rowsRef.current로 읽으므로 rows 의존성 불필요

  // ── 전체 주소 일괄 검증 ────────────────────────────────────────────────────
  const [validatingAll, setValidatingAll] = useState(false)

  const validateAllAddresses = useCallback(async () => {
    const currentRows = rowsRef.current
    const targets = currentRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) =>
        row.delivery_address && row.delivery_address.length >= 5 &&
        row.addrStatus !== 'valid' && !row.savedOrderId
      )
    if (targets.length === 0) return

    // 먼저 전체를 'validating' 상태로 표시
    setRows(prev => prev.map((r, i) =>
      targets.some(({ idx }) => idx === i) ? { ...r, addrStatus: 'validating' } : r
    ))
    setValidatingAll(true)

    // 3개씩 병렬 처리
    const CHUNK = 3
    for (let c = 0; c < targets.length; c += CHUNK) {
      const chunk = targets.slice(c, c + CHUNK)
      await Promise.all(chunk.map(async ({ row, idx }) => {
        const value = row.delivery_address
        try {
          const res = await api.post('/addresses/resolve', { address: value })
          const { lat, lng, standard_road_address, legal_emd, service_dong, match_status, match_score, coord_source } = res.data
          const displayAddress = standard_road_address ?? value
          const detectedFromAddr = detectDong(displayAddress) ?? detectDong(value)
          const refinedDong = (service_dong && VALID_DONGS.has(service_dong))
            ? service_dong
            : (legal_emd && VALID_DONGS.has(legal_emd))
              ? legal_emd
              : (detectedFromAddr && VALID_DONGS.has(detectedFromAddr)) ? detectedFromAddr : null
          const anyDong = service_dong ?? legal_emd ?? (displayAddress ?? value).match(/([가-힣]+동)/)?.[1] ?? null
          const dongStatus: DongStatus = refinedDong ? 'valid' : 'out-of-zone'
          const addrStatus: AddrStatus = match_status === 'not_found' ? 'invalid' : 'valid'
          setRows(prev => prev.map((r, i) => i === idx ? {
            ...r,
            addrStatus, lat, lng,
            addrRefined: displayAddress,
            standardRoadAddress: standard_road_address,
            legalEmd: legal_emd,
            serviceDong: service_dong,
            matchStatus: match_status,
            matchScore: match_score,
            coordSource: coord_source,
            dongStatus,
            dong: refinedDong ?? anyDong ?? r.dong,
            savedOrderId: undefined,
            submitStatus: undefined,
          } : r))
        } catch {
          const fallbackDong = detectDong(value)
          const fallbackDongStatus: DongStatus | undefined = fallbackDong
            ? (VALID_DONGS.has(fallbackDong) ? 'valid' : 'out-of-zone') : undefined
          setRows(prev => prev.map((r, i) => i === idx ? {
            ...r, addrStatus: 'invalid' as AddrStatus,
            dong: fallbackDong ?? r.dong, dongStatus: fallbackDongStatus,
          } : r))
        }
      }))
    }
    setValidatingAll(false)
  }, [])

  const DONG_COL = COL_KEYS.indexOf('dong')
  const CODE_COL = COL_KEYS.indexOf('item_code')
  // 배송동(자동 판정)·물품코드(자동 일련번호)는 키보드 이동에서 건너뜀
  const SKIP_COLS = new Set([DONG_COL, CODE_COL])
  const nextCol = (cur: number, dir: 1 | -1) => {
    let n = cur + dir
    while (SKIP_COLS.has(n)) n += dir
    return Math.max(0, Math.min(COL_KEYS.length - 1, n))
  }
  const LAST_COL = COL_KEYS.length - 1

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
      const maxRow = rowsRef.current.length - 1
      switch (e.key) {
        case 'Enter': {
          e.preventDefault()
          if (colIdx === LAST_COL) {
            if (rowIdx === maxRow) addRow()
            setTimeout(() => focusCell(rowIdx + 1, 0), 20)
          } else {
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
            if (colIdx === 0 && rowIdx > 0) focusCell(rowIdx - 1, LAST_COL)
            else if (colIdx > 0) focusCell(rowIdx, nextCol(colIdx, -1))
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
    [addRow, focusCell, deleteRow]
  )

  const applyTsvPaste = useCallback((text: string, startRow: number, startCol: number) => {
    if (!text.trim()) return
    const pastedRows = text.trim().split('\n').map((line) => line.split('\t'))
    const newRows = [...rowsRef.current]
    pastedRows.forEach((cells, ri) => {
      const rowIdx = startRow + ri
      if (rowIdx >= newRows.length) newRows.push(EMPTY_ROW())
      cells.forEach((cell, ci) => {
        const colIdx = startCol + ci
        const key = COL_KEYS[colIdx]
        if (!key) return
        if (key === 'item_code') return  // 물품코드는 자동 일련번호 — 붙여넣기 값 무시
        const val = cell.trim()
        if (key === 'customer_phone') {
          newRows[rowIdx] = { ...newRows[rowIdx], [key]: formatPhone(val) }
        } else if (key === 'quantity') {
          newRows[rowIdx] = { ...newRows[rowIdx], [key]: parseInt(val) || 1 }
        } else if (key === 'dong') {
          const detected = detectDong(val) ?? val
          newRows[rowIdx] = { ...newRows[rowIdx], dong: detected }
        } else if (key === 'delivery_address') {
          const normalized = normalizeAddress(val)
          const detected = detectDong(normalized)
          const dongStatus: DongStatus = detected ? 'valid' : 'out-of-zone'
          newRows[rowIdx] = {
            ...newRows[rowIdx], delivery_address: normalized, dongStatus,
            savedOrderId: undefined, submitStatus: undefined,
            ...(detected ? { dong: detected } : {}),
          }
        } else {
          newRows[rowIdx] = { ...newRows[rowIdx], [key]: val }
        }
      })
    })
    setRows(newRows)
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent, startRow: number, startCol: number) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    applyTsvPaste(text, startRow, startCol)
  }, [applyTsvPaste])

  const [clipboardModal, setClipboardModal] = useState(false)
  const [clipboardText, setClipboardText] = useState('')

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) { applyTsvPaste(text, activeCell.current.row, activeCell.current.col); return }
    } catch { /* 권한 차단 시 모달 폴백 */ }
    setClipboardText(''); setClipboardModal(true)
  }

  const confirmClipboardModal = () => {
    if (clipboardText.trim()) applyTsvPaste(clipboardText, activeCell.current.row, activeCell.current.col)
    setClipboardModal(false); setClipboardText('')
  }

  const addBatch = () => setRows(prev => [...prev, ...Array.from({ length: 5 }, () => EMPTY_ROW())])

  // 저장 완료 행의 선택 필드(detail_address/items_desc/request) 변경 시 부분 업데이트
  const triggerPartialUpdate = (rowIdx: number, key: 'detail_address' | 'items_desc' | 'request' | 'quantity') => {
    const row = rowsRef.current[rowIdx]
    if (!row?.savedOrderId) return
    const timerId = `partial_${row._id}_${key}`
    clearTimeout(saveTimers[timerId])
    saveTimers[timerId] = setTimeout(async () => {
      const cur = rowsRef.current[rowIdx]
      if (!cur?.savedOrderId) return
      try {
        await api.put(`/orders/${cur.savedOrderId}`, { [key]: cur[key] || undefined })
        qc.invalidateQueries({ queryKey: ['orders'] })
      } catch { /* silent */ }
    }, 900)
  }

  // IME 경고 토스트 — 화면 우상단 고정
  const ImeWarnToast = koreanWarn && (
    <div className="fixed top-16 right-4 z-[9999] flex items-center gap-3 bg-red-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-bounce">
      <Keyboard className="w-6 h-6 shrink-0" />
      <div>
        <p className="font-bold text-sm leading-tight">영어 입력 감지!</p>
        <p className="text-xs opacity-90 mt-0.5">한/영 키를 눌러 한글로 전환하세요</p>
      </div>
      <button onClick={() => { setKoreanWarn(false); setWarnCell(null) }} className="ml-1 opacity-70 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className="space-y-3">
      {ImeWarnToast}

      {/* 클립보드 모달 */}
      {clipboardModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="w-5 h-5 text-brand-500" />
                <h3 className="font-bold text-gray-800">엑셀 데이터 붙여넣기</h3>
              </div>
              <button onClick={() => setClipboardModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              엑셀에서 셀을 복사한 후 아래 박스에 <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Ctrl+V</kbd>로 붙여넣고 확인을 누르세요.
            </p>
            <textarea
              autoFocus
              value={clipboardText}
              onChange={(e) => setClipboardText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) confirmClipboardModal() }}
              className="w-full h-40 border border-gray-200 rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="여기에 Ctrl+V로 붙여넣기..."
            />
            <div className="flex gap-2">
              <button onClick={() => setClipboardModal(false)} className="btn-secondary flex-1">취소</button>
              <button onClick={confirmClipboardModal} disabled={!clipboardText.trim()} className="btn-primary flex-1 disabled:opacity-40">
                확인 (Ctrl+Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 툴바 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Save className="w-3.5 h-3.5 text-green-500" />
          <span>필수 항목 입력 + 주소 확인 시 자동 저장 (지역 외도 저장 허용) | Ctrl+V 붙여넣기</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 한글 입력 안내 뱃지 */}
          <div className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full">
            <Keyboard className="w-3 h-3" />
            <span>파란 열 = 한글 입력</span>
          </div>

          {/* 전체 주소 확인 버튼 — 미검증 행이 있을 때 강조 표시 */}
          {(() => {
            const unvalidated = rows.filter(r =>
              r.delivery_address && r.delivery_address.length >= 5 &&
              r.addrStatus !== 'valid' && !r.savedOrderId
            ).length
            return (
              <button
                type="button"
                onClick={validateAllAddresses}
                disabled={validatingAll || unvalidated === 0}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 disabled:opacity-50
                  ${unvalidated > 0
                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
                    : 'border border-gray-200 text-gray-400 bg-white'}`}
              >
                {validatingAll
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ShieldCheck className="w-3.5 h-3.5" />}
                {validatingAll
                  ? '주소 확인 중…'
                  : unvalidated > 0
                    ? `전체 주소 확인 (${unvalidated}건)`
                    : '주소 확인 완료'}
              </button>
            )
          })()}

          <button
            type="button"
            onClick={handleClipboardPaste}
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 px-3 py-1.5 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors shrink-0"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            클립보드 붙여넣기
          </button>
        </div>
      </div>

      {/* 스프레드시트 그리드 */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 28 }} />
            {COL_KEYS.map((k) => (
              COL_WIDTHS[k] ? <col key={k} style={{ width: COL_WIDTHS[k] }} /> : <col key={k} />
            ))}
            <col style={{ width: 28 }} />
          </colgroup>

          <thead className="sticky top-0 z-10 bg-gradient-to-b from-gray-100 to-gray-50 border-b-2 border-gray-200 shadow-sm">
            <tr>
              <th className="text-center text-gray-400 font-normal text-xs py-2.5 border-r border-gray-200">#</th>
              {COL_KEYS.map((k) => {
                const meta = CELL_META[k]
                const isKo = meta?.lang === 'ko'
                return (
                  <th
                    key={k}
                    className={`text-left px-2 py-2 text-xs font-semibold border-r border-gray-200 whitespace-nowrap overflow-hidden
                      ${isKo ? 'text-blue-700 bg-blue-50/60' : 'text-gray-600'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{COL_LABELS[k]}</span>
                      {meta && (
                        <span className={`text-[8px] font-black px-1.5 py-px rounded border leading-none ${meta.hintColor} ${meta.hintBg}`}>
                          {meta.hint}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
              <th />
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => {
              if (!cellRefs.current[rowIdx]) cellRefs.current[rowIdx] = []
              const isOutOfZone = row.dongStatus === 'out-of-zone'

              return (
                <tr
                  key={row._id}
                  className={`border-b border-gray-100 ${
                    row.savedOrderId ? 'bg-green-50' :
                    isOutOfZone ? 'bg-orange-50 border-l-2 border-l-orange-300' :
                    row.submitStatus === 'error' ? 'bg-red-50' : 'hover:bg-brand-50/30'
                  }`}
                >
                  <td className="text-center text-xs text-gray-400 border-r border-gray-200 py-0.5 select-none">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{rowIdx + 1}</span>
                      <RowStatusDot row={row} onRetry={() =>
                        setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, submitStatus: undefined } : r))
                      } />
                    </div>
                  </td>

                  {COL_KEYS.map((key, colIdx) => {
                    const isAddr = key === 'delivery_address'
                    const isDetail = key === 'detail_address'
                    const isDong = key === 'dong'
                    const isQty = key === 'quantity'
                    const isPhone = key === 'customer_phone'
                    const isCode = key === 'item_code'
                    const meta = CELL_META[key]
                    const isKoField = meta?.lang === 'ko'
                    const isWarn = warnCell?.row === rowIdx && warnCell?.col === colIdx

                    const cellCls = `
                      w-full h-full px-1.5 py-1 text-sm bg-transparent outline-none
                      focus:ring-2 focus:ring-inset
                      ${isWarn ? 'ring-2 ring-red-400 ring-inset' : isKoField ? 'focus:ring-blue-400' : 'focus:ring-brand-400'}
                      ${isAddr && row.addrStatus === 'valid' ? 'text-green-700' : ''}
                      ${isAddr && row.addrStatus === 'invalid' ? 'text-red-600' : ''}
                    `

                    const cellKey = `${rowIdx}-${colIdx}`

                    return (
                      <td
                        key={key}
                        className={`border-r border-gray-100 p-0 relative group
                          ${isKoField && !isDong ? 'bg-blue-50/20' : ''}`}
                      >
                        {/* 포커스 배지 — CSS group-focus-within 으로 플리커 없이 표시 */}
                        {meta && (
                          <span className={`absolute top-0 right-0 z-20 text-[8px] font-black px-1.5 py-px rounded-bl leading-none pointer-events-none select-none border invisible group-focus-within:visible ${meta.hintColor} ${meta.hintBg}`}>
                            {meta.hint}
                          </span>
                        )}
                        {/* IME 경고 툴팁 */}
                        {isWarn && (
                          <div className="absolute -top-8 left-0 z-50 bg-red-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none flex items-center gap-1">
                            <Keyboard className="w-3 h-3" />
                            <span>한/영 키 → 한글 전환</span>
                          </div>
                        )}

                        {isAddr ? (
                          <div className="flex items-center gap-0.5 pr-1">
                            <input
                              ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                              className={cellCls + ' flex-1'}
                              value={row.delivery_address}
                              lang="ko"
                              autoComplete="off"
                              onCompositionStart={() => { composingRef.current[cellKey] = true }}
                              onCompositionEnd={() => { composingRef.current[cellKey] = false }}
                              onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                              onChange={(e) => {
                                checkKoreanIME(e.target.value, rowIdx, colIdx, 'delivery_address')
                                handleAddressChange(rowIdx, e.target.value)
                              }}
                              onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                              onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                              placeholder="주소 입력"
                            />
                            <AddrIcon status={row.addrStatus} />
                            {row.matchStatus === 'needs_review' && (
                              <span
                                className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded"
                                title="주소는 매칭됐지만 좌표나 부번 확인이 필요합니다."
                              >
                                확인
                              </span>
                            )}
                            {row.matchStatus === 'matched' && row.coordSource && (
                              <span
                                className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded"
                                title={`표준주소 매칭 완료 · 좌표출처: ${row.coordSource}`}
                              >
                                표준
                              </span>
                            )}
                          </div>
                        ) : isDetail ? (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            lang="ko"
                            autoComplete="off"
                            className={cellCls}
                            value={row.detail_address}
                            onCompositionStart={() => { composingRef.current[cellKey] = true }}
                            onCompositionEnd={() => { composingRef.current[cellKey] = false }}
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                            onChange={(e) => {
                              checkKoreanIME(e.target.value, rowIdx, colIdx, 'detail_address')
                              updateCell(rowIdx, 'detail_address', e.target.value)
                              triggerPartialUpdate(rowIdx, 'detail_address')
                            }}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                            placeholder="동·호·층"
                          />
                        ) : isDong ? (
                          <div className="flex flex-col items-center justify-center px-1 py-1 gap-0.5 min-h-[36px]">
                            {!row.delivery_address ? (
                              <span className="text-[9px] text-gray-300 text-center leading-tight">주소<br/>입력 후</span>
                            ) : row.addrStatus === 'validating' ? (
                              <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                            ) : row.dongStatus === 'out-of-zone' ? (
                              <span
                                className="text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-300 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-full justify-center"
                                title="배송 대상 18개 동 외 — 저장은 허용됩니다"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                                {row.dong || '지역 외'}
                              </span>
                            ) : (row.dong && row.dongStatus === 'valid') ? (
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
                            inputMode="numeric"
                            lang="en"
                            autoComplete="off"
                            className={cellCls + ' text-center'}
                            value={row.quantity}
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                            onChange={(e) => {
                              updateCell(rowIdx, 'quantity', Number(e.target.value))
                              triggerPartialUpdate(rowIdx, 'quantity')
                            }}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                          />
                        ) : isPhone ? (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            type="tel"
                            inputMode="tel"
                            lang="en"
                            autoComplete="off"
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
                            readOnly
                            tabIndex={-1}
                            autoComplete="off"
                            className={cellCls + ' text-center font-mono text-gray-500 bg-gray-50 cursor-default'}
                            value={row.savedOrderId && row.item_code ? row.item_code : '자동'}
                            title="물품 코드는 저장 시 서버가 전역 일련번호(GA1-####)로 자동 부여합니다"
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx }; focusCell(rowIdx, nextCol(colIdx, 1)) }}
                          />
                        ) : (
                          <input
                            ref={(el) => { cellRefs.current[rowIdx][colIdx] = el }}
                            lang={meta?.lang ?? 'ko'}
                            autoComplete="off"
                            className={cellCls}
                            value={String(row[key] ?? '')}
                            onCompositionStart={() => { composingRef.current[cellKey] = true }}
                            onCompositionEnd={() => { composingRef.current[cellKey] = false }}
                            onFocus={() => { activeCell.current = { row: rowIdx, col: colIdx } }}
                            onChange={(e) => {
                              checkKoreanIME(e.target.value, rowIdx, colIdx, key)
                              updateCell(rowIdx, key, e.target.value)
                              if (key === 'items_desc' || key === 'request') {
                                triggerPartialUpdate(rowIdx, key as 'items_desc' | 'request')
                              }
                            }}
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
        <div className="flex items-start gap-3 bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="font-bold text-red-700">
              ⛔ 서비스 지역 외 주소 {rows.filter((r) => r.dongStatus === 'out-of-zone' && !r.dongOverride).length}건
            </p>
            <p className="text-xs mt-0.5 text-red-600">
              감지된 동: {[...new Set(rows.filter((r) => r.dongStatus === 'out-of-zone' && !r.dongOverride).map((r) => r.dong).filter(Boolean))].join(', ')}
              &nbsp;— 배송 가능 지역: {DONG_LIST.join('·')}
            </p>
            {isAdmin && <p className="text-xs mt-1 text-amber-700 font-medium">배송동 열의 "강제등록"을 눌러 허용할 수 있습니다.</p>}
          </div>
        </div>
      )}

      {/* 행 추가 */}
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
