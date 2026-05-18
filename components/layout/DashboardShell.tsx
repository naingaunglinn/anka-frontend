"use client";

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { RouteGuard } from '@/components/RouteGuard';
import { AppProviders } from '@/components/providers/AppProviders';
import { ChatBot } from '@/components/chatbot/ChatBot';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useBusinessStore } from '@/store/businessStore';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const { isSidebarCollapsed } = useUIStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        useUIStore.persist.rehydrate();
        useBusinessStore.persist.rehydrate();
    }, []);

    return (
        <AppProviders>
        <div className="h-full relative overflow-hidden bg-[#f8fafc]">
            {/* Blue radial gradient glow - matches landing page atmosphere */}
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(0,167,244,0.14),transparent_35%)] z-0" />
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_88%_85%,rgba(0,167,244,0.08),transparent_40%)] z-0" />

            <RouteGuard />
            <Toaster position="top-right" />
            {/* Sidebar - fixed on desktop */}
            <div className={cn(
                "hidden h-full md:flex md:flex-col md:fixed md:inset-y-0 z-[80] transition-all duration-300",
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

            {/* AI Chatbot — floating on all dashboard pages */}
            <ChatBot />
        </div>
        </AppProviders>
    );
}
