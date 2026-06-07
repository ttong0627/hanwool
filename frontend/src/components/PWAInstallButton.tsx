import { useEffect, useState } from 'react'
import { Download, X, Share } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'hanwool-pwa-dismissed'

function checkStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * "홈 화면에 추가" 설치 배너 (PWA)
 * - 안드로이드/크롬: beforeinstallprompt → 네이티브 설치
 * - iOS 사파리: 수동 안내 모달(공유 → 홈 화면에 추가)
 * - 이미 설치(standalone)했거나 사용자가 닫으면 표시 안 함
 */
export function PWAInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [showGuide, setShowGuide] = useState(false)
  const [standalone] = useState(checkStandalone)

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (standalone || dismissed) return null
  // 안드로이드/크롬은 설치 프롬프트가 준비됐을 때만, iOS는 항상(수동 안내) 노출
  if (!deferred && !isIOS()) return null

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'dismissed') {
        localStorage.setItem(DISMISS_KEY, '1')
        setDismissed(true)
      }
      setDeferred(null)
    } else {
      setShowGuide(true)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-2xl ring-1 ring-black/5">
          <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">홈 화면에 추가</p>
            <p className="text-xs text-gray-500">앱처럼 바로 열 수 있어요</p>
          </div>
          <button
            onClick={handleInstall}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white active:bg-orange-600"
          >
            <Download className="h-4 w-4" /> 설치
          </button>
          <button onClick={handleDismiss} aria-label="닫기" className="shrink-0 p-1 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showGuide && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Share className="mx-auto h-10 w-10 text-orange-500" />
            <h3 className="mt-3 text-lg font-bold text-gray-900">홈 화면에 추가하기</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Safari 하단의 <b>공유 버튼</b>을 누른 뒤
              <br />
              <b>"홈 화면에 추가"</b>를 선택하세요.
            </p>
            <button
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-orange-500 py-3 font-bold text-white"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  )
}
