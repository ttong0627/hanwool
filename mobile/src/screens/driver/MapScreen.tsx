import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Modal, ScrollView, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import * as Location from 'expo-location'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { DeliveryCompleteModal, uploadPhoto, uploadSignature, sendMmsWithPhoto } from './HomeScreen'
import { MoveStopModal, reorderedSequences } from './MoveStopModal'

const KAKAO_JS_KEY = 'ce845cbcc568d0d47ac8b2a284873459'
const MAP_BASE_URL = 'https://ga.wssc.kr' // 카카오에 등록된 도메인 (JS 키 허용 도메인)

const T = {
  primary: '#F97316', dark: '#0F172A', bg: '#F1F5F9', card: '#FFFFFF',
  border: '#E2E8F0', text: '#0F172A', textSub: '#475569', textMuted: '#94A3B8',
  success: '#10B981', warning: '#F59E0B', info: '#3B82F6', error: '#EF4444',
}

interface Order {
  id: number; customer_name: string; dong: string; delivery_address: string
  status: string; sequence?: number; lat?: number; lng?: number
  customer_phone?: string; items_desc?: string; quantity?: number
  detail_address?: string | null; item_code?: string | null; request?: string | null
}

function openKakaoNavi(address: string) {
  Linking.openURL(`kakaomap://route?ep=${encodeURIComponent(address)}&by=CAR`).catch(() =>
    Linking.openURL(`https://map.kakao.com/link/to/${encodeURIComponent(address)}`),
  )
}

