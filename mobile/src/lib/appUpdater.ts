import * as FileSystem from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import { Platform } from 'react-native'

// 앱 내부 캐시에 받는 업데이트 APK 파일명(고정 — 매번 덮어씀)
const APK_FILENAME = 'hanwool-driver-update.apk'

/** 버전 비교: a가 b보다 높으면 true (semver x.y.z) */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

/**
 * 최신 APK를 앱 안에서 직접 내려받아 설치 화면을 띄운다 (안드로이드 전용).
 * - onProgress: 0~1 다운로드 진행률 콜백
 *
 * 안드로이드 보안 정책상 '완전 무인 설치'는 일반 앱에서 불가능하다.
 * 따라서 마지막 '설치' 확인 1회는 사용자가 눌러야 하며,
 * REQUEST_INSTALL_PACKAGES 권한이 꺼져 있으면 시스템이
 * '이 앱의 설치 허용' 설정으로 자동 안내한다(최초 1회만).
 */
export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('앱 내 자동 설치는 안드로이드에서만 지원됩니다.')
  }

  const dest = `${FileSystem.cacheDirectory}${APK_FILENAME}`

  // 이전 다운로드 잔여물 제거 (용량 누수·캐시 오염 방지)
  await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})

  // 캐시버스터로 항상 최신 APK 보장 (CDN/프록시 캐시 회피)
  const url = `${apkUrl}${apkUrl.includes('?') ? '&' : '?'}t=${Date.now()}`

  const task = FileSystem.createDownloadResumable(url, dest, {}, (p) => {
    const total = p.totalBytesExpectedToWrite
    if (total > 0) onProgress(Math.min(1, p.totalBytesWritten / total))
  })

  const result = await task.downloadAsync()
  if (!result?.uri) {
    throw new Error('업데이트 파일을 받지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }

  // file:// → content:// (Android 7+ FileProvider 필수)
  const contentUri = await FileSystem.getContentUriAsync(result.uri)

  // 설치 화면 실행. FLAG_GRANT_READ_URI_PERMISSION(=1)로 설치관리자에 읽기 권한 부여.
  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    flags: 1,
  })
}
