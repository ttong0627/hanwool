import React, { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, Linking, Image, Modal,
  ActivityIndicator, TextInput, ScrollView,
} from 'react-native'
import * as SMS from 'expo-sms'
import * as ImagePicker from 'expo-image-picker'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useLocationTracking } from '@/hooks/useLocationTracking'

const API_BASE = 'http://34.64.146.168:8000'

const STATUS_LABEL: Record<string, string> = {
  assigned: '배송 대기',
  picked_up: '픽업 완료',
  in_transit: '배송 중',
  delivered: '배달 완료',
}
const STATUS_COLORS: Record<string, string> = {
  assigned: '#3b82f6',
  picked_up: '#eab308',
  in_transit: '#f97316',
  delivered: '#22c55e',
}
const SMS_STATUSES = new Set(['in_transit', 'delivered', 'delayed'])

interface Order {
  id: number; order_no: string; customer_name: string; customer_phone: string
  status: string; dong: string; delivery_address: string; items_desc?: string
  quantity: number; sequence?: number; delivery_photo_url?: string
}
interface StatusResponse extends Order {
  sms_to?: string; sms_message?: string
}
interface Driver {
  id: number; name: string; phone: string
}

// ── 사진 업로드 (실패 시 에러 throw) ─────────────────────────────────────────
async function uploadPhoto(orderId: number, photoUri: string): Promise<void> {
  const filename = photoUri.split('/').pop() ?? 'delivery.jpg'
  const ext = filename.split('.').pop() ?? 'jpg'
  const formData = new FormData()
  formData.append('file', { uri: photoUri, name: filename, type: `image/${ext}` } as unknown as Blob)
  await api.post(`/orders/${orderId}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// ── MMS 발송 (사진 첨부) ──────────────────────────────────────────────────────
async function sendMmsWithPhoto(phone: string, message: string, photoUri: string): Promise<void> {
  const available = await SMS.isAvailableAsync()
  if (!available) return
  try {
    await SMS.sendSMSAsync([phone], message, {
      attachments: { uri: photoUri, mimeType: 'image/jpeg', filename: 'delivery_photo.jpg' },
    })
  } catch { /* 사용자 취소 또는 기기 미지원 */ }
}

function openKakaoNavi(address: string) {
  Linking.openURL(`kakaomap://route?ep=${encodeURIComponent(address)}&by=CAR`).catch(() =>
    Linking.openURL(`https://map.kakao.com/link/to/${encodeURIComponent(address)}`)
  )
}

