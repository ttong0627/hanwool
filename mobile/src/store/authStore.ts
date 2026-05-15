import { create } from 'zustand'

interface User { id: number; name: string; phone: string; role: string }

interface AuthState {
  user: User | null
  accessToken: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  logout: () => set({ user: null, accessToken: null }),
}))
