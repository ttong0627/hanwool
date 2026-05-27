import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, Linking, Image, Modal,
  ActivityIndicator, TextInput, ScrollView,
} from 'react-native'
import * as SMS from 'expo-sms'
import * as ImagePicker from 'expo-image-picker'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { BASE_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useLocationTracking } from '@/hooks/useLocationTracking'

const API_BASE = BASE_URL

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

// ── 관리자 배차 후 본인 룸 WS 구독 — route_updated 수신 시 콜백 호출 ──────────
function useRouteListener(
  driverId: number | null,
  apiBaseUrl: string,
  onRouteUpdated: () => void,
) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(true)
  // 매 렌더마다 최신 콜백 참조 유지 (reconnect 시 stale closure 방지)
  const callbackRef = useRef(onRouteUpdated)
  useEffect(() => { callbackRef.current = onRouteUpdated })

  const connect = useCallback(async () => {
    if (!driverId || !isActiveRef.current) return
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }

    const { useAuthStore: store } = await import('@/store/authStore')
    const token = store.getState().accessToken ?? ''
    const wsUrl = apiBaseUrl.replace(/^http/, 'ws').replace(':8000', '').replace(/\/$/, '')
    const ws = new WebSocket(`${wsUrl}/ws/driver-${driverId}?token=${encodeURIComponent(token)}`)

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'route_updated') callbackRef.current()
      } catch { /* JSON 파싱 실패 무시 */ }
    }
    ws.onclose = () => {
      if (isActiveRef.current) reconnectRef.current = setTimeout(connect, 3_000)
    }
    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [driverId, apiBaseUrl])

  useEffect(() => {
    if (!driverId) return
    isActiveRef.current = true
    connect()
    return () => {
      isActiveRef.current = false
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [driverId, connect])
}

// ── 사진 업로드 ───────────────────────────────────────────────────────────────
async function uploadPhoto(orderId: number, photoUri: string): Promise<void> {
  const filename = photoUri.split('/').pop() ?? 'delivery.jpg'
  const ext = filename.split('.').pop() ?? 'jpg'
  const formData = new FormData()
  formData.append('file', { uri: photoUri, name: filename, type: `image/${ext}` } as unknown as Blob)
  await api.post(`/orders/${orderId}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// ── MMS 발송 ─────────────────────────────────────────────────────────────────
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
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const myId = user?.id ?? null

  const [routeMode, setRouteMode] = useState<'A' | 'B'>('A')
  const [completeTarget, setCompleteTarget] = useState<Order | null>(null)
  const [transferTarget, setTransferTarget] = useState<Order | null>(null)
  const [editSeqMode, setEditSeqMode] = useState(false)
  const [localOrders, setLocalOrders] = useState<Order[]>([])
  const [isResequencing, setIsResequencing] = useState(false)

  // 사진 업로드 실패 재시도 큐
  const retryQueue = useRef<Map<number, string>>(new Map())
  const [retryKeys, setRetryKeys] = useState<number[]>([])

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['driver-route', routeMode],
    queryFn: () => api.get('/deliveries/route', { params: { route_mode: routeMode } }).then((r) => r.data),
    refetchInterval: 60_000,
  })

  // 관리자가 배차/순번 변경 시 WS 푸시로 즉시 갱신
  useRouteListener(myId, API_BASE, useCallback(() => {
    qc.invalidateQueries({ queryKey: ['driver-route'] })
  }, [qc]))

  // 서버 데이터 변경 시 로컬 순번 동기화 (수동 편집 중에는 덮어쓰지 않음)
  useEffect(() => {
    if (orders && !isResequencing) {
      setLocalOrders(
        [...orders].sort((a: Order, b: Order) => (a.sequence ?? 999) - (b.sequence ?? 999))
      )
    }
  }, [orders, isResequencing])

  // 동료 기사 목록 (인계 모달용)
  const { data: allDrivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  // 편집 모드에서 ▲▼ 비활성화 여부 계산용 — 배달 미완료 주문의 index 맵
  const activeSeqMap = useMemo(() => {
    const active = localOrders.filter((o) => o.status !== 'delivered')
    return new Map(active.map((o, i) => [o.id, { index: i, total: active.length }]))
  }, [localOrders])

  const startWorkMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch/start-work').then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      Alert.alert('배송업무 시작', data.message || '배송업무 요청이 처리되었습니다.')
    },
    onError: () => Alert.alert('오류', '배송업무 시작 요청 중 문제가 발생했습니다.'),
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

  // 기사 본인이 순번을 수동으로 변경할 때 호출
  const resequenceMutation = useMutation({
    mutationFn: (sequences: { order_id: number; sequence: number }[]) =>
      api.put('/orders/resequence', { sequences }).then((r) => r.data),
    onSuccess: () => {
      setIsResequencing(false)
      qc.invalidateQueries({ queryKey: ['driver-route'] })
    },
    onError: () => {
      Alert.alert('오류', '순번 변경에 실패했습니다. 다시 시도해 주세요.')
      setIsResequencing(false)
      if (orders) {
        setLocalOrders(
          [...orders].sort((a: Order, b: Order) => (a.sequence ?? 999) - (b.sequence ?? 999))
        )
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

  // 순번 ▲▼ 이동: 배달 미완료 주문 내에서만 이동, 즉시 로컬 반영 후 API 호출
  const moveOrder = useCallback((orderId: number, dir: 'up' | 'down') => {
    setLocalOrders((prev) => {
      const active = prev.filter((o) => o.status !== 'delivered')
      const done = prev.filter((o) => o.status === 'delivered')
      const idx = active.findIndex((o) => o.id === orderId)
      if (idx < 0) return prev
      const target = dir === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= active.length) return prev

      const next = [...active]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      const reseq = next.map((o, i) => ({ ...o, sequence: i + 1 }))

      setIsResequencing(true)
      resequenceMutation.mutate(reseq.map((o) => ({ order_id: o.id, sequence: o.sequence! })))

      return [...reseq, ...done]
    })
  }, [resequenceMutation])

  const markRetry = (orderId: number, photoUri: string) => {
    retryQueue.current.set(orderId, photoUri)
    setRetryKeys([...retryQueue.current.keys()])
  }

  const clearRetry = (orderId: number) => {
    retryQueue.current.delete(orderId)
    setRetryKeys([...retryQueue.current.keys()])
  }

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

  useLocationTracking(myId, API_BASE)
  const otherDrivers = allDrivers.filter((d) => String(d.id) !== String(myId))

  const activeOrders = localOrders.filter((o: Order) => o.status !== 'delivered')
  const doneOrders = localOrders.filter((o: Order) => o.status === 'delivered')

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>오늘 배송 코스</Text>
        <View style={styles.headerRight}>
          <View style={styles.modeToggle}>
            {(['A', 'B'] as const).map((m) => (
              <TouchableOpacity key={m} style={[styles.modeBtn, routeMode === m && styles.modeBtnActive]} onPress={() => setRouteMode(m)}>
                <Text style={[styles.modeBtnText, routeMode === m && styles.modeBtnTextActive]}>
                  {m === 'A' ? '시장귀환' : '즉시귀환'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
              { text: '취소', style: 'cancel' },
              { text: '로그아웃', style: 'destructive', onPress: logout },
            ])}
            style={styles.logoutBtn}
          >
            <Text style={styles.logoutBtnText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 통계 */}
      <View style={styles.stats}>
        {[
          { label: '총 건수', value: localOrders.length, color: '#111827' },
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

      {/* 순번 편집 토글 — 배달 미완료 주문이 2건 이상일 때 표시 */}
      {activeOrders.length >= 2 && (
        <TouchableOpacity
          style={[styles.editSeqBtn, editSeqMode && styles.editSeqBtnActive]}
          onPress={() => setEditSeqMode((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={[styles.editSeqBtnText, editSeqMode && styles.editSeqBtnTextActive]}>
            {editSeqMode ? '✓ 순번 편집 완료' : '↕ 배송 순번 직접 조정'}
          </Text>
          {resequenceMutation.isPending && (
            <ActivityIndicator size="small" color={editSeqMode ? 'white' : '#f97316'} style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
      )}

      {/* 배송업무 시작 버튼 */}
      <TouchableOpacity
        style={[styles.startWorkBtn, startWorkMutation.isPending && styles.startWorkBtnDisabled]}
        onPress={() => startWorkMutation.mutate()}
        disabled={startWorkMutation.isPending}
      >
        <Text style={styles.startWorkBtnText}>
          {startWorkMutation.isPending ? '업무 시작 요청 중...' : '배송업무 시작'}
        </Text>
      </TouchableOpacity>

      {/* 주문 목록 */}
      <FlatList
        data={localOrders}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        contentContainerStyle={styles.list}
        renderItem={({ item: order }) => {
          const hasRetry = retryKeys.includes(order.id)
          const seqInfo = activeSeqMap.get(order.id)

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

                {/* ▲▼ 순번 조정 버튼 (편집 모드 + 미배달 주문만) */}
                {editSeqMode && seqInfo && (
                  <View style={styles.seqControls}>
                    <TouchableOpacity
                      style={[styles.seqMoveBtn, seqInfo.index === 0 && styles.seqMoveBtnDisabled]}
                      onPress={() => moveOrder(order.id, 'up')}
                      disabled={seqInfo.index === 0 || resequenceMutation.isPending}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={[styles.seqMoveBtnText, seqInfo.index === 0 && styles.seqMoveBtnTextDisabled]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.seqMoveBtn, seqInfo.index === seqInfo.total - 1 && styles.seqMoveBtnDisabled]}
                      onPress={() => moveOrder(order.id, 'down')}
                      disabled={seqInfo.index === seqInfo.total - 1 || resequenceMutation.isPending}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={[styles.seqMoveBtnText, seqInfo.index === seqInfo.total - 1 && styles.seqMoveBtnTextDisabled]}>▼</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Text style={styles.customerName}>{order.customer_name}</Text>
              <Text style={styles.address}>{order.delivery_address}</Text>
              {order.items_desc && <Text style={styles.items}>{order.items_desc} ({order.quantity}개)</Text>}

              {/* 배달 완료 사진 썸네일 */}
              {order.status === 'delivered' && order.delivery_photo_url && (
                <Image source={{ uri: `${API_BASE}${order.delivery_photo_url}` }} style={styles.thumbImage} resizeMode="cover" />
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeToggle: { flexDirection: 'row', gap: 6 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  modeBtnActive: { backgroundColor: 'white' },
  modeBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  modeBtnTextActive: { color: '#f97316' },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)' },
  logoutBtnText: { color: 'white', fontSize: 11, fontWeight: '600' },
  stats: { flexDirection: 'row', backgroundColor: 'white', paddingVertical: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#6b7280' },
  smsBanner: { backgroundColor: '#FFF7ED', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#fed7aa' },
  smsBannerText: { fontSize: 12, color: '#9a3412', textAlign: 'center' },
  // 순번 편집 토글 버튼
  editSeqBtn: { marginHorizontal: 12, marginTop: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#f97316', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', backgroundColor: 'white' },
  editSeqBtnActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  editSeqBtnText: { fontSize: 14, fontWeight: '700', color: '#f97316' },
  editSeqBtnTextActive: { color: 'white' },
  // 순번 ▲▼ 컨트롤
  seqControls: { flexDirection: 'column', gap: 2, marginLeft: 8 },
  seqMoveBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', alignItems: 'center', justifyContent: 'center' },
  seqMoveBtnDisabled: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  seqMoveBtnText: { fontSize: 13, color: '#ea580c', fontWeight: '700' },
  seqMoveBtnTextDisabled: { color: '#d1d5db' },
  startWorkBtn: { margin: 12, marginBottom: 0, backgroundColor: '#111827', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  startWorkBtnDisabled: { backgroundColor: '#9ca3af' },
  startWorkBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
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