// ── 배달 완료 확인 모달 ───────────────────────────────────────────────────────
function DeliveryCompleteModal({
  order, onConfirm, onCancel,
}: { order: Order; onConfirm: (uri: string) => void; onCancel: () => void }) {
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('권한 필요', '카메라 권한을 허용해 주세요.'); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri)
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>배달 완료 확인</Text>
          <Text style={modal.sub}>{order.customer_name}님 · {order.delivery_address}</Text>
          <TouchableOpacity style={modal.photoBox} onPress={takePhoto} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={modal.photo} resizeMode="cover" />
            ) : (
              <View style={modal.photoPlaceholder}>
                <Text style={modal.cameraIcon}>📷</Text>
                <Text style={modal.cameraLabel}>배달 완료 사진 촬영</Text>
                <Text style={modal.cameraHint}>사진을 찍어 고객께 전송합니다</Text>
              </View>
            )}
          </TouchableOpacity>
          {photoUri && <TouchableOpacity onPress={takePhoto} style={modal.retake}><Text style={modal.retakeText}>다시 촬영</Text></TouchableOpacity>}
          <Text style={modal.smsNotice}>📨 완료 처리 후 고객께 사진과 함께 문자가 발송됩니다</Text>
          <View style={modal.buttons}>
            <TouchableOpacity style={modal.cancelBtn} onPress={onCancel}><Text style={modal.cancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity
              style={[modal.confirmBtn, (!photoUri || loading) && modal.confirmDisabled]}
              onPress={() => { if (!photoUri) { Alert.alert('사진 필요', '배달 완료 사진을 먼저 촬영해 주세요.'); return } setLoading(true); onConfirm(photoUri) }}
              disabled={!photoUri || loading}
            >
              {loading ? <ActivityIndicator color="white" /> : <Text style={modal.confirmText}>완료 처리 + 문자 발송</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── 주문 인계 모달 ────────────────────────────────────────────────────────────
function TransferModal({
  order, drivers, onConfirm, onCancel,
}: { order: Order; drivers: Driver[]; onConfirm: (toDriverId: number, reason: string) => void; onCancel: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <Text style={modal.title}>주문 인계</Text>
          <Text style={modal.sub}>{order.order_no} · {order.customer_name}님</Text>

          <Text style={transfer.sectionLabel}>인계받을 기사 선택</Text>
          <ScrollView style={transfer.driverList} showsVerticalScrollIndicator={false}>
            {drivers.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[transfer.driverItem, selectedId === d.id && transfer.driverItemActive]}
                onPress={() => setSelectedId(d.id)}
              >
                <Text style={[transfer.driverName, selectedId === d.id && transfer.driverNameActive]}>{d.name}</Text>
                <Text style={transfer.driverPhone}>{d.phone}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={transfer.sectionLabel}>인계 사유 (선택)</Text>
          <TextInput
            style={transfer.reasonInput}
            placeholder="예: 차량 고장, 경로 조정..."
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <View style={modal.buttons}>
            <TouchableOpacity style={modal.cancelBtn} onPress={onCancel}><Text style={modal.cancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity
              style={[modal.confirmBtn, !selectedId && modal.confirmDisabled]}
              onPress={() => { if (selectedId) onConfirm(selectedId, reason) }}
              disabled={!selectedId}
            >
              <Text style={modal.confirmText}>인계 확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── 메인 화면 ─────────────────────────────────────────────────────────────────
export function DriverHomeScreen() {
  const qc = useQueryClient()
  const [routeMode, setRouteMode] = useState<'A' | 'B'>('A')
  const [completeTarget, setCompleteTarget] = useState<Order | null>(null)
  const [transferTarget, setTransferTarget] = useState<Order | null>(null)
  // 사진 업로드 실패 재시도 큐: orderId → photoUri
  const retryQueue = useRef<Map<number, string>>(new Map())
  const [retryKeys, setRetryKeys] = useState<number[]>([])

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['driver-route', routeMode],
    queryFn: () => api.get('/deliveries/route', { params: { route_mode: routeMode } }).then((r) => r.data),
    refetchInterval: 60_000,
  })

  // 동료 기사 목록 (인계 모달용)
  const { data: allDrivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const updateMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: string }) =>
      api.put<StatusResponse>(`/orders/${orderId}/status`, null, { params: { status } }).then((r) => r.data),
    onSuccess: async (data, { status }) => {
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      if (data.sms_to && data.sms_message && SMS_STATUSES.has(status)) {
        await sendMmsWithPhoto(data.sms_to, data.sms_message, '')
      }
    },
  })

  const transferMutation = useMutation({
    mutationFn: ({ orderId, toDriverId, reason }: { orderId: number; toDriverId: number; reason: string }) =>
      api.post(`/orders/${orderId}/transfer`, { to_driver_id: toDriverId, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      Alert.alert('완료', '주문이 인계되었습니다.')
    },
    onError: () => Alert.alert('오류', '인계 처리 중 문제가 발생했습니다.'),
  })

  // 사진 업로드 실패 → 재시도 큐 등록
  const markRetry = (orderId: number, photoUri: string) => {
    retryQueue.current.set(orderId, photoUri)
    setRetryKeys([...retryQueue.current.keys()])
  }

  const clearRetry = (orderId: number) => {
    retryQueue.current.delete(orderId)
    setRetryKeys([...retryQueue.current.keys()])
  }

  // 배달 완료: 사진 업로드 → 상태 업데이트 → MMS
  const handleDeliveryComplete = async (order: Order, photoUri: string) => {
    setCompleteTarget(null)
    try {
      await uploadPhoto(order.id, photoUri)
      clearRetry(order.id)
    } catch {
      markRetry(order.id, photoUri)
      Alert.alert(
        '사진 업로드 실패',
        '네트워크 오류로 사진 업로드에 실패했습니다.\n배달 완료 처리는 계속 진행합니다.\n나중에 재시도 버튼으로 재업로드할 수 있습니다.',
        [{ text: '확인' }]
      )
    }
    try {
      const data = await api.put<StatusResponse>(
        `/orders/${order.id}/status`, null, { params: { status: 'delivered' } }
      ).then((r) => r.data)
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      if (data.sms_to && data.sms_message) {
        await sendMmsWithPhoto(data.sms_to, data.sms_message, photoUri)
      }
    } catch {
      Alert.alert('오류', '배달 완료 처리 중 문제가 발생했습니다.')
    }
  }

  // 사진 재업로드 시도
  const handleRetryUpload = async (orderId: number) => {
    const uri = retryQueue.current.get(orderId)
    if (!uri) return
    try {
      await uploadPhoto(orderId, uri)
      clearRetry(orderId)
      Alert.alert('완료', '사진이 정상적으로 업로드되었습니다.')
    } catch {
      Alert.alert('실패', '아직 업로드가 되지 않습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  const handleStatusUpdate = (order: Order) => {
    if (order.status === 'in_transit') { setCompleteTarget(order); return }
    const nextStatus: Record<string, string> = { assigned: 'picked_up', picked_up: 'in_transit' }
    const next = nextStatus[order.status]
    if (!next) return
    const labels: Record<string, string> = { picked_up: '픽업 완료로 변경', in_transit: '배송 출발 (고객 문자 자동 발송)' }
    Alert.alert('상태 변경', `${labels[next]}?`, [
      { text: '취소', style: 'cancel' },
      { text: '확인', onPress: () => updateMutation.mutate({ orderId: order.id, status: next }) },
    ])
  }

  const handleDelayed = (order: Order) => {
    Alert.alert('배송 지연 알림', `${order.customer_name}님께 지연 문자를 보내시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { text: '문자 발송', onPress: () => updateMutation.mutate({ orderId: order.id, status: 'delayed' }) },
    ])
  }

  const handleTransferConfirm = (toDriverId: number, reason: string) => {
    if (!transferTarget) return
    setTransferTarget(null)
    transferMutation.mutate({ orderId: transferTarget.id, toDriverId, reason })
  }

  // 토큰에서 본인 ID 추출
  const myId = (() => {
    try {
      const token = (api.defaults.headers as Record<string, string>)?.Authorization?.split(' ')[1]
      if (!token) return null
      return JSON.parse(atob(token.split('.')[1])).sub
    } catch { return null }
  })()

  // 배송 중 실시간 위치 추적 (WS → 관리자 대시보드)
  useLocationTracking(myId ? Number(myId) : null, API_BASE)
  const otherDrivers = allDrivers.filter((d) => String(d.id) !== String(myId))

  const activeOrders = (orders || []).filter((o: Order) => o.status !== 'delivered')
  const doneOrders = (orders || []).filter((o: Order) => o.status === 'delivered')

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>오늘 배송 코스</Text>
        <View style={styles.modeToggle}>
          {(['A', 'B'] as const).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeBtn, routeMode === m && styles.modeBtnActive]} onPress={() => setRouteMode(m)}>
              <Text style={[styles.modeBtnText, routeMode === m && styles.modeBtnTextActive]}>
                {m === 'A' ? '시장 귀환' : '즉시 귀환'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 통계 */}
      <View style={styles.stats}>
        {[
          { label: '총 건수', value: (orders || []).length, color: '#111827' },
          { label: '남은 건수', value: activeOrders.length, color: '#f97316' },
          { label: '완료', value: doneOrders.length, color: '#22c55e' },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.statItem}>
            <Text style={[styles.statNum, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.smsBanner}>
        <Text style={styles.smsBannerText}>📷 배달 완료 시 사진과 함께 문자가 자동 발송됩니다</Text>
      </View>

      {/* 주문 목록 */}
      <FlatList
        data={orders || []}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        contentContainerStyle={styles.list}
        renderItem={({ item: order }) => {
          const hasRetry = retryKeys.includes(order.id)
          return (
            <View style={[styles.orderCard, order.status === 'delivered' && styles.orderCardDone]}>
              <View style={styles.orderHeader}>
                <View style={styles.seqBadge}>
                  <Text style={styles.seqText}>{order.sequence}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderNo}>{order.order_no}</Text>
                  <Text style={styles.dong}>{order.dong}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + '22' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}>
                    {STATUS_LABEL[order.status]}
                  </Text>
                </View>
              </View>

              <Text style={styles.customerName}>{order.customer_name}</Text>
              <Text style={styles.address}>{order.delivery_address}</Text>
              {order.items_desc && <Text style={styles.items}>{order.items_desc} ({order.quantity}개)</Text>}

              {/* 배달 완료 사진 썸네일 */}
              {order.status === 'delivered' && order.delivery_photo_url && (
                <Image source={{ uri: `http://10.0.2.2:8000${order.delivery_photo_url}` }} style={styles.thumbImage} resizeMode="cover" />
              )}

              {/* 사진 재시도 버튼 */}
              {hasRetry && (
                <TouchableOpacity style={styles.retryBtn} onPress={() => handleRetryUpload(order.id)}>
                  <Text style={styles.retryBtnText}>⚠️ 사진 업로드 재시도</Text>
                </TouchableOpacity>
              )}

              {order.status !== 'delivered' && (
                <>
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.naviBtn} onPress={() => openKakaoNavi(order.delivery_address)}>
                      <Text style={styles.naviBtnText}>카카오내비</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.customer_phone}`)}>
                      <Text style={styles.callBtnText}>전화</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.statusBtn} onPress={() => handleStatusUpdate(order)}>
                      <Text style={styles.statusBtnText}>
                        {order.status === 'assigned' ? '픽업 완료' : order.status === 'picked_up' ? '출발 📨' : '완료 📷📨'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.secondaryActions}>
                    <TouchableOpacity style={styles.transferBtn} onPress={() => setTransferTarget(order)}>
                      <Text style={styles.transferBtnText}>↔ 인계</Text>
                    </TouchableOpacity>
                    {order.status === 'in_transit' && (
                      <TouchableOpacity style={styles.delayBtn} onPress={() => handleDelayed(order)}>
                        <Text style={styles.delayBtnText}>지연 알림</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          )
        }}
      />

      {/* 배달 완료 모달 */}
      {completeTarget && (
        <DeliveryCompleteModal
          order={completeTarget}
          onConfirm={(uri) => handleDeliveryComplete(completeTarget, uri)}
          onCancel={() => setCompleteTarget(null)}
        />
      )}

      {/* 주문 인계 모달 */}
      {transferTarget && (
        <TransferModal
          order={transferTarget}
          drivers={otherDrivers}
          onConfirm={handleTransferConfirm}
          onCancel={() => setTransferTarget(null)}
        />
      )}
    </View>
  )
}

// ── 스타일 ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#f97316', padding: 16, paddingTop: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  modeToggle: { flexDirection: 'row', gap: 6 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  modeBtnActive: { backgroundColor: 'white' },
  modeBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  modeBtnTextActive: { color: '#f97316' },
  stats: { flexDirection: 'row', backgroundColor: 'white', paddingVertical: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#6b7280' },
  smsBanner: { backgroundColor: '#FFF7ED', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#fed7aa' },
  smsBannerText: { fontSize: 12, color: '#9a3412', textAlign: 'center' },
  list: { padding: 12, gap: 10 },
  orderCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  orderCardDone: { opacity: 0.6 },
  orderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  seqBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center' },
  seqText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  orderNo: { fontSize: 13, fontWeight: 'bold', color: '#c2410c' },
  dong: { fontSize: 11, color: '#6b7280' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '600' },
  customerName: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
  address: { fontSize: 14, color: '#374151', marginBottom: 2 },
  items: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  thumbImage: { width: '100%', height: 140, borderRadius: 8, marginTop: 8 },
  retryBtn: { marginTop: 8, backgroundColor: '#fef2f2', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#fca5a5' },
  retryBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  naviBtn: { flex: 2, backgroundColor: '#FEE2E2', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  naviBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
  callBtn: { flex: 1, backgroundColor: '#EFF6FF', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  callBtnText: { color: '#2563eb', fontWeight: '700', fontSize: 14 },
  statusBtn: { flex: 2, backgroundColor: '#f97316', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  statusBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  secondaryActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  transferBtn: { flex: 1, backgroundColor: '#f0f9ff', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#bae6fd' },
  transferBtnText: { color: '#0284c7', fontWeight: '600', fontSize: 13 },
  delayBtn: { flex: 1, backgroundColor: '#fef3c7', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#fde68a' },
  delayBtnText: { color: '#92400e', fontWeight: '600', fontSize: 13 },
})

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  photoBox: { width: '100%', height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f3f4f6', marginBottom: 8 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  cameraIcon: { fontSize: 48 },
  cameraLabel: { fontSize: 16, fontWeight: '700', color: '#374151' },
  cameraHint: { fontSize: 12, color: '#9ca3af' },
  retake: { alignSelf: 'flex-end', marginBottom: 8 },
  retakeText: { fontSize: 13, color: '#f97316', fontWeight: '600' },
  smsNotice: { textAlign: 'center', fontSize: 12, color: '#6b7280', marginVertical: 12, backgroundColor: '#f9fafb', padding: 10, borderRadius: 8 },
  buttons: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#f3f4f6' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  confirmBtn: { flex: 2, paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#f97316' },
  confirmDisabled: { backgroundColor: '#fed7aa' },
  confirmText: { fontSize: 15, fontWeight: '700', color: 'white' },
})

const transfer = StyleSheet.create({
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 4 },
  driverList: { maxHeight: 180, marginBottom: 12 },
  driverItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: '#f9fafb', marginBottom: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  driverItemActive: { backgroundColor: '#fff7ed', borderColor: '#f97316' },
  driverName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  driverNameActive: { color: '#c2410c' },
  driverPhone: { fontSize: 13, color: '#6b7280' },
  reasonInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12, fontSize: 14, minHeight: 64, textAlignVertical: 'top', marginBottom: 16, color: '#111827' },
})
