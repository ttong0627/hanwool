import axios from 'axios'

const BASE_URL = 'http://34.64.146.168:8000'

const api = axios.create({ baseURL: `${BASE_URL}/api/v1` })

api.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('@/store/authStore')
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
export { BASE_URL }
