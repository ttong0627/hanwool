import { useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, TextInput, RefreshControl, ActivityIndicator,
  Linking, ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import api, { BASE_URL } from '@/lib/api'

const T = {
  primary: '#F97316', dark: '#0F172A', bg: '#F1F5F9', card: '#FFFFFF',
  border: '#E2E8F0', text: '#0F172A', textSub: '#475569', textMuted: '#94A3B8',
  success: '#10B981', warning: '#F59E0B', info: '#3B82F6', error: '#EF4444',
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: '대기',   color: T.textMuted, bg: '#F1F5F9' },
  assigned:   { label: '배정',   color: T.info,      bg: '#EFF6FF' },
  picked_up:  { label: '픽업',   color: T.warning,   bg: '#FFFBEB' },
  in_transit: { label: '배송중', color: T.primary,   bg: '#FFF7ED' },
  delivered:  { label: '완료',   color: T.success,   bg: '#ECFDF5' },
  delayed:    { label: '지연',   color: T.error,     bg: '#FEF2F2' },
  cancelled:  { label: '취소',   color: T.error,     bg: '#FEF2F2' },
}

interface Order {
  id: number; order_no: string; customer_name: string; customer_phone?: string
  dong: string; status: string; sequence?: number
  driver_name?: string | null; driver_phone?: string | null
  delivered_at?: string | null; delivery_photo_url?: string | null
  coord_mismatch?: boolean; coord_distance_m?: number | null
  items_desc?: string; quantity?: number; delivery_address?: string
  detail_address?: string | null; request?: string | null; item_code?: string | null
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[s.statChip, { borderTopColor: color }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function DeliveryCard({ order, onPhoto, onPress }: { order: Order; onPhoto: (url: string) => void; onPress: () => void }) {
  const meta = STATUS_META[order.status] ?? STATUS_META.pending
  const photoUrl = order.delivery_photo_url ? `${BASE_URL}${order.delivery_photo_url}` : null
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <View style={s.cardLeft}>
        <View style={s.seqCircle}><Text style={s.seqText}>{order.sequence ?? '-'}</Text></View>
      </View>
      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <Text style={s.name}>{order.customer_name}</Text>
          <View style={[s.badge, { backgroundColor: meta.bg }]}>
            <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={s.sub}>{order.dong} · {order.driver_name ?? '미배정'}</Text>
        {order.items_desc ? <Text style={s.items} numberOfLines={1}>{order.items_desc} · {order.quantity ?? 1}개</Text> : null}

        <View style={s.metaRow}>
          {order.status === 'delivered' && (
            <View style={s.metaItem}>
              <Ionicons name="time-outline" size={13} color={T.success} />
              <Text style={[s.metaText, { color: T.success }]}>완료 {fmtTime(order.delivered_at)}</Text>
            </View>
          )}
          {order.coord_mismatch && (
            <View style={s.metaItem}>
              <Ionicons name="warning" size={13} color={T.error} />
              <Text style={[s.metaText, { color: T.error }]}>
                좌표오류{order.coord_distance_m != null ? ` ${Math.round(order.coord_distance_m)}m` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>
      {photoUrl && (
        <TouchableOpacity onPress={() => onPhoto(photoUrl)} activeOpacity={0.85}>
          <Image source={{ uri: photoUrl }} style={s.thumb} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

function DetailRow({ icon, label, value, color }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={16} color={color ?? T.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={[s.detailValue, color ? { color } : null]}>{value || '-'}</Text>
      </View>
    </View>
  )
}

function DetailModal({ order, onClose, onPhoto }: { order: Order | null; onClose: () => void; onPhoto: (url: string) => void }) {
  const insets = useSafeAreaInsets()
  if (!order) return null
  const meta = STATUS_META[order.status] ?? STATUS_META.pending
  const photoUrl = order.delivery_photo_url ? `${BASE_URL}${order.delivery_photo_url}` : null
  const addr = `${order.delivery_address ?? ''}${order.detail_address ? ` ${order.detail_address}` : ''}`.trim()
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.detailOverlay}>
        <View style={[s.detailSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.detailHandle} />
          <View style={s.detailHeader}>
            <Text style={s.detailName}>{order.customer_name}</Text>
            <View style={[s.badge, { backgroundColor: meta.bg }]}>
              <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={T.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 14, paddingTop: 6 }}>
            <DetailRow icon="receipt-outline" label="주문번호" value={order.order_no} />
            <DetailRow icon="location-outline" label="배송지" value={addr || order.dong} />
            <DetailRow icon="cube-outline" label="물품"
              value={`${order.items_desc ?? '-'} · ${order.quantity ?? 1}개${order.item_code ? `  (코드: ${order.item_code})` : ''}`} />
            {order.request ? <DetailRow icon="chatbox-ellipses-outline" label="요청사항" value={order.request} color={T.primary} /> : null}
            <DetailRow icon="person-outline" label="담당 기사" value={order.driver_name ?? '미배정'} />
            {order.status === 'delivered'
              ? <DetailRow icon="checkmark-circle-outline" label="완료 시각" value={fmtTime(order.delivered_at)} color={T.success} />
              : null}
            {order.coord_mismatch
              ? <DetailRow icon="warning-outline" label="좌표 오류"
                  value={order.coord_distance_m != null ? `약 ${Math.round(order.coord_distance_m)}m 떨어진 곳에서 완료` : '배송지와 완료 위치 불일치'} color={T.error} />
              : null}

            {photoUrl && (
              <View>
                <Text style={s.detailLabel}>배송 완료 사진</Text>
                <TouchableOpacity activeOpacity={0.9} onPress={() => onPhoto(photoUrl)}>
                  <Image source={{ uri: photoUrl }} style={s.detailPhoto} resizeMode="cover" />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {order.customer_phone ? (
            <TouchableOpacity style={s.callBtn} activeOpacity={0.85} onPress={() => Linking.openURL(`tel:${order.customer_phone}`)}>
              <Ionicons name="call" size={18} color="#fff" />
              <Text style={s.callBtnText}>고객 전화 ({order.customer_phone})</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

export function AdminDeliveriesScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [photoModal, setPhotoModal] = useState<string | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)

  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['admin-deliveries'],
    queryFn: () => api.get('/orders/today/overview').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return orders
    return orders.filter((o) =>
      o.customer_name?.includes(q) || o.delivery_address?.includes(q) || o.driver_name?.includes(q),
    )
  }, [orders, search])

  const total = orders.length
  const done = orders.filter((o) => o.status === 'delivered').length
  const inProg = orders.filter((o) => ['assigned', 'picked_up', 'in_transit'].includes(o.status)).length

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>배송 확인</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.statsRow}>
        <StatChip label="전체" value={total} color={T.textSub} />
        <StatChip label="진행중" value={inProg} color={T.primary} />
        <StatChip label="완료" value={done} color={T.success} />
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color={T.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="고객명 · 주소 · 기사 검색"
          placeholderTextColor={T.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={T.textMuted} /></TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={T.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={T.primary} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => <DeliveryCard order={item} onPhoto={setPhotoModal} onPress={() => setDetailOrder(item)} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="cube-outline" size={48} color={T.border} />
              <Text style={s.emptyText}>오늘 배송이 없습니다</Text>
            </View>
          }
        />
      )}

      {/* 상세 모달 */}
      <DetailModal order={detailOrder} onClose={() => setDetailOrder(null)} onPhoto={setPhotoModal} />

      {/* 사진 확대 모달 */}
      <Modal visible={!!photoModal} transparent animationType="fade" onRequestClose={() => setPhotoModal(null)}>
        <TouchableOpacity style={s.photoOverlay} activeOpacity={1} onPress={() => setPhotoModal(null)}>
          {photoModal && <Image source={{ uri: photoModal }} style={s.photoFull} resizeMode="contain" />}
          <Text style={s.photoHint}>화면을 누르면 닫힙니다</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.dark, paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },

  statsRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
  statChip: { flex: 1, backgroundColor: T.card, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderTopWidth: 3 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: T.textMuted, fontWeight: '600', marginTop: 2 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.card, marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  searchInput: { flex: 1, fontSize: 14, color: T.text, padding: 0 },

  card: { flexDirection: 'row', backgroundColor: T.card, borderRadius: 14, padding: 12, alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardLeft: { width: 32 },
  seqCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  seqText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', color: T.text },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9 },
  badgeText: { fontSize: 11.5, fontWeight: '800' },
  sub: { fontSize: 12.5, color: T.textSub, marginTop: 2 },
  items: { fontSize: 12, color: T.textMuted, marginTop: 1 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 5, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11.5, fontWeight: '700' },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: T.border },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 15, color: T.textSub, fontWeight: '600' },

  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', gap: 16 },
  photoFull: { width: '92%', height: '78%' },
  photoHint: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  detailHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  detailName: { flex: 1, fontSize: 20, fontWeight: '800', color: T.text },
  detailRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  detailLabel: { fontSize: 11.5, color: T.textMuted, fontWeight: '700', marginBottom: 2 },
  detailValue: { fontSize: 15, color: T.text, fontWeight: '600', lineHeight: 21 },
  detailPhoto: { width: '100%', height: 220, borderRadius: 14, marginTop: 6, backgroundColor: T.border },
  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: T.info, paddingVertical: 15, borderRadius: 14, marginTop: 16 },
  callBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
