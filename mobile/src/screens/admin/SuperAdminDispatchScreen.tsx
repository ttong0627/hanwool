import { useState } from 'react'
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface TodayStatus {
  total: number
  by_status: {
    pending: number
    assigned: number
    picked_up: number
    in_transit: number
    delivered: number
    delayed: number
  }
}

interface Driver {
  id: number
  name: string
  phone: string
  is_active: boolean
}

interface DriverStat {
  driver_id: number
  total: number
  delivered: number
}

const MAX_DRIVERS = 18

export function SuperAdminDispatchScreen() {
  const qc = useQueryClient()
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  const user = useAuthStore((state) => state.user)
  const [selectedDriverIds, setSelectedDriverIds] = useState<number[]>([])

  const { data: status, isLoading, refetch } = useQuery<TodayStatus>({
    queryKey: ['dispatch-today-status'],
    queryFn: () => api.get('/orders/dispatch/today-status').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const { data: driverStats = [] } = useQuery<DriverStat[]>({
    queryKey: ['driver-stats'],
    queryFn: () => api.get('/admin/stats/drivers').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const activeDrivers = drivers.filter((d) => d.is_active)
  const statMap: Record<number, DriverStat> = {}
  driverStats.forEach((s) => { statMap[s.driver_id] = s })

  const by = status?.by_status
  const unassigned = by?.pending ?? 0
  const ready = by?.assigned ?? 0
  const moving = (by?.picked_up ?? 0) + (by?.in_transit ?? 0)
  const done = by?.delivered ?? 0

  const dispatchMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch', { driver_ids: selectedDriverIds }).then((r) => r.data),
    onSuccess: (data) => {
      setSelectedDriverIds([])
      qc.invalidateQueries({ queryKey: ['dispatch-today-status'] })
      qc.invalidateQueries({ queryKey: ['driver-stats'] })
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      Alert.alert('배정 완료', `${data?.total ?? 0}건을 선택한 기사에게 배송준비로 배정했습니다.\n기사가 앱에서 '배송업무 시작'을 누르면 출발합니다.`)
    },
    onError: (err: any) => Alert.alert('오류', err?.response?.data?.detail ?? '배정 중 문제가 발생했습니다.'),
  })

  const toggleDriver = (id: number) => {
    setSelectedDriverIds((prev) => (
      prev.includes(id) ? prev.filter((v) => v !== id) : (prev.length >= MAX_DRIVERS ? prev : [...prev, id])
    ))
  }

  const runDispatch = () => {
    if (selectedDriverIds.length === 0) {
      Alert.alert('기사 선택 필요', '배정할 기사를 1명 이상 선택해 주세요.')
      return
    }
    const names = activeDrivers.filter((d) => selectedDriverIds.includes(d.id)).map((d) => d.name).join(', ')
    const willReassign = ready > 0 || moving > 0
    Alert.alert(
      willReassign ? '재배정 확인' : '배정 확인',
      `오늘 배송 ${status?.total ?? 0}건을\n${names} (${selectedDriverIds.length}명)\n에게 ${willReassign ? '재배정' : '배정'}합니다.\n\n각 기사에게 거리 기반으로 순번까지 자동 지정됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        { text: willReassign ? '재배정' : '배정', onPress: () => dispatchMutation.mutate() },
      ],
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>기사 배정 (총관리자)</Text>
          <Text style={styles.subtitle}>기사를 선택해 오늘 배송을 배정/재배정합니다.</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.checkBtn} onPress={() => router.push('/(admin)/deliveries')}>
            <Text style={styles.checkText}>📋 배송확인</Text>
          </TouchableOpacity>
          {user?.is_driver && (
            <TouchableOpacity style={styles.myDeliveryBtn} onPress={() => router.push('/(driver)')}>
              <Text style={styles.myDeliveryText}>🚚 내 배송</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 오늘 현황 요약 */}
      <View style={styles.statusRow}>
        <View style={styles.statCard}><Text style={styles.statNum}>{status?.total ?? 0}</Text><Text style={styles.statLabel}>총 배송</Text></View>
        <View style={[styles.statCard, unassigned > 0 && styles.statCardWarn]}><Text style={[styles.statNum, unassigned > 0 && styles.statNumWarn]}>{unassigned}</Text><Text style={styles.statLabel}>미배정</Text></View>
        <View style={styles.statCard}><Text style={[styles.statNum, { color: '#2563EB' }]}>{ready}</Text><Text style={styles.statLabel}>배송준비</Text></View>
        <View style={styles.statCard}><Text style={[styles.statNum, { color: '#F97316' }]}>{moving}</Text><Text style={styles.statLabel}>배송중</Text></View>
        <View style={styles.statCard}><Text style={[styles.statNum, { color: '#059669' }]}>{done}</Text><Text style={styles.statLabel}>완료</Text></View>
      </View>

      <Text style={styles.guide}>
        기사를 선택하고 아래 버튼을 누르면 그 기사에게 <Text style={{ fontWeight: '800', color: '#2563EB' }}>배송준비</Text>로 배정됩니다.
        다른 기사를 선택해 다시 누르면 <Text style={{ fontWeight: '800', color: '#c2410c' }}>재배정</Text>됩니다.
      </Text>

      <Text style={styles.sectionTitle}>배정할 기사 선택 ({selectedDriverIds.length}/{MAX_DRIVERS})</Text>
      <FlatList
        data={activeDrivers}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { refetch(); qc.invalidateQueries({ queryKey: ['driver-stats'] }) }} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>활성 기사가 없습니다. 사용자 관리에서 기사를 등록·활성화해 주세요.</Text>}
        renderItem={({ item }) => {
          const selected = selectedDriverIds.includes(item.id)
          const s = statMap[item.id]
          return (
            <TouchableOpacity
              style={[styles.driverItem, selected && styles.driverItemActive]}
              onPress={() => toggleDriver(item.id)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, selected && styles.driverNameActive]}>{item.name}</Text>
                <Text style={styles.driverPhone}>{item.phone}</Text>
              </View>
              {s && s.total > 0 && (
                <View style={styles.loadBadge}>
                  <Text style={styles.loadText}>오늘 {s.total}건 · 완료 {s.delivered}</Text>
                </View>
              )}
              <Text style={[styles.check, selected && styles.checkActive]}>{selected ? '✓ 선택' : '선택'}</Text>
            </TouchableOpacity>
          )
        }}
      />

      <TouchableOpacity
        style={[styles.approveBtn, (selectedDriverIds.length === 0 || dispatchMutation.isPending) && styles.approveDisabled]}
        onPress={runDispatch}
        disabled={selectedDriverIds.length === 0 || dispatchMutation.isPending}
      >
        <Text style={styles.approveText}>
          {dispatchMutation.isPending
            ? '배정 중...'
            : selectedDriverIds.length === 0
              ? '기사를 선택하세요'
              : `${selectedDriverIds.length}명에게 ${(ready > 0 || moving > 0) ? '재배정' : '배정'}`}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myDeliveryBtn: { backgroundColor: '#F97316', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  myDeliveryText: { color: '#FFFFFF', fontWeight: '800' },
  checkBtn: { backgroundColor: '#0F172A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  checkText: { color: '#FFFFFF', fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  logoutBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  logoutText: { color: '#dc2626', fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statCardWarn: { borderColor: '#fdba74', backgroundColor: '#fff7ed' },
  statNum: { fontSize: 20, fontWeight: '900', color: '#111827' },
  statNumWarn: { color: '#ea580c' },
  statLabel: { marginTop: 2, fontSize: 11, color: '#6b7280', fontWeight: '600' },
  guide: { fontSize: 12.5, color: '#374151', lineHeight: 18, backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 8 },
  list: { gap: 8, paddingBottom: 96 },
  emptyText: { textAlign: 'center', color: '#9ca3af', paddingVertical: 24 },
  driverItem: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  driverItemActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  driverName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  driverNameActive: { color: '#c2410c' },
  driverPhone: { marginTop: 3, color: '#6b7280' },
  loadBadge: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  loadText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  check: { color: '#9ca3af', fontWeight: '800', minWidth: 44, textAlign: 'right' },
  checkActive: { color: '#f97316' },
  approveBtn: { position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  approveDisabled: { backgroundColor: '#fed7aa' },
  approveText: { color: 'white', fontSize: 17, fontWeight: '900' },
})
