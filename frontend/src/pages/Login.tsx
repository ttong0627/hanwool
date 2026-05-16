import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Smartphone } from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { formatPhone } from '@/lib/utils'

interface LoginForm { phone: string; password: string }

const WEB_ROLES = ['admin', 'super_admin', 'receiver']

export function LoginPage() {
  const { register, handleSubmit, setValue } = useForm<LoginForm>()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth, logout, user } = useAuthStore()
  const navigate = useNavigate()

  // 웹 미지원 역할(기사/고객)이 localStorage에 남아 있을 경우 즉시 로그아웃
  if (user && !WEB_ROLES.includes(user.role)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto">
            <Smartphone className="w-7 h-7 text-brand-500" />
          </div>
          <h2 className="font-bold text-lg text-gray-900">모바일 앱을 이용해 주세요</h2>
          <p className="text-sm text-gray-500">
            기사·고객 계정은 웹 관리 시스템에서 사용할 수 없습니다.<br />
            경안시장 집배송 앱을 이용해 주세요.
          </p>
          <button
            onClick={() => { logout(); }}
            className="btn-primary w-full"
          >
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', data)
      const role = res.data.user.role
      if (!WEB_ROLES.includes(role)) {
        setError('기사·고객 계정은 모바일 앱을 이용해 주세요.')
        return
      }
      setAuth(res.data.user, res.data.access_token, res.data.refresh_token)
      if (['admin', 'super_admin'].includes(role)) navigate('/admin')
      else navigate('/receiver')
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
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => {
                const formatted = formatPhone(e.target.value)
                setPhone(formatted)
                setValue('phone', formatted)
              }}
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
