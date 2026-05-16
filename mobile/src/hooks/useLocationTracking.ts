import { useEffect, useRef, useCallback } from 'react'
import * as Location from 'expo-location'
import { AppState, AppStateStatus } from 'react-native'

const SEND_INTERVAL = 15_000   // 15초마다 위치 전송
const RECONNECT_DELAY = 3_000
const WS_HEARTBEAT = 20_000

interface LocationPayload {
  type: 'location'
  driver_id: number
  lat: number
  lng: number
  timestamp: number
}

export function useLocationTracking(driverId: number | null, apiBaseUrl: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locationSubRef = useRef<Location.LocationSubscription | null>(null)
  const lastLocation = useRef<{ lat: number; lng: number } | null>(null)
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isActiveRef = useRef(true)

  const sendLocation = useCallback(() => {
    if (!lastLocation.current || !driverId) return
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    const payload: LocationPayload = {
      type: 'location',
      driver_id: driverId,
      lat: lastLocation.current.lat,
      lng: lastLocation.current.lng,
      timestamp: Date.now(),
    }
    wsRef.current.send(JSON.stringify(payload))
  }, [driverId])

  const stopHeartbeat = () => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
  }

  const connect = useCallback(async () => {
    if (!driverId || !isActiveRef.current) return
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }

    // JWT 토큰 가져오기
    const { useAuthStore } = await import('@/store/authStore')
    const token = useAuthStore.getState().accessToken ?? ''

    const wsUrl = apiBaseUrl.replace(/^http/, 'ws').replace(':8000', '').replace(/\/$/, '')
    const ws = new WebSocket(`${wsUrl}/ws/driver-location?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, WS_HEARTBEAT)
      sendIntervalRef.current = setInterval(sendLocation, SEND_INTERVAL)
    }

    ws.onmessage = () => { /* pong 등 서버 응답 무시 */ }

    ws.onclose = () => {
      stopHeartbeat()
      if (sendIntervalRef.current) { clearInterval(sendIntervalRef.current); sendIntervalRef.current = null }
      if (isActiveRef.current) {
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY)
      }
    }

    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [driverId, apiBaseUrl, sendLocation])

  const startLocationWatch = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return

    locationSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 30 },
      (loc) => { lastLocation.current = { lat: loc.coords.latitude, lng: loc.coords.longitude } }
    )
  }, [])

  const stopAll = useCallback(() => {
    isActiveRef.current = false
    stopHeartbeat()
    if (sendIntervalRef.current) { clearInterval(sendIntervalRef.current); sendIntervalRef.current = null }
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }
    locationSubRef.current?.remove()
    wsRef.current?.close()
  }, [])

  useEffect(() => {
    if (!driverId) return
    isActiveRef.current = true
    startLocationWatch()
    connect()

    // 앱이 포그라운드로 돌아오면 연결 재시도
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active' && wsRef.current?.readyState !== WebSocket.OPEN) connect()
    }
    const sub = AppState.addEventListener('change', handleAppState)

    return () => { sub.remove(); stopAll() }
  }, [driverId, connect, startLocationWatch, stopAll])
}
