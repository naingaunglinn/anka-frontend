'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useEffect, useState } from 'react';
import {
    LayoutDashboard,
    Users,
    Briefcase,
    Calculator,
    FileSignature,
    FolderKanban,
    Clock,
    PieChart,
    LineChart,
    Building2,
    ChevronLeft,
    ChevronRight,
    Shield,
    Receipt,
    BrainCircuit,
    ScrollText,
} from 'lucide-react';

const orgRoutes = [
    { label: 'Dashboard',         icon: LayoutDashboard, href: '/dashboard',     color: 'text-sky-500' },
    { label: 'Organization',      icon: Users,           href: '/organization',  color: 'text-violet-500' },
    { label: 'CRM & Pipeline',    icon: Briefcase,       href: '/crm',           color: 'text-pink-700' },
    { label: 'Estimation',        icon: Calculator,      href: '/estimation',    color: 'text-orange-700' },
    { label: 'Contracts & Billing', icon: FileSignature, href: '/contracts',     color: 'text-emerald-500' },
    { label: 'Projects',          icon: FolderKanban,    href: '/projects',      color: 'text-green-700' },
    { label: 'Time Tracking',     icon: Clock,           href: '/time-tracking', color: 'text-amber-500' },
    { label: 'Financials',        icon: PieChart,        href: '/financial',     color: 'text-blue-700' },
    { label: 'Forecast',          icon: LineChart,       href: '/forecast',      color: 'text-indigo-500' },
];

const demoRoutes = [
    { label: 'Demo Dashboard', icon: LayoutDashboard, href: '/dashboard', color: 'text-sky-500' },
    { label: 'Forecast Preview', icon: LineChart, href: '/forecast', color: 'text-indigo-500' },
];

const superAdminRoutes = [
    { label: 'Dashboard',         icon: LayoutDashboard, href: '/admin/dashboard',  color: 'text-sky-500' },
    { label: 'Tenant Management', icon: Building2,       href: '/tenant',           color: 'text-violet-400' },
    { label: 'Billing & Plans',   icon: Receipt,          href: '/admin/billing',    color: 'text-emerald-400' },
    { label: 'Audit Logs',        icon: ScrollText,       href: '/admin/audit',      color: 'text-amber-400' },
    { label: 'AI Usage',          icon: BrainCircuit,     href: '/admin/ai-usage',   color: 'text-pink-400' },
];

export const Sidebar = () => {
    const pathname = usePathname();
    const { isSidebarCollapsed, toggleSidebar, isDemoMode } = useUIStore();
    const user = useAuthStore((s) => s.user);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return <div className="space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white shadow-xl w-64"></div>;
    }

    const routes = isDemoMode ? demoRoutes : (user?.isSuperAdmin ? superAdminRoutes : orgRoutes);
    const homeHref = user?.isSuperAdmin ? '/admin/dashboard' : '/dashboard';

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white shadow-xl relative transition-all duration-300 w-full overflow-hidden">
            <button
                onClick={toggleSidebar}
                className="absolute -right-3 top-6 bg-slate-800 text-white rounded-full p-1 border border-slate-700 hover:bg-slate-700 z-50 transform"
                style={{ right: '-0.75rem' }}
            >
                {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <div className="px-3 py-2 flex-1 overflow-x-hidden overflow-y-auto no-scrollbar">
                <Link href={homeHref} className={cn("flex items-center mb-10", isSidebarCollapsed ? "justify-center px-0" : "pl-3")}>
                    <div className="relative w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-xl shrink-0">
                        A
                    </div>
                    {!isSidebarCollapsed && (
                        <div className="ml-4 min-w-0">
                            <h1 className="text-xl font-bold truncate leading-tight">Anka SaaS</h1>
                            {user?.isSuperAdmin && (
                                <span className="text-[10px] font-semibold tracking-widest uppercase text-violet-400">
                                    Super Admin
                                </span>
                            )}
                        </div>
                    )}
                </Link>

                {user?.isSuperAdmin && !isSidebarCollapsed && (
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 px-3 mb-2">Admin Panel</p>
                )}
                {isDemoMode && !isSidebarCollapsed && (
                    <p className="text-[11px] uppercase tracking-wider text-sky-400 px-3 mb-2">Demo Version (Read Only)</p>
                )}

                <div className="space-y-1">
                    {routes.map((route) => (
                        <Link
                            href={route.href}
                            key={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition items-center",
                                pathname.startsWith(route.href) ? "text-white bg-white/10" : "text-zinc-400",
                                isSidebarCollapsed ? "justify-center" : "justify-start"
                            )}
                            title={isSidebarCollapsed ? route.label : undefined}
                        >
                            <div className={cn("flex items-center", isSidebarCollapsed ? "justify-center" : "flex-1")}>
                                <route.icon className={cn("h-5 w-5", isSidebarCollapsed ? "" : "mr-3", route.color)} />
                                {!isSidebarCollapsed && <span className="truncate">{route.label}</span>}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};
