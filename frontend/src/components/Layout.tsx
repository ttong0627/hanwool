import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, Truck, Users, BarChart3, LogOut,
  Shield, QrCode, UserCog, MapPin, Route, UserCircle, FileCheck2,
  PanelLeftClose, PanelLeftOpen, PackageCheck, Settings,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { HanwoolLogo } from './HanwoolLogo'

const adminNavs = [
  { to: '/admin',                    icon: LayoutDashboard, label: '대시보드' },
  { to: '/admin/orders',             icon: ClipboardList,   label: '주문 관리' },
  { to: '/admin/delivery-tracking',  icon: MapPin,          label: '배송 확인' },
  { to: '/admin/delivery-completed', icon: PackageCheck,    label: '배송 완료' },
  { to: '/admin/delivery-receipts',  icon: FileCheck2,      label: '배송 수령증' },
  { to: '/admin/reports',            icon: BarChart3,       label: '통계·보고서' },
]

const adminManagementNavs = [
  { to: '/admin/dispatch',  icon: Route,      label: '배차 관리', superOnly: true },
  { to: '/admin/drivers',   icon: Truck,      label: '기사 관리', superOnly: true },
  { to: '/admin/customers', icon: Users,      label: '고객 관리' },
  { to: '/admin/users',     icon: UserCog,    label: '사용자 관리', superOnly: true },
  { to: '/admin/my-account', icon: UserCircle, label: '내 계정' },
  { to: '/admin/privacy',   icon: Shield,     label: '개인정보', superOnly: true },
]

const receiverNavs = [
  { to: '/receiver',                  icon: ClipboardList,   label: '주문 접수' },
  { to: '/receiver/list',             icon: LayoutDashboard, label: '오늘 명단' },
  { to: '/receiver/labels',           icon: QrCode,          label: '라벨 출력' },
  { to: '/receiver/delivery-receipts', icon: FileCheck2,     label: '배송 수령증' },
  { to: '/receiver/my-account',       icon: UserCircle,      label: '내 계정' },
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
  const managementMenuRef = useRef<HTMLDivElement>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1')
  const [managementMenuOpen, setManagementMenuOpen] = useState(false)
  const navs = ['admin', 'super_admin'].includes(user?.role || '') ? adminNavs : receiverNavs
  const managementNavs = user?.role === 'super_admin'
    ? adminManagementNavs
    : adminManagementNavs.filter((item) => !item.superOnly)

  const handleLogout = () => {
    setManagementMenuOpen(false)
    logout()
    navigate('/login')
  }
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!managementMenuRef.current?.contains(event.target as Node)) {
        setManagementMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  return (
    <div className="flex h-screen" style={{ background: 'var(--surface-base)' }}>
      <aside
        className={cn(
          'flex flex-col shrink-0 transition-[width] duration-200',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
        style={{
          background: 'linear-gradient(180deg, #0e1628 0%, #111e35 60%, #0d1525 100%)',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
        }}
      >
        {/* 로고 영역 */}
        <div className={cn('border-b border-white/5', sidebarCollapsed ? 'px-2 py-3' : 'px-4 py-4')}>
          <div className={cn('flex items-center gap-2', sidebarCollapsed ? 'flex-col justify-center' : 'justify-between')}>
            <HanwoolLogo
              size={sidebarCollapsed ? 30 : 34}
              showText={!sidebarCollapsed}
              variant="full"
              className="[&_.text-brand-700]:text-orange-300 [&_.text-gray-500]:text-slate-400"
            />
            <button
              type="button"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-slate-100"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to.split('/').length <= 2}
              title={sidebarCollapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center rounded-lg text-sm font-medium transition-all duration-150 group',
                  sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2',
                  isActive
                    ? 'text-brand-300'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                )
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: 'linear-gradient(90deg, rgba(249,115,22,0.14) 0%, rgba(249,115,22,0.04) 100%)',
                      boxShadow: 'inset 0 0 0 1px rgba(249,115,22,0.12)',
                    }
                  : {}
              }
            >
              {({ isActive }) => (
                <>
                  {/* 활성 상태 왼쪽 바 */}
                  {isActive && !sidebarCollapsed && (
                    <span
                      className="absolute left-0 top-[18%] bottom-[18%] w-[3px] rounded-r-full"
                      style={{ background: '#f97316' }}
                    />
                  )}
                  <Icon className={cn(
                    'w-4 h-4 shrink-0 transition-colors',
                    isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'
                  )} />
                  {!sidebarCollapsed && label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 사용자 섹션 */}
        <div ref={managementMenuRef} className="relative p-2.5 border-t border-white/5">
          {['admin', 'super_admin'].includes(user?.role || '') && managementMenuOpen && (
            <div
              className={cn(
                'absolute bottom-[calc(100%-0.25rem)] z-30 rounded-lg border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl shadow-black/30 backdrop-blur',
                sidebarCollapsed ? 'left-2 w-52' : 'left-2 right-2'
              )}
            >
              {managementNavs.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setManagementMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-orange-500/15 text-brand-300'
                        : 'text-slate-300 hover:bg-white/7 hover:text-white'
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
          {!sidebarCollapsed && (
            <div
              className="rounded-xl px-3 py-2.5 mb-1.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
                >
                  {user?.name?.slice(0, 1) ?? '?'}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate">{user?.name}</div>
                  <div className="text-[10px] text-slate-500">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
                </div>
                {['admin', 'super_admin'].includes(user?.role || '') && (
                  <button
                    type="button"
                    onClick={() => setManagementMenuOpen((prev) => !prev)}
                    title="관리자 메뉴"
                    className={cn(
                      'ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors',
                      managementMenuOpen ? 'bg-white/10 text-brand-300' : 'hover:bg-white/8 hover:text-slate-100'
                    )}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
          {sidebarCollapsed && ['admin', 'super_admin'].includes(user?.role || '') && (
            <button
              type="button"
              onClick={() => setManagementMenuOpen((prev) => !prev)}
              title="관리자 메뉴"
              className={cn(
                'mb-1.5 flex w-full items-center justify-center rounded-lg py-2.5 text-slate-500 transition-all duration-150',
                managementMenuOpen ? 'bg-white/10 text-brand-300' : 'hover:bg-white/8 hover:text-slate-100'
              )}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? '로그아웃' : undefined}
            className={cn(
              'flex items-center w-full text-sm text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all duration-150',
              sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-2 px-3 py-2'
            )}
          >
            <LogOut className="w-4 h-4" />
            {!sidebarCollapsed && '로그아웃'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
