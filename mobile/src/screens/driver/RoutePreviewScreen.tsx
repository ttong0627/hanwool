import React, { useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { openKakaoNavi, openTmap } from '@/lib/navigation'

/* ── 디자인 토큰 ─────────────────────────────────────────────── */
const T = {
  primary:   '#F97316',
  dark:      '#0F172A',
  bg:        '#F1F5F9',
  card:      '#FFFFFF',
  border:    '#E2E8F0',
  text:      '#0F172A',
  textSub:   '#475569',
  textMuted: '#94A3B8',
  success:   '#10B981',
  warning:   '#F59E0B',
  info:      '#3B82F6',
  done:      '#D1FAE5',
  doneBorder:'#6EE7B7',
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  assigned:   { label: '대기',  color: T.info },
  picked_up:  { label: '픽업', color: T.warning },
  in_transit: { label: '배송중', color: T.primary },
  delivered:  { label: '완료', color: T.success },
  delayed:    { label: '지연', color: '#EF4444' },
}

interface Order {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  status: string
  dong: string
  delivery_address: string
  items_desc?: string
  quantity: number
  sequence?: number
  lat?: number | null
  lng?: number | null
}

/* ── 통계 칩 ─────────────────────────────────────────────────── */
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[chip.wrap, { borderTopColor: color }]}>
      <Text style={[chip.value, { color }]}>{value}</Text>
      <Text style={chip.label}>{label}</Text>
    </View>
  )
}
const chip = StyleSheet.create({
  wrap:  { flex: 1, backgroundColor: T.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderTopWidth: 3 },
  value: { fontSize: 26, fontWeight: '900' },
  label: { fontSize: 11, color: T.textMuted, fontWeight: '600', marginTop: 3 },
})

