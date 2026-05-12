'use client';

import { useState, Fragment } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Building2, Plus, Users, ChevronDown, ChevronRight, PowerOff, Power, Pencil, Trash2, Search, DollarSign } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTenantSettings, useTenantMutations } from '@/lib/queries/tenant';
import { useAdminTenantList, useAdminTenantUsers, useAdminMutations, type AdminTenant, type AdminUser } from '@/lib/queries/admin';
import toast from 'react-hot-toast';
import { useEffect } from 'react';

// -- Org user view -------------------------------------------------------------

const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
    MMK: 4500,
    JPY: 158,
};

function OrgTenantSettings() {
    const tenantQuery = useTenantSettings();
    const { updateTenant, updateExchangeRate } = useTenantMutations();

    const [taxRatePct, setTaxRatePct] = useState('');
    const [deliveryLag, setDeliveryLag] = useState('');
    const [paymentDays, setPaymentDays] = useState('');
    const [exchangeRates, setExchangeRates] = useState<Record<string, string>>({});

    useEffect(() => {
        if (tenantQuery.data) {
            setTaxRatePct((tenantQuery.data.taxRate * 100).toFixed(2));
            setDeliveryLag(String(tenantQuery.data.deliveryLagMonths));
            setPaymentDays(String(tenantQuery.data.paymentDaysLate));
            const rates: Record<string, string> = {};
            for (const currency of ['MMK', 'JPY']) {
                const val = tenantQuery.data.exchangeRates?.[currency] ?? DEFAULT_EXCHANGE_RATES[currency];
                rates[currency] = String(val);
            }
            setExchangeRates(rates);
        }
    }, [tenantQuery.data]);

    const handleSave = async () => {
        const tax = parseFloat(taxRatePct);
        if (isNaN(tax) || tax < 0 || tax > 100) {
            toast.error('Tax rate must be a number between 0 and 100.');
            return;
        }
        const lag = parseInt(deliveryLag, 10);
        if (isNaN(lag) || lag < 0 || lag > 24) {
            toast.error('Delivery lag must be 0–24 months.');
            return;
        }
        const days = parseInt(paymentDays, 10);
        if (isNaN(days) || days < 0 || days > 365) {
            toast.error('Payment delay must be 0–365 days.');
            return;
        }
        try {
            await updateTenant.mutateAsync({
                tax_rate: tax / 100,
                avg_delivery_lag_months: lag,
                avg_payment_days_late: days,
            });
            toast.success('Tenant settings saved.');
        } catch {
            toast.error('Failed to save settings.');
        }
    };

    const handleSaveExchangeRates = async () => {
        try {
            for (const [currency, rateStr] of Object.entries(exchangeRates)) {
                const rate = parseFloat(rateStr);
                if (isNaN(rate) || rate <= 0) {
                    toast.error(`Exchange rate for ${currency} must be a positive number.`);
                    return;
                }
                await updateExchangeRate.mutateAsync({
                    from_currency: currency,
                    to_currency: 'USD',
                    rate,
                });
            }
            toast.success('Exchange rates saved.');
        } catch {
            toast.error('Failed to save exchange rates.');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Tenant Settings</h2>
                <p className="text-[#4a4a4a] mt-1">Manage your organization profile and plan details.</p>
            </div>

            {tenantQuery.isLoading && <div className="h-48 animate-pulse bg-slate-100 rounded-xl" />}

            {tenantQuery.isError && (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="flex h-40 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">Could not load tenant settings.</p>
                        <Button variant="outline" onClick={() => tenantQuery.refetch()}>Retry</Button>
                    </CardContent>
                </Card>
            )}

            {tenantQuery.data && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-[#8a8a8a]" />
                                    Organization Profile
                                </CardTitle>
                                <CardDescription>Manage your company core details.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Organization Name</Label>
                                    <p className="text-sm font-medium text-slate-700">{tenantQuery.data.name}</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Tenant Slug</Label>
                                    <p className="text-sm font-medium text-slate-700">{tenantQuery.data.slug}.anka.app</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Plan</Label>
                                    <p className="text-sm font-medium text-slate-700">{tenantQuery.data.plan ?? 'Free'}</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="taxRate">Income Tax Rate (%)</Label>
                                    <div className="flex items-center">
                                        <Input
                                            id="taxRate"
                                            type="number"
                                            min={0}
                                            max={100}
                                            step="0.01"
                                            value={taxRatePct}
                                            onChange={e => setTaxRatePct(e.target.value)}
                                            className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                        />
                                        <div className="bg-slate-100 border border-l-0 px-3 h-10 rounded-r-md flex items-center text-sm text-[#8a8a8a]">%</div>
                                    </div>
                                    <p className="text-xs text-[#8a8a8a]">Applied to operating profit on the Financials page to compute net profit.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="deliveryLag">Delivery Lag (months)</Label>
                                    <div className="flex items-center">
                                        <Input
                                            id="deliveryLag"
                                            type="number"
                                            min={0}
                                            max={24}
                                            step="1"
                                            value={deliveryLag}
                                            onChange={e => setDeliveryLag(e.target.value)}
                                            className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                        />
                                        <div className="bg-slate-100 border border-l-0 px-3 h-10 rounded-r-md flex items-center text-sm text-[#8a8a8a]">mo</div>
                                    </div>
                                    <p className="text-xs text-[#8a8a8a]">Forecast: months between a deal closing and revenue landing.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="paymentDays">Payment Delay Default (days)</Label>
                                    <div className="flex items-center">
                                        <Input
                                            id="paymentDays"
                                            type="number"
                                            min={0}
                                            max={365}
                                            step="1"
                                            value={paymentDays}
                                            onChange={e => setPaymentDays(e.target.value)}
                                            className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                        />
                                        <div className="bg-slate-100 border border-l-0 px-3 h-10 rounded-r-md flex items-center text-sm text-[#8a8a8a]">days</div>
                                    </div>
                                    <p className="text-xs text-[#8a8a8a]">Fallback when a client has no paid-invoice history. Per-client averages override this.</p>
                                </div>
                                <Button className="w-full mt-2 gap-2 bg-[#171717] hover:bg-[#00a7f4]" onClick={handleSave} disabled={updateTenant.isPending}>
                                    <Save className="w-4 h-4" />
                                    {updateTenant.isPending ? 'Saving...' : 'Save Profile'}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-[#8a8a8a]" />
                                    Exchange Rates
                                </CardTitle>
                                <CardDescription>
                                    Set exchange rates against USD for accurate AI budget calculations.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-xs text-[#8a8a8a]">
                                    The AI Team Builder converts all budgets and costs to USD before analysis.
                                    Default: 1 USD = 4,500 MMK, 1 USD = 158 JPY.
                                </p>
                                {Object.entries(DEFAULT_EXCHANGE_RATES).map(([currency, defaultRate]) => (
                                    <div key={currency} className="space-y-2">
                                        <Label htmlFor={`rate-${currency}`}>1 USD = ___ {currency}</Label>
                                        <div className="flex items-center">
                                            <Input
                                                id={`rate-${currency}`}
                                                type="number"
                                                min={0.000001}
                                                step="any"
                                                value={exchangeRates[currency] ?? String(defaultRate)}
                                                onChange={e => setExchangeRates(prev => ({ ...prev, [currency]: e.target.value }))}
                                                className="focus-visible:ring-0 focus-visible:ring-offset-0"
                                            />
                                        </div>
                                        <p className="text-xs text-[#8a8a8a]">
                                            {tenantQuery.data.exchangeRates?.[currency] != null
                                                ? 'Custom rate set.'
                                                : 'Using default rate.'}
                                        </p>
                                    </div>
                                ))}
                                <Button
                                    className="w-full mt-2 gap-2 bg-[#171717] hover:bg-[#00a7f4]"
                                    onClick={handleSaveExchangeRates}
                                    disabled={updateExchangeRate.isPending}
                                >
                                    <Save className="w-4 h-4" />
                                    {updateExchangeRate.isPending ? 'Saving...' : 'Save Exchange Rates'}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2">
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardHeader>
                                <CardTitle className="text-lg">Tenant Information</CardTitle>
                                <CardDescription>Read-only details about this tenant instance.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-xs text-[#8a8a8a] uppercase tracking-wider">Tenant ID</Label>
                                        <p className="text-sm font-mono mt-1 text-slate-700 break-all">{tenantQuery.data.id}</p>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-[#8a8a8a] uppercase tracking-wider">Status</Label>
                                        <p className="text-sm mt-1 font-medium">
                                            <span className={`inline-flex items-center gap-1.5 ${tenantQuery.data.isActive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                <span className={`w-2 h-2 rounded-full ${tenantQuery.data.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                {tenantQuery.data.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

// -- Super admin: per-tenant user list -----------------------------------------

function TenantUsersPanel({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
    const usersQuery = useAdminTenantUsers(tenantId);
    const { createUser, updateUser, deleteUser } = useAdminMutations();

    // -- Create dialog state ----------------------------------------------------
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({ first_name: '', last_name: '', email: '', app_role: 'Admin' });

    // -- Edit dialog state ------------------------------------------------------
    const [editOpen, setEditOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', app_role: 'Admin' });

    // -- Delete confirm dialog state --------------------------------------------
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

    const handleCreate = async () => {
        try {
            const result = await createUser.mutateAsync({ tenantId, payload: createForm });
            toast.success(
                `User created. Temporary password: ${result.generatedPassword ?? 'sent via email'}`,
                { duration: 8000 }
            );
            setCreateOpen(false);
            setCreateForm({ first_name: '', last_name: '', email: '', app_role: 'Admin' });
        } catch {
            toast.error('Failed to create user.');
        }
    };

    const openEdit = (user: AdminUser) => {
        setEditingUser(user);
        setEditForm({
            first_name: user.firstName,
            last_name: user.lastName,
            email: user.email,
            app_role: user.appRole,
        });
        setEditOpen(true);
    };

    const handleUpdate = async () => {
        if (!editingUser) return;
        try {
            await updateUser.mutateAsync({ tenantId, userId: editingUser.id, payload: editForm });
            toast.success('User updated.');
            setEditOpen(false);
            setEditingUser(null);
        } catch {
            toast.error('Failed to update user.');
        }
    };

    const openDelete = (user: AdminUser) => {
        setDeletingUser(user);
        setDeleteOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingUser) return;
        try {
            await deleteUser.mutateAsync({ tenantId, userId: deletingUser.id });
            toast.success('User deleted.');
        } catch {
            toast.error('Failed to delete user.');
        } finally {
            setDeleteOpen(false);
            setDeletingUser(null);
        }
    };

    if (usersQuery.isLoading) return <div className="h-12 animate-pulse bg-slate-100 rounded mt-2" />;

    return (
        <div className="mt-3 space-y-2">
            {usersQuery.data && usersQuery.data.length > 0 ? (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-[#8a8a8a] uppercase tracking-wider">
                            <th className="pb-1">Name</th>
                            <th className="pb-1">Email</th>
                            <th className="pb-1">Role</th>
                            <th className="pb-1 w-16">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usersQuery.data.map(u => (
                            <tr key={u.id} className="border-t border-[#e6e9ee]">
                                <td className="py-1.5">{u.firstName} {u.lastName}</td>
                                <td className="py-1.5 text-[#8a8a8a]">{u.email}</td>
                                <td className="py-1.5">
                                    <Badge variant="outline" className="text-xs">{u.appRole}</Badge>
                                </td>
                                <td className="py-1.5">
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-[#8a8a8a] hover:text-[#00a7f4]"
                                            onClick={() => openEdit(u)}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-[#8a8a8a] hover:text-rose-600"
                                            onClick={() => openDelete(u)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="text-sm text-[#8a8a8a]">No users yet.</p>
            )}

            {/* -- Create User Dialog ----------------------------------------------- */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1 mt-1">
                        <Plus className="w-3 h-3" /> Add User
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add User to {tenantName}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>First Name</Label>
                                <Input value={createForm.first_name} onChange={e => setCreateForm(f => ({ ...f, first_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>Last Name</Label>
                                <Input value={createForm.last_name} onChange={e => setCreateForm(f => ({ ...f, last_name: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Email</Label>
                            <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Role</Label>
                            <Select value={createForm.app_role} onValueChange={v => setCreateForm(f => ({ ...f, app_role: v }))}>
                                <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                                <SelectContent>
                                    {['Admin', 'Executive', 'Sales', 'Delivery', 'HR'].map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" onClick={handleCreate} disabled={createUser.isPending}>
                            {createUser.isPending ? 'Creating...' : 'Create User'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* -- Edit User Dialog ------------------------------------------------- */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>First Name</Label>
                                <Input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>Last Name</Label>
                                <Input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Email</Label>
                            <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Role</Label>
                            <Select value={editForm.app_role} onValueChange={v => setEditForm(f => ({ ...f, app_role: v }))}>
                                <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                                <SelectContent>
                                    {['Admin', 'Executive', 'Sales', 'Delivery', 'HR'].map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" onClick={handleUpdate} disabled={updateUser.isPending}>
                            {updateUser.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* -- Delete Confirm Dialog -------------------------------------------- */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete User</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        Are you sure you want to delete <strong>{deletingUser?.firstName} {deletingUser?.lastName}</strong>? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleteUser.isPending}>
                            {deleteUser.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// -- Super admin view ----------------------------------------------------------

function SuperAdminTenantManagement() {
    const tenantsQuery = useAdminTenantList();
    const { createTenant, updateTenant, deactivateTenant } = useAdminMutations();
    const tenants = tenantsQuery.data ?? [];

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [newTenant, setNewTenant] = useState({ name: '', slug: '', plan: '' });
    const [searchQuery, setSearchQuery] = useState('');

    // Filter tenants client-side by name or slug
    const filteredTenants = tenants.filter(t =>
        !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const activeCount = tenants.filter(t => t.isActive).length;
    const inactiveCount = tenants.filter(t => !t.isActive).length;
    const totalUsers = tenants.reduce((sum, t) => sum + (t.usersCount ?? 0), 0);

    // -- Edit dialog state ------------------------------------------------------
    const [editOpen, setEditOpen] = useState(false);
    const [editingTenant, setEditingTenant] = useState<AdminTenant | null>(null);
    const [editForm, setEditForm] = useState({ name: '', slug: '', plan: 'free', isActive: true });

    // -- Deactivate confirm dialog state ----------------------------------------
    const [deactivateOpen, setDeactivateOpen] = useState(false);
    const [deactivatingTenant, setDeactivatingTenant] = useState<{ id: string; name: string } | null>(null);

    const handleCreate = async () => {
        try {
            await createTenant.mutateAsync({
                name: newTenant.name,
                slug: newTenant.slug,
                plan: newTenant.plan || undefined,
            });
            toast.success('Tenant created.');
            setCreateOpen(false);
            setNewTenant({ name: '', slug: '', plan: '' });
        } catch {
            toast.error('Failed to create tenant.');
        }
    };

    const openEdit = (tenant: AdminTenant) => {
        setEditingTenant(tenant);
        setEditForm({
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan ?? 'free',
            isActive: tenant.isActive,
        });
        setEditOpen(true);
    };

    const handleUpdate = async () => {
        if (!editingTenant) return;
        try {
            await updateTenant.mutateAsync({
                id: editingTenant.id,
                updates: {
                    name: editForm.name,
                    slug: editForm.slug,
                    plan: editForm.plan,
                    isActive: editForm.isActive,
                },
            });
            toast.success('Tenant updated.');
            setEditOpen(false);
            setEditingTenant(null);
        } catch {
            toast.error('Failed to update tenant.');
        }
    };

    const openDeactivate = (id: string, name: string) => {
        setDeactivatingTenant({ id, name });
        setDeactivateOpen(true);
    };

    // -- Reactivate handlers ----------------------------------------------------
    const [reactivateOpen, setReactivateOpen] = useState(false);
    const [reactivatingTenant, setReactivatingTenant] = useState<{ id: string; name: string } | null>(null);

    const openReactivate = (id: string, name: string) => {
        setReactivatingTenant({ id, name });
        setReactivateOpen(true);
    };

    const handleReactivate = async () => {
        if (!reactivatingTenant) return;
        try {
            await updateTenant.mutateAsync({
                id: reactivatingTenant.id,
                updates: { name: reactivatingTenant.name, isActive: true },
            });
            toast.success('Tenant reactivated.');
        } catch {
            toast.error('Failed to reactivate tenant.');
        } finally {
            setReactivateOpen(false);
            setReactivatingTenant(null);
        }
    };

    const handleDeactivate = async () => {
        if (!deactivatingTenant) return;
        try {
            await deactivateTenant.mutateAsync(deactivatingTenant.id);
            toast.success('Tenant deactivated.');
        } catch {
            toast.error('Failed to deactivate tenant.');
        } finally {
            setDeactivateOpen(false);
            setDeactivatingTenant(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Tenant Management</h2>
                    <p className="text-[#4a4a4a] mt-1">Create and manage all organizations on the platform.</p>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                            <Plus className="w-4 h-4" /> New Tenant
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Tenant</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 mt-2">
                            <div className="space-y-1">
                                <Label>Organization Name</Label>
                                <Input
                                    placeholder="Acme Corp"
                                    value={newTenant.name}
                                    onChange={e => setNewTenant(t => ({ ...t, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Slug</Label>
                                <div className="flex items-center">
                                    <Input
                                        placeholder="acme-corp"
                                        value={newTenant.slug}
                                        onChange={e => setNewTenant(t => ({ ...t, slug: e.target.value }))}
                                        className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                    />
                                    <div className="bg-slate-100 border border-l-0 px-3 h-10 rounded-r-md flex items-center text-sm text-[#8a8a8a]">.anka.app</div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label>Plan</Label>
                                <Select value={newTenant.plan} onValueChange={v => setNewTenant(t => ({ ...t, plan: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="free">Free</SelectItem>
                                        <SelectItem value="pro">Pro</SelectItem>
                                        <SelectItem value="enterprise">Enterprise</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button className="w-full" onClick={handleCreate} disabled={createTenant.isPending}>
                                {createTenant.isPending ? 'Creating...' : 'Create Tenant'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-5">
                        <p className="text-sm text-[#8a8a8a]">Total Tenants</p>
                        <p className="text-3xl font-bold mt-1">{tenants.length}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-5">
                        <p className="text-sm text-[#8a8a8a]">Active</p>
                        <p className="text-3xl font-bold mt-1 text-emerald-600">{activeCount}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-5">
                        <p className="text-sm text-[#8a8a8a]">Inactive</p>
                        <p className="text-3xl font-bold mt-1 text-rose-600">{inactiveCount}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-5">
                        <p className="text-sm text-[#8a8a8a]">Total Users</p>
                        <p className="text-3xl font-bold mt-1 text-[#00a7f4]">{totalUsers}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8a8a]" />
                <Input
                    placeholder="Search tenants by name or slug..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 bg-white"
                />
            </div>

            {/* Tenant table */}
            {tenantsQuery.isLoading ? (
                <Card className="h-48 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
            ) : tenantsQuery.isError ? (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="flex h-40 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">Could not load tenants.</p>
                        <Button variant="outline" onClick={() => tenantsQuery.refetch()}>Retry</Button>
                    </CardContent>
                </Card>
            ) : (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Organization</TableHead>
                                <TableHead>Slug</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead className="text-center">Users</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="w-[72px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTenants.map(tenant => (
                                <Fragment key={tenant.id}>
                                    <TableRow
                                        key={tenant.id}
                                        className="cursor-pointer hover:bg-white"
                                        onClick={() => setExpandedId(expandedId === tenant.id ? null : tenant.id)}
                                    >
                                        <TableCell>
                                            {expandedId === tenant.id
                                                ? <ChevronDown className="w-4 h-4 text-[#8a8a8a]" />
                                                : <ChevronRight className="w-4 h-4 text-[#8a8a8a]" />
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{tenant.name}</div>
                                            <div className="text-xs text-[#8a8a8a] font-mono">{tenant.id.slice(0, 8)}...</div>
                                        </TableCell>
                                        <TableCell className="text-[#8a8a8a]">{tenant.slug}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">{tenant.plan ?? 'free'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="inline-flex items-center gap-1 text-sm">
                                                <Users className="w-3.5 h-3.5 text-[#8a8a8a]" />
                                                <span className="font-medium">{tenant.usersCount ?? 0}</span>
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${tenant.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                <span className={`w-2 h-2 rounded-full ${tenant.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                {tenant.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-[#8a8a8a] text-sm">
                                            {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : '—'}
                                        </TableCell>
                                        <TableCell onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-[#8a8a8a] hover:text-[#00a7f4]"
                                                    title="Edit"
                                                    onClick={() => openEdit(tenant)}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                {tenant.isActive ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-[#8a8a8a] hover:text-rose-600"
                                                        title="Deactivate"
                                                        onClick={() => openDeactivate(tenant.id, tenant.name)}
                                                    >
                                                        <PowerOff className="w-4 h-4" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-[#8a8a8a] hover:text-emerald-600"
                                                        title="Reactivate"
                                                        onClick={() => openReactivate(tenant.id, tenant.name)}
                                                    >
                                                        <Power className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {expandedId === tenant.id && (
                                        <TableRow key={`${tenant.id}-users`}>
                                            <TableCell />
                                            <TableCell colSpan={7} className="bg-white py-4 px-6">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Users className="w-4 h-4 text-[#8a8a8a]" />
                                                    <span className="text-sm font-medium text-slate-700">Users</span>
                                                </div>
                                                <TenantUsersPanel tenantId={tenant.id} tenantName={tenant.name} />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            ))}
                            {filteredTenants.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-10 text-[#8a8a8a]">
                                        {searchQuery ? 'No tenants match your search.' : 'No tenants yet. Create one to get started.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            )}

            {/* -- Edit Tenant Dialog --------------------------------------------- */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Tenant</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <div className="space-y-1">
                            <Label>Organization Name</Label>
                            <Input
                                value={editForm.name}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Slug</Label>
                            <div className="flex items-center">
                                <Input
                                    value={editForm.slug}
                                    onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))}
                                    className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                                <div className="bg-slate-100 border border-l-0 px-3 h-10 rounded-r-md flex items-center text-sm text-[#8a8a8a]">.anka.app</div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Plan</Label>
                            <Select value={editForm.plan} onValueChange={v => setEditForm(f => ({ ...f, plan: v }))}>
                                <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="free">Free</SelectItem>
                                    <SelectItem value="pro">Pro</SelectItem>
                                    <SelectItem value="enterprise">Enterprise</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Status</Label>
                            <Select value={editForm.isActive ? 'active' : 'inactive'} onValueChange={v => setEditForm(f => ({ ...f, isActive: v === 'active' }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" onClick={handleUpdate} disabled={updateTenant.isPending}>
                            {updateTenant.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* -- Deactivate Tenant Confirm Dialog ------------------------------- */}
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Deactivate Tenant</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        Are you sure you want to deactivate <strong>{deactivatingTenant?.name}</strong>? Their users will be unable to log in.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeactivateOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeactivate} disabled={deactivateTenant.isPending}>
                            {deactivateTenant.isPending ? 'Deactivating...' : 'Deactivate'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* -- Reactivate Tenant Confirm Dialog ------------------------------ */}
            <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reactivate Tenant</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        Reactivate <strong>{reactivatingTenant?.name}</strong>? Their users will be able to log in again.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setReactivateOpen(false)}>Cancel</Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleReactivate} disabled={updateTenant.isPending}>
                            {updateTenant.isPending ? 'Activating...' : 'Reactivate'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// -- Page entry point ----------------------------------------------------------

export default function TenantPage() {
    const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false);
    return isSuperAdmin ? <SuperAdminTenantManagement /> : <OrgTenantSettings />;
}
