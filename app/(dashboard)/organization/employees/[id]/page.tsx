'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
    ArrowLeft, Building2, Calendar, ChevronDown, ChevronRight, Loader2,
    Mail, Plus, Star, Trash2, User, Edit2,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { useBusinessStore } from '@/store/businessStore';
import { useTenantStore, type Currency } from '@/store/tenantStore';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import {
    useEmployeeSalaryHistory, useAddSalaryRow, useUpdateSalaryRow, useDeleteSalaryRow,
    isPastMonth, type EmployeeSalaryHistoryRow,
} from '@/lib/queries/employeeSalaryHistory';
import { formatMoney } from '@/lib/currency';
import { normalizeError } from '@/lib/errorHandler';

export default function EmployeeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const employeeId = params.id as string;

    const store = useBusinessStore();
    const { activeTenantId, currentTenant, tenants } = useTenantStore();
    const currency = (currentTenant?.currency as Currency)
        ?? tenants.find((t) => t.id === activeTenantId)?.currency
        ?? 'MMK';

    // Hydrate org data on direct page load.
    useOrganizationSync();

    const employee = useMemo(
        () => store.employees.find(e => e.id === employeeId),
        [store.employees, employeeId],
    );
    const department = useMemo(
        () => employee?.departmentId ? store.departments.find(d => d.id === employee.departmentId) : undefined,
        [store.departments, employee?.departmentId],
    );
    const role = useMemo(
        () => employee?.jobRoleId ? store.roles.find(r => r.id === employee.jobRoleId) : undefined,
        [store.roles, employee?.jobRoleId],
    );

    const historyQuery = useEmployeeSalaryHistory(employeeId);

    const [addOpen, setAddOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<EmployeeSalaryHistoryRow | null>(null);

    if (!employee && !store.employees.length) {
        return (
            <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading employee…
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="p-6 space-y-3">
                <p className="text-sm text-rose-700">Employee not found.</p>
                <Button variant="outline" onClick={() => router.push('/organization')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Organization
                </Button>
            </div>
        );
    }

    const statusTone =
        employee.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : employee.status === 'On Leave' ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/organization')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{employee.name}</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {employee.roleName ?? employee.role ?? '—'} · {department?.name ?? 'No department'}
                        </p>
                    </div>
                </div>
                <Badge className={statusTone}>{employee.status}</Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile + Skills (left, 2/3) */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <User className="h-4 w-4 text-slate-500" /> Profile
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                <ProfileField label="Department" icon={<Building2 className="h-3.5 w-3.5" />}
                                    value={department?.name ?? '—'} />
                                <ProfileField label="Role" value={role?.title ?? employee.roleName ?? employee.role ?? '—'} />
                                <ProfileField label="Capacity Role" value={employee.capacityRoleName ?? employee.capacityRole ?? '—'} />
                                <ProfileField label="Rank" value={employee.rank?.name ?? employee.rankName ?? '—'} />
                                <ProfileField label="Email" icon={<Mail className="h-3.5 w-3.5" />}
                                    value={employee.email ?? '—'} />
                                <ProfileField label="Workable Hours / Month"
                                    value={`${employee.workableHours ?? 160}h`} />
                            </dl>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Star className="h-4 w-4 text-slate-500" /> Skills
                            </CardTitle>
                            <CardDescription>
                                Skills fed into the AI Team Builder so it can match required project skills against this employee.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {employee.skills && employee.skills.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {employee.skills.map((s) => (
                                        <Badge key={s.skillId} variant="outline" className="text-xs">
                                            {s.name}
                                            {s.proficiency && <span className="ml-1.5 text-slate-400">· {s.proficiency}</span>}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">No skills tagged yet. Edit on the Organization page.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Current pay summary (right, 1/3) */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Current Pay</CardTitle>
                            <CardDescription>
                                Derived from the most recent salary-history row whose effective month is on or before today.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Basic Salary</span>
                                <span className="font-medium">{formatMoney(employee.basicSalary ?? 0, currency)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Allowance</span>
                                <span className="font-medium">{formatMoney(employee.allowance ?? 0, currency)}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-3">
                                <span className="text-slate-700 font-medium">Total / Month</span>
                                <span className="font-bold">{formatMoney(employee.monthlySalary ?? 0, currency)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Cost / Hour</span>
                                <span className="font-medium">{formatMoney(employee.costPerHour ?? 0, currency)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Salary history — full-width */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-500" /> Salary History
                        </CardTitle>
                        <CardDescription>
                            Per-month salary timeline. Past months are read-only; add a future row to schedule a raise.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                        <Plus className="mr-1 h-4 w-4" /> Add salary change
                    </Button>
                </CardHeader>
                <CardContent>
                    {historyQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                        </div>
                    ) : !historyQuery.data || historyQuery.data.length === 0 ? (
                        <p className="text-sm text-slate-500 py-3">No salary history yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[140px]">Effective From</TableHead>
                                    <TableHead className="text-right">Basic</TableHead>
                                    <TableHead className="text-right">Allowance</TableHead>
                                    <TableHead className="text-right">Total / Month</TableHead>
                                    <TableHead className="text-right">Cost / Hour</TableHead>
                                    <TableHead>Notes</TableHead>
                                    <TableHead className="w-[120px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {historyQuery.data.map((row) => {
                                    const isPast = isPastMonth(row.targetMonth);
                                    const monthLabel = new Date(row.targetMonth + 'T00:00:00Z').toLocaleDateString(
                                        'default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="font-medium text-slate-700">
                                                {monthLabel}
                                                {isPast && <span className="ml-2 text-xs text-slate-400">(locked)</span>}
                                            </TableCell>
                                            <TableCell className="text-right">{formatMoney(row.basicSalary, currency)}</TableCell>
                                            <TableCell className="text-right">{formatMoney(row.allowance, currency)}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatMoney(row.monthlySalary, currency)}
                                            </TableCell>
                                            <TableCell className="text-right">{formatMoney(row.costPerHour, currency)}</TableCell>
                                            <TableCell className="text-xs text-slate-500 truncate max-w-[200px]">
                                                {row.notes ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {!isPast && (
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7"
                                                            onClick={() => setEditingRow(row)} title="Edit">
                                                            <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                                        </Button>
                                                        <DeleteRowButton row={row} />
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <AddSalaryDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                employeeId={employee.id}
                currency={currency}
            />
            <EditSalaryDialog
                row={editingRow}
                onClose={() => setEditingRow(null)}
                employeeId={employee.id}
                currency={currency}
            />
        </div>
    );
}

// ── Small helpers ──────────────────────────────────────────────────────

function ProfileField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                {icon} {label}
            </dt>
            <dd className="text-sm text-slate-800">{value}</dd>
        </div>
    );
}

function DeleteRowButton({ row }: { row: EmployeeSalaryHistoryRow }) {
    const del = useDeleteSalaryRow();
    const handleClick = async () => {
        const monthLabel = new Date(row.targetMonth + 'T00:00:00Z').toLocaleDateString(
            'default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        if (!window.confirm(`Delete the ${monthLabel} salary row?`)) return;
        try {
            await del.mutateAsync({ employeeId: row.employeeId, rowId: row.id });
            toast.success(`${monthLabel} salary row removed.`);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(normalized.message);
        }
    };
    return (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClick} title="Delete"
            disabled={del.isPending}>
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
        </Button>
    );
}

// ── Add Salary Dialog ──────────────────────────────────────────────────

function AddSalaryDialog({ open, onOpenChange, employeeId, currency }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employeeId: string;
    currency: Currency;
}) {
    const add = useAddSalaryRow();
    const defaultMonth = useMemo(() => {
        // Default to next month so it's clearly forward-dated.
        const now = new Date();
        const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        return next.toISOString().slice(0, 7); // YYYY-MM
    }, [open]); // recompute when dialog opens

    const [month, setMonth] = useState(defaultMonth);
    const [basic, setBasic] = useState('');
    const [allowance, setAllowance] = useState('0');
    const [notes, setNotes] = useState('');

    const handleSubmit = async () => {
        const basicNum = Number(basic);
        const allowanceNum = Number(allowance);
        if (!Number.isFinite(basicNum) || basicNum < 0) {
            toast.error('Basic salary must be a non-negative number.');
            return;
        }
        if (!Number.isFinite(allowanceNum) || allowanceNum < 0) {
            toast.error('Allowance must be a non-negative number.');
            return;
        }
        try {
            await add.mutateAsync({
                employeeId,
                targetMonth: `${month}-01`,
                basicSalary: basicNum,
                allowance: allowanceNum,
                notes: notes.trim() || null,
            });
            toast.success(`Salary row added for ${month}.`);
            setBasic('');
            setAllowance('0');
            setNotes('');
            onOpenChange(false);
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(normalized.message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add salary change</DialogTitle>
                    <DialogDescription>
                        Schedule a new salary effective from the first of the chosen month.
                        Past months are not allowed — pick the current month or later.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="month">Effective from (YYYY-MM)</Label>
                        <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="basic">Basic Salary ({currency})</Label>
                            <Input id="basic" type="number" min={0} step="1000" value={basic}
                                onChange={(e) => setBasic(e.target.value)} placeholder="e.g. 3000000" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="allowance">Allowance ({currency})</Label>
                            <Input id="allowance" type="number" min={0} step="1000" value={allowance}
                                onChange={(e) => setAllowance(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="notes">Notes (optional)</Label>
                        <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. Annual review raise" maxLength={500} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={add.isPending || !basic}>
                        {add.isPending ? 'Adding…' : 'Add salary row'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Edit Salary Dialog ─────────────────────────────────────────────────

function EditSalaryDialog({ row, onClose, employeeId, currency }: {
    row: EmployeeSalaryHistoryRow | null;
    onClose: () => void;
    employeeId: string;
    currency: Currency;
}) {
    const upd = useUpdateSalaryRow();
    const [basic, setBasic] = useState('');
    const [allowance, setAllowance] = useState('');
    const [notes, setNotes] = useState('');

    // Sync local state when a different row opens for editing.
    useMemo(() => {
        if (row) {
            setBasic(String(row.basicSalary));
            setAllowance(String(row.allowance));
            setNotes(row.notes ?? '');
        }
    }, [row?.id]);

    if (!row) return null;

    const monthLabel = new Date(row.targetMonth + 'T00:00:00Z').toLocaleDateString(
        'default', { month: 'short', year: 'numeric', timeZone: 'UTC' });

    const handleSubmit = async () => {
        const basicNum = Number(basic);
        const allowanceNum = Number(allowance);
        if (!Number.isFinite(basicNum) || basicNum < 0) {
            toast.error('Basic salary must be a non-negative number.');
            return;
        }
        if (!Number.isFinite(allowanceNum) || allowanceNum < 0) {
            toast.error('Allowance must be a non-negative number.');
            return;
        }
        try {
            await upd.mutateAsync({
                employeeId,
                rowId: row.id,
                basicSalary: basicNum,
                allowance: allowanceNum,
                notes: notes.trim() || null,
            });
            toast.success(`${monthLabel} salary row updated.`);
            onClose();
        } catch (err) {
            const normalized = normalizeError(err);
            toast.error(normalized.message);
        }
    };

    return (
        <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit {monthLabel} salary</DialogTitle>
                    <DialogDescription>
                        Effective month is locked — to set a different month, delete this row and add a new one.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="basic-edit">Basic Salary ({currency})</Label>
                            <Input id="basic-edit" type="number" min={0} step="1000" value={basic}
                                onChange={(e) => setBasic(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="allowance-edit">Allowance ({currency})</Label>
                            <Input id="allowance-edit" type="number" min={0} step="1000" value={allowance}
                                onChange={(e) => setAllowance(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="notes-edit">Notes (optional)</Label>
                        <Input id="notes-edit" value={notes} onChange={(e) => setNotes(e.target.value)}
                            maxLength={500} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={upd.isPending}>
                        {upd.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
