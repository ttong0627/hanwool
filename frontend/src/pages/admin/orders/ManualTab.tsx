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
import { latinToHangul, hasLatinLetter } from '@/lib/hangul'

const AUTO_HANGUL_KEY = 'hanwool_auto_hangul'

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
  if (row.submitStatus === 'pending') return <Loader2 className="w-3 h-3 text-orange-400 animate-spin" />
  if (row.submitStatus === 'error') return (
    <button title={`오류: ${row.submitError}\n클릭하면 재시도`} onClick={onRetry}
      className="text-red-400 text-xs hover:text-red-600 font-bold cursor-pointer leading-none">!</button>
  )
  if (row.savedOrderId) return <span title="저장 완료" className="text-green-500 text-xs">✓</span>
  return <span className="text-gray-300 text-xs">●</span>
}

const addrTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function rowValidationError(row: StagingRow): string | null {
  if (!row.customer_name.trim()) return '성명을 입력하세요.'
  if (!row.customer_phone.trim()) return '전화번호를 입력하세요.'
  if (!row.delivery_address.trim()) return '주소를 입력하세요.'
  if (row.delivery_address.trim().length < 5) return '주소를 5자 이상 입력하세요.'
  if (!row.dong.trim()) return '배송동을 확인하세요.'
  if (row.addrStatus === 'idle') return '주소 확인이 필요합니다.'
  if (row.addrStatus === 'validating') return '주소 확인이 끝날 때까지 기다려 주세요.'
  if (row.dongStatus === 'out-of-zone' && !row.dongOverride) {
    return '서비스 지역 외 주소입니다. 관리자가 강제등록을 승인해야 합니다.'
  }
  if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 999) {
    return '수량은 1~999 사이의 숫자로 입력하세요.'
  }
  return null
}

function apiErrorMessage(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const value = item as { loc?: unknown[]; msg?: string }
        const field = Array.isArray(value.loc) && value.loc.length ? value.loc[value.loc.length - 1] : null
        return value.msg ? (field ? String(field) + ': ' : '') + value.msg : null
      })
      .filter(Boolean)
    if (messages.length) return messages.join(', ')
  }
  return '저장에 실패했습니다. 입력값을 확인한 뒤 다시 저장해 주세요.'
}

