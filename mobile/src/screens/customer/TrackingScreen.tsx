import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

/* ── 디자인 토큰 ─────────────────────────────────────────── */
const T = {
  primary:   '#F97316',
  dark:      '#0F172A',
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
  items_desc?: string; quantity: number; created_at: string
  assigned_at?: string; picked_up_at?: string; delivered_at?: string
}

const STEPS = [
  { key: 'pending',    label: '접수 완료',   sub: '배송 신청이 접수되었습니다',   icon: 'receipt-outline',           color: T.info },
  { key: 'assigned',   label: '기사 배정',   sub: '배달 기사가 배정되었습니다',   icon: 'person-circle-outline',      color: '#8B5CF6' },
  { key: 'picked_up',  label: '물건 수거',   sub: '시장에서 물건을 수거했습니다', icon: 'cube-outline',               color: T.warning },
  { key: 'in_transit', label: '배송 중',     sub: '지금 배달 중입니다',           icon: 'car-outline',                color: T.primary },
  { key: 'delivered',  label: '배달 완료',   sub: '배달이 완료되었습니다',        icon: 'checkmark-circle-outline',   color: T.success },
]
const STEP_ORDER = STEPS.map((s) => s.key)

function getStepIdx(status: string) {
  const i = STEP_ORDER.indexOf(status)
  return i === -1 ? 0 : i
}

