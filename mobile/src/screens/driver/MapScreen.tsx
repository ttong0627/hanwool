import { useMemo, useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import * as Location from 'expo-location'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

const KAKAO_JS_KEY = 'ce845cbcc568d0d47ac8b2a284873459'
const MAP_BASE_URL = 'https://ga.wssc.kr' // 카카오에 등록된 도메인 (JS 키 허용 도메인)

const T = {
  primary: '#F97316', dark: '#0F172A', bg: '#F1F5F9', card: '#FFFFFF',
  border: '#E2E8F0', text: '#0F172A', textSub: '#475569', textMuted: '#94A3B8',
  success: '#10B981', warning: '#F59E0B',
}

interface Order {
  id: number; customer_name: string; dong: string; delivery_address: string
  status: string; sequence?: number; lat?: number; lng?: number
}

function openKakaoNavi(address: string) {
  Linking.openURL(`kakaomap://route?ep=${encodeURIComponent(address)}&by=CAR`).catch(() =>
    Linking.openURL(`https://map.kakao.com/link/to/${encodeURIComponent(address)}`),
  )
}

/* 카카오맵 HTML — 배송지 순번 핀 + 기사 위치 */
function buildMapHtml(myLoc: { lat: number; lng: number } | null, orders: Order[]): string {
  const valid = orders.filter((o) => o.lat != null && o.lng != null)
  const center = myLoc || valid[0] || { lat: 37.4090, lng: 127.2574 }
  const markers = JSON.stringify(
    valid.map((o) => ({ lat: o.lat, lng: o.lng, seq: o.sequence ?? 0, done: o.status === 'delivered' })),
  )
  const myJson = myLoc ? JSON.stringify(myLoc) : 'null'
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;overflow:hidden}
.pin{width:30px;height:30px;border-radius:50%;background:#F97316;color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.pin.done{background:#10B981}
.me{width:18px;height:18px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,.3)}
</style></head><body><div id="map"></div>
<script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false"></script>
<script>
kakao.maps.load(function(){
  var center=new kakao.maps.LatLng(${center.lat},${center.lng});
  var map=new kakao.maps.Map(document.getElementById('map'),{center:center,level:5});
  var orders=${markers};
  var bounds=new kakao.maps.LatLngBounds();
  orders.forEach(function(o){
    var pos=new kakao.maps.LatLng(o.lat,o.lng);
    var el='<div class="pin'+(o.done?' done':'')+'">'+o.seq+'</div>';
    new kakao.maps.CustomOverlay({position:pos,content:el,yAnchor:0.5}).setMap(map);
    bounds.extend(pos);
  });
  var my=${myJson};
  if(my){var mp=new kakao.maps.LatLng(my.lat,my.lng);
    new kakao.maps.CustomOverlay({position:mp,content:'<div class="me"></div>',yAnchor:0.5}).setMap(map);
    bounds.extend(mp);}
  if(orders.length>0){map.setBounds(bounds);}
});
</script></body></html>`
}

export function DriverMapScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null)
  const webRef = useRef<WebView>(null)

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['driver-route', 'A'],
    queryFn: () => api.get('/deliveries/route', { params: { route_mode: 'A' } }).then((r) => r.data),
    staleTime: 30_000,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (!cancelled) setMyLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      } catch { /* 위치 실패 무시 */ }
    })()
    return () => { cancelled = true }
  }, [])

  const sorted = useMemo(
    () => [...orders].sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999)),
    [orders],
  )
  const nextStops = sorted.filter((o) => o.status !== 'delivered').slice(0, 3)
  const html = useMemo(() => buildMapHtml(myLoc, sorted), [myLoc, sorted])

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
          />
        )}
      </View>

      {/* 하단: 다음 배송지 3곳 */}
      <View style={[s.bottomSheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={s.sheetTitle}>다음 배송지 {nextStops.length > 0 ? `(${nextStops.length})` : ''}</Text>
        {nextStops.length === 0 ? (
          <Text style={s.sheetEmpty}>남은 배송지가 없습니다</Text>
        ) : (
          nextStops.map((o) => (
            <View key={o.id} style={s.stopRow}>
              <View style={s.stopSeq}><Text style={s.stopSeqText}>{o.sequence ?? '-'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.stopName}>{o.customer_name} · {o.dong}</Text>
                <Text style={s.stopAddr} numberOfLines={1}>{o.delivery_address}</Text>
              </View>
              <TouchableOpacity style={s.naviBtn} onPress={() => openKakaoNavi(o.delivery_address)}>
                <Ionicons name="navigate" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
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

  bottomSheet: { backgroundColor: T.card, paddingHorizontal: 16, paddingTop: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 8 },
  sheetTitle: { fontSize: 14, fontWeight: '800', color: T.text, marginBottom: 2 },
  sheetEmpty: { fontSize: 13, color: T.textMuted, paddingVertical: 8 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.bg, borderRadius: 12, padding: 10 },
  stopSeq: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  stopSeqText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  stopName: { fontSize: 14, fontWeight: '700', color: T.text },
  stopAddr: { fontSize: 12, color: T.textSub, marginTop: 1 },
  naviBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
})
