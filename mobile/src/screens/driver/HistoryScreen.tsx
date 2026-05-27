import React, { useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import api, { BASE_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

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
}

interface Order {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  dong: string
  delivery_address: string
  items_desc?: string
  quantity: number
  sequence?: number
  status: string
  delivery_photo_url?: string
  completed_at?: string
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  } catch {
    return ''
  }
}

function HistoryCard({ item }: { item: Order }) {
  const photoUrl = item.delivery_photo_url
    ? `${BASE_URL}${item.delivery_photo_url}`
    : null

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        {/* 완료 배지 */}
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={14} color={T.success} />
          <Text style={styles.badgeText}>완료</Text>
          {item.completed_at ? (
            <Text style={styles.badgeTime}>{formatTime(item.completed_at)}</Text>
          ) : null}
        </View>

        {/* 고객 정보 */}
        <Text style={styles.customerName}>{item.customer_name}</Text>
        <Text style={styles.address} numberOfLines={1}>
          {item.dong} · {item.delivery_address}
        </Text>

        {/* 물품 */}
        {item.items_desc ? (
          <Text style={styles.items} numberOfLines={1}>
            {item.items_desc}
          </Text>
        ) : null}

        {/* 순번 */}
        {item.sequence != null && (
          <View style={styles.seqRow}>
            <Ionicons name="navigate" size={12} color={T.textMuted} />
            <Text style={styles.seqText}>{item.sequence}번째 배송</Text>
          </View>
        )}
      </View>

      {/* 배송 사진 썸네일 */}
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={styles.thumbEmpty}>
          <Ionicons name="camera-outline" size={22} color={T.textMuted} />
          <Text style={styles.thumbEmptyText}>사진 없음</Text>
        </View>
      )}
    </View>
  )
}

export function DriverHistoryScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['driver-orders-done'],
    queryFn: async () => {
      const res = await api.get('/orders', {
        params: { status: 'delivered', driver_id: user?.id, page: 1, page_size: 100 },
      })
      return (res.data.items ?? []) as Order[]
    },
    refetchInterval: 60_000,
  })

  const delivered = useMemo(
    () => (data ?? []).sort((a, b) => b.id - a.id),
    [data],
  )

  const totalCount = delivered.length
  const withPhoto  = delivered.filter((o) => o.delivery_photo_url).length

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>완료 내역</Text>
          <Text style={styles.headerSub}>오늘 배송 완료 목록</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{totalCount}</Text>
            <Text style={styles.headerStatLabel}>완료</Text>
          </View>
          <View style={[styles.headerStat, { marginLeft: 16 }]}>
            <Text style={styles.headerStatNum}>{withPhoto}</Text>
            <Text style={styles.headerStatLabel}>사진</Text>
          </View>
        </View>
      </View>

      {/* 목록 */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={T.primary} />
          <Text style={styles.loadingText}>불러오는 중...</Text>
        </View>
      ) : delivered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle-outline" size={64} color={T.border} />
          <Text style={styles.emptyTitle}>완료된 배송이 없습니다</Text>
          <Text style={styles.emptyText}>배송 완료 후 여기에 표시됩니다</Text>
        </View>
      ) : (
        <FlatList
          data={delivered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <HistoryCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={T.primary}
              colors={[T.primary]}
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },

  /* 헤더 */
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.dark,
    paddingHorizontal: 20, paddingVertical: 20,
  },
  headerTitle:    { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  headerSub:      { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  headerStats:    { flexDirection: 'row', alignItems: 'center' },
  headerStat:     { alignItems: 'center' },
  headerStatNum:  { fontSize: 24, fontWeight: '800', color: T.primary },
  headerStatLabel:{ fontSize: 11, color: '#94A3B8', marginTop: 2 },

  /* 리스트 */
  listContent: { padding: 16, gap: 12, paddingBottom: 100 },

  /* 카드 */
  card: {
    backgroundColor: T.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: T.success,
  },
  cardLeft:     { flex: 1, marginRight: 12 },

  badge:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 },
  badgeText:    { fontSize: 12, fontWeight: '700', color: T.success },
  badgeTime:    { fontSize: 12, color: T.textMuted, marginLeft: 4 },

  customerName: { fontSize: 18, fontWeight: '700', color: T.text, marginBottom: 4 },
  address:      { fontSize: 13, color: T.textSub, marginBottom: 4 },
  items:        { fontSize: 12, color: T.textMuted, marginBottom: 6 },

  seqRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seqText:      { fontSize: 12, color: T.textMuted },

  /* 썸네일 */
  thumb: {
    width: 72, height: 72, borderRadius: 12,
    backgroundColor: T.border,
  },
  thumbEmpty: {
    width: 72, height: 72, borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: T.border, borderStyle: 'dashed',
    gap: 4,
  },
  thumbEmptyText: { fontSize: 10, color: T.textMuted },

  /* 공통 */
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: T.textMuted },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: T.textSub },
  emptyText:   { fontSize: 14, color: T.textMuted },
})
