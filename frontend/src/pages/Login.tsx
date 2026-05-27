import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Smartphone, Eye, EyeOff } from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { HanwoolLogo } from '@/components/HanwoolLogo'

interface LoginForm { phone: string; password: string }

const WEB_ROLES = ['admin', 'super_admin', 'receiver']

export function LoginPage() {
  const { register, handleSubmit, setValue } = useForm<LoginForm>()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const { setAuth, logout, user } = useAuthStore()
  const navigate = useNavigate()

  if (user && !WEB_ROLES.includes(user.role)) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-[#0f1729] via-[#1a2540] to-[#0f1729] flex items-center justify-center p-4">
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center space-y-4 animate-fade-in-up">
          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto">
            <Smartphone className="w-7 h-7 text-brand-500" />
          </div>
          <h2 className="font-bold text-lg text-gray-900">모바일 앱을 이용해 주세요</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            기사·고객 계정은 웹 관리 시스템에서 사용할 수 없습니다.<br />
            경안시장 집배송 앱을 이용해 주세요.
          </p>
          <button onClick={logout} className="btn-primary w-full">로그아웃</button>
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
    <div className="min-h-dvh flex">
      {/* 왼쪽: 다크 브랜딩 패널 */}
      <div className="hidden lg:flex lg:w-[420px] bg-[#0f1729] flex-col items-center justify-center p-12 shrink-0">
        <div className="text-center animate-fade-in-up">
          <HanwoolLogo size={64} showText={false} />
          <h1 className="text-3xl font-extrabold text-white mt-6 leading-tight">
            한울<br />경안시장 배송서비스
          </h1>
          <p className="text-slate-400 mt-4 text-sm leading-relaxed">
            경기도 광주시 지자체 협약<br />
            경안동·송정동·쌍령동·탄벌동<br />
            무료 복지 배송 관리 시스템
          </p>
          <div className="mt-10 space-y-2 text-left">
            {[
              { dot: 'bg-green-400', text: '실시간 배송 현황 추적' },
              { dot: 'bg-brand-400', text: '65세↑ 수혜 대상 자동 확인' },
              { dot: 'bg-blue-400',  text: '장날(3·8일) 자동 접수 관리' },
            ].map(({ dot, text }) => (
              <div key={text} className="flex items-center gap-3 text-slate-400 text-sm">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 오른쪽: 로그인 폼 */}
      <div className="flex-1 bg-[#f8f9fb] flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in-up">
          {/* 모바일 로고 */}
          <div className="flex justify-center mb-8 lg:hidden">
            <HanwoolLogo size={48} showText variant="full" />
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-card border border-gray-100">
            <div className="mb-7">
              <h2 className="text-xl font-bold text-gray-900">관리자 로그인</h2>
              <p className="text-sm text-gray-500 mt-1">전화번호와 비밀번호를 입력해 주세요.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">전화번호</label>
                <input
                  {...register('phone', { required: true })}
                  type="text"
                  placeholder="010-0000-0000"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    setValue('phone', e.target.value)
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="input"
                />
              </div>

              <div>
                <label className="label">비밀번호</label>
                <div className="relative">
                  <input
                    {...register('password', { required: true })}
                    type={showPw ? 'text' : 'password'}
                    placeholder="비밀번호"
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-sm text-red-600 animate-fade-in">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-1 py-2.5 text-base"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            기사·고객 계정은 모바일 앱에서 로그인해 주세요.
          </p>
        </div>
      </div>
    </div>
  )
}
