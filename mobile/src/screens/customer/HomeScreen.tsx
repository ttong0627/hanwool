import { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Linking, ActivityIndicator, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

/* ── 디자인 토큰 (노인 친화 — 큰 글씨, 명확한 대비) ─────────────── */
const T = {
  primary:    '#F97316',
  primarySoft:'#FFF7ED',
  primaryBold:'#EA580C',
  dark:       '#0F172A',
  bg:         '#FFF8F0',
  card:       '#FFFFFF',
  border:     '#E2E8F0',
  text:       '#1E293B',
  textSub:    '#475569',
  textMuted:  '#94A3B8',
  success:    '#059669',
  successSoft:'#ECFDF5',
  info:       '#3B82F6',
  error:      '#EF4444',
}

const DONG_LIST = [
  '경안동', '송정동', '쌍령동', '탄벌동',
  '고산동', '매산동', '목동', '목현동', '문형동', '삼동',
  '양벌동', '역동', '장지동', '중대동', '직동', '추자동', '태전동', '회덕동',
] as const
const CALL_NUMBER = 'tel:010-9457-1617'  // 장영수 대표 (배송센터 대표번호)

/* ── 주문 완료 화면 ──────────────────────────────────────────── */
function SuccessView({
  orderNo, onNewOrder,
}: { orderNo: string; onNewOrder: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[suc.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={suc.iconCircle}>
        <Ionicons name="checkmark" size={56} color="#FFFFFF" />
      </View>

      <Text style={suc.title}>주문 접수 완료!</Text>

      <View style={suc.orderBox}>
        <Text style={suc.orderLabel}>접수번호</Text>
        <Text style={suc.orderNo}>{orderNo}</Text>
      </View>

      <Text style={suc.msg}>
        담당자가 기사를 배정해 드립니다.{'\n'}잠시만 기다려 주세요.
      </Text>

      <TouchableOpacity style={suc.primaryBtn} onPress={onNewOrder} activeOpacity={0.85}>
        <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
        <Text style={suc.primaryBtnText}>새 주문 하기</Text>
      </TouchableOpacity>

      <TouchableOpacity style={suc.callBtn} onPress={() => Linking.openURL(CALL_NUMBER)} activeOpacity={0.85}>
        <Ionicons name="call" size={24} color={T.primary} />
        <Text style={suc.callBtnText}>배송센터 전화</Text>
      </TouchableOpacity>
    </View>
  )
}

const suc = StyleSheet.create({
  container:    { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 20 },
  iconCircle:   { width: 110, height: 110, borderRadius: 55, backgroundColor: T.success, alignItems: 'center', justifyContent: 'center', shadowColor: T.success, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  title:        { fontSize: 36, fontWeight: '900', color: T.text, letterSpacing: -0.5 },
  orderBox:     { backgroundColor: T.successSoft, borderRadius: 20, paddingHorizontal: 40, paddingVertical: 20, alignItems: 'center', width: '100%' },
  orderLabel:   { fontSize: 16, color: T.success, fontWeight: '600', marginBottom: 6 },
  orderNo:      { fontSize: 34, fontWeight: '900', color: T.success, letterSpacing: 2 },
  msg:          { fontSize: 20, color: T.textSub, textAlign: 'center', lineHeight: 32 },
  primaryBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: T.primary, borderRadius: 18, paddingVertical: 22, paddingHorizontal: 40, width: '100%', shadowColor: T.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  primaryBtnText:{ fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  callBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: T.card, borderRadius: 18, paddingVertical: 20, paddingHorizontal: 40, width: '100%', borderWidth: 2, borderColor: T.primary },
  callBtnText:  { fontSize: 20, fontWeight: '700', color: T.primary },
})

/* ── 진행 중 주문 배너 ─────────────────────────────────────── */
const ACTIVE_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: '접수 완료 · 배정 대기 중', color: T.info,    icon: 'time-outline' },
  assigned:   { label: '기사 배정 완료',            color: '#8B5CF6', icon: 'person-circle-outline' },
  picked_up:  { label: '시장에서 물건 수거 완료',   color: '#F59E0B', icon: 'cube-outline' },
  in_transit: { label: '지금 배송 중입니다!',        color: T.primary, icon: 'car-outline' },
}

function ActiveOrderBanner({
  order, onTrack,
}: { order: { order_no: string; status: string; delivery_address: string }; onTrack: () => void }) {
  const meta = ACTIVE_STATUS[order.status] ?? ACTIVE_STATUS.pending
  return (
    <TouchableOpacity style={[ban.wrap, { borderColor: meta.color }]} onPress={onTrack} activeOpacity={0.85}>
      <View style={[ban.iconWrap, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon as any} size={28} color={meta.color} />
      </View>
      <View style={ban.textWrap}>
        <View style={ban.row}>
          <View style={[ban.dot, { backgroundColor: meta.color }]} />
          <Text style={[ban.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={ban.orderNo}>{order.order_no}</Text>
        <Text style={ban.address} numberOfLines={1}>{order.delivery_address}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={meta.color} />
    </TouchableOpacity>
  )
}

const ban = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 18, padding: 18, borderWidth: 2, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  iconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dot:      { width: 8, height: 8, borderRadius: 4 },
  statusText:{ fontSize: 14, fontWeight: '700' },
  orderNo:  { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 2 },
  address:  { fontSize: 14, color: T.textSub },
})

/* ── 메인 홈 화면 ────────────────────────────────────────── */
export function CustomerHomeScreen() {
  const insets = useSafeAreaInsets()
  const router  = useRouter()
  const { user, logout } = useAuthStore()
  const qc = useQueryClient()

  const [dong,    setDong]    = useState<string>(user?.dong ?? '경안동')
  const [address, setAddress] = useState<string>(user?.address ?? '')
  const [items,   setItems]   = useState('')
  const [request, setRequest] = useState('')
  const [orderedNo, setOrderedNo] = useState('')

  /* 오늘 진행 중 주문 조회 */
  const { data: myOrders = [] } = useQuery<any[]>({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders/my').then((r) => r.data),
    refetchInterval: 20_000,
  })

  const todayActive = myOrders.find((o) => {
    const today = new Date().toISOString().slice(0, 10)
    return o.created_at?.startsWith(today) && !['delivered', 'cancelled'].includes(o.status)
  })

  const orderMutation = useMutation({
    mutationFn: () =>
      api.post('/orders', {
        delivery_address: address,
        dong,
        items_desc: items,
        request,
        customer_name:  user?.name  ?? '',
        customer_phone: user?.phone ?? '',
        customer_id:    user?.id,
      }),
    onSuccess: (res) => {
      setOrderedNo(res.data.order_no)
      setItems('')
      setRequest('')
      qc.invalidateQueries({ queryKey: ['my-orders'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? '주문 접수에 실패했습니다. 다시 시도해 주세요.'
      Alert.alert('오류', msg)
    },
  })

  // 접수 가능 시간: 장날(3·8·13·18·23·28일) 11:00~15:00 (KST). 서버에서도 강제됨.
  const kstNow = new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000)
  const isMarketDay = [3, 8, 13, 18, 23, 28].includes(kstNow.getDate())
  const isReceptionOpen = isMarketDay && kstNow.getHours() >= 11 && kstNow.getHours() < 15
  const canSubmit = isReceptionOpen && address.trim().length > 0 && items.trim().length > 0

  /* 주문 완료 화면 */
  if (orderedNo) {
    return <SuccessView orderNo={orderedNo} onNewOrder={() => setOrderedNo('')} />
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={T.bg} />
      <View style={[main.container, { paddingTop: insets.top }]}>
        {/* 헤더 */}
        <View style={main.header}>
          <View>
            <Text style={main.greeting}>{user?.name}님, 안녕하세요 👋</Text>
            <Text style={main.headerSub}>경안시장 집배송 서비스</Text>
          </View>
          <TouchableOpacity
            style={main.logoutBtn}
            onPress={() => Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
              { text: '취소', style: 'cancel' },
              { text: '로그아웃', style: 'destructive', onPress: logout },
            ])}
          >
            <Ionicons name="log-out-outline" size={20} color={T.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={main.scroll}
          contentContainerStyle={main.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* 진행 중인 주문 배너 */}
          {todayActive && (
            <View>
              <Text style={main.sectionLabel}>진행 중인 배송</Text>
              <ActiveOrderBanner
                order={todayActive}
                onTrack={() => router.push('/(customer)/tracking')}
              />
            </View>
          )}

          {/* 주문 폼 */}
          <View style={main.card}>
            <View style={main.cardTitleRow}>
              <Ionicons name="bag-handle" size={26} color={T.primary} />
              <Text style={main.cardTitle}>배송 신청</Text>
            </View>

            {/* 배달 동 */}
            <Text style={main.label}>배달 동</Text>
            <View style={main.dongRow}>
              {DONG_LIST.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[main.dongBtn, dong === d && main.dongBtnActive]}
                  onPress={() => setDong(d)}
                  activeOpacity={0.8}
                >
                  <Text style={[main.dongBtnText, dong === d && main.dongBtnTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 배달 주소 */}
            <Text style={[main.label, { marginTop: 20 }]}>
              배달 주소 <Text style={main.required}>*</Text>
            </Text>
            <TextInput
              style={main.input}
              value={address}
              onChangeText={setAddress}
              placeholder="아파트명, 동·호수를 입력해 주세요"
              placeholderTextColor={T.textMuted}
              returnKeyType="next"
            />

            {/* 물품 내용 */}
            <Text style={[main.label, { marginTop: 20 }]}>
              물품 내용 <Text style={main.required}>*</Text>
            </Text>
            <TextInput
              style={main.input}
              value={items}
              onChangeText={setItems}
              placeholder="예) 쌀 10kg, 생수 2박스"
              placeholderTextColor={T.textMuted}
              returnKeyType="next"
            />

            {/* 요청사항 */}
            <Text style={[main.label, { marginTop: 20 }]}>
              요청사항 <Text style={main.optional}>(선택)</Text>
            </Text>
            <TextInput
              style={[main.input, main.inputMulti]}
              value={request}
              onChangeText={setRequest}
              placeholder="예) 문 앞에 두기, 전화 후 배달"
              placeholderTextColor={T.textMuted}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            {/* 접수 시간 안내 — 장날 11~15시가 아니면 신청 불가 */}
            {!isReceptionOpen && (
              <View style={main.closedBox}>
                <Ionicons name="time-outline" size={20} color="#B45309" />
                <Text style={main.closedText}>
                  지금은 접수 시간이 아닙니다.{'\n'}장날(3·8·13·18·23·28일) 오전 11시~오후 3시에 신청해 주세요.
                </Text>
              </View>
            )}

            {/* 신청 버튼 */}
            <TouchableOpacity
              style={[main.submitBtn, !canSubmit && main.submitBtnOff]}
              disabled={!canSubmit || orderMutation.isPending}
              onPress={() => orderMutation.mutate()}
              activeOpacity={0.85}
            >
              {orderMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="send" size={22} color="#FFFFFF" />
                  <Text style={main.submitBtnText}>배송 신청하기</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* 전화 버튼 */}
          <TouchableOpacity
            style={main.callBtn}
            onPress={() => Linking.openURL(CALL_NUMBER)}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={24} color="#FFFFFF" />
            <Text style={main.callBtnText}>배송센터에 전화하기</Text>
          </TouchableOpacity>

          <Text style={main.notice}>
            경기도 광주시 × 경안시장상인회 협약 무료 복지 배송
          </Text>

        </ScrollView>
      </View>
    </>
  )
}

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: T.bg,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  greeting:   { fontSize: 22, fontWeight: '800', color: T.text },
  headerSub:  { fontSize: 15, color: T.textSub, marginTop: 2 },
  logoutBtn:  { padding: 8 },

  scroll:   { flex: 1 },
  content:  { padding: 20, paddingBottom: 60, gap: 16 },

  sectionLabel: { fontSize: 14, fontWeight: '700', color: T.textMuted, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },

  card: {
    backgroundColor: T.card, borderRadius: 22, padding: 22,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  cardTitle:    { fontSize: 24, fontWeight: '800', color: T.text },

  label:    { fontSize: 20, fontWeight: '700', color: T.text, marginBottom: 10 },
  required: { color: T.error, fontSize: 20 },
  optional: { fontSize: 15, color: T.textMuted, fontWeight: '400' },

  dongRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dongBtn: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 28, backgroundColor: '#F1F5F9',
    borderWidth: 2, borderColor: T.border,
  },
  dongBtnActive:     { backgroundColor: T.primary, borderColor: T.primary },
  dongBtnText:       { fontSize: 18, fontWeight: '700', color: T.textSub },
  dongBtnTextActive: { color: '#FFFFFF' },

  input: {
    borderWidth: 2, borderColor: T.border, borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 20, color: T.text,
    backgroundColor: '#FAFAFA',
  },
  inputMulti: { minHeight: 90 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: T.primary, borderRadius: 18,
    paddingVertical: 22, marginTop: 24,
    shadowColor: T.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  submitBtnOff:  { backgroundColor: '#FDBA74', shadowOpacity: 0 },
  submitBtnText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  closedBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 20 },
  closedText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#92400E', lineHeight: 20 },

  callBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#2563EB', borderRadius: 18,
    paddingVertical: 20,
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  callBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },

  notice: { textAlign: 'center', fontSize: 13, color: T.textMuted, lineHeight: 20 },
})
