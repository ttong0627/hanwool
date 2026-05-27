import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { User, KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const ROLE_LABELS: Record<string, string> = {
  super_admin: '최고관리자',
  admin: '관리자',
  receiver: '접수자',
  driver: '기사',
  customer: '고객',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-brand-50 text-brand-700',
  receiver: 'bg-blue-50 text-blue-700',
  driver: 'bg-green-50 text-green-700',
}

export function MyAccount() {
  const currentUser = useAuthStore((s) => s.user)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [success, setSuccess] = useState(false)

  const changePwMutation = useMutation({
    mutationFn: () =>
      api.put('/users/me/password', {
        current_password: currentPw,
        new_password: newPw,
      }),
    onSuccess: () => {
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    },
  })

  const mismatch = confirmPw.length > 0 && newPw !== confirmPw
  const valid =
    currentPw.length >= 1 &&
    newPw.length >= 8 &&
    newPw === confirmPw

  const errDetail = (changePwMutation.error as { response?: { data?: { detail?: string } } })
    ?.response?.data?.detail

  return (
    <div className="p-6 max-w-lg space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="w-6 h-6 text-brand-500" />
          내 계정
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">프로필 확인 및 비밀번호 변경</p>
      </div>

      {/* 프로필 카드 */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4 text-sm uppercase tracking-wide">프로필 정보</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">이름</span>
            <span className="font-semibold text-gray-900">{currentUser?.name}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">전화번호</span>
            <span className="font-medium text-gray-700 tabular-nums">{currentUser?.phone}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-500">역할</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ROLE_COLORS[currentUser?.role ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
              {ROLE_LABELS[currentUser?.role ?? ''] ?? currentUser?.role}
            </span>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 카드 */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
          <KeyRound className="w-4 h-4" />
          비밀번호 변경
        </h2>

        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-4 text-sm">
            <CheckCircle className="w-4 h-4 shrink-0" />
            비밀번호가 성공적으로 변경되었습니다.
          </div>
        )}

        <div className="space-y-4">
          {/* 현재 비밀번호 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              현재 비밀번호 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className="input w-full pr-10"
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="현재 사용 중인 비밀번호"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 새 비밀번호 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              새 비밀번호 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className="input w-full pr-10"
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="8자 이상"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPw.length > 0 && newPw.length < 8 && (
              <p className="text-amber-600 text-xs mt-1">8자 이상 입력해 주세요.</p>
            )}
          </div>

          {/* 새 비밀번호 확인 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              새 비밀번호 확인 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className={`input w-full pr-10 ${mismatch ? 'border-red-400 focus:ring-red-300' : ''}`}
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="새 비밀번호를 다시 입력"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {mismatch && <p className="text-red-500 text-xs mt-1">새 비밀번호가 일치하지 않습니다.</p>}
          </div>

          {changePwMutation.isError && (
            <p className="text-red-500 text-sm bg-red-50 rounded-lg p-3">
              {errDetail ?? '비밀번호 변경에 실패했습니다. 다시 시도해 주세요.'}
            </p>
          )}

          <button
            onClick={() => changePwMutation.mutate()}
            disabled={!valid || changePwMutation.isPending}
            className="w-full btn-primary disabled:opacity-40 mt-2"
          >
            {changePwMutation.isPending ? '변경 중...' : '비밀번호 변경'}
          </button>
        </div>
      </div>
    </div>
  )
}
