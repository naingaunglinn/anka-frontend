'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
        if (!firstName.trim()) errs.firstName = 'Please enter your first name.';
        if (!email.trim()) errs.email = 'Please enter your email address.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Please enter a valid email address.';
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

            toast.success('Profile updated successfully.');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
            const errors = axiosErr.response?.data?.errors;
            if (errors?.email) {
                setProfileErrors(prev => ({ ...prev, email: errors.email[0] }));
            } else {
                toast.error(axiosErr.response?.data?.message ?? 'Failed to update profile.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const validatePasswords = () => {
        const errs: typeof pwErrors = {};
        if (!currentPassword) errs.currentPassword = 'Please enter your current password.';
        if (!newPassword) errs.newPassword = 'Please enter a new password.';
        else if (newPassword.length < 8) errs.newPassword = 'New password must be at least 8 characters.';
        if (!confirmPassword) errs.confirmPassword = 'Please confirm your new password.';
        else if (newPassword && newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
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
            toast.success('Password changed successfully.');
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
                toast.error(axiosErr.response?.data?.message ?? 'Failed to change password.');
            }
        } finally {
            setIsChangingPw(false);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center h-96">
                <p className="text-[#8a8a8a]">Loading profile...</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
                <p className="text-[#4a4a4a] mt-1">Update your name and email address.</p>
            </div>

            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <User className="w-5 h-5 text-[#8a8a8a]" />
                        Personal Information
                    </CardTitle>
                    <CardDescription>Changes apply immediately across the platform.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">
                                First Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="firstName"
                                value={firstName}
                                onChange={e => { setFirstName(e.target.value); if (profileErrors.firstName) setProfileErrors(p => ({ ...p, firstName: undefined })); }}
                                onBlur={() => { if (!firstName.trim()) setProfileErrors(p => ({ ...p, firstName: 'Please enter your first name.' })); }}
                                placeholder="e.g. Jane"
                                aria-invalid={!!profileErrors.firstName}
                            />
                            {profileErrors.firstName && <p className="text-xs text-destructive">{profileErrors.firstName}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">
                                Last Name <span className="text-[#4a4a4a] text-xs font-normal">(optional)</span>
                            </Label>
                            <Input
                                id="lastName"
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                placeholder="e.g. Smith"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-[#8a8a8a]" />
                            Email Address <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); if (profileErrors.email) setProfileErrors(p => ({ ...p, email: undefined })); }}
                            onBlur={() => {
                                if (!email.trim()) setProfileErrors(p => ({ ...p, email: 'Please enter your email address.' }));
                                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) setProfileErrors(p => ({ ...p, email: 'Please enter a valid email address.' }));
                            }}
                            placeholder="name@example.com"
                            aria-invalid={!!profileErrors.email}
                        />
                        {profileErrors.email && <p className="text-xs text-destructive">{profileErrors.email}</p>}
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                            <Save className="w-4 h-4" />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader>
                    <CardTitle className="text-lg">Account Details</CardTitle>
                    <CardDescription>Read-only information about your account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-[#8a8a8a] uppercase tracking-wider">Role</Label>
                            <p className="text-sm font-medium mt-1">{user.appRole}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-[#8a8a8a] uppercase tracking-wider">User ID</Label>
                            <p className="text-sm font-mono mt-1 text-[#4a4a4a]">{user.id}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Lock className="w-5 h-5 text-[#8a8a8a]" />
                        Change Password
                    </CardTitle>
                    <CardDescription>Update your password. You will need to log in again after changing it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password <span className="text-destructive">*</span></Label>
                        <div className="relative">
                            <Input
                                id="currentPassword"
                                type={showCurrentPw ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={e => { setCurrentPassword(e.target.value); if (pwErrors.currentPassword) setPwErrors(p => ({ ...p, currentPassword: undefined })); }}
                                onBlur={() => { if (!currentPassword) setPwErrors(p => ({ ...p, currentPassword: 'Please enter your current password.' })); }}
                                placeholder="Enter current password"
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
                        <Label htmlFor="newPassword">New Password <span className="text-destructive">*</span></Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showNewPw ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => { setNewPassword(e.target.value); if (pwErrors.newPassword) setPwErrors(p => ({ ...p, newPassword: undefined })); }}
                                onBlur={() => {
                                    if (!newPassword) setPwErrors(p => ({ ...p, newPassword: 'Please enter a new password.' }));
                                    else if (newPassword.length < 8) setPwErrors(p => ({ ...p, newPassword: 'Password must be at least 8 characters.' }));
                                }}
                                placeholder="Min. 8 characters"
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
                        <Label htmlFor="confirmPassword">Confirm New Password <span className="text-destructive">*</span></Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={e => { setConfirmPassword(e.target.value); if (pwErrors.confirmPassword) setPwErrors(p => ({ ...p, confirmPassword: undefined })); }}
                            onBlur={() => {
                                if (!confirmPassword) setPwErrors(p => ({ ...p, confirmPassword: 'Please confirm your new password.' }));
                                else if (newPassword && newPassword !== confirmPassword) setPwErrors(p => ({ ...p, confirmPassword: 'Passwords do not match.' }));
                            }}
                            placeholder="Re-enter new password"
                            aria-invalid={!!pwErrors.confirmPassword}
                        />
                        {pwErrors.confirmPassword && <p className="text-xs text-destructive">{pwErrors.confirmPassword}</p>}
                    </div>
                    <div className="pt-2">
                        <Button onClick={handleChangePassword} disabled={isChangingPw} className="gap-2">
                            <Lock className="w-4 h-4" />
                            {isChangingPw ? 'Changing...' : 'Change Password'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
