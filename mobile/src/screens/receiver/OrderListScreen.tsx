import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, subDays } from 'date-fns'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const T = {
  primary: '#F97316', primarySoft: '#FFF7ED',
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0',
  text: '#0F172A', textSub: '#475569', textMuted: '#94A3B8',
  success: '#059669', successSoft: '#ECFDF5',
  warning: '#F59E0B', warningSoft: '#FFFBEB',
  info: '#3B82F6', infoSoft: '#EFF6FF',
  error: '#EF4444', errorSoft: '#FEF2F2',
}

const DONG_LIST = [
  '경안동','송정동','쌍령동','탄벌동',
  '고산동','매산동','목동','목현동','문형동','삼동',
  '양벌동','역동','장지동','중대동','직동','추자동','태전동','회덕동',
]

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: '대기',   color: T.textMuted, bg: '#F1F5F9' },
  assigned:   { label: '배정',   color: T.info,      bg: T.infoSoft },
  picked_up:  { label: '픽업',   color: T.warning,   bg: T.warningSoft },
  in_transit: { label: '배송중', color: T.primary,   bg: T.primarySoft },
  delivered:  { label: '완료',   color: T.success,   bg: T.successSoft },
  cancelled:  { label: '취소',   color: T.error,     bg: T.errorSoft },
}

const KST = 9 * 60 * 60 * 1000
function todayKST(): string {
  const d = new Date(Date.now() + KST)
  return `${d.getUTCFullYear()}-${(d.getUTCMonth()+1).toString().padStart(2,'0')}-${d.getUTCDate().toString().padStart(2,'0')}`
}
function isToday(dateStr: string): boolean {
  return dateStr.slice(0,10) === todayKST()
}
function fmtDate(iso: string): string {
  try { return format(new Date(iso), 'MM/dd HH:mm') } catch { return iso.slice(0,16) }
}

interface Order {
  id: number; order_no: string; customer_name: string; customer_phone: string
  dong: string; status: string; delivery_address: string; detail_address?: string
  items_desc?: string; quantity: number; request?: string; notes?: string
  created_at: string; driver_id?: number; sequence?: number
}

/* ── 동 선택 모달 ─────────────────────────────────────────────── */
function DongPickerModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (d: string) => void; onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose} />
      <View style={pm.sheet}>
        <View style={pm.handle} />
        <Text style={pm.title}>배송 동 선택</Text>
        <FlatList
          data={DONG_LIST}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[pm.item, item === selected && pm.itemSel]}
              onPress={() => { onSelect(item); onClose() }}
              activeOpacity={0.7}
            >
              <Text style={[pm.itemText, item === selected && pm.itemTextSel]}>{item}</Text>
              {item === selected && <Ionicons name="checkmark" size={20} color={T.primary} />}
            </TouchableOpacity>
          )}
          style={{ maxHeight: 360 }}
        />
      </View>
    </Modal>
  )
}
const pm = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:       { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle:      { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:       { fontSize: 18, fontWeight: '700', color: T.text, marginBottom: 12 },
  item:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  itemSel:     { backgroundColor: T.primarySoft, borderRadius: 10 },
  itemText:    { fontSize: 17, color: T.text },
  itemTextSel: { color: T.primary, fontWeight: '700' },
})

/* ── 수정 모달 ────────────────────────────────────────────────── */
type EditForm = {
  delivery_address: string; detail_address: string; dong: string
  items_desc: string; quantity: string; request: string; notes: string
}

