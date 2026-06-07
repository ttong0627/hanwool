import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const T = {
  primary:   '#F97316',
  dark:      '#0F172A',
  darkCard:  '#1E293B',
  border:    '#334155',
  inputBg:   '#0F172A',
  text:      '#F8FAFC',
  textSub:   '#CBD5E1',
  textMuted: '#64748B',
  error:     '#EF4444',
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const router  = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)

  const loginMutation = useMutation({
    mutationFn: () => api.post('/auth/login', { phone, password }),
    onSuccess: (res) => {
      const { access_token, refresh_token, user } = res.data
      setAuth(user, access_token, refresh_token)
      if (user.role === 'driver')      router.replace('/(driver)')
      else if (user.role === 'super_admin') router.replace('/(admin)')
      else router.replace('/(customer)')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? '전화번호 또는 비밀번호를 확인해주세요.'
      Alert.alert('로그인 실패', msg)
    },
  })

  const canLogin = phone.trim().length >= 10 && password.length >= 4

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={T.dark} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: T.dark }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>

          {/* 브랜드 영역 */}
          <View style={styles.brandSection}>
            {/* 아이콘 원 */}
            <View style={styles.logoCircle}>
              <Ionicons name="storefront" size={36} color="#FFFFFF" />
            </View>

            {/* 서비스명 */}
            <Text style={styles.brandTitle}>경안시장</Text>
            <Text style={styles.brandSubtitle}>집배송 서비스</Text>

            {/* 태그라인 */}
            <View style={styles.tagline}>
              <Ionicons name="heart" size={12} color={T.primary} />
              <Text style={styles.taglineText}>경기도 광주시 × 경안시장상인회 무료 복지 배송</Text>
            </View>
          </View>

          {/* 로그인 카드 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>로그인</Text>
            <Text style={styles.cardSub}>서비스에 접속하려면 로그인해주세요</Text>

            {/* 전화번호 */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>전화번호</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={18} color={T.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="010-0000-0000"
                  placeholderTextColor={T.textMuted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* 비밀번호 */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>비밀번호</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={T.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="비밀번호 입력"
                  placeholderTextColor={T.textMuted}
                  secureTextEntry={!showPw}
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={() => canLogin && loginMutation.mutate()}
                />
                <TouchableOpacity
                  onPress={() => setShowPw((v) => !v)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPw ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={T.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* 로그인 버튼 */}
            <TouchableOpacity
              style={[styles.loginBtn, !canLogin && styles.loginBtnOff]}
              disabled={!canLogin || loginMutation.isPending}
              onPress={() => loginMutation.mutate()}
              activeOpacity={0.85}
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>로그인</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* 하단 안내 */}
          <Text style={styles.footer}>
            계정 문의: 담당 관리자에게 연락하세요
          </Text>

        </View>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.dark,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 32,
  },

  /* 브랜드 */
  brandSection: { alignItems: 'center', gap: 8 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  brandTitle:    { fontSize: 34, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  brandSubtitle: { fontSize: 18, color: T.textSub, fontWeight: '500' },
  tagline:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  taglineText:   { fontSize: 12, color: T.textMuted },

  /* 카드 */
  card: {
    backgroundColor: T.darkCard,
    borderRadius: 24,
    padding: 28,
    gap: 16,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: T.text },
  cardSub:   { fontSize: 14, color: T.textMuted, marginBottom: 4 },

  /* 필드 */
  fieldWrap: { gap: 8 },
  label:     { fontSize: 14, fontWeight: '600', color: T.textSub },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.inputBg,
    borderWidth: 1.5, borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 4,
    minHeight: 54,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 17, color: T.text,
    paddingVertical: 10,
  },
  eyeBtn: { padding: 4 },

  /* 버튼 */
  loginBtn: {
    backgroundColor: T.primary,
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  loginBtnOff:  { backgroundColor: '#7C3A1A', shadowOpacity: 0 },
  loginBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },

  /* 하단 */
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: T.textMuted,
  },
})
