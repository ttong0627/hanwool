import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  name: string
  phone: string
  role: string
  dong?: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: User, access: string, refresh: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ user, accessToken, refreshToken })
      },
      logout: () => {
        localStorage.clear()
        set({ user: null, accessToken: null, refreshToken: null })
      },
    }),
    { name: 'auth-storage', partialize: (s) => ({ user: s.user }) }
  )
)
