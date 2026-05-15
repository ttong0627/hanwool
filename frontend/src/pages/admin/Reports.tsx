import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import api from '@/lib/api'

const DONG_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa']

export function Reports() {
  const { data: daily } = useQuery({
    queryKey: ['stats-daily'],
    queryFn: () => api.get('/admin/stats/daily', { params: { days: 30 } }).then((r) => r.data),
  })
  const { data: byDong } = useQuery({
    queryKey: ['stats-dong'],
    queryFn: () => api.get('/admin/stats/by-dong').then((r) => r.data),
  })

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">통계 · 보고서</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-4">최근 30일 배송 현황</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={daily || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" name="전체" fill="#fdba74" />
              <Bar dataKey="delivered" name="완료" fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">동별 배송 비율</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={byDong || []} dataKey="total" nameKey="dong" cx="50%" cy="50%" outerRadius={90} label={({ dong, percent }) => `${dong} ${(percent * 100).toFixed(0)}%`}>
                {(byDong || []).map((_: unknown, i: number) => (
                  <Cell key={i} fill={DONG_COLORS[i % DONG_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(byDong || []).map((item: { dong: string; total: number }, i: number) => (
              <div key={item.dong} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ background: DONG_COLORS[i % 4] }} />
                <span>{item.dong}</span>
                <span className="text-gray-500 ml-auto">{item.total}건</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
