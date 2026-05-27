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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface DispatchRequest {
  id: number
  requested_by_driver_name: string
  requested_by_driver_phone: string
  total_orders: number
  pending_orders: number
  recommended_driver_count: number
}

interface Driver {
  id: number
  name: string
  phone: string
  is_active: boolean
}

export function SuperAdminDispatchScreen() {
  const qc = useQueryClient()
  const logout = useAuthStore((state) => state.logout)
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null)
  const [selectedDriverIds, setSelectedDriverIds] = useState<number[]>([])

  const { data: requests = [], isLoading, refetch } = useQuery<DispatchRequest[]>({
    queryKey: ['dispatch-requests', 'pending'],
    queryFn: () => api.get('/admin/dispatch-requests', { params: { status_filter: 'pending' } }).then((r) => r.data),
    refetchInterval: 20_000,
  })

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const activeDrivers = drivers.filter((driver) => driver.is_active)
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) || requests[0]

  const resolveMutation = useMutation({
    mutationFn: () => api.post(`/admin/dispatch-requests/${selectedRequest?.id}/resolve`, { driver_ids: selectedDriverIds }),
    onSuccess: () => {
      setSelectedDriverIds([])
      setSelectedRequestId(null)
      qc.invalidateQueries({ queryKey: ['dispatch-requests', 'pending'] })
      Alert.alert('배정 완료', '총관리자 결정에 따라 오늘 배송을 배정했습니다.')
    },
    onError: () => Alert.alert('오류', '배정 승인 중 문제가 발생했습니다.'),
  })

  const toggleDriver = (id: number) => {
    setSelectedDriverIds((prev) => (
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id].slice(0, 4)
    ))
  }

  const approve = () => {
    if (!selectedRequest || selectedDriverIds.length === 0) {
      Alert.alert('기사 선택 필요', '배정할 기사를 1명 이상 선택해 주세요.')
      return
    }
    resolveMutation.mutate()
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>총관리자 배정 알림</Text>
          <Text style={styles.subtitle}>40건 초과 배송 요청을 직접 승인합니다.</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {!selectedRequest ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>대기 중인 배정 요청이 없습니다.</Text>
          <Text style={styles.emptyText}>기사 요청이 들어오면 이 화면에 표시됩니다.</Text>
        </View>
      ) : (
        <View style={styles.requestBox}>
          <Text style={styles.alertLabel}>기사 추가/분배 결정 요청</Text>
          <Text style={styles.requestTitle}>
            총 {selectedRequest.total_orders}건 · 미배정 {selectedRequest.pending_orders}건
          </Text>
          <Text style={styles.requestSub}>
            요청 기사: {selectedRequest.requested_by_driver_name} ({selectedRequest.requested_by_driver_phone})
          </Text>
          <Text style={styles.recommend}>권장 기사 수: {selectedRequest.recommended_driver_count}명</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>배정 기사 선택</Text>
      <FlatList
        data={activeDrivers}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = selectedDriverIds.includes(item.id)
          return (
            <TouchableOpacity
              style={[styles.driverItem, selected && styles.driverItemActive]}
              onPress={() => toggleDriver(item.id)}
            >
              <View>
                <Text style={[styles.driverName, selected && styles.driverNameActive]}>{item.name}</Text>
                <Text style={styles.driverPhone}>{item.phone}</Text>
              </View>
              <Text style={[styles.check, selected && styles.checkActive]}>{selected ? '선택' : '대기'}</Text>
            </TouchableOpacity>
          )
        }}
      />

      <TouchableOpacity
        style={[styles.approveBtn, (!selectedRequest || selectedDriverIds.length === 0 || resolveMutation.isPending) && styles.approveDisabled]}
        onPress={approve}
        disabled={!selectedRequest || selectedDriverIds.length === 0 || resolveMutation.isPending}
      >
        <Text style={styles.approveText}>
          {resolveMutation.isPending ? '배정 중...' : `${selectedDriverIds.length}명으로 배정 승인`}
        </Text>
      </TouchableOpacity>

      {requests.length > 1 && (
        <View style={styles.requestTabs}>
          {requests.map((request) => (
            <TouchableOpacity key={request.id} style={styles.requestTab} onPress={() => setSelectedRequestId(request.id)}>
              <Text style={styles.requestTabText}>{request.total_orders}건 요청</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  logoutBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  logoutText: { color: '#dc2626', fontWeight: '700' },
  empty: { backgroundColor: 'white', borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptyText: { marginTop: 6, color: '#6b7280' },
  requestBox: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
  alertLabel: { color: '#c2410c', fontWeight: '800', marginBottom: 8 },
  requestTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  requestSub: { marginTop: 6, color: '#7c2d12' },
  recommend: { marginTop: 10, fontWeight: '800', color: '#c2410c' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 8 },
  list: { gap: 8, paddingBottom: 96 },
  driverItem: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  driverItemActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  driverName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  driverNameActive: { color: '#c2410c' },
  driverPhone: { marginTop: 3, color: '#6b7280' },
  check: { color: '#9ca3af', fontWeight: '700' },
  checkActive: { color: '#f97316' },
  approveBtn: { position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  approveDisabled: { backgroundColor: '#fed7aa' },
  approveText: { color: 'white', fontSize: 17, fontWeight: '900' },
  requestTabs: { position: 'absolute', left: 16, right: 16, bottom: 84, flexDirection: 'row', gap: 8 },
  requestTab: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  requestTabText: { color: '#0369a1', fontWeight: '700', fontSize: 12 },
})
