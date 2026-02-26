'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TrendingUp, Users, Activity } from 'lucide-react';

export default function ForecastPage() {
    const [newHires, setNewHires] = useState([0]);
    const [utilizationDrop, setUtilizationDrop] = useState([0]); // 0 to 20% drop
    const [monthsForecast] = useState(12); // Could be toggle for 3/6/12

    // Baseline data
    const baseRevenue = 150000;
    const baseCosts = 100000;
    const newHireCostPerMonth = 8000;
    // A new hire takes 2 months to ramp up, then generates 15000 revenue

    const forecastData = useMemo(() => {
        const data = [];
        let currentRevenue = baseRevenue;

        for (let i = 1; i <= monthsForecast; i++) {
            // Simulator logic
            const utlizationFactor = 1 - (utilizationDrop[0] / 100);
            let simRevenue = currentRevenue * utlizationFactor;
            let simCosts = baseCosts + (newHires[0] * newHireCostPerMonth);

            // Ramp up logic for new hires
            if (i > 2) {
                simRevenue += (newHires[0] * 15000) * utlizationFactor;
            } else {
                // Partial revenue during ramp up
                simRevenue += (newHires[0] * 5000) * utlizationFactor;
            }

            data.push({
                month: `Month ${i}`,
                Revenue: Math.round(simRevenue),
                Costs: Math.round(simCosts),
                Profit: Math.round(simRevenue - simCosts)
            });

            // Baseline organic growth
            currentRevenue *= 1.02;
        }
        return data;
    }, [newHires, utilizationDrop, monthsForecast]);

    const yearEndProfit = forecastData[forecastData.length - 1].Profit;
    const yearEndRevenue = forecastData[forecastData.length - 1].Revenue;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Forecasting & Scenarios</h2>
                <p className="text-muted-foreground mt-1">Simulate operational changes to project future profitability.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2 text-blue-600">
                                <Users className="h-5 w-5" />
                                Hiring Simulation
                            </CardTitle>
                            <CardDescription>Simulate adding new headcount.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="font-medium">New Hires</span>
                                <span className="font-bold text-lg">{newHires[0]} staff</span>
                            </div>
                            <Slider
                                value={newHires}
                                onValueChange={setNewHires}
                                max={10}
                                step={1}
                            />
                            <p className="text-xs text-muted-foreground pt-2">
                                Assumes $8k/mo cost, 2-month ramp-up, then $15k/mo revenue generation per hire.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2 text-amber-600">
                                <Activity className="h-5 w-5" />
                                Utilization Drop
                            </CardTitle>
                            <CardDescription>Simulate market slowdowns or bench time.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="font-medium">Utilization Penalty</span>
                                <span className="font-bold text-lg">-{utilizationDrop[0]}%</span>
                            </div>
                            <Slider
                                value={utilizationDrop}
                                onValueChange={setUtilizationDrop}
                                max={30}
                                step={1}
                                className="[&>[role=slider]]:border-amber-500 [&>span:first-child]:bg-amber-200"
                            />
                            <p className="text-xs text-muted-foreground pt-2">
                                Instantly reduces top-line service revenue across all active resources without lowering fixed costs.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-100 bg-slate-900 text-white">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-400">Projected Year-End Profit Run Rate</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-400">
                                ${(yearEndProfit / 1000).toFixed(1)}k <span className="text-sm font-normal text-slate-400">/mo</span>
                            </div>
                            <div className="mt-4 flex justify-between text-sm pt-4 border-t border-slate-800">
                                <span className="text-slate-400">Year-End Rev</span>
                                <span className="font-medium">${(yearEndRevenue / 1000).toFixed(1)}k /mo</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-2">
                    <Card className="shadow-sm border-slate-100 h-full">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-emerald-600" />
                                12-Month Profit Projection
                            </CardTitle>
                            <CardDescription>Live update based on your scenario inputs.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[450px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={forecastData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="month"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748b', fontSize: 12 }}
                                            dy={10}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748b', fontSize: 12 }}
                                            tickFormatter={(value) => `$${value / 1000}k`}
                                        />
                                        <Tooltip
                                            formatter={(value: any, name: any) => [`$${value.toLocaleString()}`, name]}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Area type="monotone" dataKey="Revenue" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                                        <Area type="monotone" dataKey="Profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                                        <Area type="monotone" dataKey="Costs" stroke="#ef4444" strokeWidth={2} fillOpacity={0} strokeDasharray="5 5" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex gap-6 mt-6 justify-center text-sm">
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div>Revenue</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div>Profit</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-0.5 border-t-2 border-dashed border-rose-500"></div>Costs</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
