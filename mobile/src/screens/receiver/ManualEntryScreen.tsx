import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Modal, FlatList, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const T = {
  primary: '#F97316', primarySoft: '#FFF7ED',
  bg: '#F8FAFC', card: '#FFFFFF',
  border: '#E2E8F0', borderFocus: '#F97316',
  text: '#0F172A', textSub: '#475569', textMuted: '#94A3B8',
  success: '#059669', successSoft: '#ECFDF5',
  error: '#EF4444',
}

const DONG_LIST = [
  '경안동','송정동','쌍령동','탄벌동',
  '고산동','매산동','목동','목현동','문형동','삼동',
  '양벌동','역동','장지동','중대동','직동','추자동','태전동','회덕동',
]

const KST = 9 * 60 * 60 * 1000
function todayLabel() {
  const d = new Date(Date.now() + KST)
  return (d.getUTCMonth()+1).toString().padStart(2,'0')+'월 '+d.getUTCDate().toString().padStart(2,'0')+'일'
}
function isMarketDay() {
  return [3,8,13,18,23,28].includes(new Date(Date.now()+KST).getUTCDate())
}

/* ── 동 선택 모달 ─────────────────────────────────────────────── */
function DongPickerModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (d: string) => void; onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={dm.overlay} activeOpacity={1} onPress={onClose} />
      <View style={dm.sheet}>
        <View style={dm.handle} />
        <Text style={dm.title}>배송 동 선택</Text>
        <FlatList
          data={DONG_LIST}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[dm.item, item === selected && dm.itemSelected]}
              onPress={() => { onSelect(item); onClose() }}
              activeOpacity={0.7}
            >
              <Text style={[dm.itemText, item === selected && dm.itemTextSelected]}>{item}</Text>
              {item === selected && <Ionicons name="checkmark" size={20} color={T.primary} />}
            </TouchableOpacity>
          )}
          style={{ maxHeight: 400 }}
        />
      </View>
    </Modal>
  )
}

const dm = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:            { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle:           { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:            { fontSize: 18, fontWeight: '700', color: T.text, marginBottom: 12 },
  item:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: T.border },
  itemSelected:     { backgroundColor: T.primarySoft, borderRadius: 10 },
  itemText:         { fontSize: 17, color: T.text },
  itemTextSelected: { color: T.primary, fontWeight: '700' },
})

/* ── 완료 카드 ────────────────────────────────────────────────── */
function SuccessCard({ orderNo, onNext }: { orderNo: string; onNext: () => void }) {
  return (
    <View style={sc.wrap}>
      <Ionicons name="checkmark-circle" size={72} color={T.success} />
      <Text style={sc.title}>접수 완료!</Text>
      <View style={sc.noBox}>
        <Text style={sc.noLabel}>접수번호</Text>
        <Text style={sc.noVal}>{orderNo}</Text>
      </View>
      <TouchableOpacity style={sc.btn} onPress={onNext} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#FFF" />
        <Text style={sc.btnText}>다음 고객 입력</Text>
      </TouchableOpacity>
    </View>
  )
}
const sc = StyleSheet.create({
  wrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 28 },
  title:   { fontSize: 32, fontWeight: '900', color: T.text },
  noBox:   { backgroundColor: T.successSoft, borderRadius: 16, paddingHorizontal: 36, paddingVertical: 18, alignItems: 'center', width: '100%' },
  noLabel: { fontSize: 14, color: T.success, fontWeight: '600', marginBottom: 4 },
  noVal:   { fontSize: 28, fontWeight: '900', color: T.success, letterSpacing: 2 },
  btn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16, marginTop: 8 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
})

/* ── 메인 ─────────────────────────────────────────────────────── */
type Form = {
  name: string; phone: string; dong: string
  address: string; detail: string
  items: string; qty: string; request: string
}
const EMPTY: Form = { name: '', phone: '', dong: '경안동', address: '', detail: '', items: '', qty: '1', request: '' }

