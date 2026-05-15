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

function PrivateRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const user = useAuthStore((s) => s.user)

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/receiver'} replace /> : <LoginPage />} />

      <Route path="/admin/*" element={
        <PrivateRoute roles={['admin']}>
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
        <PrivateRoute roles={['receiver', 'admin']}>
          <Layout>
            <Routes>
              <Route index element={<OrderForm />} />
              <Route path="list" element={<ReceiverOrderList />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/" element={
        user ? <Navigate to={user.role === 'admin' ? '/admin' : '/receiver'} replace /> : <Navigate to="/login" replace />
      } />
    </Routes>
  )
}
