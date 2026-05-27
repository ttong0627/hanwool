import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, CameraOff, CheckCircle, AlertCircle, QrCode } from 'lucide-react'
import type { StagingRow } from './types'
import { EMPTY_ROW, DONG_LIST } from './types'

interface Props {
  onAdd: (row: StagingRow) => void
}

type ScanState = 'idle' | 'scanning' | 'paused'

function parseQrData(raw: string): Partial<StagingRow> | null {
  try {
    // JSON 형식
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        customer_name: parsed.name ?? parsed.customer_name ?? '',
        customer_phone: parsed.phone ?? parsed.customer_phone ?? '',
        dong: DONG_LIST.includes(parsed.dong) ? parsed.dong : '경안동',
        delivery_address: parsed.address ?? parsed.delivery_address ?? '',
        items_desc: parsed.items ?? parsed.items_desc ?? '',
        quantity: Number(parsed.qty ?? parsed.quantity ?? 1),
        request: parsed.request ?? '',
        weight_estimate: parsed.weight ?? parsed.weight_estimate ?? '',
      }
    }
  } catch {
    // CSV 형식: 이름,전화번호,주소,동,물품,수량
    const parts = raw.split(/[,\t]/).map((s) => s.trim())
    if (parts.length >= 3) {
      return {
        customer_name: parts[0] ?? '',
        customer_phone: parts[1] ?? '',
        delivery_address: parts[2] ?? '',
        dong: DONG_LIST.includes(parts[3] as never) ? parts[3] : '경안동',
        items_desc: parts[4] ?? '',
        quantity: Number(parts[5] ?? 1) || 1,
      }
    }
  }
  return null
}

export function QrTab({ onAdd }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [scannedRows, setScannedRows] = useState<StagingRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<StagingRow> | null>(null)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanState('idle')
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setScanState('scanning')
    } catch {
      setError('카메라 접근 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.')
    }
  }, [])

  // requestAnimationFrame loop — jsQR decode
  useEffect(() => {
    if (scanState !== 'scanning') return

    let active = true
    const tick = async () => {
      if (!active || !videoRef.current || !canvasRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return }

      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Dynamic import so jsqr doesn't block initial render
      const { default: jsQR } = await import('jsqr')
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code && code.data !== lastResult) {
        setLastResult(code.data)
        const parsed = parseQrData(code.data)
        if (parsed) {
          setScanState('paused')
          setForm(parsed)
        }
      }

      if (active) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { active = false; cancelAnimationFrame(rafRef.current) }
  }, [scanState, lastResult])

  useEffect(() => () => stopCamera(), [stopCamera])

  const confirmAdd = () => {
    if (!form) return
    const row: StagingRow = { ...EMPTY_ROW(), ...form, addrStatus: 'idle' }
    setScannedRows((prev) => [row, ...prev])
    onAdd(row)
    setForm(null)
    setLastResult(null)
    setScanState('scanning')
  }

  const skipScan = () => {
    setForm(null)
    setLastResult(null)
    setScanState('scanning')
  }

  return (
    <div className="space-y-4">
      {/* 카메라 뷰 */}
      <div className="relative bg-gray-900 rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3', maxHeight: 380 }}>
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />

        {/* 스캔 오버레이 */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-52 h-52">
              <div className="absolute inset-0 border-2 border-brand-400 rounded-lg opacity-80" />
              {/* 코너 마커 */}
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-brand-400 ${cls}`} />
              ))}
              {/* 스캔 라인 */}
              <div className="absolute left-0 right-0 h-0.5 bg-brand-400 opacity-70 animate-bounce" style={{ top: '50%' }} />
            </div>
            <p className="absolute bottom-4 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
              QR 코드를 네모 안에 맞춰주세요
            </p>
          </div>
        )}

        {/* idle 상태 */}
        {scanState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <QrCode className="w-16 h-16 text-gray-500" />
            <p className="text-gray-400 text-sm">카메라를 시작하면 QR 코드를 스캔합니다</p>
          </div>
        )}

        {/* 인식 완료 오버레이 */}
        {scanState === 'paused' && form && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
              <div className="flex items-center gap-2 text-green-600 font-bold">
                <CheckCircle className="w-5 h-5" />
                QR 인식 완료
              </div>
              <div className="text-sm space-y-1 bg-gray-50 rounded-xl p-3">
                {form.customer_name && <div><span className="text-gray-400">이름</span> <strong>{form.customer_name}</strong></div>}
                {form.customer_phone && <div><span className="text-gray-400">전화</span> <strong>{form.customer_phone}</strong></div>}
                {form.delivery_address && <div><span className="text-gray-400">주소</span> <strong className="text-xs">{form.delivery_address}</strong></div>}
                {form.dong && <div><span className="text-gray-400">동</span> <strong>{form.dong}</strong></div>}
              </div>
              <div className="flex gap-2">
                <button onClick={skipScan} className="btn-secondary flex-1 text-sm py-2">다시 스캔</button>
                <button onClick={confirmAdd} className="btn-primary flex-1 text-sm py-2">추가</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 카메라 컨트롤 */}
      <div className="flex gap-3">
        {scanState === 'idle' ? (
          <button onClick={startCamera} className="btn-primary flex items-center gap-2 flex-1 justify-center py-3">
            <Camera className="w-4 h-4" />
            카메라 시작
          </button>
        ) : (
          <button onClick={stopCamera} className="btn-secondary flex items-center gap-2 flex-1 justify-center py-3">
            <CameraOff className="w-4 h-4" />
            카메라 중지
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 스캔 이력 */}
      {scannedRows.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 font-medium mb-2">이번 세션 스캔 목록 ({scannedRows.length}건)</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {scannedRows.map((r) => (
              <div key={r._id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span className="font-medium">{r.customer_name}</span>
                <span className="text-gray-400">{r.customer_phone}</span>
                <span className="ml-auto text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">{r.dong}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
