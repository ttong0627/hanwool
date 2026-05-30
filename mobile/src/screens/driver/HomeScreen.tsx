import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, Linking, Image, Modal,
  ActivityIndicator, TextInput, ScrollView, Platform,
  NativeModules, PermissionsAndroid,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as SMS from 'expo-sms'
import * as ImageManipulator from 'expo-image-manipulator'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { BASE_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useLocationTracking } from '@/hooks/useLocationTracking'
import { useAutoSaveCache, loadOrdersFromCache } from '@/hooks/useOfflineOrders'
import { ScanModal } from './ScanModal'
import { CameraCaptureModal } from './CameraCaptureModal'

const API_BASE = BASE_URL

/* ── 디자인 토큰 ─────────────────────────────────────────────────── */
const T = {
  primary:    '#F97316',
  primaryDim: '#FFF7ED',
  dark:       '#0F172A',
  bg:         '#F1F5F9',
  card:       '#FFFFFF',
  border:     '#E2E8F0',
  text:       '#0F172A',
  textSub:    '#475569',
  textMuted:  '#94A3B8',
  success:    '#10B981',
  warning:    '#F59E0B',
  error:      '#EF4444',
  info:       '#3B82F6',
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  assigned:   { label: '배송 대기',  color: T.info,    bg: '#EFF6FF', border: T.info },
  picked_up:  { label: '픽업 완료', color: T.warning,  bg: '#FFFBEB', border: T.warning },
  in_transit: { label: '배송 중',   color: T.primary,  bg: '#FFF7ED', border: T.primary },
  delivered:  { label: '배달 완료', color: T.success,  bg: '#ECFDF5', border: T.success },
}

const SMS_STATUSES = new Set(['in_transit', 'delivered', 'delayed'])

interface Order {
  id: number; order_no: string; customer_name: string; customer_phone: string
  status: string; dong: string; delivery_address: string; items_desc?: string
  quantity: number; sequence?: number; delivery_photo_url?: string
  lat?: number; lng?: number; coord_mismatch?: boolean
  request?: string; detail_address?: string; item_code?: string
}

const COORD_WARN_THRESHOLD_M = 30

/* 두 좌표 간 거리(m) — 배송지-기사 GPS 오차 판정 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
interface StatusResponse extends Order { sms_to?: string; sms_message?: string }
interface Driver { id: number; name: string; phone: string }

/* ── 사진 압축 (expo-image-manipulator) ─────────────────────────── */
async function compressPhoto(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
  )
  return result.uri
}

/* ── 사진 업로드 (POD GPS 포함) ─────────────────────────────────── */
async function uploadPhoto(
  orderId: number,
  photoUri: string,
  podLat?: number,
  podLng?: number,
  force?: boolean,
): Promise<void> {
  const compressed = await compressPhoto(photoUri)
  const formData = new FormData()
  formData.append('file', { uri: compressed, name: 'delivery.jpg', type: 'image/jpeg' } as unknown as Blob)
  if (podLat != null) formData.append('pod_lat', String(podLat))
  if (podLng != null) formData.append('pod_lng', String(podLng))
  if (force) formData.append('force', 'true')
  await api.post(`/orders/${orderId}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/* ── MMS 발송 ────────────────────────────────────────────────────── */
// 전체 출발 시 주문별 개인화 메시지를 수신자별 순차 발송 (번호 노출 방지 + 순번별 ETA 안내)
async function sendDepartureJobs(jobs: { phone: string; message: string }[]): Promise<void> {
  if (!jobs?.length) return
  const available = await SMS.isAvailableAsync()
  if (!available) { Alert.alert('문자 미지원', '이 기기에서는 문자를 보낼 수 없습니다.'); return }
  for (const { phone, message } of jobs) {
    try { await SMS.sendSMSAsync([phone], message, {}) }
    catch { /* 취소/미지원 — 다음 수신자로 진행 */ }
  }
}

// 출발 문자 자동 발송 (Android SmsManager — 사용자 확인 없이 건수만큼 1:1 자동 전송).
// iOS·권한거부·모듈없음이면 기존 컴포저 방식(sendDepartureJobs)으로 폴백.
async function autoSendDepartureJobs(jobs: { phone: string; message: string }[]): Promise<void> {
  if (!jobs?.length) return
  const DirectSms = (NativeModules as any)?.DirectSms
  if (Platform.OS === 'android' && DirectSms?.sendSms) {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
      title: '문자 발송 권한',
      message: '고객에게 출발 안내 문자를 자동 발송하려면 문자 권한이 필요합니다.',
      buttonPositive: '허용',
      buttonNegative: '거부',
    })
    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      let sent = 0
      for (const { phone, message } of jobs) {
        try { await DirectSms.sendSms(phone, message); sent += 1 }
        catch { /* 실패 건 건너뛰고 계속 */ }
        await new Promise((r) => setTimeout(r, 300)) // 대량 발송 시스템 제한 회피
      }
      Alert.alert('출발 문자 발송', `${sent}/${jobs.length}건 자동 발송했습니다.`)
      return
    }
    // 권한 거부 → 컴포저 폴백
  }
  await sendDepartureJobs(jobs)
}

async function sendMmsWithPhoto(phone: string, message: string, photoUri: string): Promise<void> {
  const available = await SMS.isAvailableAsync()
  if (!available) { Alert.alert('문자 미지원', '이 기기에서는 문자를 보낼 수 없습니다.'); return }

  // 카메라 원본 경로는 일부 기기에서 MMS 첨부가 실패해 문자앱이 안 열림 → 표준 JPG로 압축 후 첨부
  let attachUri = ''
  if (photoUri) {
    try { attachUri = await compressPhoto(photoUri) } catch { attachUri = '' }
  }
  try {
    const options = attachUri
      ? { attachments: { uri: attachUri, mimeType: 'image/jpeg', filename: 'delivery.jpg' } }
      : {}
    await SMS.sendSMSAsync([phone], message, options)
  } catch {
    // 사진 첨부 발송이 막히면 텍스트만이라도 문자앱이 열리도록 재시도
    try { await SMS.sendSMSAsync([phone], message, {}) } catch { /* 취소/미지원 */ }
  }
}

function openKakaoNavi(address: string) {
  Linking.openURL(`kakaomap://route?ep=${encodeURIComponent(address)}&by=CAR`).catch(() =>
    Linking.openURL(`https://map.kakao.com/link/to/${encodeURIComponent(address)}`)
  )
}

