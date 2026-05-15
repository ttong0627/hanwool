import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(room: string, onMessage: (data: unknown) => void) {
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws/${room}`
    const ws = new WebSocket(url)
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data))
      } catch { /* noop */ }
    }
    ws.onclose = () => setTimeout(connect, 3000)
    wsRef.current = ws
  }, [room, onMessage])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}
