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
interface RecoGroup { index: number; dongs: string[]; order_count: number }
interface RecoResp { driver_count: number; dong_groups: string[][]; groups: RecoGroup[]; uncovered_dongs: string[] }

export function SuperAdminDispatchScreen() {
  const qc = useQueryClient()
  const router = useRouter()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  const [mode, setMode] = useState<'auto' | 'edit'>('auto')
  const [driverIds, setDriverIds] = useState<number[]>([])   // 자동 배정: 복수 기사
  const [editDriverId, setEditDriverId] = useState<number | null>(null) // 수정: 1명
  const [selectedDongs, setSelectedDongs] = useState<string[]>([])      // 수정: 동 체크

  const { data: status, isLoading, refetch } = useQuery<DongStatusResp>({
    queryKey: ['dong-status'],
    queryFn: () => api.get('/orders/dispatch/dong-status').then((r) => r.data),
    refetchInterval: 15_000,
  })
  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
  })
  // 기사 수에 따른 예정 동그룹(설계: 1·2·3·4명 고정 배분)
  const { data: reco } = useQuery<RecoResp>({
    queryKey: ['dispatch-reco', driverIds.length],
    queryFn: () => api.get('/orders/dispatch/recommendation', { params: { driver_count: driverIds.length } }).then((r) => r.data),
    enabled: mode === 'auto' && driverIds.length >= 1,
  })

  const dongs = status?.dongs ?? []
  const activeDrivers = drivers.filter((d) => d.is_active)
  const driverName = (id: number) => drivers.find((d) => d.id === id)?.name ?? `기사#${id}`
  const driverLoad = useMemo(() => {
    const m: Record<number, number> = {}
    dongs.forEach((d) => d.drivers.forEach((dr) => { m[dr.driver_id] = (m[dr.driver_id] ?? 0) + dr.count }))
    return m
  }, [dongs])
  const editCount = useMemo(
    () => dongs.filter((d) => selectedDongs.includes(d.dong)).reduce((s, d) => s + d.total, 0),
    [dongs, selectedDongs],
  )

  const refreshAll = () => { refetch(); qc.invalidateQueries({ queryKey: ['drivers'] }); qc.invalidateQueries({ queryKey: ['dispatch-reco'] }) }

  // ── 자동 배정 (기사 수 → 예정 동그룹) ──
  const autoMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch', { driver_ids: driverIds, dong_groups: reco?.dong_groups }).then((r) => r.data),
    onSuccess: (data) => {
      setDriverIds([])
      qc.invalidateQueries({ queryKey: ['dong-status'] })
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      qc.invalidateQueries({ queryKey: ['driver-stats'] })
      Alert.alert('배정 완료', `기사 ${driverIds.length}명에게 ${data?.total ?? 0}건을 배정했습니다.\n기사가 '출근 수락'을 누르면 출발합니다.`)
    },
    onError: (err: any) => Alert.alert('오류', err?.response?.data?.detail ?? '배정 중 문제가 발생했습니다.'),
  })

  // ── 수정 (선택 동 → 1명에게) ──
  const editMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch/by-dong', { driver_id: editDriverId, dongs: selectedDongs }).then((r) => r.data),
    onSuccess: (data) => {
      const dn = editDriverId ? driverName(editDriverId) : ''
      setSelectedDongs([]); setEditDriverId(null)
      qc.invalidateQueries({ queryKey: ['dong-status'] })
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      Alert.alert('수정 완료', `${dn} 기사에게 동 ${data?.dong_count ?? 0}개 · ${data?.assigned ?? 0}건 배정(변경)했습니다.`)
    },
    onError: (err: any) => Alert.alert('오류', err?.response?.data?.detail ?? '수정 중 문제가 발생했습니다.'),
  })

  const resequenceMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch/resequence-all').then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dong-status'] }); qc.invalidateQueries({ queryKey: ['driver-route'] })
      Alert.alert('순번 재계산 완료', data?.message ?? '배송 순번을 다시 계산했습니다.')
    },
    onError: (err: any) => Alert.alert('오류', err?.response?.data?.detail ?? '순번 재계산 중 문제가 발생했습니다.'),
  })

  const toggleDriver = (id: number) => setDriverIds((p) => (p.includes(id) ? p.filter((v) => v !== id) : [...p, id]))
  const toggleDong = (dong: string) => setSelectedDongs((p) => (p.includes(dong) ? p.filter((v) => v !== dong) : [...p, dong]))

  const runAuto = () => {
    if (driverIds.length === 0) { Alert.alert('기사 선택', '배정할 기사를 1명 이상 선택해 주세요.'); return }
    const lines = (reco?.groups ?? []).map((g, i) => `${driverName(driverIds[i])}: ${g.dongs.join('·') || '-'} (${g.order_count}건)`).join('\n')
    Alert.alert('자동 배정 확인', `기사 ${driverIds.length}명 기준 예정 배분:\n\n${lines}\n\n이대로 배정할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '배정', onPress: () => autoMutation.mutate() },
    ])
  }
  const runResequence = () => Alert.alert('배송 순번 다시 계산', '오늘 배정된 모든 기사의 순번을 거리 기반으로 다시 계산합니다.', [
    { text: '취소', style: 'cancel' }, { text: '다시 계산', onPress: () => resequenceMutation.mutate() },
  ])
  const runEdit = () => {
    if (!editDriverId) { Alert.alert('기사 선택', '동을 옮길 기사를 선택해 주세요.'); return }
    if (selectedDongs.length === 0) { Alert.alert('동 선택', '변경할 동을 1개 이상 선택해 주세요.'); return }
    Alert.alert('동 변경 확인', `${driverName(editDriverId)} 기사에게\n${selectedDongs.join(', ')} (약 ${editCount}건)을 배정(변경)합니다.`, [
      { text: '취소', style: 'cancel' }, { text: '변경', onPress: () => editMutation.mutate() },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>기사 배정 (총관리자)</Text>
          <Text style={styles.subtitle}>기사 수를 고르면 동이 자동 배분됩니다. 동 변경은 '수정'에서.</Text>
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

      <View style={styles.unassignedBar}>
        <Text style={styles.unassignedText}>미배정 {status?.unassigned_dong_count ?? 0}개 동 · {status?.total_unassigned ?? 0}건</Text>
        {(status?.total_unassigned ?? 0) === 0 && <Text style={styles.allDone}>모두 배정됨 ✓</Text>}
      </View>

      {/* 모드 토글 */}
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, mode === 'auto' && styles.modeBtnOn]} onPress={() => setMode('auto')}>
          <Text style={[styles.modeText, mode === 'auto' && styles.modeTextOn]}>자동 배정</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === 'edit' && styles.modeBtnOn]} onPress={() => setMode('edit')}>
          <Text style={[styles.modeText, mode === 'edit' && styles.modeTextOn]}>수정 (동 변경)</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.reseqBtn, resequenceMutation.isPending && { opacity: 0.6 }]} onPress={runResequence} disabled={resequenceMutation.isPending} activeOpacity={0.85}>
        <Ionicons name="git-compare-outline" size={16} color="#0F172A" />
        <Text style={styles.reseqText}>{resequenceMutation.isPending ? '순번 계산 중...' : '배송 순번 다시 계산'}</Text>
      </TouchableOpacity>

      {mode === 'auto' ? (
        <>
          <Text style={styles.sectionTitle}>1) 배정할 기사 선택 ({driverIds.length}명)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverScroll} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
            {activeDrivers.length === 0 && <Text style={styles.emptyText}>활성 기사가 없습니다.</Text>}
            {activeDrivers.map((d) => {
              const sel = driverIds.includes(d.id)
              return (
                <TouchableOpacity key={d.id} style={[styles.driverChip, sel && styles.driverChipActive]} onPress={() => toggleDriver(d.id)} activeOpacity={0.85}>
                  <Text style={[styles.driverChipName, sel && styles.driverChipNameActive]}>{sel ? '✓ ' : ''}{d.name}</Text>
                  <Text style={[styles.driverChipLoad, sel && { color: '#fff' }]}>오늘 {driverLoad[d.id] ?? 0}건</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <Text style={styles.sectionTitle}>2) 예정 동 배분 ({driverIds.length}명 기준)</Text>
          <FlatList
            data={reco?.groups ?? []}
            keyExtractor={(g) => String(g.index)}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refreshAll} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.emptyText}>{driverIds.length === 0 ? '기사를 먼저 선택하세요.' : '배분 정보를 불러오는 중...'}</Text>}
            renderItem={({ item, index }) => (
              <View style={styles.recoItem}>
                <View style={styles.recoSeq}><Text style={styles.recoSeqText}>{index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recoDriver}>{driverIds[index] ? driverName(driverIds[index]) : `기사 ${index + 1}`}</Text>
                  <Text style={styles.recoDongs}>{item.dongs.join(' · ') || '-'}</Text>
                </View>
                <Text style={styles.recoCount}>{item.order_count}건</Text>
              </View>
            )}
            ListFooterComponent={(reco?.uncovered_dongs?.length ?? 0) > 0
              ? <Text style={styles.uncovered}>나머지 동({reco!.uncovered_dongs.join('·')})은 가장 적은 기사에게 자동 배분됩니다.</Text>
              : null}
          />

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.assignBtn, (driverIds.length === 0 || autoMutation.isPending) && styles.assignDisabled]} onPress={runAuto} disabled={driverIds.length === 0 || autoMutation.isPending}>
              <Text style={styles.assignText}>{autoMutation.isPending ? '배정 중...' : `${driverIds.length}명에게 자동 배정`}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>1) 동을 옮길 기사 (1명)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverScroll} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
            {activeDrivers.map((d) => {
              const sel = editDriverId === d.id
              return (
                <TouchableOpacity key={d.id} style={[styles.driverChip, sel && styles.driverChipActive]} onPress={() => setEditDriverId(d.id)} activeOpacity={0.85}>
                  <Text style={[styles.driverChipName, sel && styles.driverChipNameActive]}>{d.name}</Text>
                  <Text style={[styles.driverChipLoad, sel && { color: '#fff' }]}>오늘 {driverLoad[d.id] ?? 0}건</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <Text style={styles.sectionTitle}>2) 변경할 동 선택</Text>
          <FlatList
            data={dongs}
            keyExtractor={(item) => item.dong}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refreshAll} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.emptyText}>오늘 배송 주문이 없습니다.</Text>}
            renderItem={({ item }) => {
              const sel = selectedDongs.includes(item.dong)
              const assignedTo = item.drivers.map((dr) => `${driverName(dr.driver_id)} ${dr.count}`).join(', ')
              return (
                <TouchableOpacity style={[styles.dongItem, sel && styles.dongItemActive, item.unassigned > 0 && !sel && styles.dongItemUnassigned]} onPress={() => toggleDong(item.dong)} activeOpacity={0.85}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dongName, sel && styles.dongNameActive]}>{item.dong}</Text>
                    <Text style={styles.dongMeta}>총 {item.total}건{item.unassigned > 0 ? ` · 미배정 ${item.unassigned}` : ''}{assignedTo ? ` · ${assignedTo}` : ''}</Text>
                  </View>
                  <Text style={[styles.check, sel && styles.checkActive]}>{sel ? '✓' : ''}</Text>
                </TouchableOpacity>
              )
            }}
          />

          <View style={styles.footer}>
            <Text style={styles.selSummary}>{editDriverId ? driverName(editDriverId) : '기사 미선택'} · 동 {selectedDongs.length}개 · {editCount}건</Text>
            <TouchableOpacity style={[styles.assignBtn, (!editDriverId || selectedDongs.length === 0 || editMutation.isPending) && styles.assignDisabled]} onPress={runEdit} disabled={!editDriverId || selectedDongs.length === 0 || editMutation.isPending}>
              <Text style={styles.assignText}>{editMutation.isPending ? '변경 중...' : '이 기사에게 동 변경'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#fff', alignItems: 'center' },
  modeBtnOn: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  modeText: { fontSize: 14, fontWeight: '800', color: '#475569' },
  modeTextOn: { color: '#fff' },
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
  recoItem: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recoSeq: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' },
  recoSeqText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  recoDriver: { fontSize: 15, fontWeight: '800', color: '#111827' },
  recoDongs: { marginTop: 2, fontSize: 12.5, color: '#475569' },
  recoCount: { fontSize: 15, fontWeight: '900', color: '#F97316' },
  uncovered: { fontSize: 12, color: '#6b7280', paddingHorizontal: 4, paddingTop: 6 },
  dongItem: { backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dongItemActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  dongItemUnassigned: { borderColor: '#fdba74' },
  dongName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dongNameActive: { color: '#c2410c' },
  dongMeta: { marginTop: 3, fontSize: 12, color: '#6b7280' },
  check: { width: 20, fontSize: 18, fontWeight: '900', color: '#f97316', textAlign: 'center' },
  checkActive: { color: '#f97316' },
  footer: { paddingTop: 8, gap: 8 },
  selSummary: { fontSize: 14, fontWeight: '800', color: '#111827', textAlign: 'center' },
  assignBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  assignDisabled: { backgroundColor: '#fed7aa' },
  assignText: { color: 'white', fontSize: 17, fontWeight: '900' },
})
