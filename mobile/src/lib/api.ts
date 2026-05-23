import axios from 'axios'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://ga.wssc.kr'

const api = axios.create({ baseURL: `${BASE_URL}/api/v1` })

api.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('@/store/authStore')
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
export { BASE_URL }
