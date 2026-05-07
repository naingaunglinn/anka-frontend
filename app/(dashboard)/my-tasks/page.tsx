'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useProjectList } from '@/lib/queries/projects';
import { useTimeEntryList, useTimeEntryMutations } from '@/lib/queries/timeEntries';
import { LoadingState } from '@/components/LoadingState';
import type { TimeEntry } from '@/types/business';

const STATUS_VARIANTS: Record<TimeEntry['status'], string> = {
    Draft:    'bg-slate-100 text-slate-700 border-slate-200',
    Pending:  'bg-amber-50 text-amber-700 border-amber-200',
    Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Rejected: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_LABEL: Record<TimeEntry['status'], string> = {
    Draft:    'Assigned',
    Pending:  'Self-Completed',
    Approved: 'Closed',
    Rejected: 'Rejected',
};

type TabKey = 'open' | 'pending' | 'closed';

const TAB_STATUSES: Record<TabKey, string> = {
    // The Open tab spans Draft (newly assigned) and Rejected (manager bounced
    // it back) — both states need the employee's attention.
    open:    'Draft,Rejected',
    pending: 'Pending',
    closed:  'Approved',
};

const TAB_LABEL: Record<TabKey, string> = {
    open:    'Open Tasks',
    pending: 'Awaiting Review',
    closed:  'Closed',
};

const PER_PAGE = 20;

/** Trailing-edge debounce: returns `value` only after `delay` ms of no changes. */
function useDebounced<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

export default function MyTasksPage() {
    const user = useAuthStore((s) => s.user);
    const employeeId = user?.employeeId;

    const [activeTab, setActiveTab] = useState<TabKey>('open');
    const [search, setSearch]       = useState('');
    const [page, setPage]           = useState(1);
    const debouncedSearch = useDebounced(search, 300);

    // Reset pagination when the filter changes — otherwise switching to a tab
    // with fewer pages and being on page 5 leaves the user on a blank table.
    useEffect(() => { setPage(1); }, [activeTab, debouncedSearch]);

    const projectsQuery = useProjectList();
    const projects = projectsQuery.data?.data ?? [];
    const storeProjects = useBusinessStore((s) => s.projects);

    const params = useMemo(() => ({
        employee_id: employeeId ?? '',
        status: TAB_STATUSES[activeTab],
        q: debouncedSearch.trim() || undefined,
        page,
        per_page: PER_PAGE,
    }), [employeeId, activeTab, debouncedSearch, page]);

    // Skip the query entirely until we know the user's employee_id — otherwise
    // a request without that filter would return every tenant time entry.
    const entriesQuery = useTimeEntryList(params, { enabled: !!employeeId });
    const entries  = entriesQuery.data?.data ?? [];
    const meta     = entriesQuery.data?.meta;
    const lastPage = meta?.last_page ?? 1;

    const { submitTimeEntry } = useTimeEntryMutations();

    const projectName = (id: string) =>
        projects.find(p => p.id === id)?.name
        ?? storeProjects.find(p => p.id === id)?.name
        ?? 'Unknown Project';

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Tasks</h1>
                <p className="text-slate-500 mt-1">
                    Tasks your manager has assigned to you. Mark a task self-completed when you&apos;re done — your manager will review and close it.
                </p>
            </div>

            {!employeeId && (
                <Card className="shadow-sm border-amber-200 bg-amber-50">
                    <CardContent className="p-4 text-sm text-amber-800">
                        Your user account isn&apos;t linked to an employee record yet, so no assignments can be shown.
                        Ask an administrator to link your account.
                    </CardContent>
                </Card>
            )}

            {employeeId && (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <TabsList>
                            <TabsTrigger value="open">{TAB_LABEL.open}</TabsTrigger>
                            <TabsTrigger value="pending">{TAB_LABEL.pending}</TabsTrigger>
                            <TabsTrigger value="closed">{TAB_LABEL.closed}</TabsTrigger>
                        </TabsList>
                        <div className="relative w-full md:w-72">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search tasks..."
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {(['open', 'pending', 'closed'] as TabKey[]).map((tab) => (
                        <TabsContent key={tab} value={tab} className="mt-0">
                            <Card className="shadow-sm border-slate-100">
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead className="w-[120px]">Date</TableHead>
                                                <TableHead>Project</TableHead>
                                                <TableHead>Task</TableHead>
                                                <TableHead className="w-[140px]">Status</TableHead>
                                                <TableHead className="w-[80px] text-right">Hours</TableHead>
                                                {tab === 'open' && <TableHead className="w-[180px]">Action</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {entriesQuery.isLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={tab === 'open' ? 6 : 5} className="py-12">
                                                        <LoadingState message="Loading your tasks…" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : entriesQuery.isError ? (
                                                <TableRow>
                                                    <TableCell colSpan={tab === 'open' ? 6 : 5} className="py-10 text-center">
                                                        <div className="flex flex-col items-center gap-2 text-slate-500">
                                                            <span className="text-sm">Could not load your tasks.</span>
                                                            <Button variant="outline" size="sm" onClick={() => entriesQuery.refetch()}>Retry</Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : entries.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={tab === 'open' ? 6 : 5} className="py-10 text-center text-slate-500">
                                                        {debouncedSearch
                                                            ? 'No tasks match your search.'
                                                            : tab === 'open'
                                                                ? 'Nothing assigned to you right now.'
                                                                : tab === 'pending'
                                                                    ? 'Nothing awaiting review.'
                                                                    : 'No closed tasks yet.'}
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                entries.map((e) => {
                                                    const isPending = submitTimeEntry.isPending && submitTimeEntry.variables === e.id;
                                                    return (
                                                        <TableRow key={e.id}>
                                                            <TableCell className="text-slate-500 whitespace-nowrap">
                                                                <div className="flex items-center gap-2">
                                                                    <Calendar className="h-4 w-4 text-slate-400" />
                                                                    {e.date}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>{projectName(e.projectId)}</TableCell>
                                                            <TableCell className="text-slate-700">{e.task}</TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className={STATUS_VARIANTS[e.status]}>
                                                                    {STATUS_LABEL[e.status]}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-medium">{e.hours}h</TableCell>
                                                            {tab === 'open' && (
                                                                <TableCell>
                                                                    {e.status === 'Draft' ? (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-8 gap-1 text-emerald-700 hover:bg-emerald-50"
                                                                            disabled={isPending}
                                                                            onClick={() => submitTimeEntry.mutate(e.id)}
                                                                        >
                                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                                            {isPending ? 'Submitting...' : 'Self-Completed'}
                                                                        </Button>
                                                                    ) : (
                                                                        <span className="text-xs text-rose-600">Manager rejected — please follow up.</span>
                                                                    )}
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    ))}
                </Tabs>
            )}

            {employeeId && meta && (
                <div className="flex items-center justify-between text-sm text-slate-500">
                    <div>
                        {meta.total === 0
                            ? 'No tasks'
                            : `Showing ${meta.from}–${meta.to} of ${meta.total}`}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1 || entriesQuery.isFetching}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                        </Button>
                        <span className="px-2">Page {page} of {lastPage}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= lastPage || entriesQuery.isFetching}
                            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
