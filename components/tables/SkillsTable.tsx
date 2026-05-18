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

import type { Skill } from '@/types/business';

interface SkillsTableProps {
    data: Skill[];
    onEdit: (skill: Skill) => void;
    onDelete: (id: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
    Technical:  'bg-blue-50 text-blue-700 border-blue-200',
    Creative:   'bg-purple-50 text-purple-700 border-purple-200',
    Management: 'bg-amber-50 text-amber-700 border-amber-200',
    Financial:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    Legal:      'bg-slate-50 text-slate-700 border-slate-200',
    Operations: 'bg-orange-50 text-orange-700 border-orange-200',
    default:    'bg-gray-50 text-gray-700 border-gray-200',
};

// Map English category enum to translation keys. The category value lives in
// the DB in English, so we map at render time.
const CATEGORY_KEY: Record<string, string> = {
    Technical:  'skill_category_technical',
    Creative:   'skill_category_creative',
    Management: 'skill_category_management',
    Financial:  'skill_category_financial',
    Legal:      'skill_category_legal',
    Operations: 'skill_category_operations',
};

export function SkillsTable({ data, onEdit, onDelete }: SkillsTableProps) {
    const t = useTranslations();
    const [sorting, setSorting] = useState<SortingState>([]);

    const columns: ColumnDef<Skill>[] = [
        {
            accessorKey: 'name',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    {t('skill_name_col')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => <div className="font-medium text-slate-900">{row.getValue('name')}</div>,
        },
        {
            accessorKey: 'category',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    {t('category_label')}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const cat = row.getValue('category') as string;
                const cls = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.default;
                const label = CATEGORY_KEY[cat] ? t(CATEGORY_KEY[cat]) : cat;
                return <Badge variant="outline" className={`${cls} border`}>{label}</Badge>;
            },
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const skill = row.original;
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
                            <DropdownMenuItem onClick={() => onEdit(skill)}>
                                <Edit className="mr-2 h-4 w-4" /> {t('edit_action')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(skill.id)} className="text-red-600">
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
                                    {t('no_skills_found')}
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