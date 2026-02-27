'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
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
    Settings,
    ChevronLeft,
    ChevronRight,
    Handshake
} from 'lucide-react';

const routes = [
    {
        label: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
        color: 'text-sky-500',
    },
    {
        label: 'Organization',
        icon: Users,
        href: '/organization',
        color: 'text-violet-500',
    },
    {
        label: 'CRM & Pipeline',
        icon: Briefcase,
        href: '/crm',
        color: 'text-pink-700',
    },
    {
        label: 'Deals',
        icon: Handshake,
        href: '/deals',
        color: 'text-rose-500',
    },
    {
        label: 'Estimation',
        icon: Calculator,
        href: '/estimation',
        color: 'text-orange-700',
    },
    {
        label: 'Contracts & Billing',
        icon: FileSignature,
        href: '/contracts',
        color: 'text-emerald-500',
    },
    {
        label: 'Projects',
        icon: FolderKanban,
        href: '/projects',
        color: 'text-green-700',
    },
    {
        label: 'Time Tracking',
        icon: Clock,
        href: '/time-tracking',
        color: 'text-amber-500',
    },
    {
        label: 'Financials',
        icon: PieChart,
        href: '/financial',
        color: 'text-blue-700',
    },
    {
        label: 'Forecast',
        icon: LineChart,
        href: '/forecast',
        color: 'text-indigo-500',
    },
    {
        label: 'Tenant Settings',
        icon: Settings,
        href: '/tenant',
        color: 'text-gray-500',
    },
];

export const Sidebar = () => {
    const pathname = usePathname();
    const { isSidebarCollapsed, toggleSidebar } = useUIStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return <div className="space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white shadow-xl w-64"></div>;
    }

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
                <Link href="/dashboard" className={cn("flex items-center mb-14", isSidebarCollapsed ? "justify-center px-0" : "pl-3")}>
                    <div className="relative w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-xl shrink-0">
                        A
                    </div>
                    {!isSidebarCollapsed && (
                        <h1 className="text-2xl font-bold truncate ml-4">
                            Anka SaaS
                        </h1>
                    )}
                </Link>
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
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;  /* IE and Edge */
                    scrollbar-width: none;  /* Firefox */
                }
            `}</style>
        </div>
    );
};
