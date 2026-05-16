import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export default function LoginScreen() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  const loginMutation = useMutation({
    mutationFn: () => api.post('/auth/login', { phone, password }),
    onSuccess: (res) => {
      const { access_token, user } = res.data
      setAuth(user, access_token)
      if (user.role === 'driver') router.replace('/(driver)')
      else router.replace('/(customer)')
    },
    onError: () => Alert.alert('로그인 실패', '전화번호 또는 비밀번호를 확인해주세요.'),
  })

  const canLogin = phone.trim().length >= 10 && password.length >= 4

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* 로고 */}
        <View style={styles.logo}>
          <Text style={styles.logoTitle}>경안시장</Text>
          <Text style={styles.logoSub}>집배송 서비스</Text>
        </View>

        {/* 입력 폼 */}
        <View style={styles.form}>
          <Text style={styles.label}>전화번호</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="010-0000-0000"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            autoComplete="tel"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>비밀번호</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호 입력"
            placeholderTextColor="#9ca3af"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.loginBtn, !canLogin && styles.loginBtnDisabled]}
            disabled={!canLogin || loginMutation.isPending}
            onPress={() => loginMutation.mutate()}
            activeOpacity={0.8}
          >
            {loginMutation.isPending
              ? <ActivityIndicator color="white" />
              : <Text style={styles.loginBtnText}>로그인</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>경기도 광주시 × 경안시장상인회 협약 무료 복지 배송</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff7ed' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 32 },
  logo: { alignItems: 'center' },
  logoTitle: { fontSize: 36, fontWeight: 'bold', color: '#c2410c' },
  logoSub: { fontSize: 18, color: '#9a3412', marginTop: 4 },
  form: { backgroundColor: 'white', borderRadius: 20, padding: 24, gap: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 18, color: '#111827',
  },
  loginBtn: {
    backgroundColor: '#f97316', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', marginTop: 8,
  },
  loginBtnDisabled: { backgroundColor: '#fed7aa' },
  loginBtnText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  footer: { textAlign: 'center', fontSize: 13, color: '#9ca3af' },
})
