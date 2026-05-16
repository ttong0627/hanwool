import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { BarChart3, Package, CheckCircle, TrendingUp, MapPin, Truck } from 'lucide-react'
import api from '@/lib/api'

const DONG_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#fde68a']
const PERIOD_OPTIONS = [
  { label: '7일', value: 7 },
  { label: '30일', value: 30 },
  { label: '90일', value: 90 },
]

interface DailyStat { day: string; total: number; delivered: number }
interface DongStat { dong: string; total: number }
interface DriverStat { driver_id: number; total: number; delivered: number }
interface DriverInfo { id: number; name: string; phone: string }

function SummaryCard({
  label, value, sub, icon: Icon, color,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// X축 날짜 MM/DD 형식
const formatDay = (day: string) => {
  if (!day) return ''
  const parts = day.split('-')
  if (parts.length < 3) return day
  return `${parts[1]}/${parts[2]}`
}

export function Reports() {
  const [days, setDays] = useState(30)

  const { data: daily = [] } = useQuery<DailyStat[]>({
    queryKey: ['stats-daily', days],
    queryFn: () => api.get('/admin/stats/daily', { params: { days } }).then((r) => r.data),
  })

  const { data: byDong = [] } = useQuery<DongStat[]>({
    queryKey: ['stats-dong-period', days],
    queryFn: () => api.get('/admin/stats/by-dong/period', { params: { days } }).then((r) => r.data),
  })

  const { data: driverStats = [] } = useQuery<DriverStat[]>({
    queryKey: ['stats-drivers-period', days],
    queryFn: () => api.get('/admin/stats/drivers/period', { params: { days } }).then((r) => r.data),
  })

  const { data: drivers = [] } = useQuery<DriverInfo[]>({
    queryKey: ['drivers'],
    queryFn: () => api.get('/users', { params: { role: 'driver' } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  const driverMap = drivers.reduce<Record<number, string>>((acc, d) => {
    acc[d.id] = d.name; return acc
  }, {})

  // 요약 계산
  const totalOrders = daily.reduce((s, d) => s + d.total, 0)
  const totalDelivered = daily.reduce((s, d) => s + d.delivered, 0)
  const deliveryRate = totalOrders > 0 ? Math.round((totalDelivered / totalOrders) * 100) : 0
  const avgPerDay = daily.length > 0 ? Math.round(totalOrders / daily.length) : 0
  const topDong = byDong.length > 0 ? byDong[0].dong : '-'

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-500" />
            통계 · 보고서
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">배송 현황 분석</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === opt.value ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="총 배송 건수" value={totalOrders.toLocaleString()} sub={`최근 ${days}일`} icon={Package} color="bg-blue-500" />
        <SummaryCard label="완료 건수" value={totalDelivered.toLocaleString()} sub={`완료율 ${deliveryRate}%`} icon={CheckCircle} color="bg-green-500" />
        <SummaryCard label="일 평균 배송" value={`${avgPerDay}건`} sub={`${daily.length}일 기준`} icon={TrendingUp} color="bg-brand-500" />
        <SummaryCard label="최다 배송 지역" value={topDong} sub={byDong[0] ? `${byDong[0].total}건` : ''} icon={MapPin} color="bg-yellow-500" />
      </div>

      {/* 일별 배송 차트 */}
      <div className="card">
        <h2 className="font-semibold mb-4">일별 배송 현황</h2>
        {daily.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={daily} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="day"
                tickFormatter={formatDay}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                interval={days <= 7 ? 0 : days <= 30 ? 2 : 6}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip
                formatter={(value: number, name: string) => [value, name === 'total' ? '전체' : '완료']}
                labelFormatter={(label) => `날짜: ${label}`}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
              />
              <Legend formatter={(value) => value === 'total' ? '전체 접수' : '배달 완료'} />
              <Bar dataKey="total" name="total" fill="#fdba74" radius={[4, 4, 0, 0]} />
              <Bar dataKey="delivered" name="delivered" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 동별 + 기사별 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 동별 비율 */}
        <div className="card">
          <h2 className="font-semibold mb-4">동별 배송 비율</h2>
          {byDong.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">데이터 없음</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={byDong}
                    dataKey="total"
                    nameKey="dong"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={40}
                    paddingAngle={3}
                    label={({ dong, percent }) => `${dong} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {byDong.map((_, i) => (
                      <Cell key={i} fill={DONG_COLORS[i % DONG_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value}건`]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {byDong.map((item, i) => {
                  const pct = totalOrders > 0 ? Math.round((item.total / totalOrders) * 100) : 0
                  return (
                    <div key={item.dong} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: DONG_COLORS[i % DONG_COLORS.length] }} />
                      <span className="font-medium">{item.dong}</span>
                      <span className="text-gray-400 ml-auto tabular-nums">{item.total}건 ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* 기사별 실적 */}
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Truck className="w-4 h-4 text-brand-500" />
            기사별 실적 <span className="text-sm font-normal text-gray-400">(최근 {days}일)</span>
          </h2>
          {driverStats.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">데이터 없음</div>
          ) : (
            <div className="space-y-3">
              {driverStats.map((s) => {
                const rate = s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0
                const name = driverMap[s.driver_id] || `기사 #${s.driver_id}`
                return (
                  <div key={s.driver_id}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                          <Truck className="w-3.5 h-3.5 text-brand-600" />
                        </div>
                        <span className="font-medium text-sm">{name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-green-600">{s.delivered}</span>
                        <span className="text-xs text-gray-400"> / {s.total}건</span>
                        <span className="text-xs text-gray-400 ml-1">({rate}%)</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 rounded-full transition-all"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 일별 데이터 테이블 (접을 수 있음) */}
      {daily.length > 0 && (
        <details className="card">
          <summary className="font-semibold text-sm cursor-pointer hover:text-brand-600 select-none">
            일별 상세 데이터 ({daily.length}일)
          </summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs">
                  <th className="pb-2 pr-4">날짜</th>
                  <th className="pb-2 pr-4 text-right">전체</th>
                  <th className="pb-2 pr-4 text-right">완료</th>
                  <th className="pb-2 text-right">완료율</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((d) => {
                  const rate = d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0
                  return (
                    <tr key={d.day} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{d.day}</td>
                      <td className="py-2 pr-4 text-right font-medium tabular-nums">{d.total}</td>
                      <td className="py-2 pr-4 text-right text-green-600 tabular-nums">{d.delivered}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rate >= 80 ? 'bg-green-100 text-green-700' : rate >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
