import { useEffect } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

/**
 * 기사 하단 탭의 '관리자' 진입용 플레이스홀더 라우트.
 * 탭 자체는 _layout의 listeners에서 가로채 바로 /(admin)으로 보내므로
 * 이 화면이 실제로 보이는 경우는 거의 없지만, 안전망으로 리다이렉트한다.
 */
export default function AdminTabRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/(admin)') }, [])
  return <View />
}
