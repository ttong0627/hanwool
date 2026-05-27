export interface DriverTone {
  primary: string
  soft: string
  wash: string
  border: string
  text: string
  shadow: string
  gradient: string
}

/**
 * 기사별 고유 색상 팔레트.
 * 눈에 잘 띄되 너무 가볍지 않은 프리미엄 톤으로 구성하고,
 * 기사 ID가 같으면 모든 화면에서 같은 색을 쓰도록 유지한다.
 */
export const DRIVER_TONES: DriverTone[] = [
  {
    primary: '#2563eb',
    soft: 'rgba(37,99,235,0.12)',
    wash: 'linear-gradient(135deg, rgba(37,99,235,0.14), rgba(255,255,255,0.96))',
    border: 'rgba(37,99,235,0.34)',
    text: '#1d4ed8',
    shadow: 'rgba(37,99,235,0.28)',
    gradient: 'linear-gradient(135deg, #1d4ed8, #38bdf8)',
  },
  {
    primary: '#0f766e',
    soft: 'rgba(15,118,110,0.13)',
    wash: 'linear-gradient(135deg, rgba(15,118,110,0.14), rgba(255,255,255,0.96))',
    border: 'rgba(15,118,110,0.34)',
    text: '#0f766e',
    shadow: 'rgba(15,118,110,0.28)',
    gradient: 'linear-gradient(135deg, #0f766e, #2dd4bf)',
  },
  {
    primary: '#b45309',
    soft: 'rgba(180,83,9,0.14)',
    wash: 'linear-gradient(135deg, rgba(180,83,9,0.14), rgba(255,255,255,0.96))',
    border: 'rgba(180,83,9,0.34)',
    text: '#92400e',
    shadow: 'rgba(180,83,9,0.28)',
    gradient: 'linear-gradient(135deg, #b45309, #f59e0b)',
  },
  {
    primary: '#be123c',
    soft: 'rgba(190,18,60,0.12)',
    wash: 'linear-gradient(135deg, rgba(190,18,60,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(190,18,60,0.32)',
    text: '#be123c',
    shadow: 'rgba(190,18,60,0.26)',
    gradient: 'linear-gradient(135deg, #be123c, #fb7185)',
  },
  {
    primary: '#6d28d9',
    soft: 'rgba(109,40,217,0.12)',
    wash: 'linear-gradient(135deg, rgba(109,40,217,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(109,40,217,0.32)',
    text: '#6d28d9',
    shadow: 'rgba(109,40,217,0.26)',
    gradient: 'linear-gradient(135deg, #6d28d9, #a78bfa)',
  },
  {
    primary: '#0369a1',
    soft: 'rgba(3,105,161,0.12)',
    wash: 'linear-gradient(135deg, rgba(3,105,161,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(3,105,161,0.32)',
    text: '#0369a1',
    shadow: 'rgba(3,105,161,0.26)',
    gradient: 'linear-gradient(135deg, #0369a1, #22d3ee)',
  },
  {
    primary: '#047857',
    soft: 'rgba(4,120,87,0.12)',
    wash: 'linear-gradient(135deg, rgba(4,120,87,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(4,120,87,0.32)',
    text: '#047857',
    shadow: 'rgba(4,120,87,0.26)',
    gradient: 'linear-gradient(135deg, #047857, #34d399)',
  },
  {
    primary: '#c026d3',
    soft: 'rgba(192,38,211,0.11)',
    wash: 'linear-gradient(135deg, rgba(192,38,211,0.12), rgba(255,255,255,0.96))',
    border: 'rgba(192,38,211,0.30)',
    text: '#a21caf',
    shadow: 'rgba(192,38,211,0.24)',
    gradient: 'linear-gradient(135deg, #a21caf, #f0abfc)',
  },
  {
    primary: '#4f46e5',
    soft: 'rgba(79,70,229,0.12)',
    wash: 'linear-gradient(135deg, rgba(79,70,229,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(79,70,229,0.32)',
    text: '#4338ca',
    shadow: 'rgba(79,70,229,0.26)',
    gradient: 'linear-gradient(135deg, #4338ca, #818cf8)',
  },
  {
    primary: '#ea580c',
    soft: 'rgba(234,88,12,0.12)',
    wash: 'linear-gradient(135deg, rgba(234,88,12,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(234,88,12,0.32)',
    text: '#c2410c',
    shadow: 'rgba(234,88,12,0.25)',
    gradient: 'linear-gradient(135deg, #c2410c, #fb923c)',
  },
  {
    primary: '#0e7490',
    soft: 'rgba(14,116,144,0.12)',
    wash: 'linear-gradient(135deg, rgba(14,116,144,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(14,116,144,0.32)',
    text: '#0e7490',
    shadow: 'rgba(14,116,144,0.25)',
    gradient: 'linear-gradient(135deg, #0e7490, #67e8f9)',
  },
  {
    primary: '#7c2d12',
    soft: 'rgba(124,45,18,0.12)',
    wash: 'linear-gradient(135deg, rgba(124,45,18,0.13), rgba(255,255,255,0.96))',
    border: 'rgba(124,45,18,0.30)',
    text: '#7c2d12',
    shadow: 'rgba(124,45,18,0.24)',
    gradient: 'linear-gradient(135deg, #7c2d12, #fdba74)',
  },
]

export function getDriverTone(driverId: number): DriverTone {
  return DRIVER_TONES[Math.abs(driverId) % DRIVER_TONES.length]
}

export function getDriverColor(driverId: number): string {
  return getDriverTone(driverId).primary
}
