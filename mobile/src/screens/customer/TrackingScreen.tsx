import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

interface Order {
  id: number
  order_no: string
  status: string
  delivery_address: string
  dong: string
  items_desc?: string
  quantity: number
  created_at: string
  assigned_at?: string
  picked_up_at?: string
  delivered_at?: string
}

const STATUS_STEPS = [
  { key: 'pending',    label: '접수 완료',   emoji: '📋' },
  { key: 'assigned',   label: '기사 배정',   emoji: '👷' },
  { key: 'picked_up',  label: '물건 수거',   emoji: '📦' },
  { key: 'in_transit', label: '배송 중',     emoji: '🚚' },
  { key: 'delivered',  label: '배달 완료',   emoji: '✅' },
]

const STATUS_ORDER = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered']

function getStepIndex(status: string) {
  const idx = STATUS_ORDER.indexOf(status)
  return idx === -1 ? 0 : idx
}

function StatusTimeline({ order }: { order: Order }) {
  const currentIdx = getStepIndex(order.status)
  const isCancelled = order.status === 'cancelled'
  const isDelayed = order.status === 'delayed'

  if (isCancelled) {
    return (
      <View style={tl.cancelBox}>
        <Text style={tl.cancelIcon}>❌</Text>
        <Text style={tl.cancelText}>배송 취소됨</Text>
      </View>
    )
  }

  if (isDelayed) {
    return (
      <View style={tl.delayBox}>
        <Text style={tl.delayIcon}>⏰</Text>
        <Text style={tl.delayText}>배송이 지연되고 있습니다{'\n'}곧 연락드리겠습니다</Text>
      </View>
    )
  }

  return (
    <View style={tl.container}>
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx
        const isActive = i === currentIdx
        return (
          <View key={step.key} style={tl.stepRow}>
            {/* 라인 */}
            {i > 0 && (
              <View style={[tl.line, done && tl.lineDone]} />
            )}
            {/* 서클 */}
            <View style={[tl.circle, done && tl.circleDone, isActive && tl.circleActive]}>
              <Text style={[tl.circleText, done && tl.circleTextDone]}>
                {done ? step.emoji : String(i + 1)}
              </Text>
            </View>
            {/* 라벨 */}
            <Text style={[tl.stepLabel, done && tl.stepLabelDone, isActive && tl.stepLabelActive]}>
              {step.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const tl = StyleSheet.create({
  container: { paddingVertical: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  line: { width: 3, height: 20, backgroundColor: '#e5e7eb', marginLeft: 18, marginVertical: -4 },
  lineDone: { backgroundColor: '#f97316' },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 2, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  circleDone: { backgroundColor: '#fff7ed', borderColor: '#f97316' },
  circleActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  circleText: { fontSize: 16, color: '#9ca3af', fontWeight: '700' },
  circleTextDone: { fontSize: 18 },
  stepLabel: { fontSize: 17, color: '#9ca3af', marginLeft: 12, fontWeight: '600' },
  stepLabelDone: { color: '#374151' },
  stepLabelActive: { color: '#f97316', fontSize: 19, fontWeight: 'bold' },
  cancelBox: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  cancelIcon: { fontSize: 40 },
  cancelText: { fontSize: 20, color: '#dc2626', fontWeight: 'bold' },
  delayBox: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  delayIcon: { fontSize: 40 },
  delayText: { fontSize: 18, color: '#d97706', fontWeight: '600', textAlign: 'center', lineHeight: 28 },
})

function OrderCard({ order }: { order: Order }) {
  const isActive = !['delivered', 'cancelled'].includes(order.status)

  return (
    <View style={[s.card, isActive && s.cardActive]}>
      <View style={s.cardHeader}>
        <Text style={s.orderNo}>{order.order_no}</Text>
        {isActive && <View style={s.activePill}><Text style={s.activePillText}>진행중</Text></View>}
      </View>
      <Text style={s.address}>{order.delivery_address}</Text>
      {order.items_desc && <Text style={s.items}>{order.items_desc} · {order.quantity}개</Text>}
      <View style={s.divider} />
      <StatusTimeline order={order} />
    </View>
  )
}

export function CustomerTrackingScreen() {
  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders/my').then((r) => r.data),
    refetchInterval: 15_000,
  })

  const todayOrders = orders.filter((o) => {
    const today = new Date().toISOString().slice(0, 10)
    return o.created_at?.startsWith(today)
  })

  const activeOrders = todayOrders.filter((o) => !['delivered', 'cancelled'].includes(o.status))
  const doneOrders = todayOrders.filter((o) => ['delivered', 'cancelled'].includes(o.status))

  return (
    <SafeAreaView style={s.safeArea}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />}
      >
        <Text style={s.pageTitle}>📍 배송 추적</Text>
        <Text style={s.pageSub}>오늘 배송 현황 · 아래로 당겨서 새로고침</Text>

        {isLoading && (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>불러오는 중...</Text>
          </View>
        )}

        {!isLoading && todayOrders.length === 0 && (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyTitle}>오늘 배송 내역이 없습니다</Text>
            <Text style={s.emptyMsg}>주문하기 탭에서 배송을 신청해 보세요</Text>
          </View>
        )}

        {activeOrders.map((o) => <OrderCard key={o.id} order={o} />)}
        {doneOrders.map((o) => <OrderCard key={o.id} order={o} />)}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7ed' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  pageTitle: { fontSize: 28, fontWeight: 'bold', color: '#c2410c' },
  pageSub: { fontSize: 15, color: '#9ca3af', marginTop: -8 },

  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: '#f3f4f6', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardActive: { borderColor: '#fed7aa' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNo: { fontSize: 17, fontWeight: 'bold', color: '#c2410c' },
  activePill: { backgroundColor: '#fff7ed', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: '#fed7aa' },
  activePillText: { fontSize: 13, color: '#f97316', fontWeight: '700' },
  address: { fontSize: 18, color: '#374151', fontWeight: '600', marginBottom: 4 },
  items: { fontSize: 15, color: '#9ca3af', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },

  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#374151' },
  emptyMsg: { fontSize: 17, color: '#9ca3af', textAlign: 'center' },
})
