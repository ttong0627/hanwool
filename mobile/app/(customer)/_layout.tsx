import { Tabs } from 'expo-router'
import { Text } from 'react-native'

export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { height: 68, paddingBottom: 10 },
        tabBarLabelStyle: { fontSize: 15, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '주문하기',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>🛍️</Text>,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: '배송추적',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>📍</Text>,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '주문내역',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 26, color }}>📋</Text>,
        }}
      />
    </Tabs>
  )
}
