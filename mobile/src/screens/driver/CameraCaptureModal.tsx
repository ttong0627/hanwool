import React, { useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Vibration } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import * as ImageManipulator from 'expo-image-manipulator'
import { Audio } from 'expo-av'
import api from '@/lib/api'

// 흐림 경고음(짧은 비프). 재생 실패는 무시(진동으로 대체).
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
 * 배송 완료 사진 촬영 오버레이 — 후면 카메라.
 * 빠르게 촬영(skipProcessing)하고, 서버 흐림 검사로 흐리면 재촬영을 유도한다.
 * 검사 실패/오프라인/지연 시에는 통과(배송이 막히지 않도록).
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

  if (!visible) return null

  const shoot = async () => {
    if (busy || !cameraRef.current) return
    setBusy(true)
    try {
      // 빠른 촬영 — skipProcessing으로 셔터 지연 최소화(움직임 흐림 감소)
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.65, skipProcessing: true })
      if (!photo?.uri) { setBusy(false); return }

      // 서버 흐림 검사 — 빠르게(짧은 타임아웃). 실패/오프라인/지연 시 통과
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
        sharp = true
      }

      if (sharp) {
        onCaptured(photo.uri)
        return
      }

      // 흐림 — 흐린 사진은 사용 불가. 다시 촬영.
      setBusy(false)
      playWarningBeep()
      Vibration.vibrate(200)
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
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />
      )}

      {permission?.granted && (
        <>
          <View style={s.titleBar} pointerEvents="none">
            <Text style={s.title}>배송 완료 사진</Text>
            <Text style={s.subtitle}>현관문과 배달한 물품이 잘 보이게 촬영해 주세요</Text>
          </View>

          <View style={s.controls}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8} disabled={busy}>
              <Text style={s.cancelText}>취소</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.shutter, busy && { opacity: 0.7 }]} onPress={shoot} disabled={busy} activeOpacity={0.8}>
              {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterInner} />}
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
  controls: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 24,
  },
  cancelBtn: { width: 72, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  shutter: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
})
