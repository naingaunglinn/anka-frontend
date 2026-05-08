'use client';

import { useMemo, useState, type ReactNode } from 'react';
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
import { MoreHorizontal, Edit, Trash2, ArrowUpDown } from 'lucide-react';
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

// "Assigned" against monthly capacity = anything currently consuming the
// employee's time this month: still-to-do (Draft), submitted-pending-review
// (Pending), and already-counted-against-budget (Approved). Rejected entries
// are bounced back, so they no longer represent an obligation.
const ASSIGNED_STATUSES = new Set(['Draft', 'Pending', 'Approved']);

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

/**
 * Format a money value as USD, or render an em-dash for missing/invalid input
 * (NaN, null, undefined, negative). Used by Cost/Hr and Monthly Salary —
 * Cost/Hr in particular is a Postgres GENERATED column that is NULL until the
 * DB recomputes it, and parseFloat(undefined) returns NaN → "$NaN".
 */
function formatMoneyOrDash(raw: unknown): ReactNode {
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n) || n < 0) {
        return <span className="text-slate-400">—</span>;
    }
    return USD_FORMATTER.format(n);
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
    const [sorting, setSorting] = useState<SortingState>([]);
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
                        Name
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => <div className="font-medium text-slate-900">{row.getValue('name')}</div>,
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
                        Role
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
                    return <span className="text-slate-400">—</span>;
                }
                return <Badge variant="secondary">{label}</Badge>;
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
                        Monthly Salary
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => <div>{formatMoneyOrDash(row.getValue('monthlySalary'))}</div>,
        },
        {
            accessorKey: 'costPerHour',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="-ml-4 h-8 px-4"
                    >
                        Cost / Hr
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => <div>{formatMoneyOrDash(row.getValue('costPerHour'))}</div>,
        },
        {
            accessorKey: 'workableHours',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    Total Hours / Mo
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const raw = Number(row.getValue('workableHours'));
                if (!Number.isFinite(raw) || raw <= 0) {
                    return <span className="text-slate-400">—</span>;
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
                    Available Hours
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const total = Number(row.original.workableHours);
                if (!Number.isFinite(total) || total <= 0) {
                    return <span className="text-slate-400">—</span>;
                }
                const assigned   = assignedByEmployee.get(row.original.id) ?? 0;
                const available  = total - assigned;
                const overbooked = available < 0;
                return (
                    <div className={overbooked ? 'text-rose-600 font-medium' : ''}>
                        {available}h
                        {assigned > 0 && (
                            <span className="ml-1 text-xs text-slate-500">
                                ({assigned}h assigned)
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const status = row.getValue('status') as string;
                let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
                if (status === 'Active') variant = 'default';
                else if (status === 'On Leave') variant = 'secondary';
                else variant = 'destructive';

                return <Badge variant={variant}>{status}</Badge>;
            },
        },
        {
            id: 'skills',
            header: 'Skills',
            cell: ({ row }) => {
                const skills = row.original.skills ?? [];
                if (skills.length === 0) {
                    return <span className="text-slate-400 text-sm">—</span>;
                }
                return (
                    <div className="flex flex-wrap gap-1">
                        {skills.slice(0, 3).map((s) => (
                            <Badge key={s.skillId} variant="outline" className="text-xs">
                                {s.name}
                            </Badge>
                        ))}
                        {skills.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                                +{skills.length - 3}
                            </Badge>
                        )}
                    </div>
                );
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
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onEdit(employee)}>
                                <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(employee.id)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
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
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    No employees found.
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
                    Previous
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
