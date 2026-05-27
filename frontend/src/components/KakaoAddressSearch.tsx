import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, MapPin, Loader2, X } from 'lucide-react'
import api from '@/lib/api'

export interface AddressResult {
  address_name: string
  road_address?: string | null
  jibun_address?: string | null
  dong_name?: string | null
  lat?: number | null
  lng?: number | null
}

interface DropdownPos {
  top: number
  left: number
  width: number
}

interface Props {
  value: string
  onChange: (address: string) => void
  onSelect?: (result: AddressResult) => void
  placeholder?: string
  className?: string
}

export function KakaoAddressSearch({ value, onChange, onSelect, placeholder, className }: Props) {
  const [inputValue, setInputValue] = useState(value)
  const [results, setResults] = useState<AddressResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevValue = useRef(value)

  // 외부 value 변경 시 동기화 (사용자 타이핑과 충돌 방지)
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value
      setInputValue(value)
    }
  }, [value])

  // 드롭다운 위치 계산 (fixed positioning — overflow:hidden 무관하게 표시)
  const calcPos = useCallback(() => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useEffect(() => {
    if (open) calcPos()
  }, [open, calcPos])

  // scroll/resize 시 드롭다운 위치 재계산
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', calcPos, true)
    window.addEventListener('resize', calcPos)
    return () => {
      window.removeEventListener('scroll', calcPos, true)
      window.removeEventListener('resize', calcPos)
    }
  }, [open, calcPos])

  // 드롭다운 외부 클릭 닫기 (Portal로 렌더링되므로 document 레벨에서 처리)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        inputRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const res = await api.get('/addresses/search', { params: { query: q.trim(), limit: 5 } })
      const data: AddressResult[] = res.data ?? []
      setResults(data)
      setOpen(data.length > 0)
    } catch {
      setResults([])
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInput = (val: string) => {
    setInputValue(val)
    onChange(val)
    prevValue.current = val
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (result: AddressResult) => {
    const addr = result.road_address || result.address_name
    setInputValue(addr)
    onChange(addr)
    prevValue.current = addr
    onSelect?.(result)
    setOpen(false)
    setResults([])
  }

  const handleClear = () => {
    setInputValue('')
    onChange('')
    prevValue.current = ''
    setResults([])
    setOpen(false)
  }

  const dropdown = open && dropdownPos && results.length > 0 && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 9999,
      }}
      className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">표준 주소 선택</span>
        <span className="text-xs text-gray-400">{results.length}건</span>
      </div>
      {results.map((r, i) => {
        const primary = r.road_address || r.address_name
        const secondary = r.road_address && r.jibun_address && r.road_address !== r.jibun_address
          ? r.jibun_address
          : null
        return (
          <button
            key={i}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleSelect(r) }}
            className="w-full px-4 py-3 text-left hover:bg-brand-50 border-b border-gray-100 last:border-0 transition-colors group"
          >
            <div className="flex items-start gap-2.5">
              <MapPin className="w-3.5 h-3.5 text-brand-400 mt-0.5 shrink-0 group-hover:text-brand-600 transition-colors" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {primary}
                  </span>
                  {r.dong_name && (
                    <span className="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full shrink-0 font-medium">
                      {r.dong_name}
                    </span>
                  )}
                </div>
                {secondary && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{secondary}</p>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>,
    document.body
  )

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => {
            if (inputValue.trim().length >= 2 && results.length > 0) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={placeholder ?? '도로명·지번·건물명 입력 후 목록 선택'}
          className="input pl-9 pr-8 w-full"
          autoComplete="off"
        />
        {loading ? (
          <Loader2 className="absolute right-3 w-4 h-4 text-gray-400 animate-spin pointer-events-none" />
        ) : inputValue ? (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleClear() }}
            className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {dropdown}
    </div>
  )
}
