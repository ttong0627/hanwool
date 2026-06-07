import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { REFRESH_TOKEN_KEY } from '@/store/authStore'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://ga.wssc.kr'

const api = axios.create({ baseURL: `${BASE_URL}/api/v1` })

api.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('@/store/authStore')
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 액세스 토큰(30분) 만료 시 자동 갱신 — 갱신 후 원요청 재시도.
// 동시 401이 몰려도 갱신은 한 번만 수행(single-flight).
let refreshPromise: Promise<string> | null = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status
    const original = err.config
    if (status !== 401 || !original || original._retry) {
      return Promise.reject(err)
    }
    original._retry = true

    const { useAuthStore } = await import('@/store/authStore')
    const store = useAuthStore.getState()
    const refresh = store.refreshToken ?? (await AsyncStorage.getItem(REFRESH_TOKEN_KEY))
    if (!refresh) {
      store.logout()
      return Promise.reject(err)
    }

    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post(`${BASE_URL}/api/v1/auth/refresh`, { token: refresh })
          .then(({ data }) => {
            useAuthStore.getState().setTokens(data.access_token, data.refresh_token)
            return data.access_token as string
          })
          .finally(() => { refreshPromise = null })
      }
      const newToken = await refreshPromise
      original.headers = original.headers ?? {}
      original.headers.Authorization = `Bearer ${newToken}`
      return api.request(original)
    } catch {
      refreshPromise = null
      useAuthStore.getState().logout()
      return Promise.reject(err)
    }
  },
)

export default api
export { BASE_URL }
