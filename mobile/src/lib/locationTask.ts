import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { BASE_URL } from '@/lib/api'
import { ACCESS_TOKEN_KEY } from '@/store/authStore'

/**
 * 백그라운드 위치 추적 task.
 * 화면이 꺼지거나 앱이 백그라운드여도 OS가 위치를 받아 이 task를 깨우고,
 * AsyncStorage에 보관된 토큰으로 서버에 위치를 전송한다.
 * defineTask는 앱 로드 시점에 등록돼야 하므로 진입점(app/_layout.tsx)에서 import 한다.
 */
export const BG_LOCATION_TASK = 'hanwool-bg-location'

interface BgLocationData {
  locations?: Location.LocationObject[]
}

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  if (error) return
  const locations = (data as BgLocationData)?.locations
  const loc = locations?.[locations.length - 1]
  if (!loc) return
  try {
    const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) return
    await fetch(`${BASE_URL}/api/v1/deliveries/driver-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
    })
    // 401(토큰 만료) 등은 조용히 무시 — 다음 포그라운드 복귀 시 토큰이 갱신된다.
  } catch {
    // 네트워크 오류 무시 — 다음 위치 업데이트에서 재시도된다.
  }
})
