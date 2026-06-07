import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 로그인 세션을 기기에 영속화 — 문자앱에 갔다 오거나 앱이 잠깐 닫혀도 다시 로그인하지 않도록.
// 백그라운드 위치 task도 메모리 store에 접근할 수 없으므로 토큰을 AsyncStorage에서 읽는다.
export const ACCESS_TOKEN_KEY = 'hanwool.accessToken'
export const REFRESH_TOKEN_KEY = 'hanwool.refreshToken'
const USER_KEY = 'hanwool.user'

interface User {
  id: number
  name: string
  phone: string
  role: string
  dong?: string
  address?: string
  is_driver?: boolean
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  hydrated: boolean // 기기에 저장된 세션 복원 완료 여부 (복원 전엔 로그인 화면으로 튕기지 않게)
  setAuth: (user: User, accessToken: string, refreshToken?: string) => void
  setTokens: (accessToken: string, refreshToken?: string) => void
  logout: () => void
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  hydrated: false,
  setAuth: (user, accessToken, refreshToken) => {
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken).catch(() => {})
    if (refreshToken) AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken).catch(() => {})
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {})
    set({ user, accessToken, refreshToken: refreshToken ?? get().refreshToken })
  },
  // 토큰 갱신(refresh) 결과 반영 — 액세스 토큰 만료 시 자동 호출됨
  setTokens: (accessToken, refreshToken) => {
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken).catch(() => {})
    if (refreshToken) AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken).catch(() => {})
    set({ accessToken, refreshToken: refreshToken ?? get().refreshToken })
  },
  logout: () => {
    AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]).catch(() => {})
    set({ user: null, accessToken: null, refreshToken: null })
  },
  hydrate: async () => {
    try {
      const [token, refresh, userRaw] = await Promise.all([
        AsyncStorage.getItem(ACCESS_TOKEN_KEY),
        AsyncStorage.getItem(REFRESH_TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ])
      if (token && userRaw) set({ accessToken: token, refreshToken: refresh, user: JSON.parse(userRaw) })
    } catch { /* 복원 실패 시 로그인 화면으로 진행 */ }
    set({ hydrated: true })
  },
}))
