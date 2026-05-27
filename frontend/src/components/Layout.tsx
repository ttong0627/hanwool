import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Truck, Users, MessageSquareWarning, BarChart3, LogOut, Shield, QrCode, UserCog, MapPin, Route } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { HanwoolLogo } from './HanwoolLogo'

const adminNavs = [
  { to: '/admin', icon: LayoutDashboard, label: '대시보드' },
  { to: '/admin/orders', icon: ClipboardList, label: '주문 관리' },
  { to: '/admin/delivery-tracking', icon: MapPin, label: '배송 확인' },
  { to: '/admin/dispatch', icon: Route, label: '배차 관리' },
  { to: '/admin/drivers', icon: Truck, label: '기사 관리' },
  { to: '/admin/customers', icon: Users, label: '고객 관리' },
  { to: '/admin/complaints', icon: MessageSquareWarning, label: '민원 관리' },
  { to: '/admin/reports', icon: BarChart3, label: '통계·보고서' },
  { to: '/admin/privacy', icon: Shield, label: '개인정보' },
  { to: '/admin/users', icon: UserCog, label: '사용자 관리' },
]

const receiverNavs = [
  { to: '/receiver', icon: ClipboardList, label: '주문 접수' },
  { to: '/receiver/list', icon: LayoutDashboard, label: '오늘 명단' },
  { to: '/receiver/labels', icon: QrCode, label: '라벨 출력' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const navs = ['admin', 'super_admin'].includes(user?.role || '') ? adminNavs : receiverNavs

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <HanwoolLogo size={36} showText variant="full" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to.split('/').length <= 2}
              className={({ isActive }) =>
                cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <div className="px-3 py-2 text-xs text-gray-500 font-medium">{user?.name} ({user?.role})</div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 w-full text-sm text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
