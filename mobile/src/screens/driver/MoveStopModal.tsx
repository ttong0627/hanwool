import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const T = {
  primary: '#F97316', card: '#FFFFFF', bg: '#F1F5F9', border: '#E2E8F0',
  text: '#0F172A', textSub: '#475569', textMuted: '#94A3B8',
}

export interface MoveStop {
  id: number
  customer_name: string
  dong: string
  delivery_address: string
  sequence?: number
  lat?: number | null
  lng?: number | null
}

/**
 * 활성(미완료) 주문 순서에서 moveId를 newIndex 위치로 옮긴 뒤 [{order_id, sequence}] 생성.
 * 활성 주문만 1..M로 재부여한다. 완료 주문은 sequences에 포함되지 않으므로 서버가 건드리지 않고,
 * 목록 정렬에서 항상 뒤로 빠지므로 순번 이동에 영향받지 않는다.
 */
export function reorderedSequences(
  activeSorted: MoveStop[],
  moveId: number,
  newIndex: number,
): { order_id: number; sequence: number }[] {
  const others = activeSorted.filter((o) => o.id !== moveId)
  const moving = activeSorted.find((o) => o.id === moveId)
  if (!moving) return []
  const next = [...others]
  next.splice(Math.max(0, Math.min(newIndex, next.length)), 0, moving)
  return next.map((o, i) => ({ order_id: o.id, sequence: i + 1 }))
}

/**
 * 순서 이동 모달 — 옮길 배송지의 좌표/주소를 보여주고,
 * "맨 앞으로" 또는 다른 배송지 "뒤로"를 골라 한 번에 이동.
 */
export function MoveStopModal({
  stop, activeOrders, onSelect, onClose,
}: {
  stop: MoveStop | null
  activeOrders: MoveStop[]
  onSelect: (newIndex: number) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  if (!stop) return null
  const others = activeOrders.filter((o) => o.id !== stop.id)
  const coordText = stop.lat != null && stop.lng != null
    ? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`
    : '좌표 없음'

  const pick = (newIndex: number) => { onSelect(newIndex); onClose() }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>순서 이동</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={T.textMuted} />
            </TouchableOpacity>
          </View>

          {/* 옮길 배송지 정보 */}
          <View style={s.moving}>
            <Text style={s.movingName}>{stop.customer_name} · {stop.dong}</Text>
            <View style={s.row}><Ionicons name="location-outline" size={14} color={T.textMuted} /><Text style={s.movingAddr}>{stop.delivery_address}</Text></View>
            <View style={s.row}><Ionicons name="navigate-outline" size={14} color={T.textMuted} /><Text style={s.coord}>{coordText}</Text></View>
          </View>

          <Text style={s.guide}>어디로 옮길까요?</Text>
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            <TouchableOpacity style={[s.opt, s.optFront]} activeOpacity={0.8} onPress={() => pick(0)}>
              <Ionicons name="arrow-up-circle" size={18} color={T.primary} />
              <Text style={s.optFrontText}>맨 앞으로 (첫 배송)</Text>
            </TouchableOpacity>
            {others.map((o, i) => (
              <TouchableOpacity key={o.id} style={s.opt} activeOpacity={0.8} onPress={() => pick(i + 1)}>
                <View style={s.optSeq}><Text style={s.optSeqText}>{o.sequence ?? i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.optName} numberOfLines={1}>{o.customer_name} · {o.dong}</Text>
                  <Text style={s.optAddr} numberOfLines={1}>{o.delivery_address}</Text>
                </View>
                <Text style={s.optAfter}>이 뒤로</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: '800', color: T.text },
  moving: { backgroundColor: T.bg, borderRadius: 12, padding: 12, gap: 4, marginBottom: 12 },
  movingName: { fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  movingAddr: { flex: 1, fontSize: 13, color: T.textSub },
  coord: { fontSize: 12, color: T.textMuted, fontVariant: ['tabular-nums'] },
  guide: { fontSize: 13, fontWeight: '700', color: T.textSub, marginBottom: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.bg, borderRadius: 12, padding: 12 },
  optFront: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: T.primary },
  optFrontText: { fontSize: 15, fontWeight: '800', color: T.primary },
  optSeq: { width: 26, height: 26, borderRadius: 13, backgroundColor: T.textMuted, alignItems: 'center', justifyContent: 'center' },
  optSeqText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  optName: { fontSize: 14, fontWeight: '700', color: T.text },
  optAddr: { fontSize: 12, color: T.textSub, marginTop: 1 },
  optAfter: { fontSize: 12, fontWeight: '700', color: T.primary },
})