/* ── 배송지 카드 ─────────────────────────────────────────────── */
function StopCard({ order, index, total }: { order: Order; index: number; total: number }) {
  const meta   = STATUS_META[order.status] ?? STATUS_META.assigned
  const isDone = order.status === 'delivered'

  return (
    <View style={[sc.wrap, isDone && sc.wrapDone]}>
      {/* 왼쪽: 순번 + 세로선 */}
      <View style={sc.leftCol}>
        <View style={[sc.seqCircle, isDone && sc.seqCircleDone]}>
          {isDone
            ? <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            : <Text style={sc.seqText}>{order.sequence ?? index + 1}</Text>
          }
        </View>
        {index < total - 1 && (
          <View style={[sc.connector, isDone && sc.connectorDone]} />
        )}
      </View>

      {/* 오른쪽: 배송 정보 */}
      <View style={sc.content}>
        <View style={sc.topRow}>
          <View>
            <Text style={[sc.name, isDone && sc.textFaded]}>{order.customer_name}</Text>
            <Text style={[sc.dong, isDone && sc.textFaded]}>{order.dong}</Text>
          </View>
          <View style={[sc.badge, { backgroundColor: meta.color + '18' }]}>
            <Text style={[sc.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        <Text style={[sc.address, isDone && sc.textFaded]} numberOfLines={2}>
          {order.delivery_address}
        </Text>

        {order.items_desc && (
          <View style={sc.itemsRow}>
            <Ionicons name="cube-outline" size={12} color={T.textMuted} />
            <Text style={sc.itemsText} numberOfLines={1}>{order.items_desc}</Text>
          </View>
        )}

        {/* 액션 버튼 (완료 아닌 경우만) */}
        {!isDone && (
          <View style={sc.naviRow}>
            <TouchableOpacity
              style={sc.naviBtn}
              onPress={() => openKakaoNavi(order)}
              activeOpacity={0.85}
            >
              <Ionicons name="map" size={14} color={T.primary} />
              <Text style={sc.naviBtnText}>카카오맵</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={sc.tmapBtn}
              onPress={() => openTmap(order)}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={14} color="#4F46E5" />
              <Text style={sc.tmapBtnText}>Tmap</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

const sc = StyleSheet.create({
  wrap:         { flexDirection: 'row', paddingVertical: 4 },
  wrapDone:     { opacity: 0.65 },
  leftCol:      { width: 44, alignItems: 'center' },
  seqCircle:    { width: 32, height: 32, borderRadius: 16, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  seqCircleDone:{ backgroundColor: T.success },
  seqText:      { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  connector:    { width: 2, flex: 1, backgroundColor: T.border, marginVertical: 4 },
  connectorDone:{ backgroundColor: T.success },

  content:  { flex: 1, paddingBottom: 20, paddingLeft: 12 },
  topRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  name:     { fontSize: 17, fontWeight: '700', color: T.text },
  dong:     { fontSize: 12, color: T.textMuted, marginTop: 1 },
  badge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText:{ fontSize: 12, fontWeight: '700' },
  address:  { fontSize: 14, color: T.textSub, lineHeight: 20, marginBottom: 6 },
  itemsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  itemsText:{ fontSize: 12, color: T.textMuted, flex: 1 },
  naviRow:  { flexDirection: 'row', gap: 8 },
  naviBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#FFF7ED', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#FED7AA' },
  naviBtnText:{ fontSize: 13, color: T.primary, fontWeight: '700' },
  tmapBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE' },
  tmapBtnText:{ fontSize: 13, color: '#4F46E5', fontWeight: '700' },
  textFaded:{ color: T.textMuted },
})

/* ── 메인 화면 ──────────────────────────────────────────────── */
export function DriverRoutePreviewScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const { data: orders, isLoading } = useQuery({
    queryKey: ['driver-route-preview'],
    queryFn: () => api.get('/deliveries/route').then((r) => r.data),
    staleTime: 30_000,
  })

  const sorted: Order[] = useMemo(() => {
    if (!orders) return []
    return [...orders].sort((a: Order, b: Order) => (a.sequence ?? 999) - (b.sequence ?? 999))
  }, [orders])

  const total     = sorted.length
  const done      = sorted.filter((o) => o.status === 'delivered').length
  const remaining = total - done
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0
  // 잔여 배송지 * 평균 3분 (이동 + 배달 포함 러프 추정)
  const estMinutes = remaining * 3

  const firstPending = sorted.find((o) => o.status !== 'delivered')

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* 헤더 */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>루트 미리보기</Text>
          <Text style={s.headerSub}>오늘 배송 전체 경로</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={T.primary} />
          <Text style={s.loadingText}>경로 불러오는 중...</Text>
        </View>
      ) : (
        <>
          {/* 요약 통계 */}
          <View style={s.statsSection}>
            <View style={s.statsRow}>
              <StatChip label="전체"    value={total}     color={T.textSub} />
              <StatChip label="완료"    value={done}      color={T.success} />
              <StatChip label="잔여"    value={remaining} color={T.primary} />
            </View>

            {/* 진행률 바 */}
            <View style={s.progressWrap}>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${pct}%` as any }]} />
              </View>
              <View style={s.progressLabels}>
                <Text style={s.progressPct}>{pct}% 완료</Text>
                {remaining > 0 && (
                  <Text style={s.progressEst}>
                    <Ionicons name="time-outline" size={12} color={T.textMuted} /> 잔여 약 {estMinutes}분 예상
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* 배송지 리스트 */}
          <FlatList
            data={sorted}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            ListEmptyComponent={
              <View style={s.center}>
                <Ionicons name="map-outline" size={56} color={T.border} />
                <Text style={s.emptyText}>오늘 배정된 배송지가 없습니다</Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <StopCard order={item} index={index} total={sorted.length} />
            )}
            ListFooterComponent={
              sorted.length > 0 ? (
                <View style={{ height: remaining > 0 ? 120 : 40 }} />
              ) : null
            }
          />

          {/* 첫 번째 배송지 바로가기 CTA */}
          {firstPending && (
            <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.ctaRow}>
                <TouchableOpacity
                  style={s.ctaBtn}
                  onPress={() => openKakaoNavi(firstPending)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="navigate" size={22} color="#FFFFFF" />
                  <Text style={s.ctaBtnText}>
                    {firstPending.sequence ?? 1}번 카카오 출발
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.ctaTmapBtn}
                  onPress={() => openTmap(firstPending)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="navigate" size={20} color="#FFFFFF" />
                  <Text style={s.ctaTmapText}>Tmap</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.dark,
    paddingHorizontal: 16, paddingVertical: 18,
  },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  headerSub:    { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  statsSection: { backgroundColor: T.card, padding: 16, borderBottomWidth: 1, borderBottomColor: T.border },
  statsRow:     { flexDirection: 'row', gap: 10, marginBottom: 14 },

  progressWrap:   { gap: 6 },
  progressBar:    { height: 10, backgroundColor: T.border, borderRadius: 5, overflow: 'hidden' },
  progressFill:   { height: '100%', backgroundColor: T.success, borderRadius: 5 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressPct:    { fontSize: 13, fontWeight: '700', color: T.success },
  progressEst:    { fontSize: 12, color: T.textMuted },

  listContent: { padding: 16 },

  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: T.card, paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: T.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 8,
  },
  ctaRow: { flexDirection: 'row', gap: 10 },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: T.primary, borderRadius: 16,
    paddingVertical: 18,
    shadowColor: T.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  ctaBtnText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  ctaTmapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#4F46E5', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 18,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  ctaTmapText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 15, color: T.textMuted },
  emptyText:   { fontSize: 16, color: T.textSub, fontWeight: '600' },
})
