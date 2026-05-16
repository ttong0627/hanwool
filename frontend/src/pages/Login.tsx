import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface LoginForm { phone: string; password: string }

export function LoginPage() {
  const { register, handleSubmit } = useForm<LoginForm>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', data)
      setAuth(res.data.user, res.data.access_token, res.data.refresh_token)
      const role = res.data.user.role
      navigate(['admin', 'super_admin'].includes(role) ? '/admin' : '/receiver')
    } catch {
      setError('전화번호 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-orange-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-2xl font-bold">경</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">경안시장 집배송</h1>
          <p className="text-sm text-gray-500 mt-1">관리 시스템 로그인</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">전화번호</label>
            <input
              {...register('phone', { required: true })}
              type="tel"
              placeholder="01012345678"
              className="input"
            />
          </div>
          <div>
            <label className="label">비밀번호</label>
            <input
              {...register('password', { required: true })}
              type="password"
              placeholder="비밀번호"
              className="input"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
