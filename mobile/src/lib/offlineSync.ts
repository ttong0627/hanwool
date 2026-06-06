import api from './api'
import { listCompletions, removeCompletion, CompletionJob } from './offlineQueue'

// 오프라인 큐에 쌓인 배송완료를 서버에 전송한다.
// 사진 업로드 → (서명) → 상태 delivered 순서로 재생하고, 성공하면 큐에서 제거한다.
// 네트워크 실패면 큐를 유지하고 중단해(다음 트리거에서 재시도) 배터리·요청 낭비를 막는다.

let syncing = false

async function flushOne(job: CompletionJob): Promise<boolean> {
  try {
    const fd = new FormData()
    fd.append('file', { uri: job.photoPath, name: 'delivery.jpg', type: 'image/jpeg' } as unknown as Blob)
    if (job.podLat != null) fd.append('pod_lat', String(job.podLat))
    if (job.podLng != null) fd.append('pod_lng', String(job.podLng))
    if (job.force) fd.append('force', 'true')
    await api.post(`/orders/${job.orderId}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })

    if (job.signatureBase64) {
      try { await api.post(`/orders/${job.orderId}/signature`, { image_base64: job.signatureBase64 }) } catch { /* 서명 실패는 완료에 영향 없음 */ }
    }

    await api.put(`/orders/${job.orderId}/status`, null, { params: { status: 'delivered' } })
    await removeCompletion(job.orderId)
    return true
  } catch {
    return false
  }
}

/** 큐 전체 전송 시도. 반환: 전송 성공 건수와 남은 건수. */
export async function syncCompletions(): Promise<{ done: number; remaining: number }> {
  if (syncing) {
    return { done: 0, remaining: (await listCompletions()).length }
  }
  syncing = true
  let done = 0
  try {
    const jobs = await listCompletions()
    for (const job of jobs) {
      const ok = await flushOne(job)
      if (ok) done += 1
      else break // 한 건 실패 = 오프라인 추정 → 중단하고 다음 기회에 재시도
    }
  } finally {
    syncing = false
  }
  return { done, remaining: (await listCompletions()).length }
}