/* 카카오맵 HTML — 배송지 순번 핀 + 기사 트럭(window.setMe로 갱신, 지도 리로드 없음) */
function buildMapHtml(initialLoc: { lat: number; lng: number } | null, orders: Order[]): string {
  const valid = orders.filter((o) => o.lat != null && o.lng != null)
  const center = initialLoc || valid[0] || { lat: 37.4090, lng: 127.2574 }
  const markers = JSON.stringify(
    valid.map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, seq: o.sequence ?? 0, done: o.status === 'delivered' })),
  )
  const myJson = initialLoc ? JSON.stringify(initialLoc) : 'null'
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;overflow:hidden}
.pin{width:30px;height:30px;border-radius:50%;background:#F97316;color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.pin.done{background:#10B981}
.truck{width:38px;height:38px;border-radius:50%;background:#fff;border:3px solid #3B82F6;box-shadow:0 0 0 6px rgba(59,130,246,.25);display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1}
</style></head><body><div id="map"></div>
<script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false"></script>
<script>
var __map=null,__me=null,__pending=null;
// RN에서 호출 — 트럭 마커 생성/이동 (지도 리로드 없이 위치만 갱신)
window.setMe=function(lat,lng){
  if(!__map){__pending={lat:lat,lng:lng};return;}
  var pos=new kakao.maps.LatLng(lat,lng);
  if(!__me){
    __me=new kakao.maps.CustomOverlay({position:pos,content:'<div class="truck">🚚</div>',yAnchor:0.5,zIndex:10});
    __me.setMap(__map);
  } else { __me.setPosition(pos); }
};
// RN에서 호출 — 내 위치로 지도 이동
window.panToMe=function(lat,lng){ if(__map){__map.panTo(new kakao.maps.LatLng(lat,lng));} };
window.sel=function(id){ if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage('stop:'+id);} };
kakao.maps.load(function(){
  var center=new kakao.maps.LatLng(${center.lat},${center.lng});
  var map=new kakao.maps.Map(document.getElementById('map'),{center:center,level:5});
  __map=map;
  var orders=${markers};
  var bounds=new kakao.maps.LatLngBounds();
  orders.forEach(function(o){
    var pos=new kakao.maps.LatLng(o.lat,o.lng);
    var el='<div class="pin'+(o.done?' done':'')+'" onclick="sel('+o.id+')">'+o.seq+'</div>';
    new kakao.maps.CustomOverlay({position:pos,content:el,yAnchor:0.5,clickable:true}).setMap(map);
    bounds.extend(pos);
  });
  var my=${myJson};
  if(my){ window.setMe(my.lat,my.lng); bounds.extend(new kakao.maps.LatLng(my.lat,my.lng)); }
  if(orders.length>0){ map.setBounds(bounds); }
  if(__pending){ window.setMe(__pending.lat,__pending.lng); __pending=null; }
});
</script></body></html>`
}

function DetailRow({ icon, label, value, color }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={16} color={color ?? T.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.detailLabel}>{label}</Text>
        <Text style={[s.detailValue, color ? { color } : null]}>{value || '-'}</Text>
      </View>
    </View>
  )
}

function StopDetailModal({ order, onClose, onComplete, onMove }: { order: Order | null; onClose: () => void; onComplete: () => void; onMove: () => void }) {
  const insets = useSafeAreaInsets()
  if (!order) return null
  const addr = `${order.delivery_address ?? ''}${order.detail_address ? ` ${order.detail_address}` : ''}`.trim()
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.detailOverlay}>
        <View style={[s.detailSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.detailHandle} />
          <View style={s.detailHeader}>
            <View style={s.stopSeq}><Text style={s.stopSeqText}>{order.sequence ?? '-'}</Text></View>
            <Text style={s.detailName}>{order.customer_name} · {order.dong}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={T.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 14, paddingTop: 6 }}>
            <DetailRow icon="location-outline" label="배송지" value={addr || order.dong} />
            <DetailRow icon="cube-outline" label="물품"
              value={`${order.items_desc ?? '-'} · ${order.quantity ?? 1}개${order.item_code ? `  (코드: ${order.item_code})` : ''}`} />
            {order.request ? <DetailRow icon="chatbox-ellipses-outline" label="요청사항" value={order.request} color={T.primary} /> : null}
          </ScrollView>

          <View style={s.detailActions}>
            {order.customer_phone ? (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: T.info }]} activeOpacity={0.85}
                onPress={() => Linking.openURL(`tel:${order.customer_phone}`)}>
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={s.actionText}>전화</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: T.primary }]} activeOpacity={0.85}
              onPress={() => openKakaoNavi(order.delivery_address)}>
              <Ionicons name="navigate" size={18} color="#fff" />
              <Text style={s.actionText}>카카오내비</Text>
            </TouchableOpacity>
          </View>

          {order.status !== 'delivered' && (
            <View style={[s.detailActions, { marginTop: 10 }]}>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: T.textSub, flex: 0.7 }]} activeOpacity={0.85} onPress={onMove}>
                <Ionicons name="swap-vertical" size={18} color="#fff" />
                <Text style={s.actionText}>순서 이동</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: T.success }]} activeOpacity={0.85} onPress={onComplete}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={s.actionText}>배송완료하기</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

export function DriverMapScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [, setMyLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [completeTarget, setCompleteTarget] = useState<Order | null>(null)
  const [moveTarget, setMoveTarget] = useState<Order | null>(null)
  const qc = useQueryClient()
  const webRef = useRef<WebView>(null)
  const myLocRef = useRef<{ lat: number; lng: number } | null>(null)
  const watchRef = useRef<Location.LocationSubscription | null>(null)

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['driver-route', 'A'],
    queryFn: () => api.get('/deliveries/route', { params: { route_mode: 'A' } }).then((r) => r.data),
    staleTime: 30_000,
  })

  // 트럭 위치를 WebView에 주입 (지도 리로드 없이 위치만 이동)
  const pushMe = useCallback((lat: number, lng: number) => {
    webRef.current?.injectJavaScript(`window.setMe && window.setMe(${lat},${lng}); true;`)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync()
        if (perm.status !== 'granted' && perm.canAskAgain) {
          perm = await Location.requestForegroundPermissionsAsync()
        }
        if (perm.status !== 'granted') {
          Alert.alert(
            '위치 권한 필요',
            '내 위치를 지도에 표시하려면 위치 권한이 필요합니다.\n설정 > 애플리케이션 > 경안시장 배송 > 권한에서 "위치"를 허용해 주세요.',
            [{ text: '확인' }, { text: '설정 열기', onPress: () => Linking.openSettings() }],
          )
          return
        }
        // 1) 마지막 위치 우선(즉시 표시)
        const last = await Location.getLastKnownPositionAsync()
        if (last && !cancelled) {
          const p = { lat: last.coords.latitude, lng: last.coords.longitude }
          myLocRef.current = p; setMyLoc(p); pushMe(p.lat, p.lng)
        }
        // 2) 실시간 추적 (트럭이 기사를 따라 이동)
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
          (loc) => {
            if (cancelled) return
            const p = { lat: loc.coords.latitude, lng: loc.coords.longitude }
            myLocRef.current = p; setMyLoc(p); pushMe(p.lat, p.lng)
          },
        )
      } catch { /* 위치 실패 무시 */ }
    })()
    return () => {
      cancelled = true
      watchRef.current?.remove()
      watchRef.current = null
    }
  }, [pushMe])

  const sorted = useMemo(
    () => [...orders].sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999)),
    [orders],
  )
  const nextStops = sorted.filter((o) => o.status !== 'delivered').slice(0, 3)
  // html은 주문(sorted)에만 의존 — GPS 갱신 시 리로드되지 않도록 myLoc 제외(초기값만 ref로 전달)
  const html = useMemo(() => buildMapHtml(myLocRef.current, sorted), [sorted])

  const handleComplete = async (order: Order, uri: string, lat?: number, lng?: number, force?: boolean, sig?: string | null) => {
    setCompleteTarget(null)
    try { await uploadPhoto(order.id, uri, lat, lng, force) } catch { /* 업로드 실패해도 완료 진행 */ }
    if (sig) { try { await uploadSignature(order.id, sig) } catch { /* 서명 실패 무시 */ } }
    try {
      const data = await api.put(`/orders/${order.id}/status`, null, { params: { status: 'delivered' } }).then((r) => r.data)
      if (data?.sms_to && data?.sms_message) await sendMmsWithPhoto(data.sms_to, data.sms_message, uri)
    } catch { Alert.alert('오류', '배달 완료 처리 중 문제가 발생했습니다.') }
    qc.invalidateQueries({ queryKey: ['driver-route', 'A'] })
  }

  const handleMoveSelect = (newIndex: number) => {
    if (!moveTarget) return
    const active = sorted.filter((o) => o.status !== 'delivered')
    const deliveredCount = orders.filter((o) => o.status === 'delivered').length
    const seqs = reorderedSequences(active, moveTarget.id, newIndex, deliveredCount)
    setMoveTarget(null)
    if (seqs.length) {
      api.put('/orders/resequence', { sequences: seqs })
        .then(() => qc.invalidateQueries({ queryKey: ['driver-route', 'A'] }))
        .catch(() => Alert.alert('오류', '순서 변경에 실패했습니다.'))
    }
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>배송 지도</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.mapWrap}>
        {isLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={T.primary} /></View>
        ) : (
          <WebView
            ref={webRef}
            source={{ html, baseUrl: MAP_BASE_URL }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            onLoadEnd={() => { const p = myLocRef.current; if (p) pushMe(p.lat, p.lng) }}
            onMessage={(e) => {
              const d = e.nativeEvent.data
              if (d && d.indexOf('stop:') === 0) {
                const found = orders.find((x) => x.id === Number(d.slice(5)))
                if (found) setDetailOrder(found)
              }
            }}
          />
        )}

        {/* 내 위치로 이동 버튼 */}
        <TouchableOpacity
          style={s.myLocBtn}
          activeOpacity={0.85}
          onPress={() => {
            const p = myLocRef.current
            if (!p) { Alert.alert('위치 확인 중', 'GPS 위치를 받는 중입니다. 잠시 후 다시 시도해 주세요.'); return }
            webRef.current?.injectJavaScript(`window.panToMe && window.panToMe(${p.lat},${p.lng}); true;`)
          }}
        >
          <Ionicons name="locate" size={20} color={T.primary} />
        </TouchableOpacity>
      </View>

      {/* 하단: 다음 배송지 3곳 — 탭하면 상세 */}
      <View style={[s.bottomSheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={s.sheetTitle}>다음 배송지 {nextStops.length > 0 ? `(${nextStops.length})` : ''}</Text>
        {nextStops.length === 0 ? (
          <Text style={s.sheetEmpty}>남은 배송지가 없습니다</Text>
        ) : (
          nextStops.map((o) => (
            <TouchableOpacity key={o.id} style={s.stopRow} activeOpacity={0.7} onPress={() => setDetailOrder(o)}>
              <View style={s.stopSeq}><Text style={s.stopSeqText}>{o.sequence ?? '-'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.stopName}>{o.customer_name} · {o.dong}</Text>
                <Text style={s.stopAddr} numberOfLines={1}>{o.delivery_address}</Text>
              </View>
              <TouchableOpacity style={s.naviBtn} onPress={() => openKakaoNavi(o.delivery_address)}>
                <Ionicons name="navigate" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </View>

      <StopDetailModal
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
        onComplete={() => { setCompleteTarget(detailOrder); setDetailOrder(null) }}
        onMove={() => { setMoveTarget(detailOrder); setDetailOrder(null) }}
      />
      {completeTarget && (
        <DeliveryCompleteModal
          order={completeTarget}
          onConfirm={(uri, lat, lng, force, sig) => handleComplete(completeTarget, uri, lat, lng, force, sig)}
          onCancel={() => setCompleteTarget(null)}
        />
      )}
      {moveTarget && (
        <MoveStopModal
          stop={moveTarget}
          activeOrders={sorted.filter((o) => o.status !== 'delivered')}
          onSelect={handleMoveSelect}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.dark },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.dark, paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  mapWrap: { flex: 1, backgroundColor: '#E5E7EB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  myLocBtn: {
    position: 'absolute', right: 14, bottom: 14, width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5, elevation: 4,
  },

  bottomSheet: { backgroundColor: T.card, paddingHorizontal: 16, paddingTop: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 8 },
  sheetTitle: { fontSize: 14, fontWeight: '800', color: T.text, marginBottom: 2 },
  sheetEmpty: { fontSize: 13, color: T.textMuted, paddingVertical: 8 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.bg, borderRadius: 12, padding: 10 },
  stopSeq: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  stopSeqText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  stopName: { fontSize: 14, fontWeight: '700', color: T.text },
  stopAddr: { fontSize: 12, color: T.textSub, marginTop: 1 },
  naviBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },

  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailSheet: { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  detailHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  detailName: { flex: 1, fontSize: 18, fontWeight: '800', color: T.text },
  detailRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  detailLabel: { fontSize: 11.5, color: T.textMuted, fontWeight: '700', marginBottom: 2 },
  detailValue: { fontSize: 15, color: T.text, fontWeight: '600', lineHeight: 21 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
