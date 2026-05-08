"use client";

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { RouteGuard } from '@/components/RouteGuard';
import { AppProviders } from '@/components/providers/AppProviders';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useBusinessStore } from '@/store/businessStore';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { usePathname, useRouter } from 'next/navigation';

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const { isSidebarCollapsed, isDemoMode } = useUIStore();
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (!mounted || !isDemoMode) return;
        const allowedDemoPrefixes = ['/dashboard', '/forecast', '/profile'];
        const isAllowed = allowedDemoPrefixes.some((prefix) => pathname.startsWith(prefix));
        if (!isAllowed) {
            router.replace('/dashboard');
        }
    }, [mounted, isDemoMode, pathname, router]);

    useEffect(() => {
        setMounted(true);
        useUIStore.persist.rehydrate();
        useBusinessStore.persist.rehydrate();
    }, []);

    return (
        <AppProviders>
        <div className="h-full relative overflow-hidden bg-[#f8fafc]">
            {/* Blue radial gradient glow - matches landing page atmosphere */}
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(0,167,244,0.08),transparent_40%)] z-0" />
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_85%_80%,rgba(0,167,244,0.04),transparent_50%)] z-0" />

            <RouteGuard />
            <Toaster position="top-right" />
            {/* Sidebar - fixed on desktop */}
            <div className={cn(
                "hidden h-full md:flex md:flex-col md:fixed md:inset-y-0 z-[80] bg-[#171717] transition-all duration-300",
                mounted && isSidebarCollapsed ? "md:w-20" : "md:w-64"
            )}>
                <Sidebar />
            </div>

            {/* Main content wrapper */}
            <main className={cn(
                "flex flex-col h-full bg-[#f8fafc] transition-all duration-300 relative z-10",
                mounted && isSidebarCollapsed ? "md:pl-20" : "md:pl-64"
            )}>
                <Header />

                {/* Scrollable content area */}
                <div className="flex-1 overflow-auto p-6 scroll-smooth">
                    {children}
                </div>
            </main>
        </div>
        </AppProviders>
    );
}
