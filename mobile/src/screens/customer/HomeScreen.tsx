import { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Linking, SafeAreaView,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const DONG_LIST = ['경안동', '송정동', '쌍령동', '탄벌동']
const CALL_NUMBER = 'tel:031-760-0000'

export function CustomerHomeScreen() {
  const { user, logout } = useAuthStore()
  const qc = useQueryClient()
  const [dong, setDong] = useState(user?.dong || '경안동')
  const [address, setAddress] = useState(user?.address || '')
  const [items, setItems] = useState('')
  const [request, setRequest] = useState('')
  const [orderedNo, setOrderedNo] = useState('')

  const orderMutation = useMutation({
    mutationFn: () =>
      api.post('/orders', {
        delivery_address: address,
        dong,
        items_desc: items,
        request,
        // customer_name/phone/customer_id auto-filled by backend
        customer_name: user?.name ?? '',
        customer_phone: user?.phone ?? '',
        customer_id: user?.id,
      }),
    onSuccess: (res) => {
      setOrderedNo(res.data.order_no)
      setItems('')
      setRequest('')
      qc.invalidateQueries({ queryKey: ['my-orders'] })
    },
    onError: () => Alert.alert('오류', '주문 접수에 실패했습니다.\n다시 시도해주세요.'),
  })

  if (orderedNo) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>주문 접수 완료!</Text>
          <View style={styles.orderNoBox}>
            <Text style={styles.orderNoLabel}>접수번호</Text>
            <Text style={styles.orderNo}>{orderedNo}</Text>
          </View>
          <Text style={styles.successMsg}>담당자가 기사를 배정해 드립니다.{'\n'}잠시만 기다려주세요.</Text>
          <TouchableOpacity
            style={styles.newOrderBtn}
            onPress={() => setOrderedNo('')}
            activeOpacity={0.8}
          >
            <Text style={styles.newOrderBtnText}>새 주문 하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(CALL_NUMBER)}>
            <Text style={styles.callBtnText}>📞 배송센터 전화</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>경안시장 집배송</Text>
            <Text style={styles.headerSub}>{user?.name}님, 안녕하세요</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>

        {/* 주문 폼 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📦 배송 신청</Text>

          {/* 동 선택 */}
          <Text style={styles.label}>배달 동</Text>
          <View style={styles.dongRow}>
            {DONG_LIST.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.dongBtn, dong === d && styles.dongBtnActive]}
                onPress={() => setDong(d)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dongBtnText, dong === d && styles.dongBtnTextActive]}>
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 배달 주소 */}
          <Text style={[styles.label, { marginTop: 16 }]}>배달 주소 <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="아파트명, 동·호수 입력"
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
          />

          {/* 물품 내용 */}
          <Text style={[styles.label, { marginTop: 16 }]}>물품 내용 <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={items}
            onChangeText={setItems}
            placeholder="예) 쌀 10kg, 생수 2박스"
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
          />

          {/* 요청사항 */}
          <Text style={[styles.label, { marginTop: 16 }]}>요청사항 <Text style={styles.optional}>(선택)</Text></Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={request}
            onChangeText={setRequest}
            placeholder="문 앞에 두기, 전화 후 배달 등"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
          />

          {/* 신청 버튼 */}
          <TouchableOpacity
            style={[styles.submitBtn, (!address.trim() || !items.trim()) && styles.submitBtnDisabled]}
            disabled={!address.trim() || !items.trim() || orderMutation.isPending}
            onPress={() => orderMutation.mutate()}
            activeOpacity={0.8}
          >
            <Text style={styles.submitBtnText}>
              {orderMutation.isPending ? '접수 중...' : '배송 신청하기'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 전화 버튼 */}
        <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(CALL_NUMBER)} activeOpacity={0.8}>
          <Text style={styles.callBtnText}>📞 배송센터에 전화하기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff7ed' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8 },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#c2410c' },
  headerSub: { fontSize: 18, color: '#6b7280', marginTop: 2 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f3f4f6', borderRadius: 8 },
  logoutText: { fontSize: 14, color: '#6b7280' },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  successIcon: { fontSize: 64 },
  successTitle: { fontSize: 32, fontWeight: 'bold', color: '#166534' },
  orderNoBox: { backgroundColor: '#dcfce7', borderRadius: 16, paddingHorizontal: 32, paddingVertical: 16, alignItems: 'center' },
  orderNoLabel: { fontSize: 16, color: '#166534' },
  orderNo: { fontSize: 28, fontWeight: 'bold', color: '#15803d', marginTop: 4 },
  successMsg: { fontSize: 18, color: '#374151', textAlign: 'center', lineHeight: 28 },
  newOrderBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 40, marginTop: 8 },
  newOrderBtnText: { color: 'white', fontSize: 20, fontWeight: 'bold' },

  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 16 },

  label: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 6 },
  required: { color: '#ef4444' },
  optional: { fontSize: 14, color: '#9ca3af', fontWeight: '400' },

  dongRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dongBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb' },
  dongBtnActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  dongBtnText: { fontSize: 17, fontWeight: '600', color: '#374151' },
  dongBtnTextActive: { color: 'white' },

  input: {
    borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 18, color: '#111827',
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },

  submitBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 20, alignItems: 'center', marginTop: 20 },
  submitBtnDisabled: { backgroundColor: '#fed7aa' },
  submitBtnText: { color: 'white', fontSize: 20, fontWeight: 'bold' },

  callBtn: { backgroundColor: '#1d4ed8', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  callBtnText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
})
