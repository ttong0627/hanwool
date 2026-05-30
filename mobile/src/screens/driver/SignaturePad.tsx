import { Modal, View, StyleSheet, Alert } from 'react-native'
import { WebView } from 'react-native-webview'

/**
 * 수령인 서명 입력 — react-native-webview 안의 자체 HTML 캔버스(새 의존성 없음).
 * 저장 시 흰 배경 합성 PNG의 base64만 postMessage. 취소/빈서명도 메시지로 구분.
 */
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
  html, body { height:100%; background:#0f172a; font-family:-apple-system, Roboto, sans-serif; }
  .wrap { display:flex; flex-direction:column; height:100%; }
  .head { color:#fff; text-align:center; padding:14px; font-size:16px; font-weight:700; }
  .box { flex:1; margin:0 12px; background:#fff; border-radius:12px; position:relative; overflow:hidden; }
  canvas { width:100%; height:100%; touch-action:none; display:block; }
  .hint { position:absolute; top:50%; left:0; right:0; transform:translateY(-50%); text-align:center; color:#cbd5e1; font-size:18px; pointer-events:none; }
  .btns { display:flex; gap:10px; padding:14px 12px; }
  button { flex:1; padding:16px 0; border:none; border-radius:12px; font-size:17px; font-weight:700; }
  .cancel { background:#475569; color:#e2e8f0; }
  .clear { background:#334155; color:#e2e8f0; }
  .save { background:#f97316; color:#fff; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">수령인 서명을 받아주세요</div>
  <div class="box"><canvas id="pad"></canvas><div class="hint" id="hint">여기에 손가락으로 서명</div></div>
  <div class="btns">
    <button class="cancel" onclick="post('CANCEL')">취소</button>
    <button class="clear" onclick="clearPad()">지우기</button>
    <button class="save" onclick="save()">저장</button>
  </div>
</div>
<script>
  var c = document.getElementById('pad'), hint = document.getElementById('hint'), ctx = c.getContext('2d');
  var drawing = false, dirty = false, last = null;
  function setup() {
    var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
  }
  function pos(e) { var r = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; }
  function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
  function move(e) { if (!drawing) return; e.preventDefault(); var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; if (!dirty) { dirty = true; hint.style.display = 'none'; } }
  function end() { drawing = false; }
  c.addEventListener('touchstart', start, { passive:false });
  c.addEventListener('touchmove', move, { passive:false });
  c.addEventListener('touchend', end);
  c.addEventListener('mousedown', start);
  c.addEventListener('mousemove', move);
  c.addEventListener('mouseup', end);
  function clearPad() { ctx.clearRect(0, 0, c.width, c.height); dirty = false; hint.style.display = ''; }
  function post(m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(m); }
  function save() {
    if (!dirty) { post('EMPTY'); return; }
    var out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
    var o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height); o.drawImage(c, 0, 0);
    post(out.toDataURL('image/png').replace(/^data:image\\/png;base64,/, ''));
  }
  setup();
</script>
</body>
</html>`

export function SignaturePad({ visible, onSave, onCancel }: {
  visible: boolean
  onSave: (base64: string) => void
  onCancel: () => void
}) {
  if (!visible) return null
  const onMessage = (e: { nativeEvent: { data: string } }) => {
    const data = e.nativeEvent.data
    if (data === 'CANCEL') { onCancel(); return }
    if (data === 'EMPTY') { Alert.alert('서명 없음', '서명을 입력한 뒤 저장해 주세요.'); return }
    onSave(data)
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={s.wrap}>
        <WebView
          originWhitelist={['*']}
          source={{ html: HTML }}
          onMessage={onMessage}
          style={s.web}
          scrollEnabled={false}
        />
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a' },
  web: { flex: 1, backgroundColor: '#0f172a' },
})
