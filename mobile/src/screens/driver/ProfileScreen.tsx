import React from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

/* ── 디자인 토큰 ─────────────────────────────────────────────── */
const T = {
  primary:   '#F97316',
  dark:      '#0F172A',
  bg:        '#F1F5F9',
  card:      '#FFFFFF',
  border:    '#E2E8F0',
  text:      '#0F172A',
  textSub:   '#475569',
  textMuted: '#94A3B8',
  success:   '#10B981',
  warning:   '#F59E0B',
  error:     '#EF4444',
}

function StatCard({
  icon, label, value, color,
}: {
  icon: string; label: string; value: string | number; color: string
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Ionicons name={icon as any} size={22} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function InfoRow({
  icon, label, value,
}: {
  icon: string; label: string; value: string
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon as any} size={18} color={T.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  )
}

export function DriverProfileScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, logout } = useAuthStore()

  const { data: statsData } = useQuery({
    queryKey: ['driver-stats', user?.id],
    queryFn: async () => {
      const res = await api.get('/orders', {
        params: { driver_id: user?.id, page: 1, page_size: 200 },
      })
      const items = res.data.items ?? []
      const total     = items.length
      const done      = items.filter((o: any) => o.status === 'delivered').length
      const inProg    = items.filter((o: any) => ['assigned', 'picked_up', 'in_transit'].includes(o.status)).length
      const withPhoto = items.filter((o: any) => o.delivery_photo_url).length
      const pct       = total > 0 ? Math.round((done / total) * 100) : 0
      return { total, done, inProg, withPhoto, pct }
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  })

  const stats = statsData ?? { total: 0, done: 0, inProg: 0, withPhoto: 0, pct: 0 }

  function handleLogout() {
    Alert.alert(
      '로그아웃',
      '로그아웃 하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃', style: 'destructive',
          onPress: () => {
            logout()
            router.replace('/login')
          },
        },
      ],
    )
  }

  const initials = user?.name ? user.name.slice(-2) : '기사'

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>내 정보</Text>
        </View>

        {/* 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.avatarBadge}>
              <Ionicons name="car" size={12} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.profileName}>{user?.name ?? '기사'}</Text>
          <Text style={styles.profileRole}>배송 기사</Text>

          {user?.phone && (
            <View style={styles.phoneChip}>
              <Ionicons name="call" size={13} color={T.primary} />
              <Text style={styles.phoneText}>{user.phone}</Text>
            </View>
          )}
        </View>

        {/* 오늘 실적 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 실적</Text>
          <View style={styles.statsGrid}>
            <StatCard icon="list"           label="총 배송"   value={stats.total}   color={T.textSub} />
            <StatCard icon="checkmark-circle" label="완료"   value={stats.done}    color={T.success} />
            <StatCard icon="car"            label="진행 중"   value={stats.inProg}  color={T.primary} />
            <StatCard icon="camera"         label="사진 완료" value={stats.withPhoto} color={T.warning} />
          </View>

          {/* 진행률 바 */}
          <View style={styles.progressWrap}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>오늘 진행률</Text>
              <Text style={styles.progressPct}>{stats.pct}%</Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${stats.pct}%` }]} />
            </View>
            <Text style={styles.progressSub}>{stats.done} / {stats.total} 건 완료</Text>
          </View>
        </View>

        {/* 기사 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>기사 정보</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="person"      label="이름"     value={user?.name ?? '-'} />
            <View style={styles.divider} />
            <InfoRow icon="call"        label="전화번호"  value={user?.phone ?? '-'} />
            {user?.dong && (
              <>
                <View style={styles.divider} />
                <InfoRow icon="location" label="담당 동"  value={user.dong} />
              </>
            )}
          </View>
        </View>

        {/* 앱 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>앱 정보</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="storefront"  label="서비스"   value="경안시장 집배송" />
            <View style={styles.divider} />
            <InfoRow icon="shield-checkmark" label="운영기관" value="경기도 광주시 × 경안시장상인회" />
          </View>
        </View>

        {/* 로그아웃 */}
        <View style={styles.logoutWrap}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={20} color={T.error} />
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },

  /* 헤더 */
  header: {
    backgroundColor: T.dark,
    paddingHorizontal: 20, paddingVertical: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },

  /* 프로필 카드 */
  profileCard: {
    backgroundColor: T.dark,
    paddingBottom: 36,
    alignItems: 'center',
    gap: 8,
  },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText:  { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: T.success,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.dark,
  },
  profileName: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  profileRole: { fontSize: 14, color: '#94A3B8' },
  phoneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(249,115,22,0.15)',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)',
    marginTop: 4,
  },
  phoneText: { fontSize: 14, color: T.primary, fontWeight: '600' },

  /* 섹션 */
  section:      { margin: 16, marginBottom: 0 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: T.textMuted, marginBottom: 10, letterSpacing: 0.8, textTransform: 'uppercase' },

  /* 실적 그리드 */
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: T.card,
    borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 6,
    borderTopWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: T.textMuted, fontWeight: '600' },

  /* 진행률 */
  progressWrap: {
    backgroundColor: T.card, borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  progressHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel:   { fontSize: 14, fontWeight: '600', color: T.text },
  progressPct:     { fontSize: 14, fontWeight: '800', color: T.success },
  progressBg:      { height: 10, backgroundColor: T.border, borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  progressFill:    { height: '100%', backgroundColor: T.success, borderRadius: 5 },
  progressSub:     { fontSize: 12, color: T.textMuted, textAlign: 'center' },

  /* 정보 카드 */
  infoCard: {
    backgroundColor: T.card, borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    overflow: 'hidden',
  },
  infoRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  infoIconWrap:{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoContent: { flex: 1 },
  infoLabel:   { fontSize: 12, color: T.textMuted, marginBottom: 2 },
  infoValue:   { fontSize: 15, fontWeight: '600', color: T.text },
  divider:     { height: 1, backgroundColor: T.border, marginLeft: 64 },

  /* 로그아웃 */
  logoutWrap: { margin: 16, marginTop: 24 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16,
    backgroundColor: T.card,
    borderRadius: 14,
    borderWidth: 1.5, borderColor: '#FEE2E2',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: T.error },
})
