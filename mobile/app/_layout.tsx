import { useEffect } from 'react'
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/authStore'
import UpdateGate from '@/components/UpdateGate'
import '@/lib/locationTask' // 백그라운드 위치 task 등록 (앱 로드 시점에 defineTask 필요)

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function AuthGuard() {
  const user = useAuthStore((s) => s.user)
  const hydrated = useAuthStore((s) => s.hydrated)
  const router = useRouter()
  const segments = useSegments()
  const navState = useRootNavigationState()

  useEffect(() => {
    // 루트 네비게이터 마운트 + 저장된 세션 복원이 끝난 뒤에만 이동
    // (복원 전 튕기면 문자앱 갔다 올 때마다 로그인 화면으로 빠짐)
    if (!navState?.key || !hydrated) return

    const inAuth = segments[0] === 'login'
    if (!user && !inAuth) {
      router.replace('/login')
    } else if (user && inAuth) {
      if (user.role === 'driver') router.replace('/(driver)')
      else if (user.role === 'super_admin') router.replace('/(admin)')
      else router.replace('/(customer)')
    }
  }, [user, segments, navState?.key, hydrated])

  return null
}

export default function RootLayout() {
  // 앱 시작 시 기기에 저장된 로그인 세션 복원 (배송앱 계속 유지)
  useEffect(() => { useAuthStore.getState().hydrate() }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthGuard />
        <UpdateGate />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}
