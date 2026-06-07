import { useEffect, useRef } from 'react'
import { Alert, Linking, AppState } from 'react-native'
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

/* 앱 시작 시 서버 버전 확인
   - 현재 < min_supported : 강제 업데이트(닫기 불가, '업데이트'만)
   - 현재 < latest        : 권장 업데이트('나중에' 허용) */
function useUpdateCheck() {
  const busyRef = useRef(false)        // 중복 알림 방지
  const promptedRef = useRef(false)    // 같은 세션 권장 안내 1회만
  useEffect(() => {
    let mounted = true
    const check = async () => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const current = Constants.expoConfig?.version
        // 현재 버전을 못 읽으면 비교 불가 → 강제/안내 생략(잘못된 잠금·오탐 방지)
        if (!current) return
        const { data } = await api.get('/app/version')
        if (!mounted || !data?.latest) return
        const minSupported = data.min_supported ?? '0.0.0'

        // 강제 업데이트: 최소 지원 버전 미만이면 닫을 수 없는 안내(매번 표시)
        if (isNewer(minSupported, current)) {
          Alert.alert(
            '업데이트 필수',
            `현재 버전(${current})은 더 이상 사용할 수 없습니다.\n최신 버전: ${data.latest}\n\n계속하려면 업데이트해 주세요.`,
            [{ text: '지금 업데이트', onPress: () => Linking.openURL(data.apk_url) }],
            { cancelable: false },
          )
          return
        }

        // 권장 업데이트: 최신보다 낮으면 선택적 안내(세션당 1회)
        if (isNewer(data.latest, current) && !promptedRef.current) {
          promptedRef.current = true
          Alert.alert(
            '새 버전 안내',
            `새 버전(${data.latest})이 나왔습니다.\n현재 버전: ${current}\n\n지금 업데이트하시겠어요?`,
            [
              { text: '나중에', style: 'cancel' },
              { text: '업데이트', onPress: () => Linking.openURL(data.apk_url) },
            ],
          )
        }
      } catch { /* 버전 확인 실패는 조용히 무시 */ } finally {
        busyRef.current = false
      }
    }
    check()
    // 앱이 백그라운드에서 다시 켜질 때마다 재확인 → 업데이트 누락 방지
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check() })
    return () => { mounted = false; sub.remove() }
  }, [])
}

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
  useUpdateCheck()
  // 앱 시작 시 기기에 저장된 로그인 세션 복원 (배송앱 계속 유지)
  useEffect(() => { useAuthStore.getState().hydrate() }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}
