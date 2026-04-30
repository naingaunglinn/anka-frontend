"use client";

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useBusinessStore } from '@/store/businessStore';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isSidebarCollapsed } = useUIStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        useUIStore.persist.rehydrate();
        useBusinessStore.persist.rehydrate();
    }, []);

    return (
        <div className="h-full relative overflow-hidden bg-slate-50">
            <Toaster position="top-right" />
            {/* Sidebar - fixed on desktop */}
            <div className={cn(
                "hidden h-full md:flex md:flex-col md:fixed md:inset-y-0 z-[80] bg-slate-900 transition-all duration-300",
                mounted && isSidebarCollapsed ? "md:w-20" : "md:w-64"
            )}>
                <Sidebar />
            </div>

            {/* Main content wrapper */}
            <main className={cn(
                "flex flex-col h-full bg-slate-50 transition-all duration-300",
                mounted && isSidebarCollapsed ? "md:pl-20" : "md:pl-64"
            )}>
                <Header />

                {/* Scrollable content area */}
                <div className="flex-1 overflow-auto p-6 scroll-smooth">
                    {children}
                </div>
            </main>
        </div>
    );
}
