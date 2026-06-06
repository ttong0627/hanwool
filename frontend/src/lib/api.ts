import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 동시에 여러 요청이 401 받을 때 토큰 갱신을 한 번만 수행
let refreshPromise: Promise<string> | null = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios
              .post('/api/v1/auth/refresh', { token: refresh })
              .then(({ data }) => {
                localStorage.setItem('access_token', data.access_token)
                if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token)
                return data.access_token
              })
              .finally(() => { refreshPromise = null })
          }
          const newToken = await refreshPromise
          err.config.headers.Authorization = `Bearer ${newToken}`
          return api.request(err.config)
        } catch {
          refreshPromise = null
          localStorage.clear()
          window.location.href = '/login'
        }
      } else {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
