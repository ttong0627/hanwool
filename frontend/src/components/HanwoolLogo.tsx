interface Props {
  size?: number
  showText?: boolean
  variant?: 'full' | 'icon'
  className?: string
}

export function HanwoolLogo({ size = 40, showText = true, variant = 'full', className = '' }: Props) {
  const iconSize = size
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* 아이콘 마크 */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hw-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#c2410c" />
          </linearGradient>
          <linearGradient id="hw-shine" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 배경 원 */}
        <circle cx="24" cy="24" r="24" fill="url(#hw-grad)" />
        <circle cx="24" cy="24" r="24" fill="url(#hw-shine)" />

        {/* 지붕 (한옥 처마선) */}
        <path
          d="M9 22.5 C9 22.5 15 17 24 13 C33 17 39 22.5 39 22.5"
          stroke="white"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* 지붕 꼭대기 점 */}
        <circle cx="24" cy="11.5" r="2" fill="white" />

        {/* 건물 몸체 */}
        <rect x="15" y="22.5" width="18" height="13" rx="2" fill="white" fillOpacity="0.95" />

        {/* 문 */}
        <rect x="20.5" y="28" width="7" height="7.5" rx="1.5" fill="url(#hw-grad)" />

        {/* 배송 경로 점 (우상단) — 속달 의미 */}
        <circle cx="37" cy="10" r="3.5" fill="white" fillOpacity="0.9" />
        <circle cx="37" cy="10" r="2" fill="#ea580c" />

        {/* 이동 궤적 */}
        <path
          d="M28 16 Q33 12 36.5 11"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="1.5 2"
          fill="none"
          opacity="0.7"
        />
      </svg>

      {/* 텍스트 */}
      {showText && variant === 'full' && (
        <div className="leading-tight">
          <div
            style={{ fontSize: size * 0.45, fontWeight: 800, letterSpacing: '-0.02em' }}
            className="text-brand-700 font-extrabold tracking-tight"
          >
            HANWOOL
          </div>
          <div
            style={{ fontSize: size * 0.25 }}
            className="text-gray-500 font-medium tracking-wide"
          >
            경안시장 집배송
          </div>
        </div>
      )}
    </div>
  )
}
