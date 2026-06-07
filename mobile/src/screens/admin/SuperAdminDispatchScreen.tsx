import { useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface DongStat {
  dong: string
  total: number
  unassigned: number
  drivers: { driver_id: number; count: number }[]
}
interface DongStatusResp {
  dongs: DongStat[]
  total_unassigned: number
  unassigned_dong_count: number
}
interface Driver {
  id: number
  name: string
  phone: string
  is_active: boolean
}

export function SuperAdminDispatchScreen() {
  const qc = useQueryClient()
  const router = useRouter()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  const [driverId, setDriverId] = useState<number | null>(null)
  const [selectedDongs, setSelectedDongs] = useState<string[]>([])

  const { data: status, isLoading, refetch } = useQuery<DongStatusResp>({
    queryKey: ['dong-status'],
    queryFn: () => api.get('/orders/dispatch/dong-status').then((r) => r.data),
    refetchInterval: 15_000,
  })
  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })

  const dongs = status?.dongs ?? []
  const activeDrivers = drivers.filter((d) => d.is_active)

  // 기사별 현재 배정 건수(활성)
  const driverLoad = useMemo(() => {
    const m: Record<number, number> = {}
    dongs.forEach((d) => d.drivers.forEach((dr) => { m[dr.driver_id] = (m[dr.driver_id] ?? 0) + dr.count }))
    return m
  }, [dongs])
  const driverName = (id: number) => drivers.find((d) => d.id === id)?.name ?? `기사#${id}`

  const selectedCount = useMemo(
    () => dongs.filter((d) => selectedDongs.includes(d.dong)).reduce((s, d) => s + d.total, 0),
    [dongs, selectedDongs],
  )

  const dispatchMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch/by-dong', { driver_id: driverId, dongs: selectedDongs }).then((r) => r.data),
    onSuccess: (data) => {
      const dn = driverId ? driverName(driverId) : ''
      setSelectedDongs([])
      qc.invalidateQueries({ queryKey: ['dong-status'] })
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      qc.invalidateQueries({ queryKey: ['driver-stats'] })
      Alert.alert('배정 완료', `${dn} 기사에게\n동 ${data?.dong_count ?? 0}개 · 배송 ${data?.assigned ?? 0}건 배정 완료.\n기사가 '출근 수락'을 누르면 배송이 출발합니다.`)
    },
    onError: (err: any) => Alert.alert('오류', err?.response?.data?.detail ?? '배정 중 문제가 발생했습니다.'),
  })

  const toggleDong = (dong: string) => {
    setSelectedDongs((prev) => (prev.includes(dong) ? prev.filter((v) => v !== dong) : [...prev, dong]))
  }

  // 배송 순번 재계산 (순번 오류 복구용)
  const resequenceMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch/resequence-all').then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dong-status'] })
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      Alert.alert('순번 재계산 완료', data?.message ?? '배송 순번을 다시 계산했습니다.')
    },
    onError: (err: any) => Alert.alert('오류', err?.response?.data?.detail ?? '순번 재계산 중 문제가 발생했습니다.'),
  })

  const runResequence = () => {
    Alert.alert(
      '배송 순번 다시 계산',
      '오늘 배정된 모든 기사의 배송 순번을 거리 기반으로 다시 계산합니다.\n(순번이 꼬였을 때 복구용)',
      [
        { text: '취소', style: 'cancel' },
        { text: '다시 계산', onPress: () => resequenceMutation.mutate() },
      ],
    )
  }

  const runDispatch = () => {
    if (!driverId) { Alert.alert('기사 선택', '배정할 기사를 먼저 선택해 주세요.'); return }
    if (selectedDongs.length === 0) { Alert.alert('동 선택', '배정할 동을 1개 이상 선택해 주세요.'); return }
    Alert.alert(
      '기사 배정 확인',
      `${driverName(driverId)} 기사에게\n${selectedDongs.join(', ')}\n(동 ${selectedDongs.length}개 · 약 ${selectedCount}건)\n을(를) 배정합니다.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '배정', onPress: () => dispatchMutation.mutate() },
      ],
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>동(洞) 단위 기사 배정</Text>
          <Text style={styles.subtitle}>기사 선택 → 동 선택 → 배정. 2명 이상은 동을 나눠 배정하세요.</Text>
        </View>
        <View style={styles.headerBtns}>
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

      {/* 미배정 현황 — 항상 표시 */}
      <View style={styles.unassignedBar}>
        <Text style={styles.unassignedText}>
          미배정 {status?.unassigned_dong_count ?? 0}개 동 · {status?.total_unassigned ?? 0}건
        </Text>
        {(status?.total_unassigned ?? 0) === 0 && <Text style={styles.allDone}>모두 배정됨 ✓</Text>}
      </View>

      {/* 배송 순번 다시 계산 (순번 오류 복구용) */}
      <TouchableOpacity
        style={[styles.reseqBtn, resequenceMutation.isPending && { opacity: 0.6 }]}
        onPress={runResequence}
        disabled={resequenceMutation.isPending}
        activeOpacity={0.85}
      >
        <Ionicons name="git-compare-outline" size={16} color="#0F172A" />
        <Text style={styles.reseqText}>{resequenceMutation.isPending ? '순번 계산 중...' : '배송 순번 다시 계산'}</Text>
      </TouchableOpacity>

      {/* 기사 선택 (가로 스크롤) */}
      <Text style={styles.sectionTitle}>1) 배정할 기사</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverScroll} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
        {activeDrivers.length === 0 && <Text style={styles.emptyText}>활성 기사가 없습니다.</Text>}
        {activeDrivers.map((d) => {
          const sel = driverId === d.id
          return (
            <TouchableOpacity key={d.id} style={[styles.driverChip, sel && styles.driverChipActive]} onPress={() => setDriverId(d.id)} activeOpacity={0.85}>
              <Text style={[styles.driverChipName, sel && styles.driverChipNameActive]}>{d.name}</Text>
              <Text style={[styles.driverChipLoad, sel && { color: '#fff' }]}>오늘 {driverLoad[d.id] ?? 0}건</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* 동 선택 */}
      <Text style={styles.sectionTitle}>2) 동 선택 (선택할 때마다 건수 합산)</Text>
      <FlatList
        data={dongs}
        keyExtractor={(item) => item.dong}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { refetch(); qc.invalidateQueries({ queryKey: ['drivers'] }) }} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>오늘 배송 주문이 없습니다.</Text>}
        renderItem={({ item }) => {
          const sel = selectedDongs.includes(item.dong)
          const assignedTo = item.drivers.map((dr) => `${driverName(dr.driver_id)} ${dr.count}`).join(', ')
          return (
            <TouchableOpacity style={[styles.dongItem, sel && styles.dongItemActive, item.unassigned > 0 && !sel && styles.dongItemUnassigned]} onPress={() => toggleDong(item.dong)} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dongName, sel && styles.dongNameActive]}>{item.dong}</Text>
                <Text style={styles.dongMeta}>
                  총 {item.total}건{item.unassigned > 0 ? ` · 미배정 ${item.unassigned}` : ''}{assignedTo ? ` · ${assignedTo}` : ''}
                </Text>
              </View>
              {item.unassigned > 0 && <View style={styles.unBadge}><Text style={styles.unBadgeText}>미배정 {item.unassigned}</Text></View>}
              <Text style={[styles.check, sel && styles.checkActive]}>{sel ? '✓' : ''}</Text>
            </TouchableOpacity>
          )
        }}
      />

      {/* 선택 요약 + 배정 버튼 */}
      <View style={styles.footer}>
        <Text style={styles.selSummary}>
          선택: 동 {selectedDongs.length}개 · {selectedCount}건
          {driverId ? `  →  ${driverName(driverId)}` : '  (기사 미선택)'}
        </Text>
        <TouchableOpacity
          style={[styles.assignBtn, (!driverId || selectedDongs.length === 0 || dispatchMutation.isPending) && styles.assignDisabled]}
          onPress={runDispatch}
          disabled={!driverId || selectedDongs.length === 0 || dispatchMutation.isPending}
        >
          <Text style={styles.assignText}>
            {dispatchMutation.isPending ? '배정 중...' : '이 기사에게 배정'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myDeliveryBtn: { backgroundColor: '#F97316', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  myDeliveryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 4, fontSize: 12, color: '#6b7280', maxWidth: 230 },
  logoutBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  logoutText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },
  unassignedBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff7ed', borderColor: '#fdba74', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  unassignedText: { fontSize: 15, fontWeight: '900', color: '#c2410c' },
  allDone: { fontSize: 13, fontWeight: '800', color: '#059669' },
  reseqBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E2E8F0', borderRadius: 10, paddingVertical: 12, marginBottom: 12, minHeight: 48 },
  reseqText: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 6 },
  driverScroll: { maxHeight: 64, marginBottom: 10 },
  driverChip: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', minWidth: 84 },
  driverChipActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  driverChipName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  driverChipNameActive: { color: '#fff' },
  driverChipLoad: { marginTop: 2, fontSize: 11, color: '#6b7280' },
  list: { gap: 6, paddingBottom: 8 },
  emptyText: { textAlign: 'center', color: '#9ca3af', paddingVertical: 20 },
  dongItem: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dongItemActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  dongItemUnassigned: { borderColor: '#fdba74' },
  dongName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dongNameActive: { color: '#c2410c' },
  dongMeta: { marginTop: 3, fontSize: 12, color: '#6b7280' },
  unBadge: { backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  unBadgeText: { fontSize: 11, fontWeight: '800', color: '#b45309' },
  check: { width: 20, fontSize: 18, fontWeight: '900', color: '#f97316', textAlign: 'center' },
  checkActive: { color: '#f97316' },
  footer: { paddingTop: 8, gap: 8 },
  selSummary: { fontSize: 14, fontWeight: '800', color: '#111827', textAlign: 'center' },
  assignBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  assignDisabled: { backgroundColor: '#fed7aa' },
  assignText: { color: 'white', fontSize: 17, fontWeight: '900' },
})
