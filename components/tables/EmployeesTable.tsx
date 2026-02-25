'use client';

import { useState } from 'react';
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
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
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type Employee = {
    id: string;
    name: string;
    role: string;
    monthlySalary: number;
    workableHours: number;
    costPerHour: number;
    status: 'Active' | 'On Leave' | 'Terminated';
};

interface EmployeesTableProps {
    data: Employee[];
    onEdit: (employee: Employee) => void;
    onDelete: (id: string) => void;
}

export function EmployeesTable({ data, onEdit, onDelete }: EmployeesTableProps) {
    const columns: ColumnDef<Employee>[] = [
        {
            accessorKey: 'name',
            header: 'Name',
            cell: ({ row }) => <div className="font-medium text-slate-900">{row.getValue('name')}</div>,
        },
        {
            accessorKey: 'role',
            header: 'Role',
        },
        {
            accessorKey: 'monthlySalary',
            header: 'Monthly Salary',
            cell: ({ row }) => {
                const amount = parseFloat(row.getValue('monthlySalary'));
                const formatted = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                }).format(amount);
                return <div>{formatted}</div>;
            },
        },
        {
            accessorKey: 'costPerHour',
            header: 'Cost / Hr',
            cell: ({ row }) => {
                const amount = parseFloat(row.getValue('costPerHour'));
                const formatted = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                }).format(amount);
                return <div>{formatted}</div>;
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
