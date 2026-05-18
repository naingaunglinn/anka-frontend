'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    getSortedRowModel,
    SortingState,
} from '@tanstack/react-table';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Edit, Trash2, ArrowUpDown, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { Employee, Role, TimeEntry } from '@/types/business';
import { useBusinessStore } from '@/store/businessStore';
import { formatMoney } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';
import { applySellMarkup, applyBillingMarkup, LABOR_OVERHEAD_PERCENTAGE, BILLING_MARKUP_MULTIPLIER } from '@/lib/calculations';

// "Assigned" against monthly capacity = anything currently consuming the
// employee's time this month: still-to-do (Draft), submitted-pending-review
// (Pending), and already-counted-against-budget (Approved). Rejected entries
// are bounced back, so they no longer represent an obligation.
const ASSIGNED_STATUSES = new Set(['Draft', 'Pending', 'Approved']);

/**
 * Format a money value as USD, or render an em-dash for missing/invalid input
 * (NaN, null, undefined, negative). Used by Cost/Hr and Monthly Salary —
 * Cost/Hr in particular is a Postgres GENERATED column that is NULL until the
 * DB recomputes it, and parseFloat(undefined) returns NaN → "$NaN".
 */
function formatMoneyOrDash(raw: unknown, currency: import('@/lib/currencyConfig').Currency): ReactNode {
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n) || n < 0) {
        return <span className="text-[#8a8a8a]">—</span>;
    }
    return formatMoney(n, currency);
}

interface EmployeesTableProps {
    data: Employee[];
    roles?: Role[];
    /**
     * Time entries to compute "assigned hours" against. Optional; when omitted,
     * the table falls back to whatever is already in businessStore.timeEntries.
     * Pass an explicit list when the caller needs current-month accuracy
     * (the store may be empty if /time-tracking hasn't been visited yet).
     */
    timeEntries?: TimeEntry[];
    onEdit: (employee: Employee) => void;
    onDelete: (id: string) => void;
}

