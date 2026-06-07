import React, { useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image, Modal, Share, ScrollView, Alert,
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
  error:     '#EF4444',
}

interface Order {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  dong: string
  delivery_address: string
  detail_address?: string | null
  items_desc?: string
  item_code?: string | null
  quantity: number
  sequence?: number
  status: string
  request?: string | null
  notes?: string | null
  delivery_photo_url?: string | null
  delivery_signature_url?: string | null
  delivered_at?: string | null
  pod_lat?: number | null
  pod_lng?: number | null
  coord_mismatch?: boolean
  coord_distance_m?: number | null
}

function fullUrl(path?: string | null): string | null {
  if (!path) return null
  return path.startsWith('http') ? path : `${BASE_URL}${path}`
}

function formatTime(iso?: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${mm}/${dd} ${h}:${m}`
  } catch {
    return ''
  }
}

function distText(m?: number | null): string {
  if (m == null) return ''
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
}

/* ── 전체화면 사진 뷰어 + 공유 ─────────────────────────────── */
function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null
  const share = async () => {
    try { await Share.share({ url: src, message: `배송 완료 사진\n${src}` }) }
    catch { /* 사용자 취소 */ }
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lbWrap}>
        <Image source={{ uri: src }} style={styles.lbImg} resizeMode="contain" />
        <View style={styles.lbBar}>
          <TouchableOpacity style={styles.lbBtn} onPress={share} activeOpacity={0.85}>
            <Ionicons name="share-social" size={20} color="#fff" />
            <Text style={styles.lbBtnText}>공유</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.lbBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={20} color="#fff" />
            <Text style={styles.lbBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ── 완료 상세 모달 ─────────────────────────────────────────── */
function DetailRow({ label, value, color }: { label: string; value?: string | null; color?: string }) {
  return (
    <View style={styles.dRow}>
      <Text style={styles.dLabel}>{label}</Text>
      <Text style={[styles.dValue, color ? { color } : null]}>{value || '-'}</Text>
    </View>
  )
}

function DetailModal({ order, onClose, onZoom }: { order: Order | null; onClose: () => void; onZoom: (src: string) => void }) {
  const insets = useSafeAreaInsets()
  if (!order) return null
  const photo = fullUrl(order.delivery_photo_url)
  const sign = fullUrl(order.delivery_signature_url)
  const addr = `${order.delivery_address ?? ''}${order.detail_address ? ` ${order.detail_address}` : ''}`.trim()
  const coord = order.pod_lat != null && order.pod_lng != null ? `${order.pod_lat.toFixed(5)}, ${order.pod_lng.toFixed(5)}` : null

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.dOverlay}>
        <View style={[styles.dSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.dHandle} />
          <View style={styles.dHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dName}>{order.customer_name} · {order.dong}</Text>
              <Text style={styles.dSub}>{order.order_no}{order.sequence ? ` · ${order.sequence}번째 배송` : ''}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={T.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}>
            {/* 완료 사진 */}
            {photo ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => onZoom(photo)} style={styles.dPhotoWrap}>
                <Image source={{ uri: photo }} style={styles.dPhoto} resizeMode="cover" />
                <View style={styles.dPhotoTag}><Ionicons name="expand" size={13} color="#fff" /><Text style={styles.dPhotoTagText}>크게 보기 · 공유</Text></View>
              </TouchableOpacity>
            ) : (
              <View style={styles.dPhotoEmpty}><Text style={styles.dPhotoEmptyText}>완료 사진 없음</Text></View>
            )}

            <View style={{ height: 12 }} />
            <DetailRow label="완료시각" value={formatTime(order.delivered_at)} />
            <DetailRow label="연락처" value={order.customer_phone} />
            <DetailRow label="주소" value={addr || order.dong} />
            <DetailRow label="물품" value={order.items_desc ? `${order.items_desc} · ${order.quantity ?? 1}개${order.item_code ? ` (코드: ${order.item_code})` : ''}` : '-'} />
            <DetailRow label="요청사항" value={order.request || '없음'} color={order.request ? T.primary : undefined} />
            {order.notes ? <DetailRow label="메모" value={order.notes} /> : null}
            <DetailRow label="기사 좌표" value={coord || '완료 GPS 없음'} />
            {order.coord_mismatch ? (
              <View style={styles.warn}>
                <Ionicons name="warning" size={15} color={T.error} />
                <Text style={styles.warnText}>완료 위치가 배송지에서 {distText(order.coord_distance_m)} 떨어져 있습니다.</Text>
              </View>
            ) : null}

            {/* 서명 */}
            {sign ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.dLabel}>수령인 서명</Text>
                <TouchableOpacity activeOpacity={0.9} onPress={() => onZoom(sign)} style={styles.signWrap}>
                  <Image source={{ uri: sign }} style={styles.signImg} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function HistoryCard({ item, onPress }: { item: Order; onPress: () => void }) {
  const photoUrl = fullUrl(item.delivery_photo_url)
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardLeft}>
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={14} color={T.success} />
          <Text style={styles.badgeText}>완료</Text>
          {item.delivered_at ? <Text style={styles.badgeTime}>{formatTime(item.delivered_at)}</Text> : null}
        </View>
        <Text style={styles.customerName}>{item.customer_name}</Text>
        <Text style={styles.address} numberOfLines={1}>{item.dong} · {item.delivery_address}</Text>
        {item.items_desc ? <Text style={styles.items} numberOfLines={1}>{item.items_desc}</Text> : null}
        {item.sequence != null && (
          <View style={styles.seqRow}>
            <Ionicons name="navigate" size={12} color={T.textMuted} />
            <Text style={styles.seqText}>{item.sequence}번째 배송</Text>
          </View>
        )}
      </View>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={styles.thumbEmpty}>
          <Ionicons name="camera-outline" size={22} color={T.textMuted} />
          <Text style={styles.thumbEmptyText}>사진 없음</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export function DriverHistoryScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const [detail, setDetail] = useState<Order | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

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

  const delivered = useMemo(() => (data ?? []).sort((a, b) => b.id - a.id), [data])
  const totalCount = delivered.length
  const withPhoto = delivered.filter((o) => o.delivery_photo_url).length

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
          renderItem={({ item }) => <HistoryCard item={item} onPress={() => setDetail(item)} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={T.primary} colors={[T.primary]} />
          }
        />
      )}

      <DetailModal order={detail} onClose={() => setDetail(null)} onZoom={(src) => setLightbox(src)} />
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.dark, paddingHorizontal: 20, paddingVertical: 20,
  },
  headerTitle:    { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  headerSub:      { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  headerStats:    { flexDirection: 'row', alignItems: 'center' },
  headerStat:     { alignItems: 'center' },
  headerStatNum:  { fontSize: 24, fontWeight: '800', color: T.primary },
  headerStatLabel:{ fontSize: 11, color: '#94A3B8', marginTop: 2 },

  listContent: { padding: 16, gap: 12, paddingBottom: 100 },

  card: {
    backgroundColor: T.card, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderLeftWidth: 4, borderLeftColor: T.success,
  },
  cardLeft:     { flex: 1, marginRight: 12 },
  badge:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 },
  badgeText:    { fontSize: 12, fontWeight: '700', color: T.success },
  badgeTime:    { fontSize: 12, color: T.textMuted, marginLeft: 4 },
  customerName: { fontSize: 19, fontWeight: '800', color: T.text, marginBottom: 4 },
  address:      { fontSize: 15, color: T.textSub, marginBottom: 4, lineHeight: 21 },
  items:        { fontSize: 13.5, color: T.textSub, marginBottom: 6 },
  seqRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seqText:      { fontSize: 12, color: T.textMuted },

  thumb:      { width: 72, height: 72, borderRadius: 12, backgroundColor: T.border },
  thumbEmpty: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.border, borderStyle: 'dashed', gap: 4 },
  thumbEmptyText: { fontSize: 10, color: T.textMuted },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: T.textMuted },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: T.textSub },
  emptyText:   { fontSize: 14, color: T.textMuted },

  /* 상세 모달 */
  dOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  dSheet:   { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: '88%' },
  dHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 12 },
  dHeader:  { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  dName:    { fontSize: 18, fontWeight: '800', color: T.text },
  dSub:     { fontSize: 12, color: T.textMuted, marginTop: 2 },
  dPhotoWrap: { position: 'relative', borderRadius: 14, overflow: 'hidden' },
  dPhoto:   { width: '100%', height: 240, backgroundColor: '#0F172A' },
  dPhotoTag:{ position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  dPhotoTagText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  dPhotoEmpty: { height: 120, borderRadius: 14, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  dPhotoEmptyText: { color: T.textMuted, fontSize: 14 },
  dRow:     { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dLabel:   { width: 80, fontSize: 14, color: T.textMuted, fontWeight: '700' },
  dValue:   { flex: 1, fontSize: 15.5, color: T.text, fontWeight: '600' },
  warn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginTop: 8 },
  warnText: { flex: 1, fontSize: 12.5, color: T.error, fontWeight: '600' },
  signWrap: { marginTop: 6, borderWidth: 1, borderColor: T.border, borderRadius: 10, backgroundColor: '#fff' },
  signImg:  { width: '100%', height: 120 },

  /* 라이트박스 */
  lbWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  lbImg:  { width: '100%', height: '78%' },
  lbBar:  { position: 'absolute', bottom: 36, flexDirection: 'row', gap: 12 },
  lbBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  lbBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