/* ── 타임라인 컴포넌트 ──────────────────────────────────── */
function StatusTimeline({ status }: { status: string }) {
  if (status === 'cancelled') {
    return (
      <View style={tl.specialBox}>
        <View style={[tl.specialIcon, { backgroundColor: '#FEE2E2' }]}>
          <Ionicons name="close-circle" size={32} color={T.error} />
        </View>
        <Text style={[tl.specialTitle, { color: T.error }]}>배송 취소됨</Text>
        <Text style={tl.specialSub}>취소된 주문입니다</Text>
      </View>
    )
  }
  if (status === 'delayed') {
    return (
      <View style={tl.specialBox}>
        <View style={[tl.specialIcon, { backgroundColor: '#FEF3C7' }]}>
          <Ionicons name="time" size={32} color={T.warning} />
        </View>
        <Text style={[tl.specialTitle, { color: T.warning }]}>배송 지연 중</Text>
        <Text style={tl.specialSub}>곧 연락드리겠습니다</Text>
      </View>
    )
  }

  const currentIdx = getStepIdx(status)

  return (
    <View style={tl.container}>
      {STEPS.map((step, i) => {
        const done    = i <= currentIdx
        const active  = i === currentIdx
        const pending = i > currentIdx
        return (
          <View key={step.key} style={tl.row}>
            {/* 세로선 */}
            <View style={tl.lineCol}>
              {i > 0 && (
                <View style={[tl.line, done && { backgroundColor: step.color }]} />
              )}
              <View style={[
                tl.circle,
                done && { backgroundColor: step.color, borderColor: step.color },
                active && tl.circleActive,
                pending && tl.circlePending,
              ]}>
                <Ionicons
                  name={step.icon as any}
                  size={active ? 22 : 18}
                  color={done ? '#FFFFFF' : T.textMuted}
                />
              </View>
            </View>

            {/* 텍스트 */}
            <View style={[tl.textWrap, i < STEPS.length - 1 && { paddingBottom: 24 }]}>
              <Text style={[
                tl.stepLabel,
                active && { color: step.color, fontSize: 22 },
                done && !active && { color: T.text },
                pending && { color: T.textMuted },
              ]}>
                {step.label}
                {active && ' ●'}
              </Text>
              {(done || active) && (
                <Text style={[tl.stepSub, active && { color: step.color }]}>
                  {step.sub}
                </Text>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const tl = StyleSheet.create({
  container:    { paddingTop: 8 },
  row:          { flexDirection: 'row', alignItems: 'flex-start' },
  lineCol:      { width: 52, alignItems: 'center' },
  line:         { width: 3, height: 24, backgroundColor: T.border, marginBottom: -2 },
  circle:       { width: 44, height: 44, borderRadius: 22, backgroundColor: T.card, borderWidth: 2.5, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  circleActive: { shadowColor: T.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  circlePending:{ opacity: 0.5 },
  textWrap:     { flex: 1, paddingLeft: 12, paddingTop: 8 },
  stepLabel:    { fontSize: 20, fontWeight: '800', color: T.text },
  stepSub:      { fontSize: 15, color: T.textSub, marginTop: 3, lineHeight: 22 },
  specialBox:   { alignItems: 'center', paddingVertical: 24, gap: 10 },
  specialIcon:  { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  specialTitle: { fontSize: 24, fontWeight: '800' },
  specialSub:   { fontSize: 17, color: T.textMuted },
})

/* ── 주문 카드 ──────────────────────────────────────────── */
function OrderCard({ order }: { order: Order }) {
  const isActive = !['delivered', 'cancelled'].includes(order.status)

  return (
    <View style={[card.wrap, isActive && { borderColor: T.primary }]}>
      {/* 카드 헤더 */}
      <View style={card.header}>
        <View>
          <Text style={card.orderNo}>{order.order_no}</Text>
          <Text style={card.address} numberOfLines={1}>{order.delivery_address}</Text>
        </View>
        {isActive && (
          <View style={card.activePill}>
            <View style={card.activeDot} />
            <Text style={card.activePillText}>진행중</Text>
          </View>
        )}
      </View>

      {order.items_desc && (
        <View style={card.itemsRow}>
          <Ionicons name="cube-outline" size={16} color={T.textMuted} />
          <Text style={card.itemsText}>{order.items_desc} · {order.quantity}개</Text>
        </View>
      )}

      <View style={card.divider} />

      {/* 타임라인 */}
      <StatusTimeline status={order.status} />
    </View>
  )
}

const card = StyleSheet.create({
  wrap:       { backgroundColor: T.card, borderRadius: 22, padding: 22, borderWidth: 2, borderColor: T.border, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  orderNo:    { fontSize: 20, fontWeight: '800', color: T.primary, marginBottom: 4 },
  address:    { fontSize: 18, fontWeight: '600', color: T.text, maxWidth: 220 },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF7ED', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: '#FED7AA' },
  activeDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: T.primary },
  activePillText:{ fontSize: 14, color: T.primary, fontWeight: '700' },
  itemsRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  itemsText:  { fontSize: 16, color: T.textSub },
  divider:    { height: 1, backgroundColor: T.border, marginVertical: 16 },
})

/* ── 메인 화면 ──────────────────────────────────────────── */
export function CustomerTrackingScreen() {
  const insets = useSafeAreaInsets()

  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders/my').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayOrders = orders.filter((o) => o.created_at?.startsWith(todayStr))
  const active = todayOrders.filter((o) => !['delivered', 'cancelled'].includes(o.status))
  const done   = todayOrders.filter((o) =>  ['delivered', 'cancelled'].includes(o.status))

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>배송 추적</Text>
          <Text style={s.headerSub}>오늘 배송 현황</Text>
        </View>
        {todayOrders.length > 0 && (
          <View style={s.countChip}>
            <Text style={s.countText}>오늘 {todayOrders.length}건</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={refetch}
            tintColor={T.primary}
            colors={[T.primary]}
          />
        }
      >
        {isLoading && (
          <View style={s.center}>
            <Text style={s.emptyText}>불러오는 중...</Text>
          </View>
        )}

        {!isLoading && todayOrders.length === 0 && (
          <View style={s.center}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="mail-open-outline" size={52} color={T.textMuted} />
            </View>
            <Text style={s.emptyTitle}>오늘 배송 내역이 없습니다</Text>
            <Text style={s.emptyMsg}>주문하기 탭에서 배송을 신청해 보세요</Text>
          </View>
        )}

        {/* 진행 중 주문 */}
        {active.length > 0 && (
          <>
            <Text style={s.sectionLabel}>진행 중 ({active.length})</Text>
            {active.map((o) => <OrderCard key={o.id} order={o} />)}
          </>
        )}

        {/* 완료 주문 */}
        {done.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 8 }]}>완료 ({done.length})</Text>
            {done.map((o) => <OrderCard key={o.id} order={o} />)}
          </>
        )}

        <Text style={s.hint}>
          <Ionicons name="refresh-outline" size={14} color={T.textMuted} /> 아래로 당겨서 새로 고침
        </Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.bg },
  headerTitle: { fontSize: 26, fontWeight: '900', color: T.text },
  headerSub:   { fontSize: 14, color: T.textMuted, marginTop: 2 },
  countChip:   { backgroundColor: T.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  countText:   { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  content:      { padding: 20, paddingBottom: 60, gap: 14 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: T.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },

  center:       { alignItems: 'center', paddingVertical: 60, gap: 14 },
  emptyIconWrap:{ width: 90, height: 90, borderRadius: 45, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { fontSize: 22, fontWeight: '800', color: T.textSub },
  emptyMsg:     { fontSize: 18, color: T.textMuted, textAlign: 'center', lineHeight: 28 },
  emptyText:    { fontSize: 18, color: T.textMuted },

  hint: { textAlign: 'center', fontSize: 14, color: T.textMuted, paddingVertical: 8 },
})
