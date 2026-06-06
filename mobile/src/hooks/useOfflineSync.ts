import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import { queueCount } from '@/lib/offlineQueue'
import { syncCompletions } from '@/lib/offlineSync'

// 오프라인 배송완료 큐를 자동으로 비운다.
// 트리거: 마운트 직후 / 앱 포그라운드 복귀 / 30초 주기.
// pending: 아직 서버로 못 보낸 완료 건수 (UI 배지용).

export function useOfflineSync(onSynced?: () => void) {
  const [pending, setPending] = useState(0)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced

  const refresh = useCallback(async () => {
    setPending(await queueCount())
  }, [])

  const run = useCallback(async () => {
    const { done } = await syncCompletions()
    await refresh()
    if (done > 0) onSyncedRef.current?.()
  }, [refresh])

  useEffect(() => {
    run()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run()
    })
    const iv = setInterval(run, 30_000)
    return () => {
      sub.remove()
      clearInterval(iv)
    }
  }, [run])

  return { pending, syncNow: run, refresh }
}
