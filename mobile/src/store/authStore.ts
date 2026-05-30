import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 백그라운드 위치 task는 메모리 store(zustand)에 접근할 수 없으므로 토큰을 AsyncStorage에도 보관한다.
export const ACCESS_TOKEN_KEY = 'hanwool.accessToken'

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
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => {
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken).catch(() => {})
    set({ user, accessToken })
  },
  logout: () => {
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {})
    set({ user: null, accessToken: null })
  },
}))