export function EmployeesTable({ data, roles = [], timeEntries: timeEntriesProp, onEdit, onDelete }: EmployeesTableProps) {
    const t = useTranslations();
    const router = useRouter();
    const [sorting, setSorting] = useState<SortingState>([]);
    const currency = useTenantCurrency();
    const storeEntries = useBusinessStore((s) => s.timeEntries);
    const timeEntries = timeEntriesProp ?? storeEntries;

    // Sum hours per employee for the *current* calendar month, since
    // workableHours is itself a monthly figure. YYYY-MM string compare avoids
    // timezone surprises that come with Date math.
    const assignedByEmployee = useMemo(() => {
        const ymPrefix = new Date().toISOString().slice(0, 7);
        const map = new Map<string, number>();
        for (const e of timeEntries) {
            if (!ASSIGNED_STATUSES.has(e.status)) continue;
            if (!e.date?.startsWith(ymPrefix)) continue;
            map.set(e.employeeId, (map.get(e.employeeId) ?? 0) + (e.hours ?? 0));
        }
        return map;
    }, [timeEntries]);

    const columns: ColumnDef<Employee>[] = [
        {
            accessorKey: 'name',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="-ml-4 h-8 px-4"
                    >
                        {t('name')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => <div className="font-medium text-[#171717]">{row.getValue('name')}</div>,
        },
        {
            accessorKey: 'role',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="-ml-4 h-8 px-4"
                    >
                        {t('role')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const roleId = row.getValue('role') as string;
                // Resolution order: live lookup against the `roles` prop →
                // denormalized roleName on the employee row → em-dash. We
                // explicitly avoid falling back to the raw UUID, which used
                // to leak into the UI when the role had been deleted or the
                // roles list hadn't loaded yet.
                const label = roles?.find(r => r.id === roleId)?.title || row.original.roleName?.trim();
                if (!label) {
                    return <span className="text-[#8a8a8a]">—</span>;
                }
                return <Badge variant="secondary">{label}</Badge>;
            },
        },
        {
            // Sort by rank.level (numeric) so column ordering is meaningful:
            // unranked → Junior → Mid → Senior → Lead. Custom ranks are placed
            // by their level, not their position in the array.
            id: 'rank',
            accessorFn: (row) => row.rank?.level ?? -1,
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    {t('rank')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const rank = row.original.rank;
                if (!rank) return <span className="text-[#8a8a8a]">—</span>;
                // Same colour bands as the Ranks tab table for consistency.
                const cls =
                    rank.level >= 40 ? 'bg-purple-100 text-purple-700' :
                    rank.level >= 30 ? 'bg-blue-100 text-blue-700' :
                    rank.level >= 20 ? 'bg-emerald-100 text-emerald-700' :
                                       'bg-slate-100 text-slate-700';
                return <Badge className={`${cls} hover:${cls}`}>{rank.code}</Badge>;
            },
        },
        {
            accessorKey: 'monthlySalary',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="-ml-4 h-8 px-4"
                    >
                        {t('monthly_salary_col')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => <div>{formatMoneyOrDash(row.getValue('monthlySalary'), currency)}</div>,
        },
        {
            id: 'costPerHour',
            // Loaded cost = raw salary/hour × (1 + LABOR_OVERHEAD_PERCENTAGE/100).
            // The DB column `cost_per_hour` is the raw rate (monthly_salary /
            // workable_hours); the +15% absorbs company overhead so this column
            // reflects what the employee actually costs the agency per hour.
            accessorFn: (row) => {
                const raw = row.costPerHour;
                return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
                    ? applySellMarkup(raw)
                    : null;
            },
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                    title={`Raw hourly salary + ${LABOR_OVERHEAD_PERCENTAGE}% absorbed overhead.`}
                >
                    Cost / Hr
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => (
                <div>{formatMoneyOrDash(row.getValue('costPerHour') as number | null, currency)}</div>
            ),
        },
        {
            id: 'sellPerHour',
            // Sell = loaded cost × BILLING_MARKUP_MULTIPLIER (3×). What we
            // quote clients per hour of this employee's time. Only billable
            // (delivery / engineering) departments — IT — get a sell rate;
            // back-office staff (Sales, HR, etc.) intentionally show "—"
            // because their hours are never invoiced.
            accessorFn: (row) => {
                const raw = row.costPerHour;
                const dept = (row.departmentName ?? '').toLowerCase();
                const billable = dept === 'it' || dept === 'delivery' || dept === 'engineering';
                if (!billable) return null;
                return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
                    ? applyBillingMarkup(applySellMarkup(raw))
                    : null;
            },
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                    title={`Cost / Hr × ${BILLING_MARKUP_MULTIPLIER}. Quoted hourly rate to clients.`}
                >
                    Sell / Hr
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="text-emerald-700 font-medium">
                    {formatMoneyOrDash(row.getValue('sellPerHour') as number | null, currency)}
                </div>
            ),
        },
        {
            accessorKey: 'workableHours',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    {t('total_hours_per_mo')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const raw = Number(row.getValue('workableHours'));
                if (!Number.isFinite(raw) || raw <= 0) {
                    return <span className="text-[#8a8a8a]">—</span>;
                }
                return <div className="font-medium">{raw}h</div>;
            },
        },
        {
            id: 'availableHours',
            // accessorFn lets sorting work on the *computed* number even though
            // it isn't a real field on the Employee. row.original is still the
            // full Employee inside the cell renderer.
            accessorFn: (row) => (row.workableHours ?? 0) - (assignedByEmployee.get(row.id) ?? 0),
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    {t('available_hours_col')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const total = Number(row.original.workableHours);
                if (!Number.isFinite(total) || total <= 0) {
                    return <span className="text-[#8a8a8a]">—</span>;
                }
                const assigned   = assignedByEmployee.get(row.original.id) ?? 0;
                const available  = total - assigned;
                const overbooked = available < 0;
                return (
                    <div className={overbooked ? 'text-rose-600 font-medium' : ''}>
                        {available}h
                        {assigned > 0 && (
                            <span className="ml-1 text-xs text-[#8a8a8a]">
                                {t('hours_assigned', { hours: assigned })}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            id: 'skills',
            header: t('skills_col'),
            cell: ({ row }) => {
                const list = row.original.skills ?? [];
                if (list.length === 0) {
                    return <span className="text-[#8a8a8a]">—</span>;
                }
                const visible = list.slice(0, 2);
                const overflow = list.length - visible.length;
                return (
                    <div className="flex flex-wrap items-center gap-1">
                        {visible.map(s => (
                            <Badge
                                key={s.skillId}
                                variant="outline"
                                className="font-normal"
                                title={s.proficiency ? `${s.name} • ${s.proficiency}` : s.name}
                            >
                                {s.name}
                            </Badge>
                        ))}
                        {overflow > 0 && (
                            <Badge
                                variant="secondary"
                                className="font-normal"
                                title={list.slice(2).map(s => s.name).join(', ')}
                            >
                                +{overflow}
                            </Badge>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'status',
            header: t('status'),
            cell: ({ row }) => {
                const status = row.getValue('status') as string;
                let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
                let label = status;
                if (status === 'Active')   { variant = 'default';     label = t('status_active'); }
                else if (status === 'On Leave') { variant = 'secondary';  label = t('status_on_leave'); }
                else { variant = 'destructive'; label = t('status_terminated'); }

                return <Badge variant={variant}>{label}</Badge>;
            },
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const employee = row.original;

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('open_menu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{t('actions_label')}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push(`/organization/employees/${employee.id}`)}>
                                <Eye className="mr-2 h-4 w-4" /> View profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEdit(employee)}>
                                <Edit className="mr-2 h-4 w-4" /> {t('edit_action')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(employee.id)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" /> {t('delete_action')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        state: {
            sorting,
        },
    });

    return (
        <div>
            <div className="rounded-md border bg-white shadow-sm">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-[#4a4a4a]">
                                    {t('no_employees_found')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    {t('previous')}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    {t('next')}
                </Button>
            </div>
        </div>
    );
}
