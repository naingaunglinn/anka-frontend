'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Users,
    BarChart3,
    Clock,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Search,
    X,
} from 'lucide-react';
import {
    useResourceAllocation,
    type EmployeeAllocation,
} from '@/lib/queries/resourceAllocation';

const MONTH_LABELS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

type ViewMode = 'both' | 'operate' | 'available';

export default function ResourceAllocationPage() {
    const t = useTranslations();
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [viewMode, setViewMode] = useState<ViewMode>('both');
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [deptFilter, setDeptFilter] = useState('');

    const { data, isLoading } = useResourceAllocation(year);

    const employees = data?.employees ?? [];

    const departments = useMemo(
        () => [...new Set(employees.map((e) => e.department))].sort(),
        [employees],
    );

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return employees.filter((e) => {
            if (q && !e.name.toLowerCase().includes(q) && !e.id.includes(q)) return false;
            if (roleFilter && roleFilter !== 'all' && e.role !== roleFilter) return false;
            if (deptFilter && deptFilter !== 'all' && e.department !== deptFilter) return false;
            return true;
        });
    }, [employees, search, roleFilter, deptFilter]);

    const summary = useMemo(() => {
        if (filtered.length === 0) {
            return { headcount: 0, avgUtilization: 0, totalBench: 0, overAllocationAlerts: 0 };
        }
        let totalOp = 0;
        let totalAv = 0;
        let cells = 0;
        let alerts = 0;
        for (const emp of filtered) {
            for (const m of emp.months) {
                totalOp += m.operate;
                totalAv += m.available;
                cells++;
                if (m.operate > 1.0) alerts++;
            }
        }
        return {
            headcount: filtered.length,
            avgUtilization: cells > 0 ? Math.round((totalOp / cells) * 100) : 0,
            totalBench: Number(totalAv.toFixed(1)),
            overAllocationAlerts: alerts,
        };
    }, [filtered]);

    const clearFilters = () => {
        setSearch('');
        setRoleFilter('all');
        setDeptFilter('all');
        setViewMode('both');
    };

    return (
        <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-card p-5 rounded-2xl border shadow-sm gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs uppercase tracking-wider font-semibold">
                            Operational Matrix
                        </Badge>
                    </div>
                    <h1 className="text-2xl font-bold mt-1">{t('resource_allocation')}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Track employee project allocation and availability across the year.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
                    {/* Year selector */}
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-bold px-2 min-w-[52px] text-center">{year}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y + 1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* View toggle */}
                    <div className="flex bg-muted p-1 rounded-xl border">
                        {(['both', 'operate', 'available'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === mode
                                        ? 'bg-background text-foreground shadow-sm border'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {mode === 'both' ? 'Show Both' : mode === 'operate' ? 'Operating' : 'Available'}
                            </button>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-3 text-xs font-semibold bg-muted/50 px-3 py-2 rounded-xl border whitespace-nowrap">
                        <div className={`flex items-center gap-1.5 transition-opacity ${viewMode === 'available' ? 'opacity-20' : ''}`}>
                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                            <span className="text-muted-foreground">Operate</span>
                        </div>
                        <div className="h-3.5 w-px bg-border" />
                        <div className={`flex items-center gap-1.5 transition-opacity ${viewMode === 'operate' ? 'opacity-20' : ''}`}>
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                            <span className="text-muted-foreground">Available</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={Users} iconBg="bg-indigo-50 text-indigo-600" label="Active Headcount" value={String(summary.headcount)} />
                <KpiCard icon={BarChart3} iconBg="bg-amber-50 text-amber-600" label="Avg Utilization" value={`${summary.avgUtilization}%`} />
                <KpiCard icon={Clock} iconBg="bg-emerald-50 text-emerald-600" label="Total Bench (FTE)" value={String(summary.totalBench)} />
                <KpiCard
                    icon={AlertTriangle}
                    iconBg="bg-rose-50 text-rose-600"
                    label="Over-Allocation Alerts"
                    value={String(summary.overAllocationAlerts)}
                    valueClass={summary.overAllocationAlerts > 0 ? 'text-rose-600' : undefined}
                />
            </div>

            {/* Filters */}
            <div className="bg-card p-3 rounded-xl border shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder="Search by name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-full sm:w-[140px]">
                            <SelectValue placeholder="All Roles" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Roles</SelectItem>
                            <SelectItem value="leader">Leaders</SelectItem>
                            <SelectItem value="member">Members</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                        <SelectTrigger className="w-full sm:w-[160px]">
                            <SelectValue placeholder="All Departments" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Departments</SelectItem>
                            {departments.map((d) => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs font-semibold text-indigo-600">
                        <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                </div>
            </div>

            {/* Matrix table */}
            <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-muted-foreground">Loading allocation data...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground space-y-1">
                        <p className="font-medium">No employees match the current filters.</p>
                        <p className="text-xs">Adjust or clear search filters to display resource allocations.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-muted/50 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    <th className="px-4 py-3 font-bold whitespace-nowrap sticky left-0 bg-muted/50 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-20 min-w-[170px]">
                                        Employee
                                    </th>
                                    <th className="px-4 py-3 font-bold border-r min-w-[130px]">Role</th>
                                    {MONTH_LABELS.map((label, i) => (
                                        <th key={i} className="px-3 py-3 font-bold text-center min-w-[110px]">
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y text-sm">
                                {filtered.map((emp) => (
                                    <EmployeeRow key={emp.id} emp={emp} viewMode={viewMode} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function KpiCard({
    icon: Icon,
    iconBg,
    label,
    value,
    valueClass,
}: {
    icon: React.ElementType;
    iconBg: string;
    label: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <Card className="p-4 flex items-center justify-between">
            <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                <h3 className={`text-2xl font-bold mt-1 ${valueClass ?? ''}`}>{value}</h3>
            </div>
            <div className={`p-2.5 rounded-xl ${iconBg}`}>
                <Icon className="h-5 w-5" />
            </div>
        </Card>
    );
}

function EmployeeRow({ emp, viewMode }: { emp: EmployeeAllocation; viewMode: ViewMode }) {
    return (
        <tr className="hover:bg-muted/30 transition-colors group">
            <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-card group-hover:bg-muted/30 transition-colors z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.03)]">
                <div className="font-bold text-sm">{emp.name}</div>
                <div className="text-[11px] text-muted-foreground font-semibold tracking-wider mt-0.5">
                    {emp.capacityRole}
                </div>
            </td>
            <td className="px-4 py-3 whitespace-nowrap border-r">
                <Badge variant={emp.role === 'leader' ? 'default' : 'secondary'} className="text-xs capitalize">
                    {emp.role}
                </Badge>
                <div className="text-[11px] text-muted-foreground font-bold mt-1 tracking-wide">
                    {emp.department}
                </div>
            </td>
            {emp.months.map((m) => (
                <MonthCell key={m.month} month={m} viewMode={viewMode} />
            ))}
        </tr>
    );
}

function MonthCell({
    month: m,
    viewMode,
}: {
    month: { month: number; operate: number; available: number };
    viewMode: ViewMode;
}) {
    const total = m.operate + m.available || 1;
    const showOp = viewMode === 'both' || viewMode === 'operate';
    const showAv = viewMode === 'both' || viewMode === 'available';

    const opPct = showOp ? Math.min((m.operate / total) * 100, 100) : 0;
    const avPct = showAv ? Math.min((m.available / total) * 100, 100) : 0;

    const isOver = m.operate > 1.0;
    const opColor = isOver ? 'text-rose-600 font-extrabold' : m.operate > 0 ? 'text-indigo-600 font-bold' : 'text-muted-foreground/40';
    const avColor = m.available > 0 ? 'text-emerald-500 font-bold' : 'text-muted-foreground/40';
    const barColor = isOver ? 'bg-rose-500' : 'bg-indigo-600';

    return (
        <td className="px-3 py-3 align-middle">
            <div className="flex flex-col gap-1 w-full">
                <div className="flex justify-between text-[10px] tracking-tight min-h-[14px]">
                    <span className={`${opColor} transition-all`}>
                        {showOp ? `Op: ${m.operate.toFixed(1)}` : ' '}
                    </span>
                    <span className={`${avColor} transition-all`}>
                        {showAv ? `Av: ${m.available.toFixed(1)}` : ' '}
                    </span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full flex overflow-hidden">
                    <div className={`${barColor} h-full transition-all duration-300`} style={{ width: `${opPct}%` }} />
                    <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${avPct}%` }} />
                </div>
            </div>
        </td>
    );
}
