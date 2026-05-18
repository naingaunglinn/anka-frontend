'use client';

import { useState } from 'react';
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
import { MoreHorizontal, Edit, Trash2, ArrowUpDown } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { GlobalOverhead as Overhead } from '@/types/business';
import { formatMoney } from '@/lib/currency';
import { useTenantCurrency } from '@/hooks/useTenantCurrency';

interface OverheadsTableProps {
    data: Overhead[];
    onEdit: (overhead: Overhead) => void;
    onDelete: (id: string) => void;
}

export function OverheadsTable({ data, onEdit, onDelete }: OverheadsTableProps) {
    const t = useTranslations();
    const [sorting, setSorting] = useState<SortingState>([]);
    const currency = useTenantCurrency();

    const MONTH_KEYS = ['', 'month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may_short', 'month_jun', 'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec'];

    const columns: ColumnDef<Overhead>[] = [
        {
            accessorKey: 'category',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="-ml-4 h-8 px-4"
                    >
                        {t('category_col')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => <div className="font-medium text-[#171717]">{row.getValue('category')}</div>,
        },
        {
            accessorKey: 'description',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="-ml-4 h-8 px-4"
                    >
                        {t('description_col')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => <div className="text-[#4a4a4a]">{row.getValue('description')}</div>,
        },
        {
            id: 'period',
            header: t('period'),
            cell: ({ row }) => {
                const oh = row.original;
                if (oh.effectiveMonth && oh.effectiveYear) {
                    return (
                        <div className="text-[#4a4a4a] text-sm">
                            {t(MONTH_KEYS[oh.effectiveMonth])} {oh.effectiveYear}
                        </div>
                    );
                }
                return <div className="text-[#4a4a4a] text-sm">{t('all_months')}</div>;
            },
        },
        {
            accessorKey: 'monthlyCost',
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                        className="-ml-4 h-8 px-4"
                    >
                        {t('monthly_cost_col')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const amount = parseFloat(row.getValue('monthlyCost'));
                return <div className="text-right font-medium text-rose-600">{formatMoney(amount, currency)}</div>;
            },
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const overhead = row.original;

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
                            <DropdownMenuItem onClick={() => onEdit(overhead)}>
                                <Edit className="mr-2 h-4 w-4" /> {t('edit_action')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(overhead.id)} className="text-red-600">
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
                                        <TableHead key={header.id} className={header.column.id === 'monthlyCost' ? 'text-right' : ''}>
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
                                        <TableCell key={cell.id} className={cell.column.id === 'monthlyCost' ? 'text-right' : ''}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-[#4a4a4a]">
                                    {t('no_overheads_found')}
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
