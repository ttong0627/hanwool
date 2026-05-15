import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Shield, AlertTriangle, Download } from 'lucide-react'
import api from '@/lib/api'

export function Privacy() {
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<{ destroyed_at: string; message: string } | null>(null)

  const destroyMutation = useMutation({
    mutationFn: () => api.post('/admin/privacy/destroy'),
    onSuccess: (res) => setResult(res.data),
  })

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Shield className="w-6 h-6 text-brand-500" />개인정보 관리
      </h1>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">개인정보 보호 현황</h2>
        <ul className="text-sm text-gray-600 space-y-1.5">
          <li className="flex items-center gap-2">✅ 성명·연락처·주소 AES-256 암호화 저장</li>
          <li className="flex items-center gap-2">✅ 전송 구간 HTTPS/TLS 암호화</li>
          <li className="flex items-center gap-2">✅ 역할별 API 접근 통제 (RBAC)</li>
          <li className="flex items-center gap-2">✅ 전화번호 SHA-256 해시로만 검색 가능</li>
        </ul>
      </div>

      <div className="border-2 border-red-200 rounded-xl p-5 bg-red-50 space-y-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5" />
          <h2 className="font-bold">개인정보 전체 폐기 (계약 종료 시)</h2>
        </div>
        <p className="text-sm text-red-600">
          실행 시 모든 고객 개인정보(성명·연락처·주소)가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        {!result ? (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm text-red-700 font-medium">개인정보 폐기를 동의합니다. 이 작업은 되돌릴 수 없습니다.</span>
            </label>
            <button
              disabled={!confirmed || destroyMutation.isPending}
              onClick={() => destroyMutation.mutate()}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition-colors"
            >
              {destroyMutation.isPending ? '폐기 중...' : '개인정보 전체 폐기 실행'}
            </button>
          </>
        ) : (
          <div className="bg-white rounded-lg p-4 text-green-700">
            <p className="font-semibold">✅ 폐기 완료</p>
            <p className="text-sm">폐기 일시: {result.destroyed_at}</p>
            <p className="text-sm">{result.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
