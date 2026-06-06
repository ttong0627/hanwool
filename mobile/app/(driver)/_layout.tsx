import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Platform } from 'react-native'

import { useOfflineSync } from '@/hooks/useOfflineSync'

const T = {
  primary:  '#F97316',
  dark:     '#0F172A',
  inactive: '#94A3B8',
  bg:       '#FFFFFF',
  border:   '#E2E8F0',
}

export default function DriverLayout() {
  // 기사 화면 어디에 있든 오프라인 배송완료 큐를 백그라운드로 자동 전송
  useOfflineSync()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.primary,
        tabBarInactiveTintColor: T.inactive,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          backgroundColor: T.bg,
          borderTopWidth: 1,
          borderTopColor: T.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '오늘 배송',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car" size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '완료 내역',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle" size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size ?? 24} color={color} />
          ),
        }}
      />
      {/* 루트 미리보기 / 지도 — 탭바에 표시하지 않고 헤더 버튼으로만 접근 */}
      <Tabs.Screen name="route" options={{ href: null }} />
      <Tabs.Screen name="map" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  )
}
