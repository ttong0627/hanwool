import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import {
  BarChart3, Package, CheckCircle, MapPin, Truck, CalendarDays,
  Users, RefreshCw, Activity, Star, ShieldCheck, TrendingUp,
  Building2, Store,
} from 'lucide-react'
import api from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyStat { day: string; total: number; delivered: number }
interface DongStat { dong: string; total: number }
interface DriverStat { driver_id: number; total: number; delivered: number }
interface DriverInfo { id: number; name: string; phone: string }
interface MarketDateStat {
  market_date: string
  total: number
  delivered: number
  delivery_rate: number
  driver_count: number
}
interface TopCustomer { id: number; name: string; dong: string; order_count: number }
interface CustomerStats {
  total: number
  new_this_month: number
  returning: number
  returning_rate: number
  active_30d: number
  elderly_count: number
  elderly_rate: number
  top_customers: TopCustomer[]
  by_dong: { dong: string; count: number }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DONG_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa']
const PERIOD_OPTIONS = [
  { label: '7일', value: 7 },
  { label: '30일', value: 30 },
  { label: '90일', value: 90 },
]

// ─── Shared Components ────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon: Icon, color, badge,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
  badge?: string
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          {badge && (
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        <div className="text-sm text-gray-500">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

const formatDay = (day: string) => {
  if (!day) return ''
  const parts = day.split('-')
  if (parts.length < 3) return day
  return `${parts[1]}/${parts[2]}`
}

// ─── 공무원 탭 ─────────────────────────────────────────────────────────────────

function GovTab({
  days,
  daily,
  byDong,
  marketStats,
  customerStats,
}: {
  days: number
  daily: DailyStat[]
  byDong: DongStat[]
  marketStats: MarketDateStat[]
  customerStats?: CustomerStats
}) {
  const totalOrders = daily.reduce((s, d) => s + d.total, 0)
  const totalDelivered = daily.reduce((s, d) => s + d.delivered, 0)
  const deliveryRate = totalOrders > 0 ? Math.round((totalDelivered / totalOrders) * 100) : 0
  const missedOrders = totalOrders - totalDelivered

  // 장날 평균 완료율
  const avgCompletionRate =
    marketStats.length > 0
      ? Math.round(marketStats.reduce((s, m) => s + m.delivery_rate, 0) / marketStats.length)
      : 0

  // 서비스 완료율 추이 (일별)
  const completionTrend = daily.map((d) => ({
    day: d.day,
    rate: d.total > 0 ? Math.round((d.delivered / d.total) * 100) : 0,
    total: d.total,
  }))

  return (
    <div className="space-y-6">
      {/* 복지 서비스 개요 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          <h2 className="font-bold text-gray-700">복지 서비스 현황</h2>
          <span className="text-xs text-gray-400">최근 {days}일 기준</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="총 수혜 건수"
            value={totalOrders.toLocaleString()}
            sub={`최근 ${days}일 배송 접수`}
            icon={Package}
            color="bg-blue-500"
          />
          <SummaryCard
            label="서비스 완료율"
            value={`${deliveryRate}%`}
            sub={`완료 ${totalDelivered.toLocaleString()}건`}
            icon={CheckCircle}
            color={deliveryRate >= 90 ? 'bg-green-500' : deliveryRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'}
            badge={deliveryRate >= 90 ? '우수' : deliveryRate >= 70 ? '양호' : '주의'}
          />
          <SummaryCard
            label="장날 평균 완료율"
            value={`${avgCompletionRate}%`}
            sub={`${marketStats.length}회 장날 집계`}
            icon={CalendarDays}
            color="bg-indigo-500"
          />
          <SummaryCard
            label="미완료 건수"
            value={missedOrders.toLocaleString()}
            sub="배송 불가·지연 합계"
            icon={Activity}
            color={missedOrders === 0 ? 'bg-green-500' : 'bg-orange-500'}
          />
        </div>
      </div>

      {/* 65세 이상 수혜자 현황 */}
      {customerStats && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <h2 className="font-semibold text-gray-800">65세 이상 수혜 현황</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <div className="text-3xl font-black text-blue-700">{customerStats.elderly_count.toLocaleString()}</div>
              <div className="text-sm text-blue-600 font-medium mt-1">65세 이상 수혜자</div>
              <div className="text-xs text-blue-400 mt-0.5">전체 고객의 {customerStats.elderly_rate}%</div>
            </div>
            <div className="text-center p-4 bg-indigo-50 rounded-xl">
              <div className="text-3xl font-black text-indigo-700">{customerStats.total.toLocaleString()}</div>
              <div className="text-sm text-indigo-600 font-medium mt-1">전체 등록 고객</div>
              <div className="text-xs text-indigo-400 mt-0.5">이달 신규 {customerStats.new_this_month}명</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <div className="text-3xl font-black text-green-700">{customerStats.returning_rate}%</div>
              <div className="text-sm text-green-600 font-medium mt-1">재이용률</div>
              <div className="text-xs text-green-400 mt-0.5">2회 이상 이용 {customerStats.returning}명</div>
            </div>
            <div className="text-center p-4 bg-teal-50 rounded-xl">
              <div className="text-3xl font-black text-teal-700">{customerStats.active_30d.toLocaleString()}</div>
              <div className="text-sm text-teal-600 font-medium mt-1">최근 30일 이용</div>
              <div className="text-xs text-teal-400 mt-0.5">활성 수혜자</div>
            </div>
          </div>
        </div>
      )}

      {/* 장날별 서비스 완료율 */}
      <div className="card">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          장날별 서비스 완료율
        </h2>
        <p className="text-xs text-gray-400 mb-4">3·8·13·18·23·28일 장날 — 완료율 80% 이상이 서비스 목표입니다</p>
        {marketStats.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">데이터 없음</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs">
                  <th className="pb-2 pr-4">장날</th>
                  <th className="pb-2 pr-4 text-right">접수</th>
                  <th className="pb-2 pr-4 text-right">완료</th>
                  <th className="pb-2 pr-4 text-right">미완료</th>
                  <th className="pb-2 pr-4 text-right">완료율</th>
                  <th className="pb-2 text-right">투입 기사</th>
                </tr>
              </thead>
              <tbody>
                {marketStats.map((m) => (
                  <tr key={m.market_date} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-700 tabular-nums">{m.market_date}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{m.total}</td>
                    <td className="py-2.5 pr-4 text-right text-green-600 tabular-nums font-medium">{m.delivered}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-400">{m.total - m.delivered}</td>
                    <td className="py-2.5 pr-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.delivery_rate >= 90 ? 'bg-green-500' : m.delivery_rate >= 70 ? 'bg-yellow-500' : 'bg-red-400'}`}
                            style={{ width: `${m.delivery_rate}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${m.delivery_rate >= 90 ? 'text-green-600' : m.delivery_rate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {m.delivery_rate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-gray-500 tabular-nums">{m.driver_count}명</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold text-gray-700">
                  <td className="pt-2.5 pr-4">평균</td>
                  <td className="pt-2.5 pr-4 text-right tabular-nums">
                    {marketStats.length > 0 ? Math.round(marketStats.reduce((s, m) => s + m.total, 0) / marketStats.length) : 0}
                  </td>
                  <td className="pt-2.5 pr-4 text-right text-green-600 tabular-nums">
                    {marketStats.length > 0 ? Math.round(marketStats.reduce((s, m) => s + m.delivered, 0) / marketStats.length) : 0}
                  </td>
                  <td className="pt-2.5 pr-4" />
                  <td className="pt-2.5 pr-4 text-right">
                    <span className={`text-sm font-black ${avgCompletionRate >= 90 ? 'text-green-600' : avgCompletionRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {avgCompletionRate}%
                    </span>
                  </td>
                  <td className="pt-2.5 text-right text-gray-500">
                    {marketStats.length > 0 ? Math.round(marketStats.reduce((s, m) => s + m.driver_count, 0) / marketStats.length) : 0}명
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 동별 서비스 균형 */}
      <div className="card">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          동별 서비스 균형
        </h2>
        <p className="text-xs text-gray-400 mb-4">경안·송정·쌍령·탄벌 4개 동 배송 분포 — 특정 동 집중 여부를 확인합니다</p>
        {byDong.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">데이터 없음</div>
        ) : (
          <div className="space-y-3">
            {byDong.map((item, i) => {
              const pct = totalOrders > 0 ? Math.round((item.total / totalOrders) * 100) : 0
              return (
                <div key={item.dong}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: DONG_COLORS[i % DONG_COLORS.length] }} />
                      <span className="text-sm font-medium text-gray-800">{item.dong}</span>
                    </div>
                    <div className="text-sm text-right">
                      <span className="font-bold text-gray-900">{item.total.toLocaleString()}건</span>
                      <span className="text-gray-400 ml-2 tabular-nums">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: DONG_COLORS[i % DONG_COLORS.length] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 서비스 완료율 추이 */}
      {completionTrend.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            서비스 완료율 추이
          </h2>
          <p className="text-xs text-gray-400 mb-4">일별 완료율 — 80% 기준선을 유지하는지 확인합니다</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={completionTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11, fill: '#9ca3af' }} interval={days <= 7 ? 0 : days <= 30 ? 2 : 6} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} unit="%" />
              <Tooltip
                formatter={(value: number) => [`${value}%`, '완료율']}
                labelFormatter={(label) => `날짜: ${label}`}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
              />
              {/* 80% 기준선 */}
              <Line type="monotone" dataKey={() => 80} stroke="#ef4444" strokeDasharray="5 5" dot={false} strokeWidth={1.5} name="목표" />
              <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="완료율" />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-red-400 opacity-60" style={{ borderTop: '2px dashed #f87171' }} />
            붉은 점선: 목표 완료율 80%
          </p>
        </div>
      )}
    </div>
  )
}

// ─── 시장 탭 ──────────────────────────────────────────────────────────────────

function MarketTab({
  days,
  daily,
  byDong,
  driverStats,
  drivers,
  marketStats,
  customerStats,
}: {
  days: number
  daily: DailyStat[]
  byDong: DongStat[]
  driverStats: DriverStat[]
  drivers: DriverInfo[]
  marketStats: MarketDateStat[]
  customerStats?: CustomerStats
}) {
  const totalOrders = daily.reduce((s, d) => s + d.total, 0)
  const totalDelivered = daily.reduce((s, d) => s + d.delivered, 0)
  const avgPerMarketDay =
    marketStats.length > 0
      ? Math.round(marketStats.reduce((s, m) => s + m.total, 0) / marketStats.length)
      : 0
  const bestMarketDay = marketStats.length > 0
    ? [...marketStats].sort((a, b) => b.total - a.total)[0]
    : null
  const topDong = byDong.length > 0 ? byDong[0] : null

  const driverMap = drivers.reduce<Record<number, string>>((acc, d) => {
    acc[d.id] = d.name; return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* 영업 현황 요약 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Store className="w-4 h-4 text-brand-500" />
          <h2 className="font-bold text-gray-700">영업 현황</h2>
          <span className="text-xs text-gray-400">최근 {days}일 기준</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="총 배송 물량"
            value={totalOrders.toLocaleString()}
            sub={`배송 완료 ${totalDelivered.toLocaleString()}건`}
            icon={Package}
            color="bg-brand-500"
          />
          <SummaryCard
            label="장날 평균 물량"
            value={`${avgPerMarketDay}건`}
            sub={`${marketStats.length}회 장날 기준`}
            icon={CalendarDays}
            color="bg-orange-500"
          />
          <SummaryCard
            label="최다 물량 동"
            value={topDong?.dong ?? '-'}
            sub={topDong ? `${topDong.total.toLocaleString()}건` : ''}
            icon={MapPin}
            color="bg-yellow-500"
          />
          <SummaryCard
            label="재방문 고객율"
            value={customerStats ? `${customerStats.returning_rate}%` : '-'}
            sub={customerStats ? `${customerStats.returning.toLocaleString()}명 (2회↑)` : ''}
            icon={RefreshCw}
            color="bg-green-500"
          />
        </div>
      </div>

      {/* 장날별 물량 차트 */}
      <div className="card">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-500" />
          장날별 배송 물량
        </h2>
        <p className="text-xs text-gray-400 mb-4">어느 장날에 물량이 많은지 — 인력·재고 계획에 활용하세요</p>
        {marketStats.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">장날 데이터 없음</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={[...marketStats].reverse()}
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="market_date" tickFormatter={formatDay} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [value, name === 'total' ? '전체' : '완료']}
                  labelFormatter={(label) => `장날: ${label}`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="total" name="total" fill="#fdba74" radius={[4, 4, 0, 0]} />
                <Bar dataKey="delivered" name="delivered" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {bestMarketDay && (
              <p className="text-xs text-gray-500 mt-2 text-right">
                최다 물량: <strong>{bestMarketDay.market_date}</strong> ({bestMarketDay.total}건)
              </p>
            )}
          </>
        )}
      </div>

      {/* 동별 수요 + 기사별 실적 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 동별 수요 분포 */}
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-500" />
            동별 수요 분포
          </h2>
          {byDong.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">데이터 없음</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={byDong}
                    dataKey="total"
                    nameKey="dong"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={35}
                    paddingAngle={3}
                    label={({ dong, percent }) => `${dong} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {byDong.map((_, i) => (
                      <Cell key={i} fill={DONG_COLORS[i % DONG_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value.toLocaleString()}건`]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {byDong.map((item, i) => {
                  const pct = totalOrders > 0 ? Math.round((item.total / totalOrders) * 100) : 0
                  return (
                    <div key={item.dong} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: DONG_COLORS[i % DONG_COLORS.length] }} />
                      <span className="font-medium text-gray-800">{item.dong}</span>
                      <span className="text-gray-400 ml-auto tabular-nums">{item.total.toLocaleString()}건 ({pct}%)</span>
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
            기사별 실적
            <span className="text-sm font-normal text-gray-400">최근 {days}일</span>
          </h2>
          {driverStats.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">데이터 없음</div>
          ) : (
            <div className="space-y-4">
              {driverStats.map((s, rank) => {
                const rate = s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0
                const name = driverMap[s.driver_id] || `기사 #${s.driver_id}`
                return (
                  <div key={s.driver_id}>
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${
                          rank === 0 ? 'bg-yellow-400' : rank === 1 ? 'bg-gray-400' : rank === 2 ? 'bg-amber-600' : 'bg-gray-200'
                        }`}>
                          {rank + 1}
                        </div>
                        <span className="font-medium text-sm text-gray-800">{name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-green-600">{s.delivered.toLocaleString()}</span>
                        <span className="text-xs text-gray-400"> / {s.total.toLocaleString()}건</span>
                        <span className="text-xs font-semibold text-gray-500 ml-1">({rate}%)</span>
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

      {/* 최다 이용 고객 Top 5 */}
      {customerStats && customerStats.top_customers.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-brand-500" />
            최다 이용 고객 Top 5
            <span className="text-sm font-normal text-gray-400">재방문 충성 고객 현황</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {customerStats.top_customers.map((c, i) => (
              <div key={c.id} className={`rounded-xl p-3 text-center border-2 ${i === 0 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-100 bg-gray-50'}`}>
                <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-sm font-black text-white mb-2 ${
                  i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'
                }`}>
                  {i + 1}
                </div>
                <div className="font-bold text-sm text-gray-900 truncate">{c.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{c.dong}</div>
                <div className="text-2xl font-black text-brand-600 mt-1">{c.order_count}</div>
                <div className="text-xs text-gray-400">건</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 일별 물량 차트 (접기) */}
      {daily.length > 0 && (
        <details className="card">
          <summary className="font-semibold text-sm cursor-pointer hover:text-brand-600 select-none flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            일별 배송 물량 상세 ({daily.length}일)
          </summary>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11, fill: '#9ca3af' }} interval={days <= 7 ? 0 : days <= 30 ? 2 : 6} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number, name: string) => [value, name === 'total' ? '전체' : '완료']}
                  labelFormatter={(label) => `날짜: ${label}`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="total" name="total" fill="#fdba74" radius={[4, 4, 0, 0]} />
                <Bar dataKey="delivered" name="delivered" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </details>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Reports() {
  const [tab, setTab] = useState<'gov' | 'market'>('gov')
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

  const { data: marketStats = [] } = useQuery<MarketDateStat[]>({
    queryKey: ['stats-market-date'],
    queryFn: () => api.get('/admin/stats/by-market-date', { params: { limit: 12 } }).then((r) => r.data),
  })

  const { data: customerStats } = useQuery<CustomerStats>({
    queryKey: ['customer-stats'],
    queryFn: () => api.get('/admin/customers/stats').then((r) => r.data),
    staleTime: 60_000,
  })

  return (
    <div className="p-6 space-y-5 max-w-5xl page-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-500" />
            통계·보고서
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">관점에 맞는 탭을 선택하세요</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* 기간 선택 */}
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
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('gov')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'gov' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          지자체용
        </button>
        <button
          onClick={() => setTab('market')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'market' ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Store className="w-4 h-4" />
          시장용
        </button>
      </div>

      {/* 탭 설명 */}
      <div className={`rounded-xl px-4 py-3 text-sm ${tab === 'gov' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-brand-50 text-brand-700 border border-brand-100'}`}>
        {tab === 'gov'
          ? '복지 서비스 완료율, 65세 이상 수혜자 현황, 동별 서비스 균형을 중심으로 행정 목적 보고서를 제공합니다.'
          : '장날 물량 추이, 기사 실적, 최다 이용 고객, 동별 수요를 중심으로 시장 운영 현황 보고서를 제공합니다.'}
      </div>

      {/* 탭 컨텐츠 */}
      {tab === 'gov' ? (
        <GovTab
          days={days}
          daily={daily}
          byDong={byDong}
          marketStats={marketStats}
          customerStats={customerStats}
        />
      ) : (
        <MarketTab
          days={days}
          daily={daily}
          byDong={byDong}
          driverStats={driverStats}
          drivers={drivers}
          marketStats={marketStats}
          customerStats={customerStats}
        />
      )}
    </div>
  )
}
