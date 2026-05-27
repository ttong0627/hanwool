import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, Truck, Users, BarChart3, LogOut,
  Shield, QrCode, UserCog, MapPin, Route, UserCircle, FileCheck2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { HanwoolLogo } from './HanwoolLogo'

const adminNavs = [
  { to: '/admin',                    icon: LayoutDashboard, label: '대시보드' },
  { to: '/admin/orders',             icon: ClipboardList,   label: '주문 관리' },
  { to: '/admin/delivery-tracking',  icon: MapPin,          label: '배송 확인' },
  { to: '/admin/dispatch',           icon: Route,           label: '배차 관리' },
  { to: '/admin/delivery-receipts',   icon: FileCheck2,      label: '배송 수령증' },
  { to: '/admin/drivers',            icon: Truck,           label: '기사 관리' },
  { to: '/admin/customers',          icon: Users,           label: '고객 관리' },
  { to: '/admin/reports',            icon: BarChart3,       label: '통계·보고서' },
  { to: '/admin/privacy',            icon: Shield,          label: '개인정보' },
  { to: '/admin/users',              icon: UserCog,         label: '사용자 관리' },
  { to: '/admin/my-account',         icon: UserCircle,      label: '내 계정' },
]

const receiverNavs = [
  { to: '/receiver',              icon: ClipboardList, label: '주문 접수' },
  { to: '/receiver/list',         icon: LayoutDashboard, label: '오늘 명단' },
  { to: '/receiver/labels',       icon: QrCode,        label: '라벨 출력' },
  { to: '/receiver/my-account',   icon: UserCircle,    label: '내 계정' },
]

const ROLE_LABELS: Record<string, string> = {
  super_admin: '최고관리자',
  admin: '관리자',
  receiver: '접수자',
  driver: '기사',
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const navs = ['admin', 'super_admin'].includes(user?.role || '') ? adminNavs : receiverNavs

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen bg-[#f8f9fb]">
      {/* ── 다크 사이드바 ─────────────────────────────────────── */}
      <aside className="w-60 bg-[#0f1729] flex flex-col shrink-0">

        {/* 로고 영역 */}
        <div className="px-4 py-4 border-b border-white/5">
          <HanwoolLogo size={34} showText variant="full" className="[&_.text-brand-700]:text-orange-300 [&_.text-gray-500]:text-slate-400" />
        </div>

        {/* 내비게이션 */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to.split('/').length <= 2}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group',
                  isActive
                    ? 'bg-brand-500/15 text-brand-300 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.15)]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn(
                    'w-4 h-4 shrink-0 transition-colors',
                    isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'
                  )} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 하단 사용자 정보 */}
        <div className="p-3 border-t border-white/5">
          <div className="bg-white/5 rounded-xl px-3 py-2.5 mb-2">
            <div className="text-xs font-semibold text-slate-200 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 w-full text-sm text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* ── 메인 콘텐츠 ──────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