/* ── WebSocket 라우트 리스너 ─────────────────────────────────────── */
function useRouteListener(driverId: number | null, apiBaseUrl: string, onRouteUpdated: () => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(true)
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
      try { const msg = JSON.parse(evt.data); if (msg.type === 'route_updated') callbackRef.current() } catch { /* ignore */ }
    }
    ws.onclose = () => { if (isActiveRef.current) reconnectRef.current = setTimeout(connect, 3_000) }
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

/* ── 배달 완료 모달 ──────────────────────────────────────────────── */
function DeliveryCompleteModal({
  order, onConfirm, onCancel,
}: { order: Order; onConfirm: (uri: string, lat?: number, lng?: number, force?: boolean) => void; onCancel: () => void }) {
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [podCoords, setPodCoords] = useState<{ lat: number; lng: number } | null>(null)
  const insets = useSafeAreaInsets()

  // 배송지 좌표와 기사 GPS 거리(m). 좌표 미매칭 주문은 경안시장 폴백(37.4292,127.2551)이라 경고 스킵.
  const hasRealCoord = order.lat != null && order.lng != null && Math.abs(order.lat - 37.4292) > 0.0005
  const distanceM = podCoords && hasRealCoord
    ? haversineMeters(podCoords.lat, podCoords.lng, order.lat as number, order.lng as number)
    : null
  const coordWarn = distanceM != null && distanceM > COORD_WARN_THRESHOLD_M

  // 모달 열릴 때 GPS 자동 캡처 (권한 상태 확인 → 요청 → 거부 시 설정 안내)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync()
        if (perm.status !== 'granted' && perm.canAskAgain) {
          perm = await Location.requestForegroundPermissionsAsync()
        }
        if (perm.status !== 'granted') {
          if (!cancelled) {
            Alert.alert(
              '위치 권한 필요',
              '배송 위치 확인을 위해 위치 권한이 필요합니다.\n설정 > 애플리케이션 > 경안시장 배송 > 권한에서 "위치"를 허용해 주세요.',
              [{ text: '확인' }, { text: '설정 열기', onPress: () => Linking.openSettings() }],
            )
          }
          return
        }
        // 마지막 위치 우선(빠름) 후, 정확한 위치로 갱신
        const last = await Location.getLastKnownPositionAsync()
        if (last && !cancelled) setPodCoords({ lat: last.coords.latitude, lng: last.coords.longitude })
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (!cancelled) setPodCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      } catch { /* GPS 실패는 무시 — 사진만으로도 POD 유효 */ }
    })()
    return () => { cancelled = true }
  }, [])

  // 후면 카메라 인앱 캡처 모달 (모달 열리면 자동 실행)
  const [cameraOpen, setCameraOpen] = useState(true)

  const handleCaptured = (uri: string) => { setPhotoUri(uri); setCameraOpen(false) }
  const handleCameraCancel = () => {
    setCameraOpen(false)
    if (!photoUri) onCancel() // 사진 없이 카메라를 닫으면 완료 모달 자체를 닫음
  }
  const openCamera = () => setCameraOpen(true)

  const submit = () => {
    if (!photoUri) { Alert.alert('사진 필요', '배달 완료 사진을 먼저 촬영해 주세요.'); return }
    const doConfirm = (force: boolean) => { setLoading(true); onConfirm(photoUri, podCoords?.lat, podCoords?.lng, force) }
    if (coordWarn) {
      Alert.alert(
        '⚠️ 위치 경고',
        `현재 위치가 배송지에서 약 ${Math.round(distanceM!)}m 떨어져 있습니다.\n배송지가 맞는지 확인해 주세요.\n\n그래도 완료 처리하면 '좌표 오류'로 기록됩니다.`,
        [
          { text: '취소', style: 'cancel' },
          { text: '강제 완료', style: 'destructive', onPress: () => doConfirm(true) },
        ],
      )
      return
    }
    doConfirm(false)
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      {cameraOpen ? (
        /* 카메라가 열린 동안엔 완료 시트를 아예 마운트하지 않음 — 한 화면에 하나만
           렌더해, Android에서 카메라 네이티브 뷰가 시트 뒤에 깔려 전체 터치를 삼키는
           '멈춤' 현상을 원천 차단한다. */
        <CameraCaptureModal visible onCaptured={handleCaptured} onCancel={handleCameraCancel} />
      ) : (
      <View style={$modal.overlay}>
        <View style={[$modal.sheet, { paddingBottom: insets.bottom + 24 }]}>
          {/* 핸들 바 */}
          <View style={$modal.handle} />

          <View style={$modal.headerRow}>
            <View>
              <Text style={$modal.title}>배달 완료 확인</Text>
              <Text style={$modal.sub}>{order.customer_name} · {order.dong}</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={$modal.closeBtn}>
              <Ionicons name="close" size={22} color={T.textSub} />
            </TouchableOpacity>
          </View>

          <Text style={$modal.addressText} numberOfLines={2}>
            {order.delivery_address}{order.detail_address ? ` ${order.detail_address}` : ''}
          </Text>
          {(order.items_desc || order.request) && (
            <View style={$modal.infoBox}>
              {order.items_desc ? (
                <Text style={$modal.infoLine}>📦 {order.items_desc} · {order.quantity ?? 1}개</Text>
              ) : null}
              {order.request ? (
                <Text style={[$modal.infoLine, { color: T.primary }]}>📌 요청: {order.request}</Text>
              ) : null}
            </View>
          )}

          {/* 사진 촬영 영역 */}
          <TouchableOpacity style={$modal.photoBox} onPress={openCamera} activeOpacity={0.85}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={$modal.photo} resizeMode="cover" />
            ) : (
              <View style={$modal.photoEmpty}>
                <View style={$modal.cameraCircle}>
                  <Ionicons name="camera-outline" size={40} color={T.primary} />
                </View>
                <Text style={$modal.cameraTitle}>배달 완료 사진 촬영</Text>
                <Text style={$modal.cameraHint}>사진을 찍어 고객께 문자로 전송합니다</Text>
              </View>
            )}
          </TouchableOpacity>

          {photoUri && (
            <TouchableOpacity onPress={openCamera} style={$modal.retake}>
              <Ionicons name="refresh-outline" size={14} color={T.primary} />
              <Text style={$modal.retakeText}>다시 촬영</Text>
            </TouchableOpacity>
          )}

          {/* GPS POD 상태 표시 */}
          <View style={$modal.gpsRow}>
            <Ionicons
              name={podCoords ? 'location' : 'location-outline'}
              size={14}
              color={coordWarn ? T.error : podCoords ? T.success : T.textMuted}
            />
            <Text style={[$modal.gpsText, { color: coordWarn ? T.error : podCoords ? T.success : T.textMuted }]}>
              {podCoords
                ? (distanceM != null
                    ? `배송지와 약 ${Math.round(distanceM)}m`
                    : `GPS 위치 확보 (${podCoords.lat.toFixed(5)}, ${podCoords.lng.toFixed(5)})`)
                : 'GPS 위치 수신 중...'}
            </Text>
          </View>

          {/* 좌표 불일치 경고 배너 */}
          {coordWarn && (
            <View style={$modal.warnBanner}>
              <Ionicons name="warning" size={16} color={T.error} />
              <Text style={$modal.warnText}>
                배송지에서 {Math.round(distanceM!)}m 떨어져 있습니다. 배송지가 맞는지 확인하세요.
              </Text>
            </View>
          )}

          {/* 안내 배너 */}
          <View style={$modal.notice}>
            <Ionicons name="chatbubble-outline" size={14} color={T.textSub} />
            <Text style={$modal.noticeText}>완료 처리 후 고객께 사진과 함께 문자가 발송됩니다</Text>
          </View>

          <View style={$modal.btnRow}>
            <TouchableOpacity style={$modal.cancelBtn} onPress={onCancel}>
              <Text style={$modal.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                $modal.confirmBtn,
                coordWarn && { backgroundColor: T.error },
                (!photoUri || loading) && $modal.confirmDisabled,
              ]}
              onPress={submit}
              disabled={!photoUri || loading}
            >
              {loading
                ? <ActivityIndicator color="white" size="small" />
                : <><Ionicons name={coordWarn ? 'warning-outline' : 'checkmark-circle-outline'} size={18} color="white" style={{ marginRight: 6 }} /><Text style={$modal.confirmText}>{coordWarn ? '강제 완료' : '완료 + 문자 발송'}</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
      )}
    </Modal>
  )
}

