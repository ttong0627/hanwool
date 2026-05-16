import { useEffect } from 'react'
import { MapPin } from 'lucide-react'

declare global {
  interface Window {
    daum: {
      Postcode: new (opts: { oncomplete: (data: DaumResult) => void; onclose?: () => void }) => { open: () => void }
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
  useEffect(() => {
    const id = 'daum-postcode-sdk'
    if (!document.getElementById(id)) {
      const s = document.createElement('script')
      s.id = id
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
      s.async = true
      document.head.appendChild(s)
    }
  }, [])

  const open = () => {
    if (!window.daum?.Postcode) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.')
      return
    }
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
        className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 active:bg-brand-700 transition-colors shrink-0"
      >
        <MapPin className="w-4 h-4" />
        주소 검색
      </button>
    </div>
  )
}
