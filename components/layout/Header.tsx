'use client';

import { useTenantStore } from '@/store/tenantStore';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
    Building2,
    LogOut,
    User as UserIcon
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
    const { tenants, activeTenantId, setActiveTenant } = useTenantStore();
    const user = useAuthStore((state) => state.user);
    const { logout } = useAuth();

    const activeTenantName = tenants.find(t => t.id === activeTenantId)?.name || 'Select Tenant';
    const displayName = user ? `${user.firstName} ${user.lastName}` : 'User';
    const initials = user ? user.firstName.charAt(0).toUpperCase() : 'U';

    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            router.push('/login');
        }
    };

    return (
        <header className="h-16 w-full flex items-center justify-between px-6 bg-white border-b shadow-sm">
            <div className="flex items-center">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="flex items-center gap-2 min-w-[200px] justify-between">
                            <span className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-muted-foreground" />
                                <span className="font-semibold">{activeTenantName}</span>
                            </span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[200px]">
                        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {tenants.map((t) => (
                            <DropdownMenuItem
                                key={t.id}
                                onClick={() => setActiveTenant(t.id)}
                                className={activeTenantId === t.id ? "bg-slate-100 font-bold" : ""}
                            >
                                {t.name}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="flex items-center gap-x-4">
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
