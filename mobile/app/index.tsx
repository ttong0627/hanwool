import { Redirect } from 'expo-router'
import { useAuthStore } from '@/store/authStore'

export default function Index() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/login" />
  if (user.role === 'driver') return <Redirect href="/(driver)" />
  if (user.role === 'super_admin' || user.role === 'admin') return <Redirect href="/(admin)" />
  return <Redirect href="/(customer)" />
}
