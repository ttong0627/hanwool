import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Platform } from 'react-native'

const T = {
  primary: '#F97316',
  inactive: '#94A3B8',
  bg: '#FFFFFF',
  border: '#E2E8F0',
}

export default function ReceiverLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.primary,
        tabBarInactiveTintColor: T.inactive,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 6,
          backgroundColor: T.bg,
          borderTopWidth: 1,
          borderTopColor: T.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '주문 입력',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create" size={size ?? 24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: '주문 확인',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size ?? 24} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
