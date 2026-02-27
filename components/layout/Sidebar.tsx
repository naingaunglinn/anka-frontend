'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
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
} from 'lucide-react';

const routes = [
    {
        label: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
        color: 'text-sky-500',
    },
    {
        label: 'Deals & Pipeline',
        icon: FolderKanban,
        href: '/deals',
        color: 'text-amber-600',
    },
    {
        label: 'Organization',
        icon: Users,
        href: '/organization',
        color: 'text-violet-500',
    },
    {
        label: 'CRM & Sales',
        icon: Briefcase,
        href: '/crm',
        color: 'text-pink-700',
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

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white shadow-xl">
            <div className="px-3 py-2 flex-1">
                <Link href="/dashboard" className="flex items-center pl-3 mb-14">
                    <div className="relative w-8 h-8 mr-4 bg-primary rounded-lg flex items-center justify-center font-bold text-xl">
                        A
                    </div>
                    <h1 className="text-2xl font-bold">
                        Anka SaaS
                    </h1>
                </Link>
                <div className="space-y-1">
                    {routes.map((route) => (
                        <Link
                            href={route.href}
                            key={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname.startsWith(route.href) ? "text-white bg-white/10" : "text-zinc-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};
