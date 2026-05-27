/** 기사별 고유 색상 팔레트 — 모든 메뉴에서 동일하게 사용 (최대 6명) */
export const DRIVER_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#d97706', '#0891b2', '#be185d']

/** 기사 ID 기반 고유 색상 반환 (ID가 같으면 항상 같은 색) */
export function getDriverColor(driverId: number): string {
  return DRIVER_COLORS[driverId % DRIVER_COLORS.length]
}
