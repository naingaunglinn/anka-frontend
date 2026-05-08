'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock, Plus, Users, Briefcase, Calendar, CheckCircle2, XCircle, Trash2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useBusinessStore } from '@/store/businessStore';
import { TimeEntry } from '@/types/business';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useProjectList, useProjectTeam } from '@/lib/queries/projects';
import { useTimeEntryList, useTimeEntryMutations } from '@/lib/queries/timeEntries';
import type { Project } from '@/types/business';

const STATUS_VARIANTS: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-700 border-slate-200',
    Pending: 'bg-amber-50 text-amber-700 border-amber-200',
    Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Rejected: 'bg-red-50 text-red-700 border-red-200',
};

export default function TimeTrackingPage() {
    const store = useBusinessStore();
    const projectsQuery = useProjectList();
    const timeEntriesQuery = useTimeEntryList();
    const { createTimeEntry, approveTimeEntry, rejectTimeEntry, deleteTimeEntry } = useTimeEntryMutations();
    const projects = projectsQuery.data?.data ?? [];
    const timeEntries = timeEntriesQuery.data?.data ?? [];
    const [isAddOpen, setIsAddOpen] = useState(false);

    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [taskDesc, setTaskDesc] = useState('');
    const [hoursLogged, setHoursLogged] = useState('');
    const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [billable, setBillable] = useState(true);
    const [timeErrors, setTimeErrors] = useState<{
        employee?: string; project?: string; task?: string; hours?: string;
    }>({});

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

    // AI Auto-Assign state
    const [autoAssignLoading, setAutoAssignLoading] = useState<string | null>(null);

    async function handleAutoAssign(projectId: string) {
        setAutoAssignLoading(projectId);
        try {
            const res = await api.post(`/projects/${projectId}/auto-assign`);
            const data = res.data.data ?? res.data;
            const count = Array.isArray(data) ? data.length : 0;
            toast.success(count > 0 ? `Auto-assigned ${count} team members` : 'Team auto-assigned successfully');
        } catch (err) {
            toast.error('Auto-assign failed. Ensure the project has a linked contract and deal.');
        } finally {
            setAutoAssignLoading(null);
        }
    }

    const handleSaveTime = async () => {
        const errs: typeof timeErrors = {};
        if (!selectedEmployeeId) errs.employee = 'Please select a team member.';
        if (!selectedProjectId) errs.project = 'Please select a project.';
        if (!taskDesc.trim()) errs.task = 'Please describe the task.';
        if (!hoursLogged) errs.hours = 'Please enter the hours logged.';
        else if (Number(hoursLogged) <= 0) errs.hours = 'Hours must be greater than zero.';
        setTimeErrors(errs);
        if (Object.keys(errs).length > 0) return;

        const newEntry: TimeEntry = {
            id: `TIME-${crypto.randomUUID().split('-')[0]}`,
            projectId: selectedProjectId,
            employeeId: selectedEmployeeId,
            task: taskDesc,
            date: entryDate,
            hours: Number(hoursLogged),
            billable,
            status: 'Draft'
        };

        await createTimeEntry.mutateAsync(newEntry);
        setIsAddOpen(false);
        setTaskDesc('');
        setHoursLogged('');
        setBillable(true);
        setTimeErrors({});
    };

    const totalHoursLogged = timeEntries.reduce((sum, e) => sum + e.hours, 0);
    const activeProjectsCount = new Set(timeEntries.map(e => e.projectId)).size;
    const totalCapacity = store.employees
        .filter((employee) => employee.status === 'Active')
        .reduce((sum, employee) => sum + employee.workableHours, 0);
    const approvedHours = timeEntries
        .filter((entry) => entry.status === 'Approved')
        .reduce((sum, entry) => sum + entry.hours, 0);
    const utilization = totalCapacity > 0 ? Math.round((approvedHours / totalCapacity) * 100) : 0;
    const isLoading = projectsQuery.isLoading || timeEntriesQuery.isLoading;
    const isError = projectsQuery.isError || timeEntriesQuery.isError;
    const retry = () => {
        projectsQuery.refetch();
        timeEntriesQuery.refetch();
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Time Tracking & Utilization</h1>
                    <p className="text-[#8a8a8a] mt-1">Log hours against active projects to track budget consumption and labor costs.</p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#171717] hover:bg-[#00a7f4] gap-2">
                            <Plus className="h-4 w-4" /> Log Time
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Log Time to Project</DialogTitle>
                            <DialogDescription>
                                Accurately booking time drains the project budget and adds to direct labor costs in the P&L.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <p className="text-xs text-[#4a4a4a]">Fields marked <span className="text-destructive">*</span> are required.</p>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Employee <span className="text-destructive">*</span></label>
                                <Select value={selectedEmployeeId} onValueChange={v => { setSelectedEmployeeId(v); if (timeErrors.employee) setTimeErrors(p => ({ ...p, employee: undefined })); }}>
                                    <SelectTrigger aria-invalid={!!timeErrors.employee}>
                                        <SelectValue placeholder="Select team member..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {store.employees.map(emp => (
                                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {timeErrors.employee && <p className="text-xs text-destructive">{timeErrors.employee}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Project <span className="text-destructive">*</span></label>
                                <Select value={selectedProjectId} onValueChange={v => { setSelectedProjectId(v); if (timeErrors.project) setTimeErrors(p => ({ ...p, project: undefined })); }}>
                                    <SelectTrigger aria-invalid={!!timeErrors.project}>
                                        <SelectValue placeholder="Select active project..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {projects.map(prj => (
                                            <SelectItem key={prj.id} value={prj.id}>{prj.name} ({prj.client})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {timeErrors.project && <p className="text-xs text-destructive">{timeErrors.project}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Date <span className="text-destructive">*</span></label>
                                <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Task Description <span className="text-destructive">*</span></label>
                                    <Input
                                        value={taskDesc}
                                        onChange={e => { setTaskDesc(e.target.value); if (timeErrors.task) setTimeErrors(p => ({ ...p, task: undefined })); }}
                                        onBlur={() => { if (!taskDesc.trim()) setTimeErrors(p => ({ ...p, task: 'Please describe the task.' })); }}
                                        placeholder="e.g. API Integration"
                                        aria-invalid={!!timeErrors.task}
                                    />
                                    {timeErrors.task && <p className="text-xs text-destructive">{timeErrors.task}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Hours <span className="text-destructive">*</span></label>
                                    <Input
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        value={hoursLogged}
                                        onChange={e => { setHoursLogged(e.target.value); if (timeErrors.hours) setTimeErrors(p => ({ ...p, hours: undefined })); }}
                                        onBlur={() => { if (!hoursLogged || Number(hoursLogged) <= 0) setTimeErrors(p => ({ ...p, hours: 'Enter a valid number of hours.' })); }}
                                        placeholder="4.0"
                                        aria-invalid={!!timeErrors.hours}
                                    />
                                    {timeErrors.hours && <p className="text-xs text-destructive">{timeErrors.hours}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="billable"
                                    checked={billable}
                                    onChange={e => setBillable(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-[#171717] focus:ring-slate-900"
                                />
                                <label htmlFor="billable" className="text-sm font-medium text-slate-700">Billable</label>
                            </div>
                            <Button className="w-full bg-[#171717] hover:bg-[#00a7f4]" onClick={handleSaveTime} disabled={createTimeEntry.isPending}>
                                {createTimeEntry.isPending ? 'Submitting...' : 'Submit Time Entry'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Total Hours Logged</p>
                            <Clock className="h-5 w-5 text-[#00a7f4]" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{totalHoursLogged}h</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Active Projects Receiving Time</p>
                            <Briefcase className="h-5 w-5 text-indigo-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{activeProjectsCount}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Available Team Utilization</p>
                            <Users className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">
                                {utilization}%
                            </span>
                            <span className="text-sm text-[#8a8a8a]">average this month</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* AI Auto-Assign Section — only projects with NO team members yet */}
            {!isLoading && !isError && (
                <AutoAssignCard
                    projects={projects.filter(p => p.status === 'Not Started' || p.status === 'On Track')}
                    onAutoAssign={handleAutoAssign}
                    autoAssignLoading={autoAssignLoading}
                />
            )}

            {isLoading ? (
                <Card className="h-64 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
            ) : isError ? (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="flex h-64 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">Could not load time entries.</p>
                        <Button variant="outline" onClick={retry}>Retry</Button>
                    </CardContent>
                </Card>
            ) : (
            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader>
                    <CardTitle className="text-lg">Recent Time Entries</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Task</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Hours</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {timeEntries.slice().reverse().map((entry) => {
                                const emp = store.employees.find(e => e.id === entry.employeeId);
                                const prj = projects.find(p => p.id === entry.projectId);

                                return (
                                    <TableRow key={entry.id}>
                                        <TableCell className="text-[#8a8a8a] whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-[#8a8a8a]" />
                                                {entry.date}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">{emp?.name || 'Unknown'}</TableCell>
                                        <TableCell>{prj?.name || 'Unknown Project'}</TableCell>
                                        <TableCell className="text-[#4a4a4a]">{entry.task}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={STATUS_VARIANTS[entry.status] ?? 'bg-amber-50 text-amber-700 border-amber-200'}>
                                                {entry.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{entry.hours}h</TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                {entry.status !== 'Approved' && entry.status !== 'Rejected' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                                        disabled={approveTimeEntry.isPending}
                                                        onClick={() => approveTimeEntry.mutate(entry.id)}
                                                        title="Approve & Close"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                {entry.status === 'Pending' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                        disabled={rejectTimeEntry.isPending}
                                                        onClick={() => rejectTimeEntry.mutate(entry.id)}
                                                        title="Reject"
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                                    disabled={deleteTimeEntry.isPending}
                                                    onClick={() => {
                                                        setDeletingEntryId(entry.id);
                                                        setDeleteConfirmOpen(true);
                                                    }}
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {timeEntries.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-6 text-[#8a8a8a]">No time recorded yet. Log time to see data here.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            )}

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Time Entry</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        Are you sure you want to delete this time entry? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => {
                            if (deletingEntryId) {
                                deleteTimeEntry.mutate(deletingEntryId);
                            }
                            setDeleteConfirmOpen(false);
                            setDeletingEntryId(null);
                        }} disabled={deleteTimeEntry.isPending}>
                            {deleteTimeEntry.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function AutoAssignCard({
    projects,
    onAutoAssign,
    autoAssignLoading,
}: {
    projects: Project[];
    onAutoAssign: (projectId: string) => void;
    autoAssignLoading: string | null;
}) {
    return (
        <Card className="shadow-sm border-[#e6e9ee]">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#00a7f4]" />
                    AI Team Assignment
                </CardTitle>
                <CardDescription>
                    Automatically distribute workload hours for newly contracted projects that don&apos;t have a team yet.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {projects.map(project => (
                        <AutoAssignProjectRow
                            key={project.id}
                            project={project}
                            onAutoAssign={onAutoAssign}
                            autoAssignLoading={autoAssignLoading}
                        />
                    ))}
                    {projects.length === 0 && (
                        <p className="text-sm text-[#8a8a8a] text-center py-4">
                            No unstaffed active projects. Win a deal to create a new project.
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function AutoAssignProjectRow({
    project,
    onAutoAssign,
    autoAssignLoading,
}: {
    project: Project;
    onAutoAssign: (projectId: string) => void;
    autoAssignLoading: string | null;
}) {
    const teamQuery = useProjectTeam(project.id);
    const hasTeam = (teamQuery.data?.length ?? 0) > 0;

    // Don't show projects that already have team members assigned
    if (hasTeam) return null;

    return (
        <div className="flex items-center justify-between rounded-lg border border-[#e6e9ee] bg-white p-4">
            <div>
                <p className="text-sm font-medium text-[#171717]">{project.name}</p>
                <p className="text-xs text-[#8a8a8a]">{project.client} · {project.status}</p>
            </div>
            <Button
                size="sm"
                className="gap-2 bg-[#171717] hover:bg-[#00a7f4]"
                onClick={() => onAutoAssign(project.id)}
                disabled={autoAssignLoading === project.id || teamQuery.isLoading}
            >
                {autoAssignLoading === project.id ? (
                    <Clock className="h-4 w-4 animate-spin" />
                ) : (
                    <Sparkles className="h-4 w-4" />
                )}
                Auto-Assign Team
            </Button>
        </div>
    );
}
