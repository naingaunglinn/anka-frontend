'use client';

import { useTenantStore } from '@/store/tenantStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
    Building2,
    LogOut,
    User as UserIcon,
    Settings
} from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export const Header = () => {
    const router = useRouter();
    const { currentTenant } = useTenantStore();
    const user = useAuthStore((state) => state.user);
    const isDemoMode = useUIStore((state) => state.isDemoMode);
    const exitDemoMode = useUIStore((state) => state.exitDemoMode);
    const { logout } = useAuth();

    const displayName = user?.firstName ? `${user.firstName} ${user.lastName}` : (user?.email ?? 'User');
    const initials = user?.firstName?.charAt(0).toUpperCase() ?? 'U';

    const handleLogout = async () => {
        try {
            await logout();
            exitDemoMode();
        } finally {
            router.replace('/login');
        }
    };

    const handleExitDemo = async () => {
        await logout();
        exitDemoMode();
        router.replace('/login');
    };

    return (
        <header className="h-16 w-full flex items-center justify-between px-6 bg-white border-b shadow-sm">
            <div className="flex items-center">
                {user?.isSuperAdmin ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-violet-50 border border-violet-200">
                        <Building2 className="w-4 h-4 text-violet-600" />
                        <span className="text-sm font-semibold text-violet-700">Super Admin</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 min-w-[200px]">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold">{currentTenant?.name ?? 'Select Tenant'}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-x-4">
                {isDemoMode && (
                    <div className="flex items-center gap-2 rounded-md border border-[#00a7f4]/30 bg-[#00a7f4]/10 px-3 py-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#00a7f4]" />
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0086c4]">Demo Version</span>
                        <button
                            type="button"
                            onClick={handleExitDemo}
                            className="ml-1 text-xs font-medium text-[#0086c4] underline-offset-2 hover:underline"
                        >
                            Exit
                        </button>
                    </div>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                            <Avatar className="h-8 w-8 bg-primary/10">
                                <AvatarFallback className="text-primary font-bold">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{displayName}</p>
                                <p className="text-xs leading-none text-muted-foreground">
                                    {user?.email || 'user@example.com'}
                                </p>
                                <p className="text-xs font-bold text-primary mt-1">
                                    Role: {user?.appRole || 'Guest'}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push('/profile')} className="cursor-pointer">
                            <Settings className="w-4 h-4 mr-2" />
                            Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                            <LogOut className="w-4 h-4 mr-2" />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
};
