import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

/* ── 디자인 토큰 ─────────────────────────────────────────── */
const T = {
  primary:   '#F97316',
  bg:        '#FFF8F0',
  card:      '#FFFFFF',
  border:    '#E2E8F0',
  text:      '#1E293B',
  textSub:   '#475569',
  textMuted: '#94A3B8',
  success:   '#059669',
  info:      '#3B82F6',
  warning:   '#F59E0B',
  error:     '#EF4444',
}

interface Order {
  id: number; order_no: string; status: string
  delivery_address: string; dong: string
  items_desc?: string; quantity: number
  created_at: string; delivered_at?: string
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:    { label: '접수 대기',  color: T.info,    bg: '#EFF6FF', icon: 'time-outline' },
  assigned:   { label: '기사 배정',  color: '#8B5CF6', bg: '#F5F3FF', icon: 'person-circle-outline' },
  picked_up:  { label: '수거 완료',  color: T.warning, bg: '#FFFBEB', icon: 'cube-outline' },
  in_transit: { label: '배송 중',    color: T.primary, bg: '#FFF7ED', icon: 'car-outline' },
  delivered:  { label: '배달 완료',  color: T.success, bg: '#ECFDF5', icon: 'checkmark-circle-outline' },
  cancelled:  { label: '취소',       color: T.error,   bg: '#FEF2F2', icon: 'close-circle-outline' },
  delayed:    { label: '지연 중',    color: T.warning, bg: '#FFFBEB', icon: 'warning-outline' },
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const mo  = d.getMonth() + 1
  const day = d.getDate()
  const hh  = d.getHours().toString().padStart(2, '0')
  const mm  = d.getMinutes().toString().padStart(2, '0')
  return `${mo}/${day} ${hh}:${mm}`
}

function HistoryCard({ order }: { order: Order }) {
  const meta = STATUS_META[order.status] ?? STATUS_META.pending
  const isDone = order.status === 'delivered'

  return (
    <View style={[hc.wrap, isDone && { borderLeftColor: T.success }]}>
      {/* 상태 배지 + 접수번호 */}
      <View style={hc.top}>
        <View style={[hc.badge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon as any} size={15} color={meta.color} />
          <Text style={[hc.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={hc.orderNo}>{order.order_no}</Text>
      </View>

      {/* 주소 */}
      <Text style={hc.address}>{order.delivery_address}</Text>

      {/* 물품 */}
      {order.items_desc && (
        <View style={hc.itemsRow}>
          <Ionicons name="cube-outline" size={15} color={T.textMuted} />
          <Text style={hc.itemsText}>{order.items_desc} · {order.quantity}개</Text>
        </View>
      )}

      {/* 날짜 */}
      <View style={hc.dateRow}>
        <Ionicons name="calendar-outline" size={14} color={T.textMuted} />
        <Text style={hc.dateText}>
          접수 {formatDate(order.created_at)}
          {order.delivered_at ? `  →  완료 ${formatDate(order.delivered_at)}` : ''}
        </Text>
      </View>
    </View>
  )
}

const hc = StyleSheet.create({
  wrap:      { backgroundColor: T.card, borderRadius: 18, padding: 20, borderLeftWidth: 4, borderLeftColor: T.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  top:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeText: { fontSize: 14, fontWeight: '700' },
  orderNo:   { fontSize: 16, fontWeight: '700', color: T.primary },
  address:   { fontSize: 18, fontWeight: '700', color: T.text, marginBottom: 6 },
  itemsRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  itemsText: { fontSize: 15, color: T.textSub },
  dateRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText:  { fontSize: 13, color: T.textMuted },
})

/* ── 메인 화면 ──────────────────────────────────────────── */
export function CustomerHistoryScreen() {
  const insets = useSafeAreaInsets()

  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders/my').then((r) => r.data),
    staleTime: 60_000,
  })

  const delivered = orders.filter((o) => o.status === 'delivered').length
  const total     = orders.length

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        renderItem={({ item }) => <HistoryCard order={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={refetch}
            tintColor={T.primary}
            colors={[T.primary]}
          />
        }
        ListHeaderComponent={
          <View style={s.header}>
            {/* 타이틀 */}
            <Text style={s.headerTitle}>주문 내역</Text>
            <Text style={s.headerSub}>전체 주문 기록</Text>

            {/* 요약 */}
            {total > 0 && (
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={s.summaryNum}>{total}</Text>
                  <Text style={s.summaryLabel}>총 주문</Text>
                </View>
                <View style={[s.summaryCard, { borderTopColor: T.success }]}>
                  <Text style={[s.summaryNum, { color: T.success }]}>{delivered}</Text>
                  <Text style={s.summaryLabel}>배달 완료</Text>
                </View>
                <View style={[s.summaryCard, { borderTopColor: T.primary }]}>
                  <Text style={[s.summaryNum, { color: T.primary }]}>
                    {total > 0 ? Math.round((delivered / total) * 100) : 0}%
                  </Text>
                  <Text style={s.summaryLabel}>완료율</Text>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={s.empty}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="receipt-outline" size={48} color={T.textMuted} />
              </View>
              <Text style={s.emptyTitle}>주문 내역이 없습니다</Text>
              <Text style={s.emptyMsg}>주문하기 탭에서 첫 배송을 신청해 보세요</Text>
            </View>
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyMsg}>불러오는 중...</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: T.bg },
  listContent:{ padding: 20, paddingBottom: 60 },

  header:    { marginBottom: 20 },
  headerTitle:{ fontSize: 28, fontWeight: '900', color: T.text, marginBottom: 4 },
  headerSub:  { fontSize: 15, color: T.textMuted, marginBottom: 16 },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  summaryCard:{ flex: 1, backgroundColor: T.card, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderTopWidth: 3, borderTopColor: T.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  summaryNum: { fontSize: 28, fontWeight: '900', color: T.text },
  summaryLabel:{ fontSize: 13, color: T.textMuted, marginTop: 4, fontWeight: '600' },

  empty:       { alignItems: 'center', paddingVertical: 60, gap: 14 },
  emptyIconWrap:{ width: 90, height: 90, borderRadius: 45, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:  { fontSize: 22, fontWeight: '800', color: T.textSub },
  emptyMsg:    { fontSize: 17, color: T.textMuted, textAlign: 'center', lineHeight: 26 },
})
