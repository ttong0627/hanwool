import { useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import api, { BASE_URL } from '@/lib/api'

const T = {
  primary: '#F97316', dark: '#0F172A', sub: '#475569', muted: '#94A3B8',
  border: '#E2E8F0', bg: '#F8FAFC', card: '#FFFFFF',
  success: '#059669', error: '#EF4444', info: '#2563EB',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '접수', assigned: '배정', picked_up: '픽업완료',
  in_transit: '배송중', delivered: '배송완료', cancelled: '취소', delayed: '지연',
}

interface OrderDetail {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  status: string
  dong: string
  delivery_address: string
  detail_address?: string | null
  items_desc?: string | null
  quantity?: number
  item_code?: string | null
  request?: string | null
  notes?: string | null
  sequence?: number | null
  lat?: number | null
  lng?: number | null
  delivery_photo_url?: string | null
  delivery_signature_url?: string | null
  delivery_memo?: string | null
  received_by_security?: boolean
  pod_lat?: number | null
  pod_lng?: number | null
  coord_distance_m?: number | null
  coord_mismatch?: boolean
  created_at?: string | null
  assigned_at?: string | null
  picked_up_at?: string | null
  delivered_at?: string | null
}

function fmt(ts?: string | null): string {
  if (!ts) return '-'
  try {
    const d = new Date(ts)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return ts }
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={[st.rowValue, color ? { color } : null]}>{value || '-'}</Text>
    </View>
  )
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const orderId = Number(id)

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ['order-detail', orderId],
    queryFn: () => api.get(`/orders/${orderId}`).then((r) => r.data),
    enabled: Number.isFinite(orderId),
  })

  const photoUrl = useMemo(
    () => (order?.delivery_photo_url ? `${BASE_URL}${order.delivery_photo_url}` : null),
    [order?.delivery_photo_url],
  )
  const signUrl = useMemo(
    () => (order?.delivery_signature_url ? `${BASE_URL}${order.delivery_signature_url}` : null),
    [order?.delivery_signature_url],
  )

  const openNavi = () => {
    if (!order) return
    const name = encodeURIComponent(order.delivery_address || '배송지')
    if (order.lat != null && order.lng != null) {
      Linking.openURL(`kakaomap://route?ep=${order.lat},${order.lng}&by=CAR`).catch(() =>
        Linking.openURL(`https://map.kakao.com/link/to/${name},${order.lat},${order.lng}`),
      )
    } else {
      Linking.openURL(`https://map.kakao.com/link/search/${name}`).catch(() => {})
    }
  }

  const isDone = order?.status === 'delivered'

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={T.dark} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>배송 상세</Text>
        <View style={{ width: 26 }} />
      </View>

      {isLoading || !order ? (
        <View style={st.center}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          {/* 상태/주문번호 */}
          <View style={st.topRow}>
            <Text style={st.orderNo}>{order.order_no}</Text>
            <View style={[st.statusBadge, isDone && { backgroundColor: 'rgba(5,150,105,0.12)' }]}>
              <Text style={[st.statusText, isDone && { color: T.success }]}>{STATUS_LABEL[order.status] ?? order.status}</Text>
            </View>
          </View>

          {/* 고객/주소 */}
          <View style={st.cardBox}>
            <Text style={st.custName}>{order.customer_name} 고객님</Text>
            <View style={st.addrRow}>
              <Ionicons name="location-outline" size={16} color={T.muted} style={{ marginTop: 2 }} />
              <Text style={st.addr}>
                {order.delivery_address}{order.detail_address ? ` ${order.detail_address}` : ''}
              </Text>
            </View>
            <Row label="배송동" value={order.dong} />
            <Row label="물품" value={`${order.items_desc || '-'} (${order.quantity ?? 1}개)`} />
            {order.item_code ? <Row label="코드" value={order.item_code} /> : null}
            {order.request ? <Row label="요청사항" value={order.request} color={T.primary} /> : null}
            {order.notes ? <Row label="전달사항" value={order.notes} color={T.info} /> : null}
          </View>

          {/* 액션 */}
          <View style={st.actionRow}>
            <TouchableOpacity style={[st.actionBtn, { borderColor: T.error }]} onPress={openNavi} activeOpacity={0.85}>
              <Ionicons name="navigate-outline" size={18} color={T.error} />
              <Text style={[st.actionText, { color: T.error }]}>카카오내비</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.actionBtn, { borderColor: T.info }]}
              onPress={() => Linking.openURL(`tel:${order.customer_phone}`)}
              activeOpacity={0.85}
            >
              <Ionicons name="call-outline" size={18} color={T.info} />
              <Text style={[st.actionText, { color: T.info }]}>전화</Text>
            </TouchableOpacity>
          </View>

          {/* 완료 정보 */}
          {isDone && (
            <View style={st.cardBox}>
              <Text style={st.sectionTitle}>배송완료 정보</Text>
              <View style={st.tagRow}>
                {order.received_by_security && (
                  <View style={st.tagSecurity}>
                    <Ionicons name="shield-checkmark" size={13} color={T.success} />
                    <Text style={st.tagSecurityText}>경비실 수령</Text>
                  </View>
                )}
                {order.delivery_signature_url && (
                  <View style={st.tagSign}>
                    <Ionicons name="create-outline" size={13} color={T.info} />
                    <Text style={st.tagSignText}>서명 있음</Text>
                  </View>
                )}
                {order.coord_mismatch && (
                  <View style={st.tagWarn}>
                    <Ionicons name="warning" size={13} color={T.error} />
                    <Text style={st.tagWarnText}>좌표 불일치</Text>
                  </View>
                )}
              </View>

              <Row label="완료시각" value={fmt(order.delivered_at)} />
              {order.coord_distance_m != null && (
                <Row label="배송지 거리" value={`약 ${Math.round(order.coord_distance_m)}m`} color={order.coord_mismatch ? T.error : T.sub} />
              )}
              {order.delivery_memo ? <Row label="메모" value={order.delivery_memo} /> : null}

              {photoUrl && (
                <View style={{ marginTop: 12 }}>
                  <Text style={st.imgLabel}>완료 사진</Text>
                  <Image source={{ uri: photoUrl }} style={st.photo} resizeMode="cover" />
                </View>
              )}
              {signUrl && (
                <View style={{ marginTop: 12 }}>
                  <Text style={st.imgLabel}>수령인 서명</Text>
                  <Image source={{ uri: signUrl }} style={st.sign} resizeMode="contain" />
                </View>
              )}
            </View>
          )}

          {/* 진행 이력(시각) */}
          <View style={st.cardBox}>
            <Text style={st.sectionTitle}>진행 시각</Text>
            <Row label="접수" value={fmt(order.created_at)} />
            <Row label="배정" value={fmt(order.assigned_at)} />
            <Row label="픽업" value={fmt(order.picked_up_at)} />
            <Row label="완료" value={fmt(order.delivered_at)} />
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: T.card,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: T.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  orderNo: { fontSize: 15, fontWeight: '800', color: T.dark },
  statusBadge: { backgroundColor: 'rgba(148,163,184,0.18)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '800', color: T.sub },
  cardBox: { backgroundColor: T.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: T.border },
  custName: { fontSize: 18, fontWeight: '800', color: T.dark, marginBottom: 8 },
  addrRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  addr: { flex: 1, fontSize: 15, color: T.sub, lineHeight: 21 },
  row: { flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  rowLabel: { width: 92, fontSize: 13, fontWeight: '700', color: T.muted },
  rowValue: { flex: 1, fontSize: 14, color: T.dark },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, backgroundColor: T.card,
  },
  actionText: { fontSize: 15, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: T.dark, marginBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  tagSecurity: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,150,105,0.10)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  tagSecurityText: { fontSize: 12, fontWeight: '800', color: T.success },
  tagSign: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(37,99,235,0.10)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  tagSignText: { fontSize: 12, fontWeight: '800', color: T.info },
  tagWarn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.10)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  tagWarnText: { fontSize: 12, fontWeight: '800', color: T.error },
  imgLabel: { fontSize: 12, fontWeight: '700', color: T.muted, marginBottom: 6 },
  photo: { width: '100%', height: 260, borderRadius: 12, backgroundColor: '#F1F5F9' },
  sign: { width: '100%', height: 130, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: T.border },
})