export default function ManualEntryScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>({ ...EMPTY })
  const [dongModal, setDongModal] = useState(false)
  const [doneNo, setDoneNo] = useState<string | null>(null)
  const [foc, setFoc] = useState<string | null>(null)
  const phoneRef = useRef<TextInput>(null)
  const addrRef = useRef<TextInput>(null)
  const detailRef = useRef<TextInput>(null)
  const itemsRef = useRef<TextInput>(null)
  const qtyRef = useRef<TextInput>(null)
  const reqRef = useRef<TextInput>(null)
  const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const fb = (f: string) => foc === f
    ? { borderColor: T.borderFocus, borderWidth: 1.5 }
    : { borderColor: T.border, borderWidth: 1 }

  const saveMut = useMutation({
    mutationFn: () => api.post('/orders/single', {
      customer_name: form.name.trim(),
      customer_phone: form.phone.trim(),
      delivery_address: form.address.trim(),
      detail_address: form.detail.trim() || undefined,
      dong: form.dong,
      items_desc: form.items.trim() || undefined,
      quantity: parseInt(form.qty) || 1,
      request: form.request.trim() || undefined,
      dong_override: false,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setDoneNo(res.data.order_no ?? String(res.data.id ?? '완료'))
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? '저장 실패'
      Alert.alert('접수 실패', msg)
    },
  })

  const handleSave = () => {
    if (!form.name.trim()) return Alert.alert('필수', '성명을 입력해 주세요.')
    if (!form.phone.trim()) return Alert.alert('필수', '전화번호를 입력해 주세요.')
    if (!form.address.trim()) return Alert.alert('필수', '배송 주소를 입력해 주세요.')
    saveMut.mutate()
  }

  if (doneNo) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <SuccessCard orderNo={doneNo} onNext={() => { setDoneNo(null); setForm({ ...EMPTY }) }} />
    </View>
  )

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <DongPickerModal visible={dongModal} selected={form.dong}
        onSelect={(d) => set('dong', d)} onClose={() => setDongModal(false)} />

      {/* 헤더 */}
      <View style={s.header}>
        <View>
          <Text style={s.hTitle}>주문 접수</Text>
          <Text style={s.hSub}>{todayLabel()} {isMarketDay() ? '장날' : '장외'}</Text>
        </View>
        <View style={s.hRole}>
          <Ionicons name="person-circle" size={18} color={T.primary} />
          <Text style={s.hRoleText}>{user?.name ?? '접수자'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* 고객 정보 */}
          <View style={s.card}>
            <Text style={s.cardTitle}>고객 정보</Text>
            <View style={s.row}>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.lbl}>성명 <Text style={s.req}>*</Text></Text>
                <TextInput style={[s.inp, fb('name')]} value={form.name}
                  onChangeText={(v) => set('name', v)} placeholder="홍길동"
                  placeholderTextColor={T.textMuted} returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                  onFocus={() => setFoc('name')} onBlur={() => setFoc(null)} />
              </View>
              <View style={[s.field, { flex: 1.5 }]}>
                <Text style={s.lbl}>전화번호 <Text style={s.req}>*</Text></Text>
                <TextInput ref={phoneRef} style={[s.inp, fb('phone')]} value={form.phone}
                  onChangeText={(v) => set('phone', v)} placeholder="010-0000-0000"
                  placeholderTextColor={T.textMuted} keyboardType="phone-pad" returnKeyType="next"
                  onSubmitEditing={() => addrRef.current?.focus()}
                  onFocus={() => setFoc('phone')} onBlur={() => setFoc(null)} />
              </View>
            </View>
          </View>

          {/* 배송 정보 */}
          <View style={s.card}>
            <Text style={s.cardTitle}>배송 정보</Text>
            <View style={s.field}>
              <Text style={s.lbl}>배송 동 <Text style={s.req}>*</Text></Text>
              <TouchableOpacity style={[s.pick, fb('dong')]}
                onPress={() => setDongModal(true)} activeOpacity={0.7}>
                <Text style={s.pickText}>{form.dong}</Text>
                <Ionicons name="chevron-down" size={18} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={s.field}>
              <Text style={s.lbl}>배송 주소 <Text style={s.req}>*</Text></Text>
              <TextInput ref={addrRef} style={[s.inp, fb('addr')]} value={form.address}
                onChangeText={(v) => set('address', v)} placeholder="도로명 또는 지번 주소"
                placeholderTextColor={T.textMuted} returnKeyType="next"
                onSubmitEditing={() => detailRef.current?.focus()}
                onFocus={() => setFoc('addr')} onBlur={() => setFoc(null)} />
            </View>
            <View style={s.field}>
              <Text style={s.lbl}>상세주소</Text>
              <TextInput ref={detailRef} style={[s.inp, fb('detail')]} value={form.detail}
                onChangeText={(v) => set('detail', v)} placeholder="동·호·층 등"
                placeholderTextColor={T.textMuted} returnKeyType="next"
                onSubmitEditing={() => itemsRef.current?.focus()}
                onFocus={() => setFoc('detail')} onBlur={() => setFoc(null)} />
            </View>
          </View>

          {/* 물품 정보 */}
          <View style={s.card}>
            <Text style={s.cardTitle}>물품 정보</Text>
            <View style={s.row}>
              <View style={[s.field, { flex: 2 }]}>
                <Text style={s.lbl}>물품 내역</Text>
                <TextInput ref={itemsRef} style={[s.inp, fb('items')]} value={form.items}
                  onChangeText={(v) => set('items', v)} placeholder="쌀, 채소 등"
                  placeholderTextColor={T.textMuted} returnKeyType="next"
                  onSubmitEditing={() => qtyRef.current?.focus()}
                  onFocus={() => setFoc('items')} onBlur={() => setFoc(null)} />
              </View>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.lbl}>수량</Text>
                <TextInput ref={qtyRef} style={[s.inp, fb('qty')]} value={form.qty}
                  onChangeText={(v) => set('qty', v.replace(/\D/g, '') || '1')}
                  keyboardType="numeric" returnKeyType="next"
                  onSubmitEditing={() => reqRef.current?.focus()}
                  onFocus={() => setFoc('qty')}
                  onBlur={() => { setFoc(null); if (!form.qty) set('qty', '1') }} />
              </View>
            </View>
            <View style={s.field}>
              <Text style={s.lbl}>요청사항</Text>
              <TextInput ref={reqRef} style={[s.inp, s.ta, fb('req')]} value={form.request}
                onChangeText={(v) => set('request', v)} placeholder="배송 시 주의사항 등"
                placeholderTextColor={T.textMuted} multiline numberOfLines={2}
                textAlignVertical="top"
                onFocus={() => setFoc('req')} onBlur={() => setFoc(null)} />
            </View>
          </View>

          {/* 접수 버튼 */}
          <TouchableOpacity
            style={[s.saveBtn, saveMut.isPending && s.saveDis]}
            onPress={handleSave} activeOpacity={0.85} disabled={saveMut.isPending}>
            {saveMut.isPending
              ? <ActivityIndicator color="#FFF" />
              : <><Ionicons name="checkmark-circle" size={24} color="#FFF" /><Text style={s.saveTxt}>접수하기</Text></>
            }
          </TouchableOpacity>
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: T.bg },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  hTitle:    { fontSize: 20, fontWeight: '800', color: T.text },
  hSub:      { fontSize: 13, color: T.textMuted, marginTop: 2 },
  hRole:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  hRoleText: { fontSize: 13, fontWeight: '600', color: T.primary },
  scroll:    { flex: 1 },
  content:   { padding: 16, gap: 12 },
  card:      { backgroundColor: T.card, borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: T.primary },
  row:       { flexDirection: 'row', gap: 10 },
  field:     { gap: 4 },
  lbl:       { fontSize: 13, fontWeight: '600', color: T.textSub },
  req:       { color: T.error },
  inp:       { backgroundColor: T.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: T.text },
  ta:        { height: 72, paddingTop: 10 },
  pick:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 13 },
  pickText:  { fontSize: 16, color: T.text, fontWeight: '500' },
  saveBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: T.primary, borderRadius: 16, paddingVertical: 18, marginTop: 4 },
  saveDis:   { backgroundColor: T.textMuted },
  saveTxt:   { fontSize: 20, fontWeight: '800', color: '#FFF' },
})