function EditModal({ order, onSave, onClose, loading }: {
  order: Order; onSave: (data: object) => void
  onClose: () => void; loading: boolean
}) {
  const [form, setForm] = useState<EditForm>({
    delivery_address: order.delivery_address ?? '',
    detail_address: order.detail_address ?? '',
    dong: order.dong ?? '경안동',
    items_desc: order.items_desc ?? '',
    quantity: String(order.quantity ?? 1),
    request: order.request ?? '',
    notes: order.notes ?? '',
  })
  const [dongModal, setDongModal] = useState(false)
  const set = (k: keyof EditForm, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={em.overlay} activeOpacity={1} onPress={onClose} />
      <View style={em.sheet}>
        <View style={em.handle} />
        <View style={em.hRow}>
          <View>
            <Text style={em.title}>주문 수정</Text>
            <Text style={em.sub}>{order.order_no} · {order.customer_name}</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={T.textMuted} />
          </TouchableOpacity>
        </View>

        <DongPickerModal visible={dongModal} selected={form.dong}
          onSelect={(d) => set('dong', d)} onClose={() => setDongModal(false)} />

        <FlatList
          data={[null]}
          keyExtractor={() => '1'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={() => (
            <View style={em.fields}>
              <View style={em.fld}>
                <Text style={em.lbl}>배송 동</Text>
                <TouchableOpacity style={em.pick} onPress={() => setDongModal(true)} activeOpacity={0.7}>
                  <Text style={em.pickTxt}>{form.dong}</Text>
                  <Ionicons name="chevron-down" size={16} color={T.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={em.fld}>
                <Text style={em.lbl}>배송 주소</Text>
                <TextInput style={em.inp} value={form.delivery_address}
                  onChangeText={(v) => set('delivery_address', v)}
                  placeholder="도로명 또는 지번" placeholderTextColor={T.textMuted} />
              </View>
              <View style={em.fld}>
                <Text style={em.lbl}>상세주소</Text>
                <TextInput style={em.inp} value={form.detail_address}
                  onChangeText={(v) => set('detail_address', v)}
                  placeholder="동·호·층 등" placeholderTextColor={T.textMuted} />
              </View>
              <View style={em.row}>
                <View style={[em.fld, { flex: 2 }]}>
                  <Text style={em.lbl}>물품 내역</Text>
                  <TextInput style={em.inp} value={form.items_desc}
                    onChangeText={(v) => set('items_desc', v)}
                    placeholder="쌀, 채소 등" placeholderTextColor={T.textMuted} />
                </View>
                <View style={[em.fld, { flex: 1 }]}>
                  <Text style={em.lbl}>수량</Text>
                  <TextInput style={em.inp} value={form.quantity}
                    onChangeText={(v) => set('quantity', v.replace(/\D/g,'') || '1')}
                    keyboardType="numeric" />
                </View>
              </View>
              <View style={em.fld}>
                <Text style={em.lbl}>요청사항</Text>
                <TextInput style={[em.inp, em.ta]} value={form.request}
                  onChangeText={(v) => set('request', v)}
                  placeholder="배송 요청사항" placeholderTextColor={T.textMuted}
                  multiline numberOfLines={2} textAlignVertical="top" />
              </View>
              <View style={em.fld}>
                <Text style={em.lbl}>전달사항 (기사 메모)</Text>
                <TextInput style={[em.inp, em.ta]} value={form.notes}
                  onChangeText={(v) => set('notes', v)}
                  placeholder="기사에게 전달할 내용" placeholderTextColor={T.textMuted}
                  multiline numberOfLines={2} textAlignVertical="top" />
              </View>
            </View>
          )}
        />

        <View style={em.actions}>
          <TouchableOpacity style={em.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={em.cancelTxt}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[em.saveBtn, loading && em.saveDis]}
            onPress={() => onSave({
              delivery_address: form.delivery_address.trim() || undefined,
              detail_address: form.detail_address.trim() || undefined,
              dong: form.dong,
              items_desc: form.items_desc.trim() || undefined,
              quantity: parseInt(form.quantity) || 1,
              request: form.request.trim() || undefined,
              notes: form.notes.trim() || undefined,
            })}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFF" size="small" />
              : <Text style={em.saveTxt}>저장</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const em = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:     { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: 20 },
  handle:    { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  hRow:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  title:     { fontSize: 18, fontWeight: '700', color: T.text },
  sub:       { fontSize: 13, color: T.textMuted, marginTop: 2 },
  fields:    { padding: 20, gap: 12 },
  fld:       { gap: 4 },
  row:       { flexDirection: 'row', gap: 10 },
  lbl:       { fontSize: 13, fontWeight: '600', color: T.textSub },
  inp:       { backgroundColor: T.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: T.text, borderWidth: 1, borderColor: T.border },
  ta:        { height: 64, paddingTop: 8 },
  pick:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: T.border },
  pickTxt:   { fontSize: 15, color: T.text },
  actions:   { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelTxt: { fontSize: 16, fontWeight: '600', color: T.textSub },
  saveBtn:   { flex: 2, backgroundColor: T.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveDis:   { backgroundColor: T.textMuted },
  saveTxt:   { fontSize: 16, fontWeight: '700', color: '#FFF' },
})

/* ── 주문 카드 ────────────────────────────────────────────────── */
function OrderCard({ order, canEdit, canDelete, onEdit, onDelete }: {
  order: Order; canEdit: boolean; canDelete: boolean
  onEdit: () => void; onDelete: () => void
}) {
  const meta = STATUS_META[order.status] ?? STATUS_META.pending
  return (
    <View style={oc.card}>
      <View style={oc.topRow}>
        <View style={oc.topLeft}>
          <Text style={oc.no}>{order.order_no}</Text>
          <View style={[oc.badge, { backgroundColor: meta.bg }]}>
            <Text style={[oc.badgeTxt, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={oc.time}>{fmtDate(order.created_at)}</Text>
      </View>
      <View style={oc.body}>
        <View style={oc.nameRow}>
          <Ionicons name="person" size={14} color={T.textMuted} />
          <Text style={oc.name}>{order.customer_name}</Text>
          <Text style={oc.phone}>{order.customer_phone}</Text>
        </View>
        <View style={oc.addrRow}>
          <Ionicons name="location" size={14} color={T.primary} />
          <Text style={oc.addr} numberOfLines={1}>
            {order.dong} · {order.delivery_address}
            {order.detail_address ? ' ' + order.detail_address : ''}
          </Text>
        </View>
        {order.items_desc ? (
          <View style={oc.itemRow}>
            <Ionicons name="cube" size={14} color={T.textMuted} />
            <Text style={oc.items}>{order.items_desc} · {order.quantity}개</Text>
          </View>
        ) : null}
        {order.request ? (
          <View style={oc.itemRow}>
            <Ionicons name="chatbubble-ellipses" size={14} color={T.info} />
            <Text style={oc.req} numberOfLines={1}>{order.request}</Text>
          </View>
        ) : null}
      </View>
      <View style={oc.actions}>
        {canEdit ? (
          <TouchableOpacity style={oc.editBtn} onPress={onEdit} activeOpacity={0.7}>
            <Ionicons name="create-outline" size={16} color={T.info} />
            <Text style={oc.editTxt}>수정</Text>
          </TouchableOpacity>
        ) : (
          <View style={oc.lockRow}>
            <Ionicons name="lock-closed" size={12} color={T.textMuted} />
            <Text style={oc.lockTxt}>당일만 수정 가능</Text>
          </View>
        )}
        {canDelete && (
          <TouchableOpacity style={oc.delBtn} onPress={onDelete} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={16} color={T.error} />
            <Text style={oc.delTxt}>삭제</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const oc = StyleSheet.create({
  card:    { backgroundColor: T.card, borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  topRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  no:      { fontSize: 13, fontWeight: '700', color: T.primary },
  badge:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeTxt:{ fontSize: 12, fontWeight: '600' },
  time:    { fontSize: 12, color: T.textMuted },
  body:    { gap: 4, marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:    { fontSize: 15, fontWeight: '700', color: T.text },
  phone:   { fontSize: 13, color: T.textMuted },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addr:    { flex: 1, fontSize: 13, color: T.textSub },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  items:   { fontSize: 13, color: T.textMuted },
  req:     { flex: 1, fontSize: 13, color: T.info },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.infoSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  editTxt: { fontSize: 13, fontWeight: '600', color: T.info },
  delBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.errorSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  delTxt:  { fontSize: 13, fontWeight: '600', color: T.error },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockTxt: { fontSize: 12, color: T.textMuted },
} as const)

/* ── 메인 ─────────────────────────────────────────────────────── */
export default function OrderListScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'super_admin'
  const qc = useQueryClient()

  const [date, setDate] = useState(todayKST())
  const [editTarget, setEditTarget] = useState<Order | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const prevDay = () => setDate(d => format(subDays(new Date(d), 1), 'yyyy-MM-dd'))
  const nextDay = () => {
    const next = format(addDays(new Date(date), 1), 'yyyy-MM-dd')
    if (next > todayKST() && !isSuperAdmin) return
    setDate(next)
  }

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['receiver-orders', date],
    queryFn: async () => {
      const res = await api.get('/orders', { params: { page: 1, page_size: 200, date } })
      return res.data?.items ?? res.data ?? []
    },
    staleTime: 30_000,
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await qc.invalidateQueries({ queryKey: ['receiver-orders', date] })
    setRefreshing(false)
  }, [date, qc])

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => api.put(`/orders/${id}`, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['receiver-orders', date] })
      setEditTarget(null)
      if (res.data?.status_reset_message) Alert.alert('안내', res.data.status_reset_message)
      if (res.data?.address_warning) Alert.alert('주소 경고', res.data.address_warning)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '수정 실패'
      Alert.alert('수정 실패', msg)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/orders/${id}/hard`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receiver-orders', date] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '삭제 실패'
      Alert.alert('삭제 실패', msg)
    },
  })

  const handleDelete = (order: Order) => {
    Alert.alert(
      '주문 삭제',
      `${order.customer_name}님 주문을 삭제하시겠습니까?\n(${order.order_no})`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => deleteMut.mutate(order.id) },
      ]
    )
  }

  // 수정·삭제 권한: 당일 주문이면 누구나, 비당일은 super_admin만
  const canModify = (order: Order) => isToday(order.created_at) || isSuperAdmin
  const todaySelected = date === todayKST()

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {editTarget && (
        <EditModal
          order={editTarget}
          loading={editMut.isPending}
          onClose={() => setEditTarget(null)}
          onSave={(data) => editMut.mutate({ id: editTarget.id, data })}
        />
      )}

      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.hTitle}>주문 확인</Text>
        <View style={s.hRole}>
          <Ionicons name="person-circle" size={18} color={T.primary} />
          <Text style={s.hRoleText}>{user?.name ?? '접수자'}</Text>
        </View>
      </View>

      {/* 날짜 내비 */}
      <View style={s.dateNav}>
        <TouchableOpacity style={s.dateBtn} onPress={prevDay} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={T.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.dateLbl, todaySelected && s.dateLblToday]}
          onPress={() => setDate(todayKST())}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar" size={16} color={todaySelected ? T.primary : T.textSub} />
          <Text style={[s.dateTxt, todaySelected && s.dateTxtToday]}>
            {todaySelected ? '오늘 ' + date : date}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.dateBtn, date >= todayKST() && !isSuperAdmin && s.dateBtnDis]}
          onPress={nextDay}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={20}
            color={date >= todayKST() && !isSuperAdmin ? T.textMuted : T.text} />
        </TouchableOpacity>
      </View>

      {/* 통계 */}
      {orders.length > 0 && (
        <View style={s.stat}>
          <Text style={s.statAll}>전체 {orders.length}건</Text>
          <Text style={s.statDone}>완료 {orders.filter(o => o.status === 'delivered').length}건</Text>
          <Text style={s.statPending}>대기 {orders.filter(o => o.status === 'pending').length}건</Text>
        </View>
      )}

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={T.primary} size="large" />
          <Text style={s.loadTxt}>불러오는 중...</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="receipt-outline" size={48} color={T.textMuted} />
          <Text style={s.emptyTxt}>접수된 주문이 없습니다</Text>
          {!todaySelected && !isSuperAdmin && (
            <Text style={s.emptyHint}>당일 주문만 수정·삭제 가능합니다</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
          renderItem={({ item }) => {
            const ok = canModify(item)
            return (
              <OrderCard
                order={item}
                canEdit={ok}
                canDelete={ok}
                onEdit={() => setEditTarget(item)}
                onDelete={() => handleDelete(item)}
              />
            )
          }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: T.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  hTitle:      { fontSize: 20, fontWeight: '800', color: T.text },
  hRole:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  hRoleText:   { fontSize: 13, fontWeight: '600', color: T.primary },
  dateNav:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  dateBtn:     { padding: 8 },
  dateBtnDis:  { opacity: 0.3 },
  dateLbl:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: T.bg, minWidth: 150, justifyContent: 'center' },
  dateLblToday:{ backgroundColor: T.primarySoft },
  dateTxt:     { fontSize: 15, fontWeight: '600', color: T.textSub },
  dateTxtToday:{ color: T.primary },
  stat:        { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  statAll:     { fontSize: 13, fontWeight: '600', color: T.textSub },
  statDone:    { fontSize: 13, fontWeight: '600', color: T.success },
  statPending: { fontSize: 13, fontWeight: '600', color: T.warning },
  list:        { padding: 16, paddingBottom: 40 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadTxt:     { fontSize: 15, color: T.textMuted },
  emptyTxt:    { fontSize: 17, color: T.textMuted, fontWeight: '600' },
  emptyHint:   { fontSize: 13, color: T.textMuted },
} as const)