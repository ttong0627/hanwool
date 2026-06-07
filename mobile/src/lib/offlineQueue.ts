import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'

// 오프라인 배송완료(POD) 영구 큐.
// 네트워크가 끊긴 상태에서 기사가 '배달 완료'를 하면 사진을 기기에 영구 저장하고
// 완료 작업을 큐에 쌓아둔다. 인터넷이 연결되면 offlineSync가 순서대로 서버에 전송한다.

const QUEUE_KEY = 'offline_completion_queue_v1'
const POD_DIR = `${FileSystem.documentDirectory ?? ''}pod_queue/`

export interface CompletionJob {
  orderId: number
  orderNo: string
  photoPath: string            // 기기에 영구 저장된 완료 사진 경로 (앱 재시작에도 유지)
  signatureBase64?: string | null
  podLat?: number
  podLng?: number
  force?: boolean
  memo?: string | null         // 배송 메모
  receivedBySecurity?: boolean // 경비실 수령
  photoUploaded?: boolean      // 사진 업로드 성공 표시(상태 전송 실패 후 재시도 시 중복 업로드 방지)
  queuedAt: number
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(POD_DIR)
    if (!info.exists) await FileSystem.makeDirectoryAsync(POD_DIR, { intermediates: true })
  } catch {
    /* 디렉터리 생성 실패는 copy 단계에서 다시 처리 */
  }
}

/** 캐시 영역의 사진을 영구 영역으로 복사해 앱 재시작에도 사라지지 않게 한다. */
export async function persistPhoto(orderId: number, srcUri: string): Promise<string> {
  await ensureDir()
  const dest = `${POD_DIR}${orderId}_${Date.now()}.jpg`
  await FileSystem.copyAsync({ from: srcUri, to: dest })
  return dest
}

async function readQueue(): Promise<CompletionJob[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeQueue(jobs: CompletionJob[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(jobs))
  } catch {
    /* 저장 실패는 무시 — 다음 기회에 다시 시도 */
  }
}

/** 같은 주문은 1건만 유지(중복 방지) 후 큐에 추가. */
export async function enqueueCompletion(job: CompletionJob): Promise<void> {
  const jobs = await readQueue()
  const others = jobs.filter((j) => j.orderId !== job.orderId)
  others.push(job)
  await writeQueue(others)
}

export async function listCompletions(): Promise<CompletionJob[]> {
  return readQueue()
}

/** 사진 업로드 성공을 큐에 영구 표시 — 상태 전송 실패 후 재시도 때 사진 중복 업로드 방지. */
export async function markPhotoUploaded(orderId: number): Promise<void> {
  const jobs = await readQueue()
  await writeQueue(jobs.map((j) => (j.orderId === orderId ? { ...j, photoUploaded: true } : j)))
}

export async function removeCompletion(orderId: number): Promise<void> {
  const jobs = await readQueue()
  const target = jobs.find((j) => j.orderId === orderId)
  if (target?.photoPath) {
    try { await FileSystem.deleteAsync(target.photoPath, { idempotent: true }) } catch { /* ignore */ }
  }
  await writeQueue(jobs.filter((j) => j.orderId !== orderId))
}

export async function queueCount(): Promise<number> {
  return (await readQueue()).length
}
