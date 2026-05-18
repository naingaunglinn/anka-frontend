'use client';

import { useTenantStore } from '@/store/tenantStore';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

export const Header = () => {
    const router = useRouter();
    const t = useTranslations();
    const { currentTenant } = useTenantStore();
    const user = useAuthStore((state) => state.user);
    const { logout } = useAuth();

    const displayName = user?.firstName ? `${user.firstName} ${user.lastName}` : (user?.email ?? 'User');
    const initials = user?.firstName?.charAt(0).toUpperCase() ?? 'U';

    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            router.replace('/login');
        }
    };

    return (
        <header className="h-16 w-full flex items-center justify-between px-6 bg-[#f0f9ff] border-b border-[#e6e9ee] shadow-sm">
            <div className="flex items-center">
                {user?.isSuperAdmin ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#f0f9ff] border border-[#00a7f4]/20">
                        <Building2 className="w-4 h-4 text-[#00a7f4]" />
                        <span className="text-sm font-semibold text-[#0086c4]">{t('super_admin')}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#f0f9ff] border border-[#00a7f4]/20 min-w-[200px]">
                        <Building2 className="w-4 h-4 text-[#00a7f4]" />
                        <span className="font-semibold text-[#171717]">{currentTenant?.name ?? t('select_tenant')}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-x-4">
                <LocaleSwitcher />

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
                                <p className="text-xs leading-none text-[#4a4a4a]">
                                    {user?.email || 'user@example.com'}
                                </p>
                                <p className="text-xs font-bold text-primary mt-1">
                                    {t('role')}: {user?.appRole || 'Guest'}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push('/profile')} className="cursor-pointer">
                            <Settings className="w-4 h-4 mr-2" />
                            {t('profile')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                            <LogOut className="w-4 h-4 mr-2" />
                            {t('log_out')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
};
