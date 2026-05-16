import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/Login'
import { Dashboard } from '@/pages/admin/Dashboard'
import { Orders } from '@/pages/admin/Orders'
import { Drivers } from '@/pages/admin/Drivers'
import { Customers } from '@/pages/admin/Customers'
import { Complaints } from '@/pages/admin/Complaints'
import { Reports } from '@/pages/admin/Reports'
import { Privacy } from '@/pages/admin/Privacy'
import { OrderForm } from '@/pages/receiver/OrderForm'
import { ReceiverOrderList } from '@/pages/receiver/OrderList'
import { LabelPrint } from '@/pages/receiver/LabelPrint'

const WEB_APP_ROLES = ['admin', 'super_admin', 'receiver']

function roleToHome(role: string): string {
  if (['admin', 'super_admin'].includes(role)) return '/admin'
  if (role === 'receiver') return '/receiver'
  return '/login'
}

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const user = useAuthStore((s) => s.user)

  return (
    <Routes>
      <Route path="/login" element={
        user && WEB_APP_ROLES.includes(user.role)
          ? <Navigate to={roleToHome(user.role)} replace />
          : <LoginPage />
      } />

      <Route path="/admin/*" element={
        <PrivateRoute roles={['admin', 'super_admin']}>
          <Layout>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<Orders />} />
              <Route path="drivers" element={<Drivers />} />
              <Route path="customers" element={<Customers />} />
              <Route path="complaints" element={<Complaints />} />
              <Route path="reports" element={<Reports />} />
              <Route path="privacy" element={<Privacy />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/receiver/*" element={
        <PrivateRoute roles={['receiver', 'admin', 'super_admin']}>
          <Layout>
            <Routes>
              <Route index element={<OrderForm />} />
              <Route path="list" element={<ReceiverOrderList />} />
              <Route path="labels" element={<LabelPrint />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />

      <Route path="*" element={
        user
          ? <Navigate to={roleToHome(user.role)} replace />
          : <Navigate to="/login" replace />
      } />
    </Routes>
  )
}
