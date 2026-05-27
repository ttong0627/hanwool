import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle, AlertTriangle, X, Table } from 'lucide-react'
import type { StagingRow, ColKey, DongStatus } from './types'
import { EMPTY_ROW, DONG_LIST, EXCEL_FIELD_OPTIONS } from './types'

interface Props {
  onAddRows: (rows: StagingRow[]) => void
}

interface ParsedExcel {
  headers: string[]
  rows: string[][]
}

type Mapping = Record<string, ColKey | ''>

const VALID_DONGS = new Set<string>(DONG_LIST)

function normalizeDong(val: string): string {
  return DONG_LIST.find((d) => val.includes(d)) ?? '경안동'
}

function autoDetectMapping(headers: string[]): Mapping {
  const MAP: Record<string, ColKey> = {
    이름: 'customer_name', 성명: 'customer_name', 고객명: 'customer_name',
    전화: 'customer_phone', 전화번호: 'customer_phone', 핸드폰: 'customer_phone', 연락처: 'customer_phone',
    동: 'dong', 배송동: 'dong', 지역: 'dong',
    주소: 'delivery_address', 배송주소: 'delivery_address', 배달주소: 'delivery_address',
    물품: 'items_desc', 물품내역: 'items_desc', 상품: 'items_desc', 품목: 'items_desc',
    수량: 'quantity', 갯수: 'quantity',
    요청: 'request', 요청사항: 'request', 메모: 'request',
    코드: 'item_code', 구분: 'item_code', 분류: 'item_code',
  }
  const result: Mapping = {}
  headers.forEach((h) => {
    const key = Object.keys(MAP).find((k) => h.includes(k))
    result[h] = key ? MAP[key] : ''
  })
  return result
}

function buildRows(parsed: ParsedExcel, mapping: Mapping): StagingRow[] {
  return parsed.rows
    .filter((r) => r.some((c) => c.trim()))
    .map((row) => {
      const get = (key: ColKey): string => {
        const headerIdx = parsed.headers.findIndex((h) => mapping[h] === key)
        return headerIdx >= 0 ? (row[headerIdx] ?? '').trim() : ''
      }
      const dong = normalizeDong(get('dong'))
      const addrVal = get('delivery_address')
      // 주소에서 동 감지 — 감지 못하면 out-of-zone
      const addrHasDong = DONG_LIST.some((d) => addrVal.includes(d))
      const dongStatus: DongStatus = VALID_DONGS.has(dong) && (get('dong') || addrHasDong) ? 'valid' : 'out-of-zone'

      return {
        ...EMPTY_ROW(),
        customer_name: get('customer_name'),
        customer_phone: get('customer_phone'),
        dong,
        dongStatus,
        delivery_address: addrVal,
        items_desc: get('items_desc'),
        item_code: get('item_code'),
        quantity: Number(get('quantity')) || 1,
        request: get('request'),
      }
    })
    .filter((r) => r.customer_name || r.customer_phone || r.delivery_address)
}

