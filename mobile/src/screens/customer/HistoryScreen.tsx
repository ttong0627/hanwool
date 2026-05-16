import { View, Text, StyleSheet, FlatList, RefreshControl, SafeAreaView } from 'react-native'
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
  delivered_at?: string
}

const STATUS_INFO: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: '접수대기',   color: '#92400e', bg: '#fef3c7' },
  assigned:   { label: '기사배정',   color: '#1e40af', bg: '#dbeafe' },
  picked_up:  { label: '수거완료',   color: '#7e22ce', bg: '#f3e8ff' },
  in_transit: { label: '배송중',     color: '#c2410c', bg: '#ffedd5' },
  delivered:  { label: '배달완료',   color: '#166534', bg: '#dcfce7' },
  cancelled:  { label: '취소',       color: '#6b7280', bg: '#f3f4f6' },
  delayed:    { label: '지연',       color: '#b45309', bg: '#fef3c7' },
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hour}:${min}`
}

function HistoryItem({ order }: { order: Order }) {
  const info = STATUS_INFO[order.status] || STATUS_INFO['pending']

  return (
    <View style={s.item}>
      <View style={s.itemTop}>
        <Text style={s.orderNo}>{order.order_no}</Text>
        <View style={[s.statusBadge, { backgroundColor: info.bg }]}>
          <Text style={[s.statusText, { color: info.color }]}>{info.label}</Text>
        </View>
      </View>
      <Text style={s.address}>{order.delivery_address}</Text>
      {order.items_desc && (
        <Text style={s.items}>{order.items_desc} · {order.quantity}개</Text>
      )}
      <Text style={s.date}>
        {formatDate(order.created_at)}
        {order.delivered_at && ` → 완료 ${formatDate(order.delivered_at)}`}
      </Text>
    </View>
  )
}

export function CustomerHistoryScreen() {
  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders/my').then((r) => r.data),
    staleTime: 60_000,
  })

  const deliveredCount = orders.filter((o) => o.status === 'delivered').length

  return (
    <SafeAreaView style={s.safeArea}>
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        renderItem={({ item }) => <HistoryItem order={item} />}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f97316" />
        }
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.pageTitle}>📋 주문 내역</Text>
            {orders.length > 0 && (
              <View style={s.summaryRow}>
                <View style={s.summaryBox}>
                  <Text style={s.summaryNum}>{orders.length}</Text>
                  <Text style={s.summaryLabel}>총 주문</Text>
                </View>
                <View style={s.summaryBox}>
                  <Text style={[s.summaryNum, { color: '#16a34a' }]}>{deliveredCount}</Text>
                  <Text style={s.summaryLabel}>배달완료</Text>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>📭</Text>
              <Text style={s.emptyTitle}>주문 내역이 없습니다</Text>
              <Text style={s.emptyMsg}>주문하기 탭에서 첫 배송을 신청해 보세요</Text>
            </View>
          ) : (
            <View style={s.emptyBox}>
              <Text style={s.emptyMsg}>불러오는 중...</Text>
            </View>
          )
        }
        contentContainerStyle={s.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7ed' },
  listContent: { padding: 20, paddingBottom: 40 },

  header: { marginBottom: 16 },
  pageTitle: { fontSize: 28, fontWeight: 'bold', color: '#c2410c', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryBox: { flex: 1, backgroundColor: 'white', borderRadius: 16, paddingVertical: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  summaryNum: { fontSize: 28, fontWeight: 'bold', color: '#f97316' },
  summaryLabel: { fontSize: 15, color: '#6b7280', marginTop: 2 },

  item: { backgroundColor: 'white', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNo: { fontSize: 17, fontWeight: 'bold', color: '#c2410c' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 14, fontWeight: '700' },
  address: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 3 },
  items: { fontSize: 15, color: '#9ca3af', marginBottom: 3 },
  date: { fontSize: 14, color: '#9ca3af' },

  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#374151' },
  emptyMsg: { fontSize: 17, color: '#9ca3af', textAlign: 'center' },
})
