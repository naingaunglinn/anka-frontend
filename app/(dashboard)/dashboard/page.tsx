import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RevenueTrendChart, ProfitBreakdownChart } from '@/components/charts/DashboardCharts';
import { DollarSign, TrendingUp, Percent, Activity, Box, PieChart } from 'lucide-react';

const kpiData = [
    { title: 'Total Revenue', value: '$1.2M', change: '+12.5%', icon: DollarSign, color: 'text-blue-500' },
    { title: 'Gross Profit', value: '$850K', change: '+8.2%', icon: Box, color: 'text-slate-500' },
    { title: 'Operating Profit', value: '$450K', change: '+15.3%', icon: Activity, color: 'text-indigo-500' },
    { title: 'Net Profit', value: '$320K', change: '+18.1%', icon: PieChart, color: 'text-emerald-500' },
    { title: 'Margin %', value: '26.6%', change: '+2.4%', icon: Percent, color: 'text-amber-500' },
    { title: 'Utilization %', value: '82%', change: '-1.5%', icon: TrendingUp, color: 'text-rose-500' },
];

export default function DashboardPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Executive Dashboard</h2>
                <p className="text-muted-foreground mt-1">Overview of your IT services profitability metrics.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {kpiData.map((kpi) => (
                    <Card key={kpi.title} className="hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {kpi.title}
                            </CardTitle>
                            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{kpi.value}</div>
                            <p className={`text-xs mt-1 font-medium ${kpi.change.startsWith('+') ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {kpi.change} from last month
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Revenue Trend</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <RevenueTrendChart />
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Profit Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ProfitBreakdownChart />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
