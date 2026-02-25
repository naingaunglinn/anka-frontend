import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-full relative overflow-hidden bg-slate-50">
            {/* Sidebar - fixed on desktop */}
            <div className="hidden h-full md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-[80] bg-slate-900">
                <Sidebar />
            </div>

            {/* Main content wrapper */}
            <main className="md:pl-64 flex flex-col h-full bg-slate-50">
                <Header />

                {/* Scrollable content area */}
                <div className="flex-1 overflow-auto p-6 scroll-smooth">
                    {children}
                </div>
            </main>
        </div>
    );
}
