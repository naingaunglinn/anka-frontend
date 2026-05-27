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

import type { Rank } from '@/types/business';

interface RanksTableProps {
    data: Rank[];
    onEdit: (rank: Rank) => void;
    onDelete: (id: string) => void;
}

/**
 * Pick a colour band for the rank chip based on its level.
 * The UI uses level (not code) so custom tenant ranks ("Principal" 35,
 * "Staff" 45, etc.) still get a sensible colour without hard-coding the
 * full taxonomy here.
 */
function levelBadgeClass(level: number): string {
    if (level >= 4) return 'bg-purple-100 text-purple-700 hover:bg-purple-100';
    if (level >= 3) return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
    if (level >= 2) return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100';
    return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
}

export function RanksTable({ data, onEdit, onDelete }: RanksTableProps) {
    const t = useTranslations();
    const [sorting, setSorting] = useState<SortingState>([{ id: 'level', desc: false }]);

    const columns: ColumnDef<Rank>[] = [
        {
            accessorKey: 'level',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    {t('level_col')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const lvl = row.getValue<number>('level');
                return <Badge className={levelBadgeClass(lvl)}>{lvl}</Badge>;
            },
        },
        {
            accessorKey: 'code',
            header: t('position_code'),
            cell: ({ row }) => (
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-700">
                    {row.getValue('code')}
                </code>
            ),
        },
        {
            accessorKey: 'name',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    {t('position_name')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => <div className="font-medium text-slate-900">{row.getValue('name')}</div>,
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const rank = row.original;
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
                            <DropdownMenuItem onClick={() => onEdit(rank)}>
                                <Edit className="mr-2 h-4 w-4" /> {t('edit_action')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(rank.id)} className="text-red-600">
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
        state: { sorting },
    });

    return (
        <div>
            <div className="rounded-md border bg-white shadow-sm">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id}>
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
                                    {t('no_ranks_found')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                    {t('previous')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                    {t('next')}
                </Button>
            </div>
        </div>
    );
}
