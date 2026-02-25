'use client';

import { useTenantStore } from '@/store/tenantStore';
import { useAuthStore } from '@/store/authStore';
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
import { useEffect } from 'react';

export const Header = () => {
    const { tenants, activeTenantId, setActiveTenant, setTenants } = useTenantStore();
    const { user, logout } = useAuthStore();

    // Mock initial tenants for UI setup
    useEffect(() => {
        if (tenants.length === 0) {
            const mockTenants = [
                { id: 't1', name: 'Acme Corp IT' },
                { id: 't2', name: 'Global Tech Services' }
            ];
            setTenants(mockTenants);
            if (!activeTenantId) {
                setActiveTenant(mockTenants[0].id);
            }
        }
    }, [tenants.length, activeTenantId, setTenants, setActiveTenant]);

    const activeTenantName = tenants.find(t => t.id === activeTenantId)?.name || 'Select Tenant';

    const handleLogout = () => {
        logout();
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
    };

    return (
        <header className="h-16 w-full flex items-center justify-between px-6 bg-white border-b shadow-sm">
            <div className="flex items-center">
                {/* Tenant Switcher */}
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
                {/* User Profile */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                            <Avatar className="h-8 w-8 bg-primary/10">
                                <AvatarFallback className="text-primary font-bold">
                                    {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                                <p className="text-xs leading-none text-muted-foreground">
                                    {user?.email || 'user@example.com'}
                                </p>
                                <p className="text-xs font-bold text-primary mt-1">
                                    Role: {user?.role || 'Guest'}
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
