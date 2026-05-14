'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { ArrowUpDown, FileText, ChevronRight } from 'lucide-react';
import type { ContractDocument } from '@/lib/queries/contractDocuments';

interface Props {
    data: ContractDocument[];
    isLoading?: boolean;
}

function statusBadge(status: ContractDocument['analysis_status']) {
    const map: Record<ContractDocument['analysis_status'], string> = {
        approved:  'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
        rejected:  'bg-amber-100 text-amber-700 hover:bg-amber-100',
        failed:    'bg-red-100 text-red-700 hover:bg-red-100',
        analyzing: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
        pending:   'bg-slate-100 text-slate-700 hover:bg-slate-100',
    };
    const label: Record<ContractDocument['analysis_status'], string> = {
        approved:  'Approved',
        rejected:  'Rejected',
        failed:    'Failed',
        analyzing: 'Analyzing',
        pending:   'Pending',
    };
    return <Badge className={`${map[status]} font-medium`}>{label[status]}</Badge>;
}

function scoreCell(score: number | null | undefined, status: ContractDocument['analysis_status']) {
    if (status === 'pending' || status === 'analyzing' || status === 'failed' || score == null) {
        return <span className="text-slate-400">—</span>;
    }
    const cls =
        score >= 80 ? 'text-emerald-600' :
        score >= 60 ? 'text-amber-600' :
                      'text-red-600';
    return <span className={`font-semibold ${cls}`}>{score}<span className="text-xs text-slate-400 ml-0.5">/100</span></span>;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return d.toLocaleDateString();
}

export function ContractReviewsTable({ data, isLoading }: Props) {
    // Default sort: most-recent first. Salespeople triage today's uploads.
    const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);

    const columns: ColumnDef<ContractDocument>[] = [
        {
            id: 'analysis_status',
            accessorKey: 'analysis_status',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    Status
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => statusBadge(row.original.analysis_status),
        },
        {
            id: 'overall_score',
            accessorFn: (row) => row.overall_score ?? -1,
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    Score
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => scoreCell(row.original.overall_score, row.original.analysis_status),
        },
        {
            id: 'deal',
            accessorFn: (row) => row.deal?.name ?? '',
            header: 'Deal',
            cell: ({ row }) => {
                const deal = row.original.deal;
                if (!deal) return <span className="text-slate-400">—</span>;
                return (
                    <div className="min-w-0">
                        <Link
                            href={`/crm/${deal.id}`}
                            className="text-sm font-medium text-slate-900 hover:text-indigo-600 hover:underline truncate block max-w-[260px]"
                        >
                            {deal.name}
                        </Link>
                        <div className="text-xs text-slate-500 truncate max-w-[260px]">{deal.client}</div>
                    </div>
                );
            },
        },
        {
            id: 'original_filename',
            accessorKey: 'original_filename',
            header: 'File',
            cell: ({ row }) => (
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm truncate max-w-[220px]">{row.original.original_filename}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                        {row.original.extension.toUpperCase()} · {formatBytes(row.original.size_bytes)}
                    </span>
                </div>
            ),
        },
        {
            id: 'created_at',
            accessorKey: 'created_at',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="-ml-4 h-8 px-4"
                >
                    Uploaded
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => (
                <span className="text-xs text-slate-600">{relativeTime(row.original.created_at)}</span>
            ),
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <Link
                    href={`/crm/contract-reviews/${row.original.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                    Review <ChevronRight className="h-3 w-3" />
                </Link>
            ),
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
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground text-sm">
                                    Loading reviews…
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground text-sm">
                                    No contract documents yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} className="hover:bg-slate-50/50">
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                    Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                    Next
                </Button>
            </div>
        </div>
    );
}