export function ExcelTab({ onAddRows }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedExcel | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState(false)

  const parseFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      setError('xlsx, xls, csv 파일만 지원합니다.')
      return
    }

    setLoading(true)
    setError(null)
    setImported(false)

    try {
      const buf = await file.arrayBuffer()
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (data.length < 2) { setError('데이터가 없습니다. 첫 행이 헤더여야 합니다.'); setLoading(false); return }

      const headers = data[0].map(String)
      const rows = data.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '')))

      setParsed({ headers, rows })
      setMapping(autoDetectMapping(headers))
      setFileName(file.name)
    } catch {
      setError('파일 파싱 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [parseFile])

  const handleImport = () => {
    if (!parsed) return
    const rows = buildRows(parsed, mapping)
    if (rows.length === 0) { setError('매핑된 유효 데이터가 없습니다.'); return }
    onAddRows(rows)
    setImported(true)
  }

  const reset = () => {
    setParsed(null)
    setMapping({})
    setFileName('')
    setImported(false)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const requiredMapped = (['customer_name', 'customer_phone', 'delivery_address'] as ColKey[])
    .every((k) => Object.values(mapping).includes(k))

  // 미리보기용 out-of-zone 건수
  const previewRows = parsed ? buildRows(parsed, mapping) : []
  const outOfZoneCount = previewRows.filter((r) => r.dongStatus === 'out-of-zone').length

  return (
    <div className="space-y-5">
      {!parsed ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-all"
        >
          <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center">
            <FileSpreadsheet className="w-8 h-8 text-brand-600" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-700">엑셀 파일을 드래그하거나 클릭하여 선택</p>
            <p className="text-sm text-gray-400 mt-1">.xlsx · .xls · .csv 지원 | 최대 10MB</p>
          </div>
          <div className="flex items-center gap-2 text-brand-600 font-medium text-sm">
            <Upload className="w-4 h-4" />
            파일 선택
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 파일 정보 헤더 */}
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <div className="flex-1">
              <span className="font-semibold text-green-800">{fileName}</span>
              <span className="text-sm text-green-600 ml-2">· {parsed.rows.length}행 데이터</span>
            </div>
            <button onClick={reset} className="p-1 hover:text-red-600 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 서비스 지역 외 경고 */}
          {outOfZoneCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                서비스 지역 외(경안동·송정동·쌍령동·탄벌동 미해당) 주소 <strong>{outOfZoneCount}건</strong>이 포함됩니다.
                스테이징 등록 후 관리자가 강제 등록 여부를 결정합니다.
              </span>
            </div>
          )}

          {/* 매핑 테이블 */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Table className="w-4 h-4 text-brand-500" />
              컬럼 매핑 — 엑셀 열을 시스템 필드에 연결하세요
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 gap-0 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 border-b border-gray-200">
                <span>엑셀 열 이름</span>
                <span className="text-center"><ArrowRight className="w-3 h-3 inline" /></span>
                <span>시스템 필드</span>
              </div>
              <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {parsed.headers.map((h) => (
                  <div key={h} className="grid grid-cols-3 items-center gap-0 px-4 py-2.5">
                    <span className="text-sm font-medium text-gray-800 bg-gray-100 px-2 py-1 rounded text-center truncate">
                      {h}
                    </span>
                    <ArrowRight className="w-3 h-3 text-gray-300 mx-auto" />
                    <select
                      value={mapping[h] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as ColKey | '' }))}
                      className="input text-sm py-1.5"
                    >
                      {EXCEL_FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {!requiredMapped && (
              <div className="flex items-center gap-2 mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                성명·전화번호·주소는 반드시 매핑해야 합니다.
              </div>
            )}
          </div>

          {/* 미리보기 (상위 3행) */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">미리보기 (상위 3행)</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="text-xs w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                        {h}
                        {mapping[h] && <span className="ml-1 text-brand-500">→ {mapping[h]}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsed.rows.slice(0, 3).map((row, ri) => (
                    <tr key={ri} className="hover:bg-gray-50">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-32 truncate">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 가져오기 버튼 */}
          {imported ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">{buildRows(parsed, mapping).length}건을 스테이징 목록에 추가했습니다.</span>
              {outOfZoneCount > 0 && (
                <span className="text-amber-700 text-sm ml-1">({outOfZoneCount}건 지역 외)</span>
              )}
              <button onClick={reset} className="ml-auto text-sm underline">다른 파일 업로드</button>
            </div>
          ) : (
            <button
              onClick={handleImport}
              disabled={!requiredMapped || loading}
              className="btn-primary w-full py-3 font-bold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {parsed.rows.length}건 스테이징으로 가져오기
              {outOfZoneCount > 0 && <span className="text-xs opacity-80">({outOfZoneCount}건 지역 외 포함)</span>}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!parsed && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          <p className="font-semibold mb-1">권장 엑셀 열 이름 (자동 매핑됨)</p>
          <p className="text-xs text-blue-600">이름 · 전화번호 · 동 · 주소 · 물품내역 · 수량 · 요청사항 · 코드</p>
        </div>
      )}
    </div>
  )
}
