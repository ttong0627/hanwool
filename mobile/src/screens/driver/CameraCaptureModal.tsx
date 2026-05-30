import React, { useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Vibration } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import * as ImageManipulator from 'expo-image-manipulator'
import api from '@/lib/api'

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
  const [lastUri, setLastUri] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  if (!visible) return null

  const shoot = async () => {
    if (busy || !cameraRef.current) return
    setBusy(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false })
      if (!photo?.uri) { setBusy(false); return }

      // 서버 흐림 검사 — 작은 이미지를 보내 선명도 판정 (실패/오프라인 시 통과)
      let sharp = true
      try {
        const small = await ImageManipulator.manipulateAsync(
          photo.uri, [{ resize: { width: 1080 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        )
        const fd = new FormData()
        fd.append('file', { uri: small.uri, name: 'check.jpg', type: 'image/jpeg' } as unknown as Blob)
        const res = await api.post('/orders/blur-check', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 8000,
        })
        sharp = res.data?.sharp !== false
      } catch {
        sharp = true // 검사 실패/오프라인 시 통과 — 배송이 막히지 않도록
      }

      if (sharp) {
        setAttempts(0)
        onCaptured(photo.uri)
        return
      }

      // 흐림 — 다시 촬영 유도 (강한 진동 + 경고 팝업)
      setLastUri(photo.uri)
      setAttempts((a) => a + 1)
      setBusy(false)
      Vibration.vibrate([0, 300, 150, 300])
      Alert.alert('사진이 흐립니다', '현관문과 배달한 물품이 선명하게 보이도록 다시 촬영해 주세요.')
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
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      )}

      {permission?.granted && (
        <>
          <View style={s.titleBar} pointerEvents="none">
            <Text style={s.title}>배송 완료 사진</Text>
            <Text style={s.subtitle}>현관문과 배달한 물품이 잘 보이게 촬영해 주세요</Text>
          </View>

          {attempts >= 3 && lastUri && !busy && (
            <TouchableOpacity style={s.forceBtn} activeOpacity={0.85} onPress={() => { if (lastUri) { setAttempts(0); onCaptured(lastUri) } }}>
              <Text style={s.forceText}>흐리지만 이 사진 사용</Text>
            </TouchableOpacity>
          )}

          <View style={s.controls}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8} disabled={busy}>
              <Text style={s.cancelText}>취소</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.shutter} onPress={shoot} disabled={busy} activeOpacity={0.8}>
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
  forceBtn: {
    position: 'absolute', bottom: 140, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: '#F59E0B',
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
  },
  forceText: { color: '#FBBF24', fontSize: 14, fontWeight: '700' },
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
