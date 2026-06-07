import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Vibration } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import * as ImageManipulator from 'expo-image-manipulator'
import { Accelerometer } from 'expo-sensors'
import { Audio } from 'expo-av'
import api from '@/lib/api'

const SHAKE_THRESHOLD = 0.055   // 이 값 이상 움직이면 '흔들림'으로 보고 촬영 대기

// 흐림 경고음(짧은 더블 비프). 재생 실패는 무시(진동으로 대체).
async function playWarningBeep() {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true })
    const { sound } = await Audio.Sound.createAsync(
      require('../../../assets/beep.wav'),
      { shouldPlay: true, volume: 1.0 },
    )
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) sound.unloadAsync().catch(() => {})
    })
  } catch { /* 소리 재생 실패는 무시 */ }
}

/**
 * 배송 완료 사진 촬영 오버레이 — 후면(back) 카메라 강제.
 * 촬영 후 서버 흐림 검사(/orders/blur-check)로 선명도를 판정한다.
 * 선명하면 onCaptured(uri), 흐리면 진동+경고 후 다시 촬영. 3회 연속 흐리면 강제 사용 버튼 노출.
 * 검사 실패/오프라인 시에는 통과(차단 방지).
 * (앱 내 WebView 검사는 실기기에서 불안정해 서버 PIL 측정으로 일원화)
 */
export function CameraCaptureModal({
  visible,
  onCaptured,
  onCancel,
}: {
  visible: boolean
  onCaptured: (uri: string) => void
  onCancel: () => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)   // 카메라 예열 완료 — 준비된 뒤에만 촬영(움직임 흐림 방지)
  const shakeRef = useRef(0)                   // 최근 움직임 크기
  const [steady, setSteady] = useState(true)   // 흔들리지 않는 상태(촬영 적합)

  // 가속도 센서로 손떨림 측정 — 흔들리면 촬영을 잠깐 미뤄 흐린 사진을 원천 차단
  useEffect(() => {
    let sub: { remove: () => void } | undefined
    let last: { x: number; y: number; z: number } | null = null
    try {
      Accelerometer.setUpdateInterval(120)
      sub = Accelerometer.addListener(({ x, y, z }) => {
        if (last) {
          const d = Math.abs(x - last.x) + Math.abs(y - last.y) + Math.abs(z - last.z)
          shakeRef.current = d
          setSteady(d < SHAKE_THRESHOLD)
        }
        last = { x, y, z }
      })
    } catch {
      setSteady(true) // 센서 미지원 시 정상 촬영(차단 방지)
    }
    return () => { try { sub?.remove() } catch { /* ignore */ } }
  }, [])

  if (!visible) return null

  const shoot = async () => {
    if (busy || !ready || !cameraRef.current) return
    setBusy(true)
    try {
      // 흔들림이 멈출 때까지 잠깐 대기(최대 1.5초) → 손떨림 흐림 방지
      const start = Date.now()
      while (shakeRef.current >= SHAKE_THRESHOLD && Date.now() - start < 1500) {
        await new Promise((r) => setTimeout(r, 70))
      }
      // 빠른 촬영 — skipProcessing으로 처리 지연 최소화
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.65, skipProcessing: true })
      if (!photo?.uri) { setBusy(false); return }

      // 서버 흐림 검사 — 빠르게(짧은 타임아웃). 실패/오프라인/지연 시 통과(배송 안 막힘)
      let sharp = true
      try {
        const small = await ImageManipulator.manipulateAsync(
          photo.uri, [{ resize: { width: 900 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
        )
        const fd = new FormData()
        fd.append('file', { uri: small.uri, name: 'check.jpg', type: 'image/jpeg' } as unknown as Blob)
        const res = await api.post('/orders/blur-check', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 3500,
        })
        sharp = res.data?.sharp !== false
      } catch {
        sharp = true // 검사 실패/오프라인/지연 시 통과
      }

      if (sharp) {
        onCaptured(photo.uri)
        return
      }

      // 흐림 — 흐린 사진은 사용 불가. 반드시 다시 촬영.
      setBusy(false)
      playWarningBeep()
      Vibration.vibrate([0, 250, 120, 250])
      Alert.alert('사진이 흐립니다', '흐린 사진은 사용할 수 없습니다.\n현관문과 배달한 물품이 선명하게 보이도록 다시 촬영해 주세요.')
    } catch {
      setBusy(false)
    }
  }

  return (
    <View style={s.wrap}>
      {!permission ? (
        <View style={s.center}><ActivityIndicator color="#fff" size="large" /></View>
      ) : !permission.granted ? (
        <View style={s.center}>
          <Ionicons name="camera-outline" size={56} color="#fff" />
          <Text style={s.msg}>배송 사진 촬영을 위해 카메라 권한이 필요합니다</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={s.permBtnText}>권한 허용</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          animateShutter={false}
          onCameraReady={() => setReady(true)}
        />
      )}

      {permission?.granted && (
        <>
          <View style={s.titleBar} pointerEvents="none">
            <Text style={s.title}>배송 완료 사진</Text>
            <Text style={s.subtitle}>현관문과 배달한 물품이 잘 보이게 촬영해 주세요</Text>
          </View>

          {/* 흔들림 표시 — 멈추면 초록(촬영 적합), 흔들리면 빨강(잠시 정지) */}
          <View style={[s.steadyTag, steady ? s.steadyOn : s.steadyOff]} pointerEvents="none">
            <Ionicons name={steady ? 'checkmark-circle' : 'hand-left'} size={16} color="#fff" />
            <Text style={s.steadyText}>{steady ? '준비됨 — 지금 촬영' : '흔들림 — 잠시 멈춰주세요'}</Text>
          </View>

          <View style={s.controls}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8} disabled={busy}>
              <Text style={s.cancelText}>취소</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.shutter, !steady && s.shutterShake, busy && { opacity: 0.7 }]} onPress={shoot} disabled={busy} activeOpacity={0.8}>
              {busy ? <ActivityIndicator color="#fff" /> : <View style={[s.shutterInner, steady && s.shutterInnerReady]} />}
            </TouchableOpacity>

            <View style={s.cancelBtn} />
          </View>
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 50, elevation: 50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  msg: { color: '#fff', fontSize: 16, textAlign: 'center' },
  permBtn: { backgroundColor: '#F97316', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  titleBar: {
    position: 'absolute', top: 40, left: 16, right: 16, alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  steadyTag: {
    position: 'absolute', bottom: 140, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
  },
  steadyOn: { backgroundColor: 'rgba(22,163,74,0.92)' },
  steadyOff: { backgroundColor: 'rgba(220,38,38,0.92)' },
  steadyText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  shutterShake: { borderColor: 'rgba(248,113,113,0.95)' },
  shutterInnerReady: { backgroundColor: '#22C55E' },
  controls: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 24,
  },
  cancelBtn: { width: 72, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  shutter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
})
