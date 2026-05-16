import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  UserCog, UserPlus, X, KeyRound, ToggleLeft, ToggleRight, Shield,
} from 'lucide-react'
import api from '@/lib/api'
import { formatDate, formatPhone } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

interface StaffUser {
  id: number
  name: string
  phone: string
  role: string
  is_active: boolean
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: '최고관리자',
  admin: '관리자',
  receiver: '접수자',
  driver: '기사',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-brand-50 text-brand-700 border-brand-200',
  receiver: 'bg-blue-50 text-blue-700 border-blue-200',
  driver: 'bg-green-50 text-green-700 border-green-200',
}

const STAFF_ROLES = ['super_admin', 'admin', 'receiver', 'driver']

// ── 신규 계정 등록 모달 ─────────────────────────────────────────
function CreateStaffModal({ onClose, currentRole }: { onClose: () => void; currentRole: string }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', phone: '', role: 'receiver', password: '' })

  const availableRoles = currentRole === 'super_admin'
    ? ['super_admin', 'admin', 'receiver', 'driver']
    : ['receiver', 'driver']

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-users'] })
      onClose()
    },
  })

  const valid = form.name.trim() && form.phone.trim() && form.password.trim()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">신규 계정 등록</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="홍길동"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 <span className="text-red-500">*</span></label>
            <input
              className="input w-full"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
              placeholder="010-0000-0000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">역할 <span className="text-red-500">*</span></label>
            <select
              className="input w-full"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {availableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span className="text-red-500">*</span></label>
            <input
              className="input w-full"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="8자 이상"
            />
          </div>
          {createMutation.isError && (
            <p className="text-red-500 text-sm">등록에 실패했습니다. 전화번호가 이미 사용 중일 수 있습니다.</p>
          )}
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!valid || createMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {createMutation.isPending ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 비밀번호 재설정 모달 ────────────────────────────────────────
function ResetPasswordModal({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const resetMutation = useMutation({
    mutationFn: () => api.put(`/users/${user.id}/password`, { password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-users'] })
      onClose()
    },
  })

  const mismatch = confirm && password !== confirm
  const valid = password.length >= 8 && password === confirm

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">비밀번호 재설정</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <span className="text-gray-500">대상: </span>
            <span className="font-semibold text-gray-900">{user.name}</span>
            <span className="text-gray-400 ml-2">({user.phone})</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
            <input
              className="input w-full"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
            <input
              className={`input w-full ${mismatch ? 'border-red-400 focus:ring-red-300' : ''}`}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="동일하게 입력"
            />
            {mismatch && <p className="text-red-500 text-xs mt-1">비밀번호가 일치하지 않습니다.</p>}
          </div>
          {resetMutation.isError && (
            <p className="text-red-500 text-sm">재설정에 실패했습니다. 다시 시도해 주세요.</p>
          )}
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => resetMutation.mutate()}
            disabled={!valid || resetMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {resetMutation.isPending ? '변경 중...' : '변경'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 역할 변경 모달 (super_admin 전용) ──────────────────────────
function ChangeRoleModal({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const qc = useQueryClient()
  const [role, setRole] = useState(user.role)

  const roleMutation = useMutation({
    mutationFn: () => api.put(`/users/${user.id}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-users'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-lg">역할 변경</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-gray-50 rounded-xl p-3 text-sm">
            <span className="font-semibold text-gray-900">{user.name}</span>
            <span className="text-gray-400 ml-2">({user.phone})</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">역할 선택</label>
            <select
              className="input w-full"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary">취소</button>
          <button
            onClick={() => roleMutation.mutate()}
            disabled={role === user.role || roleMutation.isPending}
            className="flex-1 btn-primary disabled:opacity-40"
          >
            {roleMutation.isPending ? '변경 중...' : '변경'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export function StaffUsers() {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null)
  const [roleTarget, setRoleTarget] = useState<StaffUser | null>(null)
  const [roleFilter, setRoleFilter] = useState('')

  const { data: users = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: ['staff-users'],
    queryFn: () => api.get('/users').then((r) =>
      (r.data as StaffUser[]).filter((u) => STAFF_ROLES.includes(u.role))
    ),
    staleTime: 30_000,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-users'] }),
  })

  const filtered = roleFilter ? users.filter((u) => u.role === roleFilter) : users

  return (
    <div className="p-6 space-y-4">
      {showCreate && currentUser && (
        <CreateStaffModal currentRole={currentUser.role} onClose={() => setShowCreate(false)} />
      )}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
      {roleTarget && (
        <ChangeRoleModal user={roleTarget} onClose={() => setRoleTarget(null)} />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="w-6 h-6 text-brand-500" />
            사용자 관리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            스태프 계정 등록 · 비밀번호 관리 · 역할 설정
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" />신규 계정
        </button>
      </div>

      {/* 역할 필터 탭 */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: '', label: '전체' }, ...STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setRoleFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              roleFilter === value
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs opacity-70">
              {value ? users.filter((u) => u.role === value).length : users.length}
            </span>
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}

      {!isLoading && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="pb-3 pr-4 font-medium">이름</th>
                <th className="pb-3 pr-4 font-medium">전화번호</th>
                <th className="pb-3 pr-4 font-medium">역할</th>
                <th className="pb-3 pr-4 font-medium">상태</th>
                <th className="pb-3 pr-4 font-medium">등록일</th>
                <th className="pb-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b last:border-0 hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}
                >
                  <td className="py-3 pr-4 font-medium text-gray-900">{u.name}</td>
                  <td className="py-3 pr-4 text-gray-600 tabular-nums">{u.phone}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium ${u.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                      {u.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-xs tabular-nums">{formatDate(u.created_at)}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      {/* 비밀번호 재설정 */}
                      <button
                        onClick={() => setResetTarget(u)}
                        className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors"
                        title="비밀번호 재설정"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>

                      {/* 역할 변경 (super_admin 전용) */}
                      {currentUser?.role === 'super_admin' && (
                        <button
                          onClick={() => setRoleTarget(u)}
                          className="p-1.5 hover:bg-purple-50 rounded-lg text-gray-400 hover:text-purple-600 transition-colors"
                          title="역할 변경"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* 활성/비활성 토글 */}
                      <button
                        onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                        className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                        title={u.is_active ? '비활성화' : '활성화'}
                      >
                        {u.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center text-gray-400 py-10">
              <UserCog className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>등록된 계정이 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 안내 메모 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">로그인 안내</p>
        <ul className="space-y-0.5 text-blue-600 text-xs">
          <li>· 관리자·접수자: 웹 브라우저 로그인 (전화번호 + 비밀번호)</li>
          <li>· 기사: 모바일 앱 로그인 (전화번호 + 비밀번호)</li>
          <li>· 등록 후 비밀번호를 해당 직원에게 전달해 주세요.</li>
        </ul>
      </div>
    </div>
  )
}
