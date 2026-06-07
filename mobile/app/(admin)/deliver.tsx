import { useEffect } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

/**
 * 관리자 하단 탭의 '배송하기' 진입용 플레이스홀더 라우트.
 * 탭 자체는 _layout의 listeners에서 가로채 바로 /(driver)로 보낸다.
 */
export default function DeliverTabRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/(driver)') }, [])
  return <View />
}
