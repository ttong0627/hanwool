import { Linking, Platform } from 'react-native'

/**
 * 외부 내비게이션 앱 연동 (카카오맵 / Tmap)
 * - 좌표(lat/lng)가 있으면 좌표 기준 길찾기, 없으면 주소명 검색 폴백
 * - 앱 미설치 시 웹/스토어로 폴백
 */

export interface NaviDest {
  lat?: number | null
  lng?: number | null
  /** 배송지 도로명/지번 주소 (좌표 없을 때 검색 폴백에 사용) */
  delivery_address?: string | null
}

const destName = (dest: NaviDest) =>
  encodeURIComponent(dest.delivery_address || '배송지')

/** 카카오맵 길찾기 — 앱 우선, 없으면 웹 링크 폴백 */
export function openKakaoNavi(dest: NaviDest): void {
  const name = destName(dest)
  if (dest.lat != null && dest.lng != null) {
    // 카카오맵 길찾기는 도착지를 '좌표'로 받아야 목적지가 정확히 찍힌다.
    Linking.openURL(`kakaomap://route?ep=${dest.lat},${dest.lng}&by=CAR`).catch(() =>
      Linking.openURL(`https://map.kakao.com/link/to/${name},${dest.lat},${dest.lng}`).catch(() => {}),
    )
  } else {
    Linking.openURL(`https://map.kakao.com/link/search/${name}`).catch(() => {})
  }
}

/** Tmap 길찾기 — 앱 우선, 미설치 시 스토어 폴백 */
export function openTmap(dest: NaviDest): void {
  const name = destName(dest)
  // Tmap URI scheme: tmap://route?goalname=목적지&goalx=경도(lng)&goaly=위도(lat)
  const storeUrl =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/kr/app/t-map/id431589174'
      : 'market://details?id=com.skt.tmap.ku'

  if (dest.lat != null && dest.lng != null) {
    const url = `tmap://route?goalname=${name}&goalx=${dest.lng}&goaly=${dest.lat}`
    Linking.openURL(url).catch(() => Linking.openURL(storeUrl).catch(() => {}))
  } else {
    // 좌표가 없으면 주소명 검색 길찾기 폴백 (Tmap은 goalname만으로도 검색 동작)
    Linking.openURL(`tmap://search?name=${name}`).catch(() => Linking.openURL(storeUrl).catch(() => {}))
  }
}
