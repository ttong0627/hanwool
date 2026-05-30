import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'

/**
 * QR/바코드 스캔 모달.
 * 스캔되면 onScanned(code) 1회 호출 후 잠금 — 중복 인식 방지.
 * 호출 측에서 결과(주문 매칭/상태전환)를 처리하고 onClose로 닫는다.
 */
export function ScanModal({
  visible,
  onClose,
  onScanned,
  title = '상품 스캔',
}: {
  visible: boolean
  onClose: () => void
  onScanned: (code: string) => void
  title?: string
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const [locked, setLocked] = useState(false)

  // 모달이 다시 열릴 때마다 잠금 해제
  useEffect(() => {
    if (visible) setLocked(false)
  }, [visible])

  const handleScan = (result: BarcodeScanningResult) => {
    if (locked || !result?.data) return
    setLocked(true)
    onScanned(result.data.trim())
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.wrap}>
        {!permission ? (
          <View style={s.center}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : !permission.granted ? (
          <View style={s.center}>
            <Ionicons name="camera-outline" size={56} color="#fff" />
            <Text style={s.msg}>스캔하려면 카메라 권한이 필요합니다</Text>
            <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
              <Text style={s.permBtnText}>권한 허용</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={locked ? undefined : handleScan}
          />
        )}

        {/* 가이드 프레임 + 안내 (카메라 위 오버레이) */}
        {permission?.granted && (
          <View style={s.overlay} pointerEvents="none">
            <View style={s.frame} />
            <Text style={s.hint}>QR/바코드를 사각형 안에 맞춰 주세요</Text>
            {locked && <Text style={s.scanned}>인식 완료 — 처리 중...</Text>}
          </View>
        )}

        <TouchableOpacity style={s.close} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={26} color="#fff" />
          <Text style={s.closeText}>닫기</Text>
        </TouchableOpacity>

        <View style={s.titleBar} pointerEvents="none">
          <Text style={s.title}>{title}</Text>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  msg: { color: '#fff', fontSize: 16, textAlign: 'center' },
  permBtn: { backgroundColor: '#F97316', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 240, height: 240, borderRadius: 20,
    borderWidth: 3, borderColor: '#F97316', backgroundColor: 'transparent',
  },
  hint: { marginTop: 20, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  scanned: { marginTop: 8, color: '#10B981', fontSize: 15, fontWeight: '700' },
  close: {
    position: 'absolute', bottom: 36, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24,
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  titleBar: { position: 'absolute', top: 52, alignSelf: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
})
