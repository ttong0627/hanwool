import { Redirect } from 'expo-router'
import { useAuthStore } from '@/store/authStore'

export default function Index() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/login" />
  if (user.role === 'driver') return <Redirect href="/(driver)" />
  return <Redirect href="/(customer)" />
}
