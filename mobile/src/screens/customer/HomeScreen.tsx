import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, Linking
} from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const DONG_LIST = ['경안동', '송정동', '쌍령동', '탄벌동']

export function CustomerHomeScreen() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [dong, setDong] = useState(user?.dong || '경안동')
  const [address, setAddress] = useState('')
  const [items, setItems] = useState('')
  const [request, setRequest] = useState('')
  const [success, setSuccess] = useState('')

  const orderMutation = useMutation({
    mutationFn: () => api.post('/orders', {
      customer_name: user?.name,
      customer_phone: user?.phone,
      customer_id: user?.id,
      delivery_address: address,
      dong,
      items_desc: items,
      request,
    }),
    onSuccess: (res) => {
      setSuccess(res.data.order_no)
      setAddress(''); setItems(''); setRequest('')
      qc.invalidateQueries({ queryKey: ['my-orders'] })
      setTimeout(() => setSuccess(''), 5000)
    },
    onError: () => Alert.alert('오류', '주문 접수에 실패했습니다. 다시 시도해주세요.'),
  })

  const { data: myOrders } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.get('/orders/today').then((r) => r.data),
  })

  const callCenter = () => Linking.openURL('tel:031-000-0000')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>경안시장 집배송</Text>
        <Text style={styles.headerSub}>{user?.name}님 안녕하세요</Text>
      </View>

      {success ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✅ 주문 접수 완료!</Text>
          <Text style={styles.successOrderNo}>접수번호: {success}</Text>
          <Text style={styles.successSub}>담당자가 곧 배정해 드립니다</Text>
        </View>
      ) : (
        <View style={styles.orderForm}>
          <Text style={styles.sectionTitle}>주문하기</Text>

          <Text style={styles.fieldLabel}>배달 동 선택</Text>
          <View style={styles.dongRow}>
            {DONG_LIST.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.dongBtn, dong === d && styles.dongBtnActive]}
                onPress={() => setDong(d)}
              >
                <Text style={[styles.dongBtnText, dong === d && styles.dongBtnTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>배달 주소</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="아파트명, 동·호수 입력"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.fieldLabel}>물품 내용</Text>
          <TextInput
            style={styles.input}
            value={items}
            onChangeText={setItems}
            placeholder="예) 쌀 10kg, 생수 2박스"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.fieldLabel}>요청사항 (선택)</Text>
          <TextInput
            style={styles.input}
            value={request}
            onChangeText={setRequest}
            placeholder="문 앞에 두기 등"
            placeholderTextColor="#9ca3af"
          />

          <TouchableOpacity
            style={[styles.orderBtn, (!address || !items) && styles.orderBtnDisabled]}
            disabled={!address || !items || orderMutation.isPending}
            onPress={() => orderMutation.mutate()}
          >
            <Text style={styles.orderBtnText}>
              {orderMutation.isPending ? '접수 중...' : '배송 신청'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {(myOrders || []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 주문 현황</Text>
          {(myOrders || []).slice(0, 3).map((o: { id: number; order_no: string; status: string; delivery_address: string }) => (
            <View key={o.id} style={styles.orderRow}>
              <View>
                <Text style={styles.orderRowNo}>{o.order_no}</Text>
                <Text style={styles.orderRowAddr}>{o.delivery_address}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: o.status === 'delivered' ? '#dcfce7' : '#fff7ed' }]}>
                <Text style={{ fontSize: 13, color: o.status === 'delivered' ? '#16a34a' : '#ea580c', fontWeight: '600' }}>
                  {o.status === 'delivered' ? '완료' : o.status === 'in_transit' ? '배송중' : '대기'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.callBtn} onPress={callCenter}>
        <Text style={styles.callBtnText}>📞 배송센터 전화</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff7ed' },
  content: { padding: 20, gap: 16 },
  header: { alignItems: 'center', paddingVertical: 20 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#c2410c' },
  headerSub: { fontSize: 16, color: '#6b7280', marginTop: 4 },
  successBox: { backgroundColor: '#dcfce7', borderRadius: 16, padding: 20, alignItems: 'center', gap: 6 },
  successText: { fontSize: 20, fontWeight: 'bold', color: '#166534' },
  successOrderNo: { fontSize: 16, fontWeight: '700', color: '#15803d' },
  successSub: { fontSize: 14, color: '#166534' },
  orderForm: { backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 6 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  fieldLabel: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 8 },
  dongRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  dongBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  dongBtnActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  dongBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  dongBtnTextActive: { color: 'white' },
  input: { borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827', marginTop: 4 },
  orderBtn: { backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 18, alignItems: 'center', marginTop: 12 },
  orderBtnDisabled: { backgroundColor: '#fed7aa' },
  orderBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  section: { backgroundColor: 'white', borderRadius: 16, padding: 16, gap: 8 },
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  orderRowNo: { fontSize: 14, fontWeight: '700', color: '#c2410c' },
  orderRowAddr: { fontSize: 12, color: '#6b7280' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  callBtn: { backgroundColor: '#1d4ed8', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  callBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
})
