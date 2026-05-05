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

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [isChangingPw, setIsChangingPw] = useState(false);

    useEffect(() => {
        if (user) {
            setFirstName(user.firstName ?? '');
            setLastName(user.lastName ?? '');
            setEmail(user.email ?? '');
        }
    }, [user]);

    const handleSave = async () => {
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
                appRole: ((raw.app_role ?? raw.appRole) as 'Admin' | 'Executive' | 'Sales' | 'Delivery' | 'HR') ?? 'Executive',
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
            const message = axiosErr.response?.data?.message;
            const errors = axiosErr.response?.data?.errors;
            if (errors?.email) {
                toast.error(errors.email[0]);
            } else {
                toast.error(message ?? 'Failed to update profile.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error('All password fields are required.');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match.');
            return;
        }
        if (newPassword.length < 8) {
            toast.error('New password must be at least 8 characters.');
            return;
        }
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
            const message = axiosErr.response?.data?.message;
            const errors = axiosErr.response?.data?.errors;
            if (errors?.current_password) {
                toast.error(errors.current_password[0]);
            } else if (errors?.new_password) {
                toast.error(errors.new_password[0]);
            } else {
                toast.error(message ?? 'Failed to change password.');
            }
        } finally {
            setIsChangingPw(false);
        }
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center h-96">
                <p className="text-slate-500">Loading profile...</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
                <p className="text-muted-foreground mt-1">Update your name and email address.</p>
            </div>

            <Card className="shadow-sm border-slate-100">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <User className="w-5 h-5 text-slate-500" />
                        Personal Information
                    </CardTitle>
                    <CardDescription>Changes apply immediately across the platform.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                                id="firstName"
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                placeholder="First name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                                id="lastName"
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                placeholder="Last name"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            Email Address
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="name@example.com"
                        />
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                            <Save className="w-4 h-4" />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-100">
                <CardHeader>
                    <CardTitle className="text-lg">Account Details</CardTitle>
                    <CardDescription>Read-only information about your account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-slate-500 uppercase tracking-wider">Role</Label>
                            <p className="text-sm font-medium mt-1">{user.appRole}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-slate-500 uppercase tracking-wider">User ID</Label>
                            <p className="text-sm font-mono mt-1 text-slate-600">{user.id}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-100">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Lock className="w-5 h-5 text-slate-500" />
                        Change Password
                    </CardTitle>
                    <CardDescription>Update your password. You will need to log in again after changing it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <div className="relative">
                            <Input
                                id="currentPassword"
                                type={showCurrentPw ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                placeholder="Enter current password"
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                onClick={() => setShowCurrentPw(!showCurrentPw)}
                            >
                                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showNewPw ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Min. 8 characters"
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                onClick={() => setShowNewPw(!showNewPw)}
                            >
                                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                        />
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
