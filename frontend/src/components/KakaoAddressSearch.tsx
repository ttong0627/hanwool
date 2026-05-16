import { useEffect, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

declare global {
  interface Window {
    daum: {
      Postcode: new (opts: { oncomplete: (data: DaumResult) => void }) => { open: () => void }
    }
  }
}

interface DaumResult {
  roadAddress: string
  jibunAddress: string
  buildingName: string
}

interface Props {
  value: string
  onChange: (address: string) => void
  placeholder?: string
  className?: string
}

export function KakaoAddressSearch({ value, onChange, placeholder, className }: Props) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (window.daum?.Postcode) { setReady(true); return }

    const id = 'daum-postcode-sdk'
    let s = document.getElementById(id) as HTMLScriptElement | null

    if (!s) {
      s = document.createElement('script')
      s.id = id
      s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
      s.async = true
      document.head.appendChild(s)
    }

    const onLoad = () => setReady(true)
    s.addEventListener('load', onLoad)
    return () => s?.removeEventListener('load', onLoad)
  }, [])

  const open = () => {
    if (!ready || !window.daum?.Postcode) return
    new window.daum.Postcode({
      oncomplete: (data) => {
        const base = data.roadAddress || data.jibunAddress
        const full = data.buildingName ? `${base} (${data.buildingName})` : base
        onChange(full)
      },
    }).open()
  }

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      <input
        type="text"
        value={value}
        readOnly
        placeholder={placeholder ?? '주소 검색 버튼을 클릭하세요'}
        className="input flex-1 bg-gray-50 cursor-pointer"
        onClick={open}
      />
      <button
        type="button"
        onClick={open}
        disabled={!ready}
        className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 active:bg-brand-700 disabled:opacity-60 disabled:cursor-wait transition-colors shrink-0"
      >
        {ready
          ? <><MapPin className="w-4 h-4" />주소 검색</>
          : <><Loader2 className="w-4 h-4 animate-spin" />로딩중</>
        }
      </button>
    </div>
  )
}