/* ── 주문 인계 모달 ──────────────────────────────────────────────── */
function TransferModal({ order, drivers, onConfirm, onCancel }: {
  order: Order; drivers: Driver[]
  onConfirm: (toDriverId: number, reason: string) => void; onCancel: () => void
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const insets = useSafeAreaInsets()

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <View style={$modal.overlay}>
        <View style={[$modal.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={$modal.handle} />
          <View style={$modal.headerRow}>
            <View>
              <Text style={$modal.title}>주문 인계</Text>
              <Text style={$modal.sub}>{order.order_no} · {order.customer_name}</Text>
            </View>
            <TouchableOpacity onPress={onCancel} style={$modal.closeBtn}>
              <Ionicons name="close" size={22} color={T.textSub} />
            </TouchableOpacity>
          </View>

          <Text style={$transfer.label}>인계받을 기사 선택</Text>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            {drivers.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[$transfer.item, selectedId === d.id && $transfer.itemActive]}
                onPress={() => setSelectedId(d.id)}
              >
                <View style={$transfer.itemLeft}>
                  <View style={[$transfer.avatar, selectedId === d.id && $transfer.avatarActive]}>
                    <Text style={[$transfer.avatarText, selectedId === d.id && { color: T.primary }]}>
                      {d.name[0]}
                    </Text>
                  </View>
                  <View>
                    <Text style={[$transfer.name, selectedId === d.id && { color: T.primary }]}>{d.name}</Text>
                    <Text style={$transfer.phone}>{d.phone}</Text>
                  </View>
                </View>
                {selectedId === d.id && <Ionicons name="checkmark-circle" size={20} color={T.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[$transfer.label, { marginTop: 16 }]}>인계 사유 <Text style={{ color: T.textMuted, fontSize: 12, fontWeight: '400' }}>(선택)</Text></Text>
          <TextInput
            style={$transfer.reason}
            placeholder="예: 차량 고장, 경로 조정..."
            placeholderTextColor={T.textMuted}
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <View style={$modal.btnRow}>
            <TouchableOpacity style={$modal.cancelBtn} onPress={onCancel}>
              <Text style={$modal.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[$modal.confirmBtn, !selectedId && $modal.confirmDisabled]}
              onPress={() => { if (selectedId) onConfirm(selectedId, reason) }}
              disabled={!selectedId}
            >
              <Text style={$modal.confirmText}>인계 확정</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

/* ── 배송 카드 ───────────────────────────────────────────────────── */
function DeliveryCard({
  order, seqInfo, editMode, onMove, onNavi, onCall, onStatus, onDelay, onTransfer, retrying, onRetry, apiBase,
}: {
  order: Order
  seqInfo?: { index: number; total: number }
  editMode: boolean
  onMove: (dir: 'up' | 'down') => void
  onNavi: () => void
  onCall: () => void
  onStatus: () => void
  onDelay: () => void
  onTransfer: () => void
  retrying: boolean
  onRetry: () => void
  apiBase: string
}) {
  const meta = STATUS_META[order.status] ?? STATUS_META.assigned
  const isDone = order.status === 'delivered'

  return (
    <View style={[$card.wrap, isDone && $card.wrapDone, { borderLeftColor: meta.border }]}>
      {/* 카드 헤더 */}
      <View style={$card.header}>
        {/* 순번 배지 */}
        <View style={[$card.seqBadge, { backgroundColor: meta.border }]}>
          <Text style={$card.seqText}>{order.sequence ?? '-'}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={$card.orderNo}>{order.order_no}</Text>
            <View style={[$card.statusBadge, { backgroundColor: meta.bg }]}>
              <Text style={[$card.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          <Text style={$card.dong}>{order.dong}</Text>
        </View>

        {/* 순번 편집 버튼 */}
        {editMode && seqInfo && (
          <View style={$card.seqCtrl}>
            <TouchableOpacity
              style={[$card.seqBtn, seqInfo.index === 0 && $card.seqBtnOff]}
              onPress={() => onMove('up')}
              disabled={seqInfo.index === 0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-up" size={16} color={seqInfo.index === 0 ? T.border : T.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[$card.seqBtn, seqInfo.index === seqInfo.total - 1 && $card.seqBtnOff]}
              onPress={() => onMove('down')}
              disabled={seqInfo.index === seqInfo.total - 1}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-down" size={16} color={seqInfo.index === seqInfo.total - 1 ? T.border : T.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 고객 정보 — 탭하면 다음 단계(픽업→출발→완료) 처리 */}
      <TouchableOpacity
        activeOpacity={isDone ? 1 : 0.6}
        onPress={isDone ? undefined : onStatus}
        disabled={isDone}
      >
        <Text style={$card.name}>{order.customer_name} 어르신</Text>
        <View style={$card.addressRow}>
          <Ionicons name="location-outline" size={14} color={T.textMuted} style={{ marginTop: 1 }} />
          <Text style={$card.address}>
            {order.delivery_address}{order.detail_address ? ` ${order.detail_address}` : ''}
          </Text>
        </View>
        {order.items_desc && (
          <View style={$card.itemsRow}>
            <Ionicons name="cube-outline" size={13} color={T.textMuted} style={{ marginTop: 1 }} />
            <Text style={$card.items}>
              {order.items_desc} ({order.quantity}개){order.item_code ? `  ·  ${order.item_code}` : ''}
            </Text>
          </View>
        )}
        {order.request ? (
          <View style={$card.itemsRow}>
            <Ionicons name="chatbox-ellipses-outline" size={13} color={T.primary} style={{ marginTop: 1 }} />
            <Text style={[$card.items, { color: T.primary }]}>요청: {order.request}</Text>
          </View>
        ) : null}
        {!isDone && (
          <Text style={$card.tapHint}>
            👆 탭하면 {order.status === 'assigned' ? '픽업 완료' : order.status === 'picked_up' ? '배송 출발' : '배송 완료'} 처리
          </Text>
        )}
      </TouchableOpacity>

      {/* 완료 사진 썸네일 */}
      {isDone && order.delivery_photo_url && (
        <Image
          source={{ uri: `${apiBase}${order.delivery_photo_url}` }}
          style={$card.thumb}
          resizeMode="cover"
        />
      )}

      {/* 사진 업로드 재시도 */}
      {retrying && (
        <TouchableOpacity style={$card.retryBtn} onPress={onRetry}>
          <Ionicons name="warning-outline" size={14} color={T.error} />
          <Text style={$card.retryText}>사진 업로드 재시도</Text>
        </TouchableOpacity>
      )}

      {/* 액션 버튼 */}
      {!isDone && (
        <>
          <View style={$card.actions}>
            <TouchableOpacity style={$card.naviBtn} onPress={onNavi} activeOpacity={0.8}>
              <Ionicons name="navigate-outline" size={16} color={T.error} />
              <Text style={[$card.btnText, { color: T.error }]}>카카오내비</Text>
            </TouchableOpacity>
            <TouchableOpacity style={$card.callBtn} onPress={onCall} activeOpacity={0.8}>
              <Ionicons name="call-outline" size={16} color={T.info} />
              <Text style={[$card.btnText, { color: T.info }]}>전화</Text>
            </TouchableOpacity>
            <TouchableOpacity style={$card.statusBtn} onPress={onStatus} activeOpacity={0.8}>
              <Text style={$card.statusBtnText}>
                {order.status === 'assigned' ? '픽업 완료' : order.status === 'picked_up' ? '출발 📨' : '완료 📷'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={$card.subActions}>
            <TouchableOpacity style={$card.transferBtn} onPress={onTransfer} activeOpacity={0.8}>
              <Ionicons name="swap-horizontal-outline" size={14} color={T.info} />
              <Text style={$card.transferText}>인계</Text>
            </TouchableOpacity>
            {order.status === 'in_transit' && (
              <TouchableOpacity style={$card.delayBtn} onPress={onDelay} activeOpacity={0.8}>
                <Ionicons name="time-outline" size={14} color={T.warning} />
                <Text style={$card.delayText}>지연 알림</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  )
}

/* ── 메인 화면 ───────────────────────────────────────────────────── */
export function DriverHomeScreen() {
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const myId = user?.id ?? null

  const [routeMode, setRouteMode] = useState<'A' | 'B'>('A')
  const [completeTarget, setCompleteTarget] = useState<Order | null>(null)
  const [transferTarget, setTransferTarget] = useState<Order | null>(null)
  const [editSeqMode, setEditSeqMode] = useState(false)
  const [localOrders, setLocalOrders] = useState<Order[]>([])
  const [isResequencing, setIsResequencing] = useState(false)
  const [scanVisible, setScanVisible] = useState(false)

  const retryQueue = useRef<Map<number, string>>(new Map())
  const [retryKeys, setRetryKeys] = useState<number[]>([])

  const [isOffline, setIsOffline] = useState(false)

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['driver-route', routeMode],
    queryFn: async () => {
      try {
        const result = await api.get('/deliveries/route', { params: { route_mode: routeMode } }).then((r) => r.data)
        setIsOffline(false)
        return result
      } catch (err: any) {
        // 네트워크 오류 시 캐시에서 복원
        if (!err?.response) {
          const cached = await loadOrdersFromCache()
          if (cached) { setIsOffline(true); return cached }
        }
        throw err
      }
    },
    refetchInterval: 60_000,
  })

  // 정상 조회 시 캐시 저장
  useAutoSaveCache(orders)

  useRouteListener(myId, API_BASE, useCallback(() => {
    qc.invalidateQueries({ queryKey: ['driver-route'] })
  }, [qc]))

  useEffect(() => {
    if (orders && !isResequencing) {
      setLocalOrders([...orders].sort((a: Order, b: Order) => (a.sequence ?? 999) - (b.sequence ?? 999)))
    }
  }, [orders, isResequencing])

  const { data: allDrivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  const activeSeqMap = useMemo(() => {
    const active = localOrders.filter((o) => o.status !== 'delivered')
    return new Map(active.map((o, i) => [o.id, { index: i, total: active.length }]))
  }, [localOrders])

  const startWorkMutation = useMutation({
    mutationFn: () => api.post('/orders/dispatch/start-work').then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      const jobs: { phone: string; message: string }[] = data?.sms_jobs || []
      if (jobs.length) {
        Alert.alert(
          '배송업무 시작',
          `${data.message || '배송을 시작합니다.'}\n\n고객 ${jobs.length}명에게 출발 문자를 자동 발송할까요?`,
          [
            { text: '나중에', style: 'cancel' },
            { text: '자동 발송', onPress: () => autoSendDepartureJobs(jobs) },
          ],
        )
      } else {
        Alert.alert('배송업무 시작', data?.message || '배송업무 요청이 처리됐습니다.')
      }
    },
    onError: () => Alert.alert('오류', '배송업무 시작 요청 중 문제가 발생했습니다.'),
  })

  // 전체 픽업 완료 — assigned 주문을 한 번에 picked_up으로 (순차 처리)
  const bulkPickupMutation = useMutation({
    mutationFn: async (targets: Order[]) => {
      for (const o of targets) {
        await api.put(`/orders/${o.id}/status`, null, { params: { status: 'picked_up' } })
      }
    },
    onSuccess: (_data, targets) => {
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      Alert.alert('전체 픽업 완료', `${targets.length}건을 픽업 완료 처리했습니다.`)
    },
    onError: () => Alert.alert('오류', '일괄 픽업 처리 중 문제가 발생했습니다. 다시 시도해 주세요.'),
  })

  const handleBulkPickup = () => {
    if (assignedOrders.length === 0) return
    Alert.alert(
      '전체 픽업 완료',
      `픽업 대기 ${assignedOrders.length}건을 모두 '픽업 완료'로 변경할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '전체 픽업 완료', onPress: () => bulkPickupMutation.mutate(assignedOrders) },
      ],
    )
  }

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

  const resequenceMutation = useMutation({
    mutationFn: (sequences: { order_id: number; sequence: number }[]) =>
      api.put('/orders/resequence', { sequences }).then((r) => r.data),
    onSuccess: () => { setIsResequencing(false); qc.invalidateQueries({ queryKey: ['driver-route'] }) },
    onError: () => {
      Alert.alert('오류', '순번 변경에 실패했습니다.')
      setIsResequencing(false)
      if (orders) setLocalOrders([...orders].sort((a: Order, b: Order) => (a.sequence ?? 999) - (b.sequence ?? 999)))
    },
  })

  const transferMutation = useMutation({
    mutationFn: ({ orderId, toDriverId, reason }: { orderId: number; toDriverId: number; reason: string }) =>
      api.post(`/orders/${orderId}/transfer`, { to_driver_id: toDriverId, reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['driver-route'] }); Alert.alert('완료', '주문이 인계됐습니다.') },
    onError: () => Alert.alert('오류', '인계 처리 중 문제가 발생했습니다.'),
  })

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

  const markRetry = (id: number, uri: string) => { retryQueue.current.set(id, uri); setRetryKeys([...retryQueue.current.keys()]) }
  const clearRetry = (id: number) => { retryQueue.current.delete(id); setRetryKeys([...retryQueue.current.keys()]) }

  const handleDeliveryComplete = async (order: Order, photoUri: string, podLat?: number, podLng?: number, force?: boolean) => {
    setCompleteTarget(null)
    try { await uploadPhoto(order.id, photoUri, podLat, podLng, force); clearRetry(order.id) }
    catch {
      markRetry(order.id, photoUri)
      Alert.alert('사진 업로드 실패', '배달 완료는 처리됩니다.\n나중에 재시도 버튼으로 재업로드할 수 있습니다.', [{ text: '확인' }])
    }
    try {
      const data = await api.put<StatusResponse>(`/orders/${order.id}/status`, null, { params: { status: 'delivered' } }).then((r) => r.data)
      qc.invalidateQueries({ queryKey: ['driver-route'] })
      if (data.sms_to && data.sms_message) await sendMmsWithPhoto(data.sms_to, data.sms_message, photoUri)
    } catch { Alert.alert('오류', '배달 완료 처리 중 문제가 발생했습니다.') }
  }

  const handleRetryUpload = async (orderId: number) => {
    const uri = retryQueue.current.get(orderId)
    if (!uri) return
    try { await uploadPhoto(orderId, uri); clearRetry(orderId); Alert.alert('완료', '사진이 업로드됐습니다.') }
    catch { Alert.alert('실패', '아직 업로드가 되지 않습니다. 잠시 후 다시 시도해 주세요.') }
  }

  const handleStatusUpdate = (order: Order) => {
    if (order.status === 'in_transit') { setCompleteTarget(order); return }
    const nextMap: Record<string, string> = { assigned: 'picked_up', picked_up: 'in_transit' }
    const next = nextMap[order.status]
    if (!next) return
    const labels: Record<string, string> = { picked_up: '픽업 완료로 변경', in_transit: '배송 출발 (고객 문자 자동 발송)' }
    Alert.alert('상태 변경', `${labels[next]}?`, [
      { text: '취소', style: 'cancel' },
      { text: '확인', onPress: () => updateMutation.mutate({ orderId: order.id, status: next }) },
    ])
  }

  const handleDelayed = (order: Order) => {
    Alert.alert('배송 지연 알림', `${order.customer_name}님께 지연 문자를 발송할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '문자 발송', onPress: () => updateMutation.mutate({ orderId: order.id, status: 'delayed' }) },
    ])
  }

  // 스캔된 코드(item_code / order_no / id)로 주문을 찾아 다음 단계 처리(픽업→출발→완료)
  const handleScanned = (code: string) => {
    setScanVisible(false)
    const norm = code.trim()
    const matched = localOrders.find(
      (o) => o.item_code === norm || o.order_no === norm || String(o.id) === norm,
    )
    if (!matched) {
      Alert.alert('일치하는 주문 없음', `스캔한 코드에 해당하는 오늘 배송 주문을 찾을 수 없습니다.\n\n코드: ${norm}`)
      return
    }
    if (matched.status === 'delivered') {
      Alert.alert('이미 완료', `${matched.customer_name} 어르신 주문은 이미 배송 완료되었습니다.`)
      return
    }
    handleStatusUpdate(matched)
  }

  useLocationTracking(myId, API_BASE)

  const activeOrders = localOrders.filter((o) => o.status !== 'delivered')
  const doneOrders = localOrders.filter((o) => o.status === 'delivered')
  const assignedOrders = localOrders.filter((o) => o.status === 'assigned')
  const otherDrivers = allDrivers.filter((d) => String(d.id) !== String(myId))
  const progress = localOrders.length > 0 ? Math.round((doneOrders.length / localOrders.length) * 100) : 0

  // 현재 날짜 표시
  const today = new Date()
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일 (${['일', '월', '화', '수', '목', '금', '토'][today.getDay()]})`

  return (
    <View style={[$s.root, { paddingTop: insets.top }]}>

      {/* ── 헤더 (다크 프리미엄) ── */}
      <View style={$s.header}>
        <View style={$s.headerTop}>
          <View>
            <Text style={$s.headerDate}>{dateStr}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={$s.headerName}>{user?.name ?? '기사'} 님</Text>
              {isOffline && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Ionicons name="cloud-offline-outline" size={12} color="#FCA5A5" />
                  <Text style={{ fontSize: 11, color: '#FCA5A5', fontWeight: '700' }}>오프라인</Text>
                </View>
              )}
            </View>
          </View>
          <View style={$s.headerRight}>
            {/* 지도 버튼 */}
            <TouchableOpacity
              style={$s.routePreviewBtn}
              onPress={() => router.push('/(driver)/map')}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={15} color={T.primary} />
              <Text style={$s.routePreviewText}>지도</Text>
            </TouchableOpacity>

            {/* 루트 모드 토글 */}
            <View style={$s.modeToggle}>
              {(['A', 'B'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[$s.modeBtn, routeMode === m && $s.modeBtnActive]}
                  onPress={() => setRouteMode(m)}
                >
                  <Text style={[$s.modeBtnText, routeMode === m && $s.modeBtnTextActive]}>
                    {m === 'A' ? '시장귀환' : '즉시귀환'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={$s.logoutBtn}
              onPress={() => Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
                { text: '취소', style: 'cancel' },
                { text: '로그아웃', style: 'destructive', onPress: logout },
              ])}
            >
              <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 진행률 바 */}
        <View style={$s.progressSection}>
          <View style={$s.statsRow}>
            {[
              { label: '전체', value: localOrders.length, color: 'white' },
              { label: '배송중', value: activeOrders.length, color: T.primary },
              { label: '완료', value: doneOrders.length, color: T.success },
            ].map(({ label, value, color }) => (
              <View key={label} style={$s.statItem}>
                <Text style={[$s.statNum, { color }]}>{value}</Text>
                <Text style={$s.statLabel}>{label}</Text>
              </View>
            ))}
            <View style={$s.statDivider} />
            <View style={$s.statItem}>
              <Text style={[$s.statNum, { color: T.success }]}>{progress}%</Text>
              <Text style={$s.statLabel}>진행률</Text>
            </View>
          </View>
          <View style={$s.progressBar}>
            <View style={[$s.progressFill, { width: `${progress}%` as any }]} />
          </View>
        </View>
      </View>

      {/* ── 컨트롤 바 ── */}
      <View style={$s.controlBar}>
        <TouchableOpacity
          style={[$s.startBtn, startWorkMutation.isPending && $s.startBtnLoading]}
          onPress={() => startWorkMutation.mutate()}
          disabled={startWorkMutation.isPending}
          activeOpacity={0.85}
        >
          {startWorkMutation.isPending
            ? <ActivityIndicator color="white" size="small" />
            : <><Ionicons name="play-circle-outline" size={18} color="white" style={{ marginRight: 6 }} /><Text style={$s.startBtnText}>배송업무 시작</Text></>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={$s.scanBtn}
          onPress={() => setScanVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="scan-outline" size={16} color={T.primary} />
          <Text style={$s.scanBtnText}>스캔</Text>
        </TouchableOpacity>

        {activeOrders.length >= 2 && (
          <TouchableOpacity
            style={[$s.editBtn, editSeqMode && $s.editBtnActive]}
            onPress={() => setEditSeqMode((v) => !v)}
          >
            <Ionicons
              name={editSeqMode ? 'checkmark-outline' : 'swap-vertical-outline'}
              size={16}
              color={editSeqMode ? 'white' : T.primary}
            />
            <Text style={[$s.editBtnText, editSeqMode && $s.editBtnTextActive]}>
              {editSeqMode ? '편집 완료' : '순번 조정'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 전체 픽업 완료 ── */}
      {assignedOrders.length > 0 && (
        <TouchableOpacity
          style={[$s.bulkPickupBtn, bulkPickupMutation.isPending && $s.bulkPickupLoading]}
          onPress={handleBulkPickup}
          disabled={bulkPickupMutation.isPending}
          activeOpacity={0.85}
        >
          {bulkPickupMutation.isPending
            ? <ActivityIndicator color="white" size="small" />
            : <><Ionicons name="checkmark-done-outline" size={18} color="white" style={{ marginRight: 6 }} /><Text style={$s.bulkPickupText}>전체 픽업 완료 ({assignedOrders.length}건)</Text></>
          }
        </TouchableOpacity>
      )}

      {/* ── 배송 목록 ── */}
      <FlatList
        data={localOrders}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={T.primary} />}
        contentContainerStyle={[$s.list, { paddingBottom: insets.bottom + 80 }]}
        removeClippedSubviews
        ListEmptyComponent={
          isLoading ? null : (
            <View style={$s.empty}>
              <Ionicons name="cube-outline" size={48} color={T.textMuted} />
              <Text style={$s.emptyTitle}>오늘 배송이 없습니다</Text>
              <Text style={$s.emptySub}>관리자가 배차를 완료하면 자동으로 나타납니다</Text>
            </View>
          )
        }
        renderItem={({ item: order }) => (
          <DeliveryCard
            order={order}
            seqInfo={activeSeqMap.get(order.id)}
            editMode={editSeqMode}
            onMove={(dir) => moveOrder(order.id, dir)}
            onNavi={() => openKakaoNavi(order.delivery_address)}
            onCall={() => Linking.openURL(`tel:${order.customer_phone}`)}
            onStatus={() => handleStatusUpdate(order)}
            onDelay={() => handleDelayed(order)}
            onTransfer={() => setTransferTarget(order)}
            retrying={retryKeys.includes(order.id)}
            onRetry={() => handleRetryUpload(order.id)}
            apiBase={API_BASE}
          />
        )}
      />

      {/* ── 모달들 ── */}
      {completeTarget && (
        <DeliveryCompleteModal
          order={completeTarget}
          onConfirm={(uri, lat, lng, force) => handleDeliveryComplete(completeTarget, uri, lat, lng, force)}
          onCancel={() => setCompleteTarget(null)}
        />
      )}
      {transferTarget && (
        <TransferModal
          order={transferTarget}
          drivers={otherDrivers}
          onConfirm={(toDriverId, reason) => {
            setTransferTarget(null)
            transferMutation.mutate({ orderId: transferTarget.id, toDriverId, reason })
          }}
          onCancel={() => setTransferTarget(null)}
        />
      )}
      <ScanModal
        visible={scanVisible}
        onClose={() => setScanVisible(false)}
        onScanned={handleScanned}
        title="상품 스캔 (픽업·완료)"
      />
    </View>
  )
}

/* ── 스타일 ──────────────────────────────────────────────────────── */
const $s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: T.bg },

  // 헤더
  header:         { backgroundColor: T.dark, paddingHorizontal: 20, paddingBottom: 16 },
  headerTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 16 },
  headerDate:     { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500', marginBottom: 2 },
  headerName:     { fontSize: 22, fontWeight: '700', color: 'white' },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeToggle:     { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 3, gap: 2 },
  modeBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 17 },
  modeBtnActive:  { backgroundColor: T.primary },
  modeBtnText:    { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  modeBtnTextActive: { color: 'white' },
  logoutBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

  // 진행률
  progressSection:{ paddingTop: 4 },
  statsRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statItem:       { flex: 1, alignItems: 'center' },
  statNum:        { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  statLabel:      { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  statDivider:    { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' },
  progressBar:    { height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' },
  progressFill:   { height: '100%', backgroundColor: T.success, borderRadius: 3 },

  // 컨트롤 바
  controlBar:     { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  startBtn:       { flex: 1, flexDirection: 'row', backgroundColor: T.dark, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  startBtnLoading:{ backgroundColor: T.textSub },
  startBtnText:   { color: 'white', fontSize: 15, fontWeight: '700' },
  bulkPickupBtn:  { flexDirection: 'row', backgroundColor: T.warning, marginHorizontal: 16, marginTop: 10, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bulkPickupLoading: { backgroundColor: T.textSub },
  bulkPickupText: { color: 'white', fontSize: 15, fontWeight: '800' },
  editBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: T.primary, backgroundColor: 'white' },
  editBtnActive:  { backgroundColor: T.primary, borderColor: T.primary },
  editBtnText:    { fontSize: 13, fontWeight: '700', color: T.primary },
  editBtnTextActive: { color: 'white' },
  scanBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: T.primary, backgroundColor: 'white' },
  scanBtnText:    { fontSize: 13, fontWeight: '700', color: T.primary },

  // 목록
  list:           { paddingHorizontal: 12, paddingTop: 12, gap: 10 },
  empty:          { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle:     { fontSize: 17, fontWeight: '600', color: T.textSub },
  emptySub:       { fontSize: 13, color: T.textMuted, textAlign: 'center' },

  // 루트 미리보기 버튼
  routePreviewBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(249,115,22,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)' },
  routePreviewText: { fontSize: 12, fontWeight: '700', color: T.primary },
})

const $card = StyleSheet.create({
  wrap:         { backgroundColor: T.card, borderRadius: 16, padding: 16, shadowColor: T.dark, shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3, borderLeftWidth: 4, borderLeftColor: T.primary },
  wrapDone:     { opacity: 0.65 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  seqBadge:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  seqText:      { color: 'white', fontSize: 14, fontWeight: '800' },
  orderNo:      { fontSize: 12, fontWeight: '700', color: T.textSub },
  dong:         { fontSize: 11, color: T.textMuted, marginTop: 1 },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  seqCtrl:      { gap: 4 },
  seqBtn:       { width: 30, height: 30, borderRadius: 8, backgroundColor: T.primaryDim, alignItems: 'center', justifyContent: 'center' },
  seqBtnOff:    { backgroundColor: T.bg },
  name:         { fontSize: 20, fontWeight: '700', color: T.text, marginBottom: 4 },
  addressRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 3 },
  address:      { fontSize: 14, color: T.textSub, flex: 1, lineHeight: 20 },
  itemsRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 6 },
  items:        { fontSize: 13, color: T.textMuted, flex: 1 },
  tapHint:      { fontSize: 12, color: T.primary, fontWeight: '600', marginTop: 2, marginBottom: 2 },
  thumb:        { width: '100%', height: 160, borderRadius: 12, marginTop: 10 },
  retryBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', paddingVertical: 10, borderRadius: 10, paddingHorizontal: 14, marginTop: 8, borderWidth: 1, borderColor: '#FECACA' },
  retryText:    { fontSize: 13, fontWeight: '700', color: T.error },
  actions:      { flexDirection: 'row', gap: 8, marginTop: 12 },
  naviBtn:      { flex: 2, flexDirection: 'row', gap: 5, backgroundColor: '#FEF2F2', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  callBtn:      { flex: 1, flexDirection: 'row', gap: 5, backgroundColor: '#EFF6FF', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusBtn:    { flex: 2, backgroundColor: T.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText:      { fontSize: 13, fontWeight: '700' },
  statusBtnText:{ color: 'white', fontSize: 14, fontWeight: '800' },
  subActions:   { flexDirection: 'row', gap: 8, marginTop: 8 },
  transferBtn:  { flex: 1, flexDirection: 'row', gap: 5, backgroundColor: '#F0F9FF', paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BAE6FD' },
  transferText: { fontSize: 13, fontWeight: '600', color: T.info },
  delayBtn:     { flex: 1, flexDirection: 'row', gap: 5, backgroundColor: '#FFFBEB', paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FDE68A' },
  delayText:    { fontSize: 13, fontWeight: '600', color: T.warning },
})

const $modal = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: T.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '88%' },
  handle:       { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title:        { fontSize: 20, fontWeight: '800', color: T.text },
  sub:          { fontSize: 13, color: T.textSub, marginTop: 3 },
  closeBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  addressText:  { fontSize: 13, color: T.textMuted, marginBottom: 16, lineHeight: 19 },
  photoBox:     { width: '100%', height: 220, borderRadius: 20, overflow: 'hidden', backgroundColor: T.bg, marginBottom: 12 },
  photo:        { width: '100%', height: '100%' },
  photoEmpty:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  cameraCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.primaryDim, alignItems: 'center', justifyContent: 'center' },
  cameraTitle:  { fontSize: 16, fontWeight: '700', color: T.text },
  cameraHint:   { fontSize: 12, color: T.textMuted },
  retake:       { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginBottom: 12 },
  retakeText:   { fontSize: 13, color: T.primary, fontWeight: '600' },
  gpsRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  gpsText:      { fontSize: 12, fontWeight: '600' },
  warnBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 12, borderRadius: 10, marginBottom: 8 },
  warnText:     { fontSize: 12.5, color: '#DC2626', flex: 1, fontWeight: '600', lineHeight: 18 },
  infoBox:      { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 8, gap: 4 },
  infoLine:     { fontSize: 13, color: '#334155', fontWeight: '600', lineHeight: 18 },
  notice:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.bg, padding: 12, borderRadius: 10, marginBottom: 20 },
  noticeText:   { fontSize: 12, color: T.textSub, flex: 1, lineHeight: 18 },
  btnRow:       { flexDirection: 'row', gap: 10 },
  cancelBtn:    { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center', backgroundColor: T.bg },
  cancelText:   { fontSize: 16, fontWeight: '600', color: T.textSub },
  confirmBtn:   { flex: 2, flexDirection: 'row', paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: T.primary },
  confirmDisabled: { backgroundColor: '#FED7AA' },
  confirmText:  { fontSize: 15, fontWeight: '800', color: 'white' },
})

const $transfer = StyleSheet.create({
  label:    { fontSize: 13, fontWeight: '700', color: T.textSub, marginBottom: 8 },
  item:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: T.bg, marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent' },
  itemActive: { backgroundColor: T.primaryDim, borderColor: T.primary },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:   { width: 40, height: 40, borderRadius: 20, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  avatarActive: { backgroundColor: '#FED7AA' },
  avatarText: { fontSize: 16, fontWeight: '700', color: T.textSub },
  name:     { fontSize: 15, fontWeight: '700', color: T.text },
  phone:    { fontSize: 12, color: T.textMuted, marginTop: 2 },
  reason:   { borderWidth: 1.5, borderColor: T.border, borderRadius: 14, padding: 14, fontSize: 14, minHeight: 72, textAlignVertical: 'top', marginBottom: 20, color: T.text, backgroundColor: T.bg },
})
