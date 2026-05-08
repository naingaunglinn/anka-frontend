'use client';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend
} from 'recharts';

const revenueData = [
    { month: 'Jan', revenue: 45000 },
    { month: 'Feb', revenue: 52000 },
    { month: 'Mar', revenue: 48000 },
    { month: 'Apr', revenue: 61000 },
    { month: 'May', revenue: 59000 },
    { month: 'Jun', revenue: 67000 },
];

const profitData = [
    { month: 'Jan', gross: 25000, operating: 15000, net: 10000 },
    { month: 'Feb', gross: 30000, operating: 18000, net: 12000 },
    { month: 'Mar', gross: 28000, operating: 16000, net: 11000 },
    { month: 'Apr', gross: 35000, operating: 22000, net: 16000 },
    { month: 'May', gross: 32000, operating: 20000, net: 14000 },
    { month: 'Jun', gross: 40000, operating: 28000, net: 20000 },
];

export const RevenueTrendChart = ({ data }: { data?: any[] }) => {
    const chartData = data || revenueData;

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                    <Tooltip
                        formatter={(value: any) => [`$${value.toLocaleString()}`, 'Revenue']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#00a7f4"
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export const ProfitBreakdownChart = () => {
    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={profitData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                    <Tooltip
                        formatter={(value: any, name: any) => [
                            `$${value.toLocaleString()}`,
                            String(name).charAt(0).toUpperCase() + String(name).slice(1) + ' Profit'
                        ]}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="gross" fill="#64748b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="operating" fill="#00a7f4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="net" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
