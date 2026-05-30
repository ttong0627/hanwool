import { useEffect } from 'react'
import { Alert, Linking } from 'react-native'
import Constants from 'expo-constants'
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import '@/lib/locationTask' // 백그라운드 위치 task 등록 (앱 로드 시점에 defineTask 필요)

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

/* 버전 비교: a가 b보다 높으면 true (semver x.y.z) */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

/* 앱 시작 시 서버 최신 버전 확인 → 새 버전이면 업데이트 안내 */
function useUpdateCheck() {
  useEffect(() => {
    let done = false
    ;(async () => {
      try {
        const current = Constants.expoConfig?.version ?? '0.0.0'
        const { data } = await api.get('/app/version')
        if (done || !data?.latest) return
        if (isNewer(data.latest, current)) {
          Alert.alert(
            '새 버전 안내',
            `새 버전(${data.latest})이 출시됐습니다.\n현재 버전: ${current}\n\n최신 버전으로 업데이트해 주세요.`,
            [
              { text: '나중에', style: 'cancel' },
              { text: '업데이트', onPress: () => Linking.openURL(data.apk_url) },
            ],
          )
        }
      } catch { /* 버전 확인 실패는 조용히 무시 */ }
    })()
    return () => { done = true }
  }, [])
}

function AuthGuard() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()
  const segments = useSegments()
  const navState = useRootNavigationState()

  useEffect(() => {
    // 루트 네비게이터가 마운트된 후에만 이동 (mount 전 navigate 크래시 방지)
    if (!navState?.key) return

    const inAuth = segments[0] === 'login'
    if (!user && !inAuth) {
      router.replace('/login')
    } else if (user && inAuth) {
      if (user.role === 'driver') router.replace('/(driver)')
      else if (user.role === 'super_admin') router.replace('/(admin)')
      else router.replace('/(customer)')
    }
  }, [user, segments, navState?.key])

  return null
}

export default function RootLayout() {
  useUpdateCheck()
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}
