'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { canAccessRoute, fallbackPathFor } from '@/lib/route-permissions';
import { useEffect, useState } from 'react';
import {
    LayoutDashboard,
    Users,
    Briefcase,
    Calculator,
    FileSignature,
    FolderKanban,
    Clock,
    CalendarCheck,
    Activity,
    PieChart,
    LineChart,
    Building2,
    ChevronLeft,
    ChevronRight,
    Shield,
    Receipt,
    BrainCircuit,
    ScrollText,
    KeyRound,
} from 'lucide-react';

// labelKey resolves against messages/{locale}.json at render time.
const orgRoutes = [
    { labelKey: 'dashboard',         icon: LayoutDashboard, href: '/dashboard',          color: 'text-[#00a7f4]' },
    { labelKey: 'organization',      icon: Users,           href: '/organization',       color: 'text-violet-500' },
    { labelKey: 'project_pipeline',  icon: Briefcase,       href: '/project-pipeline',   color: 'text-pink-700' },
    { labelKey: 'estimation',        icon: Calculator,      href: '/estimation',         color: 'text-orange-700' },
    { labelKey: 'contracts',         icon: FileSignature,   href: '/contracts',          color: 'text-emerald-500' },
    { labelKey: 'projects',          icon: FolderKanban,    href: '/projects',           color: 'text-green-700' },
    { labelKey: 'time_tracking',     icon: Clock,           href: '/time-tracking',      color: 'text-amber-500' },
    { labelKey: 'schedule_tracking', icon: Activity,        href: '/schedule-tracking',  color: 'text-rose-500' },
    { labelKey: 'my_schedule',       icon: CalendarCheck,   href: '/my-schedule',        color: 'text-emerald-500' },
    { labelKey: 'financials',        icon: PieChart,        href: '/financial',          color: 'text-[#0086c4]' },
    { labelKey: 'forecast',          icon: LineChart,       href: '/forecast',           color: 'text-indigo-500' },
    { labelKey: 'tenant_settings',   icon: Building2,       href: '/tenant',             color: 'text-violet-500' },
    { labelKey: 'roles_permissions', icon: KeyRound,        href: '/tenant/roles',       color: 'text-fuchsia-600' },
];

const superAdminRoutes = [
    { labelKey: 'dashboard',         icon: LayoutDashboard, href: '/admin/dashboard',  color: 'text-[#00a7f4]' },
    { labelKey: 'tenant_management', icon: Building2,       href: '/tenant',           color: 'text-violet-400' },
    { labelKey: 'billing_plans',     icon: Receipt,         href: '/admin/billing',    color: 'text-emerald-400' },
    { labelKey: 'audit_logs',        icon: ScrollText,      href: '/admin/audit',      color: 'text-amber-400' },
    { labelKey: 'ai_usage',          icon: BrainCircuit,    href: '/admin/ai-usage',   color: 'text-pink-400' },
];

export const Sidebar = () => {
    const pathname = usePathname();
    const t = useTranslations();
    const { isSidebarCollapsed, toggleSidebar } = useUIStore();
    const user = useAuthStore((s) => s.user);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return <div className="space-y-4 py-4 flex flex-col h-full bg-gradient-to-br from-white via-[#fafcfe] to-[#f0f9ff] text-[#171717] shadow-xl w-64 border-r border-[#e6e9ee]"></div>;
    }

    const visibleOrgRoutes = orgRoutes.filter((r) => canAccessRoute(user, r.href));
    const routes = user?.isSuperAdmin ? superAdminRoutes : visibleOrgRoutes;
    const homeHref = user?.isSuperAdmin ? '/admin/dashboard' : fallbackPathFor(user);

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-gradient-to-br from-white via-[#fafcfe] to-[#f0f9ff] text-[#171717] shadow-xl relative transition-all duration-300 w-full border-r border-[#e6e9ee]">
            <button
                onClick={toggleSidebar}
                className="absolute -right-3 top-6 bg-white text-[#4a4a4a] rounded-full p-1 border border-[#e6e9ee] hover:bg-[#f8fafc] hover:text-[#00a7f4] z-50 transform shadow-sm"
                style={{ right: '-0.75rem' }}
            >
                {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <div className="px-3 py-2 flex-1 overflow-x-hidden overflow-y-auto no-scrollbar">
                <Link href={homeHref} className={cn("flex items-center mb-10", isSidebarCollapsed ? "justify-center px-0" : "pl-3")}>
                    <div className="relative w-8 h-8 bg-[#00a7f4] rounded-lg flex items-center justify-center font-bold text-xl shrink-0 text-white">
                        A
                    </div>
                    {!isSidebarCollapsed && (
                        <div className="ml-4 min-w-0">
                            <h1 className="text-xl font-bold truncate leading-tight text-[#171717]">{t('anka_saas')}</h1>
                            {user?.isSuperAdmin && (
                                <span className="text-[10px] font-semibold tracking-widest uppercase text-[#0086c4]">
                                    {t('super_admin')}
                                </span>
                            )}
                        </div>
                    )}
                </Link>

                {user?.isSuperAdmin && !isSidebarCollapsed && (
                    <p className="text-[11px] uppercase tracking-wider text-[#8a8a8a] px-3 mb-2">{t('admin_panel')}</p>
                )}

                <div className="space-y-1">
                    {routes.map((route) => {
                        const label = t(route.labelKey);
                        return (
                            <Link
                                href={route.href}
                                key={route.href}
                                className={cn(
                                    "text-sm group flex p-3 w-full font-medium cursor-pointer hover:text-[#0086c4] hover:bg-[#00a7f4]/10 rounded-lg transition items-center",
                                    pathname.startsWith(route.href) ? "text-[#0086c4] bg-[#00a7f4]/10" : "text-[#4a4a4a]",
                                    isSidebarCollapsed ? "justify-center" : "justify-start"
                                )}
                                title={isSidebarCollapsed ? label : undefined}
                            >
                                <div className={cn("flex items-center", isSidebarCollapsed ? "justify-center" : "flex-1")}>
                                    <route.icon className={cn("h-5 w-5", isSidebarCollapsed ? "" : "mr-3", route.color)} />
                                    {!isSidebarCollapsed && <span className="truncate">{label}</span>}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};