function rowWriteSignature(row: StagingRow): string {
  return JSON.stringify([
    row.customer_name,
    row.customer_phone,
    row.addrRefined ?? row.delivery_address,
    row.detail_address,
    row.dong,
    row.items_desc,
    row.quantity,
    row.request,
    row.lat,
    row.lng,
    Boolean(row.dongOverride),
  ])
}

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
  const roleLabel =
    user?.role === 'super_admin' ? '최고관리자'
    : user?.role === 'admin' ? '관리자'
    : user?.role === 'receiver' ? '접수담당'
    : '권한 없음'
  const qc = useQueryClient()

  const [rows, setRows] = useState<StagingRow[]>(() => [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const savingRowIdsRef = useRef(new Set<string>())
  const cellRefs = useRef<CellRef[][]>([])
  const activeCell = useRef<{ row: number; col: number }>({ row: 0, col: 0 })
  // 지금 손대고 있는 행 — 이 행은 입력이 끝날 때까지 자동저장하지 않는다.
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>()

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

  // ── 영타 자동 한글 변환 ────────────────────────────────────────────────────
  // 브라우저는 IME(한/영)를 강제로 켤 수 없다. 전화번호·수량 칸에서 크롬이 IME를
  // 영문으로 내려버리므로, 한글 칸에 들어온 영문을 두벌식 매핑으로 되돌린다.
  const [autoHangul, setAutoHangul] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_HANGUL_KEY) !== 'off' } catch { return true }
  })

  const toggleAutoHangul = useCallback(() => {
    setAutoHangul(prev => {
      const next = !prev
      try { localStorage.setItem(AUTO_HANGUL_KEY, next ? 'on' : 'off') } catch { /* 저장 실패는 무시 */ }
      return next
    })
  }, [])

  // ── 칸 단위 영문 고정 ──────────────────────────────────────────────────────
  // 한글이 기본이지만 담당자가 영문을 택한 칸(한/영 키·되돌리기)은 그대로 둔다.
  // 키는 행 _id 기반 — 행을 지워 인덱스가 밀려도 따라가지 않는다.
  const [enCells, setEnCells] = useState<Record<string, true>>({})
  // 방금 한글로 바꾼 칸의 원문 — Esc 또는 되돌리기 배지로 복구한다.
  const [revertInfo, setRevertInfo] = useState<{ cellId: string; prev: string } | null>(null)
  const revertTimer = useRef<ReturnType<typeof setTimeout>>()

  /** 되돌리기 안내를 띄운다. 6초 뒤 스스로 사라져 화면을 가리지 않는다. */
  const offerRevert = useCallback((cellId: string, prev: string) => {
    setRevertInfo({ cellId, prev })
    clearTimeout(revertTimer.current)
    revertTimer.current = setTimeout(() => setRevertInfo(null), 6000)
  }, [])

  const cellIdOf = useCallback((rowIdx: number, key: ColKey) => {
    const id = rowsRef.current[rowIdx]?._id ?? String(rowIdx)
    return `${id}:${key}`
  }, [])

  const markEnglishCell = useCallback((cellId: string) => {
    setEnCells(prev => (prev[cellId] ? prev : { ...prev, [cellId]: true }))
  }, [])

  const checkKoreanIME = useCallback((value: string, rowIdx: number, colIdx: number, key: ColKey) => {
    if (autoHangul) return // 자동 변환이 켜져 있으면 경고할 일이 없다
    const meta = CELL_META[key]
    if (meta?.lang !== 'ko') return
    const cellKey = `${rowIdx}-${colIdx}`
    if (composingRef.current[cellKey]) return // IME 조합 중이면 스킵
    if (LATIN_RE.test(value) && !HANGUL_RE.test(value.slice(-1))) {
      triggerIMEWarn(rowIdx, colIdx)
    }
  }, [triggerIMEWarn, autoHangul])

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
      // 저장 완료 행을 수정하면 동일 client_row_id로 다시 저장해 기존 주문을 갱신한다.
      savedOrderId: undefined, submitStatus: undefined, submitError: undefined,
    } : r))
  }, [])

  const deleteRow = useCallback((rowIdx: number) => {
    setRows(prev => prev.filter((_, i) => i !== rowIdx))
  }, [])

  // ── 자동저장 ──────────────────────────────────────────────────────────────
  const autoSaveRow = useCallback(async (rowId: string, showValidationError = false) => {
    const row = rowsRef.current.find((item) => item._id === rowId)
    if (!row) return
    if (row.savedOrderId) return
    const validationError = rowValidationError(row)
    if (validationError) {
      if (showValidationError) {
        setRows(prev => prev.map((item) =>
          item._id === rowId ? { ...item, submitStatus: 'error', submitError: validationError } : item
        ))
      }
      return
    }
    if (savingRowIdsRef.current.has(rowId)) return
    savingRowIdsRef.current.add(rowId)

    setRows(prev => prev.map((item) =>
      item._id === rowId ? { ...item, submitStatus: 'pending', submitError: undefined } : item
    ))
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
        dong_override: Boolean(row.dongOverride),
        // 행 멱등키: 같은 행을 다시 저장(오타/영문 수정)해도 중복 생성 대신 기존 주문 갱신
        client_row_id: row._id,
      }, { timeout: 15_000 })
      const savedId: number = res.data.id
      setRows(prev => prev.map((item) =>
        item._id !== rowId ? item :
          rowWriteSignature(item) !== rowWriteSignature(row)
            ? { ...item, savedOrderId: undefined, submitStatus: undefined, submitError: undefined }
            : { ...item, savedOrderId: savedId, item_code: res.data.item_code ?? item.item_code, submitStatus: 'success', submitError: undefined }
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
      const msg = apiErrorMessage(err)
      setRows(prev => prev.map((item) =>
        item._id === rowId ? { ...item, submitStatus: 'error', submitError: msg } : item
      ))
    } finally {
      savingRowIdsRef.current.delete(rowId)
    }
  }, []) // rowsRef.current로 읽으므로 rows 의존성 불필요

  useEffect(() => {
    rows.forEach((row) => {
      if (row.savedOrderId) return
      // 손대고 있는 행은 저장하지 않는다 — 입력 도중에 저장이 끼어들어 끊기는 것을 막는다.
      if (row._id === editingRowId) { clearTimeout(saveTimers[row._id]); return }
      const isReady =
        row.customer_name && row.customer_phone && row.delivery_address && row.dong &&
        (row.addrStatus === 'valid' || row.addrStatus === 'invalid')
      if (!isReady) return
      if (row.submitStatus === 'pending' || row.submitStatus === 'success' || row.submitStatus === 'error') return
      clearTimeout(saveTimers[row._id])
      saveTimers[row._id] = setTimeout(() => void autoSaveRow(row._id), 600)
    })
  }, [rows, editingRowId]) // eslint-disable-line

  // ── 주소 변경 ─────────────────────────────────────────────────────────────
  // 타이핑 중에는 값을 손대지 않는다. 정규화(앞머리 제거·trim)와 주소 확인은
  // 칸에서 손을 뗄 때(blur/Enter/Tab)만 한다 — 입력 중 캐럿이 끝으로 튀거나
  // 확인 요청이 끼어들어 입력이 끊기는 것을 막는다.
  const handleAddressChange = useCallback((rowIdx: number, rawValue: string) => {
    const rowId = rowsRef.current[rowIdx]?._id ?? String(rowIdx)
    clearTimeout(addrTimers[rowId])
    const detected = detectDong(rawValue)
    setRows(prev => prev.map((r, i) => i === rowIdx ? {
      ...r,
      delivery_address: rawValue,
      savedOrderId: undefined, submitStatus: undefined, submitError: undefined,
      addrStatus: 'idle',
      dongOverride: false,
      dongStatus: detected ? (VALID_DONGS.has(detected) ? 'valid' : 'out-of-zone') : undefined,
      dong: detected ?? r.dong,
    } : r))
  }, [])

  /** 한 행의 주소를 서버에 확인한다. 칸에서 손을 뗄 때만 호출된다. */
  const resolveAddressRow = useCallback(async (rowIdx: number, overrideAddress?: string) => {
    const current = rowsRef.current[rowIdx]
    if (!current) return
    const value = normalizeAddress(overrideAddress ?? current.delivery_address)
    const rowId = current._id
    clearTimeout(addrTimers[rowId])

    if (value !== current.delivery_address) {
      setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, delivery_address: value } : r))
    }
    const changed = overrideAddress !== undefined && overrideAddress !== current.delivery_address
    if (!value || value.length < 5) {
      const detected = detectDong(value)
      setRows(prev => prev.map((r, i) => i === rowIdx ? {
        ...r, addrStatus: 'idle', dong: detected ?? r.dong,
        dongStatus: detected ? (VALID_DONGS.has(detected) ? 'valid' : 'out-of-zone') : undefined,
      } : r))
      return
    }
    if (!changed && current.addrStatus === 'valid' && current.addrRefined) return // 이미 확인된 주소는 재조회하지 않는다

    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, addrStatus: 'validating' } : r))
    try {
      const res = await api.post('/addresses/resolve', { address: value }, { timeout: 15_000 })
      const {
        lat, lng, standard_road_address, legal_emd, service_dong,
        match_status, match_score, coord_source,
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
        addrStatus, lat, lng,
        addrRefined: displayAddress,
        standardRoadAddress: standard_road_address,
        legalEmd: legal_emd,
        serviceDong: service_dong,
        matchStatus: match_status,
        matchScore: match_score,
        coordSource: coord_source,
        dongStatus, dongOverride: false,
        dong: refinedDong ?? anyDong ?? r.dong,
        savedOrderId: undefined, submitStatus: undefined,
      } : r))
    } catch {
      const fallbackDong = detectDong(value)
      const fallbackDongStatus: DongStatus | undefined = fallbackDong
        ? (VALID_DONGS.has(fallbackDong) ? 'valid' : 'out-of-zone') : undefined
      setRows(prev => prev.map((r, i) => i === rowIdx ? {
        ...r, addrStatus: 'invalid' as AddrStatus,
        dong: fallbackDong ?? r.dong, dongStatus: fallbackDongStatus,
      } : r))
    }
  }, [])

  /**
   * 칸에서 손을 뗄 때 한 번만 보정한다.
   * 1) 한글 칸에 영문이 남아 있으면 두벌식으로 되돌린다(영문 고정 칸은 제외)
   * 2) 주소 칸이면 정규화 후 서버 확인을 실행한다
   * 타이핑 도중에는 아무것도 하지 않으므로 캐럿이 끝으로 튀지 않는다.
   */
  const commitCell = useCallback((rowIdx: number, key: ColKey) => {
    const row = rowsRef.current[rowIdx]
    if (!row) return
    const cellId = `${row._id}:${key}`
    const raw = String(row[key] ?? '')
    let next = raw

    if (CELL_META[key]?.lang === 'ko' && autoHangul && !enCells[cellId] && hasLatinLetter(raw)) {
      const converted = latinToHangul(raw)
      if (converted !== raw) {
        next = converted
        offerRevert(cellId, raw)
      }
    }

    if (key === 'customer_phone') {
      const formatted = formatPhone(raw)
      if (formatted !== raw) updateCell(rowIdx, key, formatted)
      return
    }

    if (key === 'delivery_address') {
      if (next !== raw) handleAddressChange(rowIdx, next)
      void resolveAddressRow(rowIdx, next)
      checkKoreanIME(next, rowIdx, COL_KEYS.indexOf(key), key)
      return
    }
    if (next !== raw) updateCell(rowIdx, key, next)
    checkKoreanIME(next, rowIdx, COL_KEYS.indexOf(key), key)
  }, [autoHangul, enCells, handleAddressChange, resolveAddressRow, updateCell, checkKoreanIME, offerRevert])

  /** 방금 한글로 바뀐 칸을 원래 영문으로 되돌리고, 그 칸을 영문 고정으로 표시한다. */
  const revertCell = useCallback((rowIdx: number, key: ColKey): boolean => {
    const row = rowsRef.current[rowIdx]
    if (!row) return false
    const cellId = `${row._id}:${key}`
    if (!revertInfo || revertInfo.cellId !== cellId) return false
    markEnglishCell(cellId)
    if (key === 'delivery_address') handleAddressChange(rowIdx, revertInfo.prev)
    else updateCell(rowIdx, key, revertInfo.prev)
    clearTimeout(revertTimer.current)
    setRevertInfo(null)
    return true
  }, [revertInfo, markEnglishCell, handleAddressChange, updateCell])

  /**
   * 저장 버튼 — 주소 확인이 아직이면 먼저 확인하고 저장한다.
   * (확인을 칸 이탈 시점으로 미뤘기 때문에, 버튼을 바로 눌러도 막히지 않아야 한다.)
   */
  const saveRowNow = useCallback(async (rowId: string) => {
    clearTimeout(saveTimers[rowId])
    const rowIdx = rowsRef.current.findIndex((item) => item._id === rowId)
    if (rowIdx >= 0) {
      const row = rowsRef.current[rowIdx]
      if (row.delivery_address && row.addrStatus !== 'valid' && row.addrStatus !== 'invalid') {
        await resolveAddressRow(rowIdx)
        // setRows 반영(리렌더) 후에 rowsRef가 최신이 된다. 한 틱 양보한 뒤 저장한다.
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    await autoSaveRow(rowId, true)
  }, [autoSaveRow, resolveAddressRow])

  /** 칸 진입 — 이 행을 "편집 중"으로 잡아 자동저장을 보류시킨다. */
  const onCellFocus = useCallback((rowIdx: number, colIdx: number) => {
    clearTimeout(leaveTimer.current)
    activeCell.current = { row: rowIdx, col: colIdx }
    const id = rowsRef.current[rowIdx]?._id ?? null
    setEditingRowId(id)
  }, [])

  /** 칸 이탈 — 여기서만 값을 보정하고, 잠시 뒤 편집 표시를 푼다(같은 행 안 이동은 유지). */
  const onCellBlur = useCallback((rowIdx: number, key: ColKey) => {
    commitCell(rowIdx, key)
    clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(() => setEditingRowId(null), 200)
  }, [commitCell])

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
          const res = await api.post('/addresses/resolve', { address: value }, { timeout: 15_000 })
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
            dongStatus, dongOverride: false,
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
      const colKey = COL_KEYS[colIdx]

      // 한/영 키 — 브라우저가 IME를 대신 켜 줄 수 없으므로, 이 칸의 영문 고정을 토글한다.
      if (e.key === 'HangulMode' || e.code === 'Lang1' || e.code === 'Lang2') {
        const cellId = cellIdOf(rowIdx, colKey)
        setEnCells(prev => {
          const next = { ...prev }
          if (next[cellId]) delete next[cellId]
          else next[cellId] = true
          return next
        })
        return
      }

      switch (e.key) {
        case 'Escape': {
          // 방금 한글로 바뀐 칸이면 원래 영문으로 되돌리고, 그 칸은 영문 고정이 된다.
          if (revertCell(rowIdx, colKey)) e.preventDefault()
          break
        }
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
    [addRow, focusCell, deleteRow, revertCell, cellIdOf]
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
            ...newRows[rowIdx], delivery_address: normalized, dongStatus, dongOverride: false,
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

  // IME 경고 토스트 — 화면 우상단 고정
  const ImeWarnToast = koreanWarn && (
    <div className="fixed top-16 right-4 z-[9999] flex items-center gap-3 bg-red-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl">
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
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <Save className="w-3.5 h-3.5 text-green-500" />
          <span>칸을 벗어나면 주소 확인 · 행을 벗어나면 자동 저장 (입력 중에는 끼어들지 않습니다) | Ctrl+V 붙여넣기</span>
          <span
            title={isAdmin
              ? '접수 권한이 있고, 서비스 지역 외 주소도 강제등록으로 승인할 수 있습니다.'
              : '접수 권한이 있습니다. 다만 서비스 지역 외 주소는 관리자가 강제등록을 승인해야 저장됩니다.'}
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border
              ${isAdmin
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-slate-50 border-slate-300 text-slate-600'}`}
          >
            <ShieldCheck className="w-3 h-3" />
            {roleLabel} · 접수 가능 · 지역 외 {isAdmin ? '강제등록 가능' : '관리자 승인 필요'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 영타 자동 한글 변환 토글 — 파란 열(한글 칸)에만 적용 */}
          <button
            type="button"
            onClick={toggleAutoHangul}
            title={autoHangul
              ? '파란 열(한글 칸)은 칸에서 손을 뗄 때만 영문을 한글로 바꿔 줍니다.\n영문 그대로 두려면 그 칸에서 Esc — 그 칸은 이후 영문으로 고정됩니다.\n한/영 키로도 칸별 영문 고정을 켜고 끌 수 있습니다.'
              : '자동 변환이 꺼져 있습니다. 입력한 그대로 저장됩니다.'}
            className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors shrink-0
              ${autoHangul
                ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          >
            <Keyboard className="w-3 h-3" />
            <span>{autoHangul ? '자동 한글 변환 ON' : '자동 한글 변환 OFF'}</span>
          </button>

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
                className={`flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors duration-300 shrink-0 disabled:opacity-50 min-w-[150px]
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
            <col style={{ width: 64 }} />
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
              <th className="text-center text-gray-500 font-semibold text-xs">저장</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => {
              if (!cellRefs.current[rowIdx]) cellRefs.current[rowIdx] = []
              const isOutOfZone = row.dongStatus === 'out-of-zone'

              return (
                <tr
                  key={row._id}
                  className={`border-b border-gray-100 transition-colors duration-500 ${
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
                    const cellId = `${row._id}:${key}`
                    const isEnLocked = isKoField && Boolean(enCells[cellId])
                    const showRevert = revertInfo?.cellId === cellId

                    return (
                      <td
                        key={key}
                        className={`border-r border-gray-100 p-0 relative group
                          ${isKoField && !isDong ? 'bg-blue-50/20' : ''}`}
                      >
                        {/* 포커스 배지 — CSS group-focus-within 으로 플리커 없이 표시 */}
                        {meta && (
                          <span className={`absolute top-0 right-0 z-20 text-[8px] font-black px-1.5 py-px rounded-bl leading-none pointer-events-none select-none border invisible group-focus-within:visible ${
                            isEnLocked
                              ? 'text-amber-700 bg-amber-100 border-amber-300'
                              : `${meta.hintColor} ${meta.hintBg}`}`}>
                            {isEnLocked ? '영문' : meta.hint}
                          </span>
                        )}

                        {/* 한글로 바뀐 직후 — 되돌리면 이 칸은 영문으로 고정된다 */}
                        {showRevert && (
                          <button
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => { e.preventDefault(); revertCell(rowIdx, key) }}
                            title="한글 변환을 취소하고 원래 영문으로 되돌립니다. 이 칸은 이후 영문으로 고정됩니다. (Esc)"
                            className="absolute -top-7 left-0 z-50 flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg whitespace-nowrap"
                          >
                            <Keyboard className="w-3 h-3" />
                            영문 유지 (Esc)
                          </button>
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
                              className={cellCls + ' flex-1 min-w-0'}
                              value={row.delivery_address}
                              lang="ko"
                              autoComplete="off"
                              onCompositionStart={() => { composingRef.current[cellKey] = true }}
                              onCompositionEnd={() => { composingRef.current[cellKey] = false }}
                              onFocus={() => onCellFocus(rowIdx, colIdx)}
                              onBlur={() => onCellBlur(rowIdx, 'delivery_address')}
                              onChange={(e) => handleAddressChange(rowIdx, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                              onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                              placeholder="주소 입력"
                            />
                            {/* 상태 표시 자리 — 폭을 미리 잡아 둔다.
                                확인 결과가 도착해도 입력창이 좁아지며 글자가 밀리지 않게 하기 위함. */}
                            <div className="w-[54px] shrink-0 flex items-center justify-end gap-0.5">
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
                            onFocus={() => onCellFocus(rowIdx, colIdx)}
                            onBlur={() => onCellBlur(rowIdx, 'detail_address')}
                            onChange={(e) => updateCell(rowIdx, 'detail_address', e.target.value)}
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
                              row.dongOverride ? (
                                <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1 py-0.5 rounded text-center">
                                  강제승인<br/>{row.dong || '지역 외'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!isAdmin || row.submitStatus === 'pending'}
                                  onClick={() => setRows(prev => prev.map((item) =>
                                    item._id === row._id
                                      ? { ...item, dongOverride: true, savedOrderId: undefined, submitStatus: undefined, submitError: undefined }
                                      : item
                                  ))}
                                  className="text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-300 px-1 py-0.5 rounded w-full"
                                  title="서비스 지역 외 주소를 관리자 권한으로 강제등록"
                                >
                                  강제등록<br/>{row.dong || '지역 외'}
                                </button>
                              )
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
                            onFocus={() => onCellFocus(rowIdx, colIdx)}
                            onBlur={() => onCellBlur(rowIdx, 'quantity')}
                            onChange={(e) => {
                              updateCell(rowIdx, 'quantity', Number(e.target.value))
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
                            onFocus={() => onCellFocus(rowIdx, colIdx)}
                            onBlur={() => onCellBlur(rowIdx, 'customer_phone')}
                            onChange={(e) => {
                              // 캐럿이 맨 끝일 때만 하이픈을 넣는다. 중간을 고치는 중에는
                              // 값을 바꾸지 않아야 커서가 끝으로 튀지 않는다(마무리는 blur에서).
                              const el = e.target
                              const atEnd = el.selectionStart === null || el.selectionStart === el.value.length
                              updateCell(rowIdx, 'customer_phone', atEnd ? formatPhone(el.value) : el.value)
                            }}
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
                            onFocus={() => { onCellFocus(rowIdx, colIdx); focusCell(rowIdx, nextCol(colIdx, 1)) }}
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
                            onFocus={() => onCellFocus(rowIdx, colIdx)}
                            onBlur={() => onCellBlur(rowIdx, key)}
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
                      onClick={() => { void saveRowNow(row._id) }}
                      disabled={Boolean(row.savedOrderId) || row.submitStatus === 'pending'}
                      title={row.savedOrderId ? '저장 완료' : '이 행 저장'}
                      className="p-1 text-brand-600 hover:text-brand-800 disabled:text-green-500 disabled:cursor-default transition-colors"
                    >
                      {row.submitStatus === 'pending'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : row.savedOrderId
                          ? <CheckCircle className="w-3.5 h-3.5" />
                          : <Save className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={row.submitStatus === 'pending'}
                      onClick={() => deleteRow(rowIdx)}
                      className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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

      {rows.some((row) => row.submitStatus === 'error' && row.submitError) && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <p className="font-bold">저장하지 못한 행이 있습니다.</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {rows.map((row, index) => row.submitStatus === 'error' && row.submitError ? (
              <li key={row._id}>{index + 1}행: {row.submitError}</li>
            ) : null)}
          </ul>
        </div>
      )}

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
            <p className="text-xs mt-1 font-medium text-amber-700">
              {isAdmin
                ? '배송동 열의 "강제등록"을 눌러 허용할 수 있습니다.'
                : `${roleLabel} 권한으로는 지역 외 주소를 저장할 수 없습니다. 관리자에게 강제등록 승인을 요청하세요.`}
            </p>
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
