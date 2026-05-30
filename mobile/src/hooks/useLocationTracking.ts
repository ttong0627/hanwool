import { useEffect, useRef } from 'react'
import * as Location from 'expo-location'
import { Alert } from 'react-native'

import { BASE_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { BG_LOCATION_TASK } from '@/lib/locationTask'

const POST_INTERVAL = 10_000   // 포그라운드 위치 전송 주기(10초)
const DISTANCE_INTERVAL = 20   // 20m 이상 이동 시 갱신

/**
 * 기사 위치 추적 — 위치를 REST POST로 서버에 전송(서버가 시각 기록 + Redis 저장 + 관리자 브로드캐스트).
 * enabled=true(배송 진행 중)일 때만 동작. 포그라운드(앱 떠 있을 때)는 watch+주기 전송,
 * 백그라운드(화면 꺼짐)는 expo-location 백그라운드 task로 전송한다.
 * enabled=false 또는 언마운트 시 모두 중단(배터리·프라이버시 보호).
 */
async function postLocation(lat: number, lng: number) {
  try {
    const token = useAuthStore.getState().accessToken
    if (!token) return
    await fetch(`${BASE_URL}/api/v1/deliveries/driver-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lat, lng }),
    })
  } catch {
    // 네트워크 오류 무시 — 다음 주기에 재시도
  }
}

export function useLocationTracking(driverId: number | null, enabled: boolean) {
  const watchRef = useRef<Location.LocationSubscription | null>(null)
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRef = useRef<{ lat: number; lng: number } | null>(null)
  const startedBgRef = useRef(false)
  const warnedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      // 포그라운드 위치 권한 필수
      const fg = await Location.requestForegroundPermissionsAsync()
      if (fg.status !== 'granted') {
        if (!warnedRef.current) {
          warnedRef.current = true
          Alert.alert('위치 권한 필요', '배송 중 위치 공유를 위해 위치 권한을 허용해 주세요.')
        }
        return
      }
      if (cancelled) return

      // 포그라운드: 위치 watch + 주기 전송 (앱이 떠 있을 때 즉시성 확보)
      if (!watchRef.current) {
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: POST_INTERVAL, distanceInterval: DISTANCE_INTERVAL },
          (loc) => { lastRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude } },
        )
      }
      if (!sendTimerRef.current) {
        sendTimerRef.current = setInterval(() => {
          if (lastRef.current) postLocation(lastRef.current.lat, lastRef.current.lng)
        }, POST_INTERVAL)
      }

      // 백그라운드: 화면이 꺼져도 전송 (권한 '항상 허용' 시에만)
      const bg = await Location.requestBackgroundPermissionsAsync()
      if (cancelled) return
      if (bg.status === 'granted') {
        const already = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false)
        if (!already && !cancelled) {
          await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: POST_INTERVAL,
            distanceInterval: DISTANCE_INTERVAL,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: '배송 위치 공유 중',
              notificationBody: '관리자에게 실시간 위치를 전송합니다.',
              notificationColor: '#F97316',
            },
          }).catch(() => {})
        }
        startedBgRef.current = true
      } else if (!warnedRef.current) {
        warnedRef.current = true
        Alert.alert(
          '백그라운드 위치',
          "화면이 꺼져도 위치가 공유되려면 위치 권한을 '항상 허용'으로 설정해 주세요. 지금은 앱이 켜져 있을 때만 공유됩니다.",
        )
      }
    }

    const stop = async () => {
      watchRef.current?.remove()
      watchRef.current = null
      if (sendTimerRef.current) { clearInterval(sendTimerRef.current); sendTimerRef.current = null }
      if (startedBgRef.current) {
        const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false)
        if (running) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {})
        startedBgRef.current = false
      }
    }

    if (driverId && enabled) start()
    else stop()

    return () => { cancelled = true; stop() }
  }, [driverId, enabled])
}
