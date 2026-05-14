'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, FileText, Loader2, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ContractReviewsTable } from '@/components/tables/ContractReviewsTable';
import {
    useAllContractDocuments,
    type ContractDocumentStatusFilter,
} from '@/lib/queries/contractDocuments';
import { usePermission } from '@/hooks/usePermission';

const STATUS_FILTERS: Array<{ value: ContractDocumentStatusFilter; label: string }> = [
    { value: 'all',       label: 'All' },
    { value: 'pending',   label: 'Pending' },
    { value: 'analyzing', label: 'Analyzing' },
    { value: 'rejected',  label: 'Needs attention' },
    { value: 'approved',  label: 'Approved' },
    { value: 'failed',    label: 'Failed' },
];

/**
 * Contract Reviews queue — tenant-wide list of every uploaded contract
 * document and its AI verdict status. Triage view: salespeople and
 * managers see what needs attention vs what's already approved/in-flight.
 *
 * Drill-down: click any row → /contract-reviews/[id] for the deep review
 * with the full AnalysisResultCard + deal-context side panel.
 */
export default function ContractReviewsPage() {
    const router = useRouter();
    const { allowed: canView } = usePermission('view_crm');
    const [status, setStatus] = useState<ContractDocumentStatusFilter>('all');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce the search input by ~250ms so we don't fire a query per keystroke.
    useMemo(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
        return () => clearTimeout(t);
    }, [search]);

    const { data, isLoading } = useAllContractDocuments({
        status,
        search: debouncedSearch || undefined,
        perPage: 50,
    });

    const docs = data?.data ?? [];

    // Derive header stats from whatever the current filter loaded — gives
    // the salesperson a quick "how many of each" without an extra round trip.
    const stats = useMemo(() => {
        const counts = { pending: 0, rejected: 0, approved: 0, failed: 0 };
        for (const d of docs) {
            if (d.analysis_status === 'pending' || d.analysis_status === 'analyzing') counts.pending++;
            else if (d.analysis_status === 'rejected') counts.rejected++;
            else if (d.analysis_status === 'approved') counts.approved++;
            else if (d.analysis_status === 'failed')   counts.failed++;
        }
        return counts;
    }, [docs]);

    if (!canView) {
        return (
            <div className="container mx-auto p-6 max-w-6xl">
                <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">
                        You don&apos;t have permission to view contract reviews.
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-6xl space-y-6">
            <div className="flex items-start gap-3">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => router.push('/crm')}
                    aria-label="Back to CRM"
                    title="Back to CRM"
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500">
                        <Link href="/crm" className="hover:text-slate-900 hover:underline">
                            CRM &amp; Pipeline
                        </Link>
                        <span> / Contract Reviews</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2 mt-0.5">
                        <FileText className="h-6 w-6 text-indigo-600" />
                        Contract Reviews
                    </h1>
                    <p className="text-sm text-slate-600 mt-1">
                        AI analysis of every customer contract uploaded across your deals. Use this view to triage what needs attention.
                    </p>
                </div>
            </div>

            {/* Quick-glance stats from the current filter result */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-slate-200">
                    <CardContent className="p-4">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">In flight</div>
                        <div className="text-2xl font-bold mt-1 text-slate-900">{stats.pending}</div>
                    </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50/30">
                    <CardContent className="p-4">
                        <div className="text-xs text-amber-700 uppercase tracking-wide">Needs attention</div>
                        <div className="text-2xl font-bold mt-1 text-amber-900">{stats.rejected}</div>
                    </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50/30">
                    <CardContent className="p-4">
                        <div className="text-xs text-emerald-700 uppercase tracking-wide">Approved</div>
                        <div className="text-2xl font-bold mt-1 text-emerald-900">{stats.approved}</div>
                    </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50/30">
                    <CardContent className="p-4">
                        <div className="text-xs text-red-700 uppercase tracking-wide">Failed</div>
                        <div className="text-2xl font-bold mt-1 text-red-900">{stats.failed}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter bar */}
            <Card className="border-slate-200">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        {STATUS_FILTERS.map(f => (
                            <Button
                                key={f.value}
                                type="button"
                                size="sm"
                                variant={status === f.value ? 'default' : 'outline'}
                                onClick={() => setStatus(f.value)}
                                className={status === f.value ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                            >
                                {f.label}
                                {status === f.value && (
                                    <Badge className="ml-1.5 bg-white/20 text-white text-[10px]">
                                        {docs.length}
                                    </Badge>
                                )}
                            </Button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search by deal name, client, or filename…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                        {isLoading && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                        )}
                    </div>
                </CardContent>
            </Card>

            <ContractReviewsTable data={docs} isLoading={isLoading} />
        </div>
    );
}
