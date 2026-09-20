import { useEffect, useState } from 'react'

/**
 * 새 버전이 배포됐는지 알려 준다.
 *
 * 화면을 켜 둔 채 작업하면 배포를 해도 브라우저는 옛 코드를 계속 쓴다.
 * `index.html`은 no-cache라 항상 최신을 받으므로, 거기 적힌 메인 스크립트가
 * 지금 화면이 쓰는 것과 다르면 새 버전이 올라간 것이다.
 *
 * 입력 중 화면이 저절로 새로고침되면 쓰던 내용이 날아가므로, 여기서는
 * 알리기만 하고 새로고침은 사용자가 직접 누르게 한다.
 */
const CHECK_INTERVAL_MS = 3 * 60 * 1000
const MAIN_SCRIPT_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/

function currentMainScript(): string | null {
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]
  for (const el of scripts) {
    const src = el.getAttribute('src') ?? ''
    const hit = src.match(MAIN_SCRIPT_RE)
    if (hit) return hit[0]
  }
  return null
}

export function useAppUpdate(): boolean {
  const [outdated, setOutdated] = useState(false)

  useEffect(() => {
    const mine = currentMainScript()
    if (!mine) return // 개발 서버 등 해시 번들이 아닌 환경에서는 확인하지 않는다
    let alive = true

    const check = async () => {
      try {
        // 쿼리를 붙여 서비스워커·브라우저 캐시를 모두 우회한다
        const res = await fetch(`/index.html?_v=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = (await res.text()).match(MAIN_SCRIPT_RE)?.[0]
        if (alive && latest && latest !== mine) setOutdated(true)
      } catch {
        /* 네트워크 문제는 무시 — 다음 주기에 다시 본다 */
      }
    }

    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  return outdated
}
