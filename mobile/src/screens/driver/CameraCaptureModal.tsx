import React, { useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Vibration } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import * as ImageManipulator from 'expo-image-manipulator'
import { WebView } from 'react-native-webview'

/**
 * 배송 완료 사진 촬영 오버레이 — 후면(back) 카메라 강제.
 * 촬영 후 흐림(초점) 검사: 라플라시안 분산이 임계값 미만이면 경고음+진동 후 다시 촬영.
 * 선명하면 onCaptured(uri). 취소 시 onCancel.
 */

// 라플라시안 분산 임계값(보수적 — 명백한 흐림만 거부). 현장 테스트로 미세조정.
const BLUR_THRESHOLD = 55

function buildBlurHtml(b64: string, threshold: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
  function post(m){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(String(m)); }
  function beep(){ try{ var a=new (window.AudioContext||window.webkitAudioContext)(); var o=a.createOscillator(); var g=a.createGain(); o.type='square'; o.frequency.value=880; o.connect(g); g.connect(a.destination); g.gain.value=0.25; o.start(); setTimeout(function(){ o.stop(); if(a.close) a.close(); },350);}catch(e){} }
  var img=new Image();
  img.onload=function(){
    try{
      var W=img.width,H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0,W,H);
      var d=ctx.getImageData(0,0,W,H).data;
      var gr=new Float64Array(W*H);
      for(var i=0;i<W*H;i++){ gr[i]=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]; }
      var s=0,s2=0,n=0;
      for(var y=1;y<H-1;y++){ for(var x=1;x<W-1;x++){ var k=y*W+x; var lap=gr[k-1]+gr[k+1]+gr[k-W]+gr[k+W]-4*gr[k]; s+=lap; s2+=lap*lap; n++; } }
      var mean=s/n; var v=s2/n-mean*mean;
      if(v < ${threshold}) beep();
      post(Math.round(v));
    }catch(e){ post('ERR'); }
  };
  img.onerror=function(){ post('ERR'); };
  img.src='data:image/jpeg;base64,${b64}';
  </script></body></html>`
}

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
  const [pendingUri, setPendingUri] = useState<string | null>(null)
  const [checkB64, setCheckB64] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!visible) return null

  const accept = (uri: string) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setCheckB64(null); setPendingUri(null); setAttempts(0); setBusy(false)
    onCaptured(uri)
  }

  const shoot = async () => {
    if (busy || !cameraRef.current) return
    setBusy(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false })
      if (!photo?.uri) { setBusy(false); return }
      // 흐림 검사용 축소본(base64)
      let b64: string | null = null
      try {
        const small = await ImageManipulator.manipulateAsync(
          photo.uri, [{ resize: { width: 400 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        )
        b64 = small.base64 ?? null
      } catch { b64 = null }
      if (!b64) { accept(photo.uri); return } // 분석 불가 시 통과(차단 방지)
      setPendingUri(photo.uri)
      setCheckB64(b64) // WebView 마운트 → 자동 분석
      // 실패 안전장치: 5초 내 결과 없으면 통과
      timerRef.current = setTimeout(() => accept(photo.uri), 5000)
    } catch {
      setBusy(false)
    }
  }

  const onBlurResult = (e: { nativeEvent: { data: string } }) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const score = Number(e.nativeEvent.data)
    setCheckB64(null)
    const uri = pendingUri
    if (!isNaN(score) && score >= BLUR_THRESHOLD) {
      if (uri) accept(uri)
      else setBusy(false)
      return
    }
    // 흐림(또는 ERR) — 다시 촬영 유도
    setBusy(false)
    setAttempts((a) => a + 1)
    Vibration.vibrate(350)
    Alert.alert('사진이 흐립니다', '현관문과 배달한 물품이 선명하게 보이도록 다시 촬영해 주세요.')
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

          {attempts >= 3 && pendingUri && !busy && (
            <TouchableOpacity style={s.forceBtn} activeOpacity={0.85} onPress={() => { if (pendingUri) accept(pendingUri) }}>
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

          {checkB64 && (
            <WebView
              source={{ html: buildBlurHtml(checkB64, BLUR_THRESHOLD) }}
              onMessage={onBlurResult}
              style={s.analyzer}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              mediaPlaybackRequiresUserAction={false}
            />
          )}
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
  analyzer: { position: 'absolute', width: 1, height: 1, opacity: 0 },
})
