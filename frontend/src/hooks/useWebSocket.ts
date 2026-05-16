import { useEffect, useRef, useCallback } from 'react'

const HEARTBEAT_INTERVAL = 20_000  // 20초마다 ping
const RECONNECT_DELAY = 3_000
const LOCATION_TIMEOUT = 30_000    // 30초 이상 위치 없으면 "위치 없음"

export function useWebSocket(room: string, onMessage: (data: unknown) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const stopHeartbeat = () => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
  }

  const startHeartbeat = (ws: WebSocket) => {
    stopHeartbeat()
    heartbeatRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, HEARTBEAT_INTERVAL)
  }

  const connect = useCallback(() => {
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/${room}`
    const ws = new WebSocket(url)

    ws.onopen = () => startHeartbeat(ws)

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data?.type === 'pong') return  // heartbeat 응답 무시
        onMessageRef.current(data)
      } catch { /* noop */ }
    }

    ws.onclose = () => {
      stopHeartbeat()
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY)
    }

    ws.onerror = () => ws.close()

    wsRef.current = ws
  }, [room])

  useEffect(() => {
    connect()
    return () => {
      stopHeartbeat()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}

export { LOCATION_TIMEOUT }
