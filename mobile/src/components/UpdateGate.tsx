import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Constants from 'expo-constants'
import api from '@/lib/api'
import { downloadAndInstallApk, isNewer } from '@/lib/appUpdater'

type VersionInfo = { latest: string; apk_url: string; min_supported?: string }
type Phase = 'hidden' | 'prompt' | 'downloading' | 'error'

const ORANGE = '#f97316'

/**
 * 앱 내 자동 업데이트 게이트.
 * - 앱 시작/포그라운드 복귀 시 서버 최신 버전을 확인
 * - 현재 < min_supported : 강제 업데이트(닫기 불가)
 * - 현재 < latest        : 권장 업데이트(세션당 1회 안내, '나중에' 허용)
 * - 업데이트 시 앱 안에서 직접 다운로드 → 설치 화면 자동 실행
 */
export default function UpdateGate() {
  const [phase, setPhase] = useState<Phase>('hidden')
  const [progress, setProgress] = useState(0)
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [forced, setForced] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const checkingRef = useRef(false)
  const promptedRef = useRef(false) // 권장 업데이트는 세션당 1회만
  const phaseRef = useRef<Phase>('hidden') // AppState 콜백에서 최신 phase 참조용
  const current = Constants.expoConfig?.version ?? ''

  const check = useCallback(async () => {
    // 현재 버전을 못 읽으면 비교 불가 → 오탐 방지로 생략
    if (!current || checkingRef.current) return
    checkingRef.current = true
    try {
      const { data } = await api.get<VersionInfo>('/app/version')
      if (!data?.latest) return
      const min = data.min_supported ?? '0.0.0'

      if (isNewer(min, current)) {
        // 강제 업데이트(매번 표시)
        setInfo(data)
        setForced(true)
        setPhase('prompt')
      } else if (isNewer(data.latest, current) && !promptedRef.current) {
        // 권장 업데이트(세션당 1회)
        promptedRef.current = true
        setInfo(data)
        setForced(false)
        setPhase('prompt')
      }
    } catch {
      /* 버전 확인 실패는 조용히 무시 */
    } finally {
      checkingRef.current = false
    }
  }, [current])

  // AppState 콜백이 최신 phase를 읽도록 동기화
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    check()
    // 백그라운드에서 돌아올 때마다 재확인 (다운로드 중에는 건너뜀)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && phaseRef.current !== 'downloading') check()
    })
    return () => sub.remove()
  }, [check])

  const startUpdate = useCallback(async () => {
    if (!info) return
    // 비안드로이드는 기존 방식(브라우저 다운로드)로 폴백
    if (Platform.OS !== 'android') {
      Linking.openURL(info.apk_url)
      return
    }
    setErrMsg('')
    setProgress(0)
    setPhase('downloading')
    try {
      await downloadAndInstallApk(info.apk_url, setProgress)
      // 설치 화면이 떴다. 강제면 안내 유지, 권장이면 닫는다.
      setPhase(forced ? 'prompt' : 'hidden')
    } catch (e: any) {
      setErrMsg(e?.message ?? '업데이트 중 문제가 발생했습니다.')
      setPhase('error')
    }
  }, [info, forced])

  if (phase === 'hidden' || !info) return null

  const pct = Math.round(progress * 100)
  const canDismiss = !forced && phase !== 'downloading'

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (canDismiss) setPhase('hidden')
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {phase === 'downloading' ? (
            <>
              <Text style={styles.title}>업데이트 받는 중…</Text>
              <Text style={styles.big}>{pct}%</Text>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.sub}>
                다 받으면 설치 화면이 자동으로 열립니다.{'\n'}잠시만 기다려 주세요.
              </Text>
            </>
          ) : phase === 'error' ? (
            <>
              <Text style={styles.title}>업데이트 실패</Text>
              <Text style={styles.sub}>{errMsg}</Text>
              <Pressable style={styles.primaryBtn} onPress={startUpdate}>
                <Text style={styles.primaryTxt}>다시 시도</Text>
              </Pressable>
              {!forced && (
                <Pressable style={styles.ghostBtn} onPress={() => setPhase('hidden')}>
                  <Text style={styles.ghostTxt}>나중에</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Text style={styles.title}>{forced ? '업데이트 필수' : '새 버전 안내'}</Text>
              <Text style={styles.sub}>
                {forced
                  ? `현재 버전(${current})은 더 이상 사용할 수 없습니다.`
                  : `새 버전(${info.latest})이 나왔습니다.`}
                {'\n'}버튼을 누르면 앱에서 바로 받아 설치합니다.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={startUpdate}>
                <Text style={styles.primaryTxt}>지금 업데이트</Text>
              </Pressable>
              {!forced && (
                <Pressable style={styles.ghostBtn} onPress={() => setPhase('hidden')}>
                  <Text style={styles.ghostTxt}>나중에</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 12, textAlign: 'center' },
  big: { fontSize: 44, fontWeight: '900', color: ORANGE, marginVertical: 8 },
  sub: { fontSize: 16, color: '#444', textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  barBg: {
    width: '100%',
    height: 14,
    borderRadius: 7,
    backgroundColor: '#eee',
    overflow: 'hidden',
    marginBottom: 16,
  },
  barFill: { height: '100%', borderRadius: 7, backgroundColor: ORANGE },
  primaryBtn: {
    width: '100%',
    backgroundColor: ORANGE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontSize: 19, fontWeight: '800' },
  ghostBtn: { width: '100%', paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  ghostTxt: { color: '#888', fontSize: 16, fontWeight: '600' },
})
