import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Shield, AlertTriangle, Download, Lock, CheckCircle2, Eye, Key, Users } from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const CONFIRM_PHRASE = '전체폐기'

interface DestroyResult {
  destroyed_at: string
  confirmed_by: number
  message: string
}

function ProtectionItem({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-gray-700">
      <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-green-600" />
      </div>
      {text}
    </li>
  )
}

export function Privacy() {
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'super_admin'

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [confirmText, setConfirmText] = useState('')
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<DestroyResult | null>(null)

  const destroyMutation = useMutation({
    mutationFn: () => api.post('/admin/privacy/destroy'),
    onSuccess: (res) => {
      setResult(res.data)
      setStep(1)
    },
  })

  const downloadPdf = () => {
    if (!result) return
    const token = localStorage.getItem('access_token')
    const params = new URLSearchParams({
      destroyed_at: result.destroyed_at,
      ...(reason ? { reason } : {}),
    })
    fetch(`/api/v1/documents/privacy-destruction.pdf?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `privacy_destruction_${new Date().toISOString().slice(0, 10)}.pdf`
        a.click()
      })
  }

  const canProceedStep2 = step === 1
  const canProceedStep3 = step === 2 && confirmText === CONFIRM_PHRASE

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-brand-500" />
          개인정보 관리
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">개인정보 보호 현황 및 폐기 관리</p>
      </div>

      {/* 보호 현황 */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          개인정보 보호 현황
        </h2>
        <ul className="space-y-2.5">
          <ProtectionItem icon={Lock} text="성명·연락처·주소 AES-256 암호화 저장" />
          <ProtectionItem icon={Eye} text="전송 구간 HTTPS/TLS 암호화 적용" />
          <ProtectionItem icon={Key} text="역할별 API 접근 통제 (RBAC) — 5단계 권한 분리" />
          <ProtectionItem icon={Users} text="전화번호 SHA-256 해시로만 검색 (원문 비노출)" />
          <ProtectionItem icon={Shield} text="개인정보처리방침 준수 (개인정보보호법 제21조)" />
        </ul>
      </div>

      {/* 폐기 완료 결과 */}
      {result && (
        <div className="card border border-green-200 bg-green-50 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            개인정보 폐기 완료
          </div>
          <div className="text-sm text-green-700 space-y-1">
            <p>폐기 일시: <span className="font-medium tabular-nums">{result.destroyed_at}</span></p>
            <p>{result.message}</p>
          </div>
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 btn-secondary text-sm"
          >
            <Download className="w-4 h-4" />
            폐기 확인서 PDF 다운로드
          </button>
        </div>
      )}

      {/* super_admin 전용 폐기 섹션 */}
      {!isSuperAdmin ? (
        <div className="card border border-gray-200 bg-gray-50 text-center py-10">
          <Shield className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">개인정보 폐기는 최고 관리자(super_admin)만 실행할 수 있습니다.</p>
          <p className="text-xs text-gray-400 mt-1">현재 권한: {user?.role}</p>
        </div>
      ) : (
        <div className="border-2 border-red-200 rounded-2xl overflow-hidden">
          {/* 경고 헤더 */}
          <div className="bg-red-600 px-5 py-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-white" />
            <h2 className="font-bold text-white">개인정보 전체 폐기 (계약 종료 시)</h2>
          </div>

          <div className="bg-red-50 p-5 space-y-5">
            <p className="text-sm text-red-700 bg-red-100 rounded-xl px-4 py-3 border border-red-200">
              ⚠️ 실행 시 <strong>모든 고객 개인정보(성명·연락처·주소)</strong>가 영구 삭제됩니다.
              주문·민원·SMS 로그의 개인정보도 함께 폐기됩니다. <strong>이 작업은 되돌릴 수 없습니다.</strong>
            </p>

            {/* 단계별 안전 확인 */}
            {!result && (
              <div className="space-y-4">
                {/* 1단계: 폐기 사유 입력 */}
                <div className={`rounded-xl border p-4 transition-all ${step >= 1 ? 'border-red-200 bg-white' : 'border-gray-200 opacity-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
                    <span className="font-medium text-sm text-gray-700">폐기 사유 입력 (선택)</span>
                  </div>
                  <input
                    className="input w-full text-sm"
                    placeholder="계약 종료에 따른 개인정보 보호법 제21조 이행"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={step > 1}
                  />
                  {step === 1 && (
                    <button
                      onClick={() => setStep(2)}
                      className="mt-3 btn-secondary text-sm py-1.5 px-4"
                    >
                      다음 단계
                    </button>
                  )}
                </div>

                {/* 2단계: 확인 문구 입력 */}
                <div className={`rounded-xl border p-4 transition-all ${step >= 2 ? 'border-red-300 bg-white' : 'border-gray-200 opacity-40 pointer-events-none'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
                    <span className="font-medium text-sm text-gray-700">확인 문구 입력</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    아래 칸에 <strong className="text-red-600">"{CONFIRM_PHRASE}"</strong> 를 정확히 입력하세요.
                  </p>
                  <input
                    className={`input w-full text-sm ${confirmText === CONFIRM_PHRASE ? 'border-red-400 bg-red-50' : ''}`}
                    placeholder={CONFIRM_PHRASE}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    disabled={step !== 2}
                  />
                  {step === 2 && canProceedStep3 && (
                    <button
                      onClick={() => setStep(3)}
                      className="mt-3 bg-red-100 hover:bg-red-200 text-red-700 font-medium text-sm py-1.5 px-4 rounded-lg transition-colors"
                    >
                      다음 단계 (최종 확인)
                    </button>
                  )}
                </div>

                {/* 3단계: 최종 실행 */}
                <div className={`rounded-xl border p-4 transition-all ${step === 3 ? 'border-red-400 bg-red-50' : 'border-gray-200 opacity-40 pointer-events-none'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 3 ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'}`}>3</div>
                    <span className="font-medium text-sm text-gray-700">최종 실행</span>
                  </div>
                  <p className="text-sm text-red-700 font-medium mb-3">
                    아래 버튼을 누르면 즉시 폐기가 실행됩니다. 마지막으로 확인하세요.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setStep(1); setConfirmText('') }}
                      className="btn-secondary text-sm py-2 px-4"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => destroyMutation.mutate()}
                      disabled={destroyMutation.isPending}
                      className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold px-6 py-2 rounded-xl disabled:opacity-40 transition-colors shadow-sm"
                    >
                      {destroyMutation.isPending ? '폐기 중...' : '⚠️ 개인정보 전체 폐기 실행'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
