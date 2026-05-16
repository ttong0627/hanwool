import { Tabs } from 'expo-router'
import { Text } from 'react-native'

export default function DriverLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { height: 60, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '배송 목록',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🚚</Text>,
        }}
      />
    </Tabs>
  )
}
