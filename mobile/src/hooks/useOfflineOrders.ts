import { useEffect, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const CACHE_KEY = 'offline_driver_orders'
const CACHE_TS_KEY = 'offline_driver_orders_ts'
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24시간

export interface CachedOrder {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  status: string
  dong: string
  delivery_address: string
  items_desc?: string
  quantity: number
  sequence?: number
  delivery_photo_url?: string
}

export async function saveOrdersToCache(orders: CachedOrder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(orders))
    await AsyncStorage.setItem(CACHE_TS_KEY, Date.now().toString())
  } catch {
    // 저장 실패는 무시 (오프라인 캐시는 보조 수단)
  }
}

export async function loadOrdersFromCache(): Promise<CachedOrder[] | null> {
  try {
    const ts = await AsyncStorage.getItem(CACHE_TS_KEY)
    if (!ts) return null
    if (Date.now() - Number(ts) > MAX_AGE_MS) return null

    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function clearOrdersCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([CACHE_KEY, CACHE_TS_KEY])
  } catch { /* ignore */ }
}

/* 쿼리 결과를 자동으로 캐시에 저장하는 훅 */
export function useAutoSaveCache(orders: CachedOrder[] | undefined) {
  const prevRef = useRef<string>('')

  useEffect(() => {
    if (!orders || orders.length === 0) return
    const serialized = JSON.stringify(orders)
    if (serialized === prevRef.current) return
    prevRef.current = serialized
    saveOrdersToCache(orders)
  }, [orders])
}
