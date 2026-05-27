'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { User, Mail, Save, Lock, Eye, EyeOff } from 'lucide-react';

export default function ProfilePage() {
    const t = useTranslations();
    const router = useRouter();
    const { user } = useAuth();
    const { login } = useAuthStore();

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [profileErrors, setProfileErrors] = useState<{ firstName?: string; email?: string }>({});

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [isChangingPw, setIsChangingPw] = useState(false);
    const [pwErrors, setPwErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});

    useEffect(() => {
        if (user) {
            setFirstName(user.firstName ?? '');
            setLastName(user.lastName ?? '');
            setEmail(user.email ?? '');
        }
    }, [user]);

    const validateProfile = () => {
        const errs: typeof profileErrors = {};
        if (!firstName.trim()) errs.firstName = t('please_enter_first_name');
        if (!email.trim()) errs.email = t('please_enter_email');
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t('please_enter_valid_email');
        setProfileErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSave = async () => {
        if (!validateProfile()) return;
        setIsSaving(true);
        try {
            const { data } = await api.put('/auth/profile', {
                first_name: firstName,
                last_name: lastName,
                email: email,
            });

            // Refresh the auth store with updated user data
            const raw = data?.data ?? data;
            const updatedUser = {
                id: raw.id as string,
                firstName: (raw.first_name ?? raw.firstName) as string,
                lastName: (raw.last_name ?? raw.lastName) as string,
                email: raw.email as string,
                appRole: ((raw.app_role ?? raw.appRole) as string) ?? 'Executive',
                permissions: Array.isArray(raw.permissions)
                    ? (raw.permissions as string[])
                    : (!!(raw.is_super_admin ?? raw.isSuperAdmin) ? ['all'] : []),
                systemRole: (raw.system_role ?? raw.systemRole ?? 'member') as string,
                isSuperAdmin: !!(raw.is_super_admin ?? raw.isSuperAdmin),
                tenant: raw.tenant
                    ? {
                        id: (raw.tenant.id as string) ?? '',
                        name: (raw.tenant.name as string) ?? '',
                        slug: (raw.tenant.slug as string) ?? '',
                    }
                    : null,
            };

            const token = useAuthStore.getState().token;
            if (token) {
                login(updatedUser, token);
            }

            toast.success(t('profile_updated_success'));
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
            const errors = axiosErr.response?.data?.errors;
            if (errors?.email) {
                setProfileErrors(prev => ({ ...prev, email: errors.email[0] }));
            } else {
                toast.error(axiosErr.response?.data?.message ?? t('failed_to_update_profile'));
            }
        } finally {
            setIsSaving(false);
        }
    };

    const validatePasswords = () => {
        const errs: typeof pwErrors = {};
        if (!currentPassword) errs.currentPassword = t('please_enter_current_password');
        if (!newPassword) errs.newPassword = t('please_enter_new_password');
        else if (newPassword.length < 8) errs.newPassword = t('password_min_length');
        if (!confirmPassword) errs.confirmPassword = t('please_confirm_password');
        else if (newPassword && newPassword !== confirmPassword) errs.confirmPassword = t('passwords_do_not_match');
        setPwErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleChangePassword = async () => {
        if (!validatePasswords()) return;
        setIsChangingPw(true);
        try {
            await api.post('/auth/password', {
                current_password: currentPassword,
                new_password: newPassword,
                new_password_confirmation: confirmPassword,
            });
            toast.success(t('password_changed_success'));
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
            const apiErrors = axiosErr.response?.data?.errors;
            if (apiErrors?.current_password) {
                setPwErrors(prev => ({ ...prev, currentPassword: apiErrors.current_password[0] }));
            } else if (apiErrors?.new_password) {
                setPwErrors(prev => ({ ...prev, newPassword: apiErrors.new_password[0] }));
            } else {
                toast.error(axiosErr.response?.data?.message ?? t('failed_to_change_password'));
            }
        } finally {
            setIsChangingPw(false);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center h-96">
                <p className="text-[#8a8a8a]">{t('loading_profile')}</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">{t('my_profile')}</h2>
                <p className="text-[#4a4a4a] mt-1">{t('profile_description')}</p>
            </div>

            <Card variant="plain">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <User className="w-5 h-5 text-[#8a8a8a]" />
                        {t('personal_information')}
                    </CardTitle>
                    <CardDescription>{t('personal_info_description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">
                                {t('first_name')} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="firstName"
                                value={firstName}
                                onChange={e => { setFirstName(e.target.value); if (profileErrors.firstName) setProfileErrors(p => ({ ...p, firstName: undefined })); }}
                                onBlur={() => { if (!firstName.trim()) setProfileErrors(p => ({ ...p, firstName: t('please_enter_first_name') })); }}
                                placeholder={t('placeholder_first_name')}
                                aria-invalid={!!profileErrors.firstName}
                            />
                            {profileErrors.firstName && <p className="text-xs text-destructive">{profileErrors.firstName}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">
                                {t('last_name')} <span className="text-[#4a4a4a] text-xs font-normal">{t('optional')}</span>
                            </Label>
                            <Input
                                id="lastName"
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                placeholder={t('placeholder_last_name')}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-[#8a8a8a]" />
                            {t('email_address')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); if (profileErrors.email) setProfileErrors(p => ({ ...p, email: undefined })); }}
                            onBlur={() => {
                                if (!email.trim()) setProfileErrors(p => ({ ...p, email: t('please_enter_email') }));
                                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setProfileErrors(p => ({ ...p, email: t('please_enter_valid_email') }));
                            }}
                            placeholder={t('placeholder_email')}
                            aria-invalid={!!profileErrors.email}
                        />
                        {profileErrors.email && <p className="text-xs text-destructive">{profileErrors.email}</p>}
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                            <Save className="w-4 h-4" />
                            {isSaving ? t('saving') : t('save_changes_button')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card variant="plain">
                <CardHeader>
                    <CardTitle className="text-lg">{t('account_details')}</CardTitle>
                    <CardDescription>{t('account_details_description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-[#8a8a8a] uppercase tracking-wider">{t('role')}</Label>
                            <p className="text-sm font-medium mt-1">{user.appRole}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-[#8a8a8a] uppercase tracking-wider">{t('user_id')}</Label>
                            <p className="text-sm font-mono mt-1 text-[#4a4a4a]">{user.id}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card variant="plain">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Lock className="w-5 h-5 text-[#8a8a8a]" />
                        {t('change_password')}
                    </CardTitle>
                    <CardDescription>{t('change_password_description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">{t('current_password')} <span className="text-destructive">*</span></Label>
                        <div className="relative">
                            <Input
                                id="currentPassword"
                                type={showCurrentPw ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={e => { setCurrentPassword(e.target.value); if (pwErrors.currentPassword) setPwErrors(p => ({ ...p, currentPassword: undefined })); }}
                                onBlur={() => { if (!currentPassword) setPwErrors(p => ({ ...p, currentPassword: t('please_enter_current_password') })); }}
                                placeholder={t('enter_current_password')}
                                aria-invalid={!!pwErrors.currentPassword}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8a8a] hover:text-[#4a4a4a]"
                                onClick={() => setShowCurrentPw(!showCurrentPw)}
                            >
                                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {pwErrors.currentPassword && <p className="text-xs text-destructive">{pwErrors.currentPassword}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">{t('new_password')} <span className="text-destructive">*</span></Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showNewPw ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => { setNewPassword(e.target.value); if (pwErrors.newPassword) setPwErrors(p => ({ ...p, newPassword: undefined })); }}
                                onBlur={() => {
                                    if (!newPassword) setPwErrors(p => ({ ...p, newPassword: t('please_enter_new_password') }));
                                    else if (newPassword.length < 8) setPwErrors(p => ({ ...p, newPassword: t('password_min_length') }));
                                }}
                                placeholder={t('min_8_characters')}
                                aria-invalid={!!pwErrors.newPassword}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8a8a] hover:text-[#4a4a4a]"
                                onClick={() => setShowNewPw(!showNewPw)}
                            >
                                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {pwErrors.newPassword && <p className="text-xs text-destructive">{pwErrors.newPassword}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">{t('confirm_new_password')} <span className="text-destructive">*</span></Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={e => { setConfirmPassword(e.target.value); if (pwErrors.confirmPassword) setPwErrors(p => ({ ...p, confirmPassword: undefined })); }}
                            onBlur={() => {
                                if (!confirmPassword) setPwErrors(p => ({ ...p, confirmPassword: t('please_confirm_password') }));
                                else if (newPassword && newPassword !== confirmPassword) setPwErrors(p => ({ ...p, confirmPassword: t('passwords_do_not_match') }));
                            }}
                            placeholder={t('reenter_new_password')}
                            aria-invalid={!!pwErrors.confirmPassword}
                        />
                        {pwErrors.confirmPassword && <p className="text-xs text-destructive">{pwErrors.confirmPassword}</p>}
                    </div>
                    <div className="pt-2">
                        <Button onClick={handleChangePassword} disabled={isChangingPw} className="gap-2">
                            <Lock className="w-4 h-4" />
                            {isChangingPw ? t('changing') : t('change_password')}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
