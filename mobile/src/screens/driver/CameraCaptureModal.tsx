import React, { useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'

/**
 * 배송 완료 사진 촬영 오버레이 — expo-camera로 후면(back) 카메라 강제.
 * (ImagePicker.launchCameraAsync의 cameraType은 일부 기기서 무시돼 전면이 열리는 문제 해결)
 * ⚠️ RN Modal이 아닌 전체화면 절대배치 View — 부모 Modal(완료 시트) 위에 덮어 중첩 Modal 터치 충돌을 방지.
 * 촬영하면 onCaptured(uri) 호출. 취소 시 onCancel.
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
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false })
      if (photo?.uri) onCaptured(photo.uri)
    } catch {
      // 촬영 실패 — 다시 시도하도록 그대로 둠
    } finally {
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
              <Text style={s.subtitle}>배달한 물품이 잘 보이게 촬영해 주세요</Text>
            </View>

            <View style={s.controls}>
              <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
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
  titleBar: { position: 'absolute', top: 52, alignSelf: 'center', alignItems: 'center', gap: 4 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
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
