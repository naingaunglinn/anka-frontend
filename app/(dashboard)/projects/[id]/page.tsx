'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Calendar, Users, Clock, FileWarning, ExternalLink, Briefcase, Sparkles, Plus, Trash2, Wand2 } from 'lucide-react';
import { useProjectDetail, useProjectMutations, useProjectTeam, useProjectTeamMutations } from '@/lib/queries/projects';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { useContractList } from '@/lib/queries/contracts';
import { useBusinessStore } from '@/store/businessStore';
import type { Project } from '@/types/business';

export default function ProjectDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const projectId = params.id;

    const projectQuery   = useProjectDetail(projectId);
    const teamQuery      = useProjectTeam(projectId);
    const timeEntriesQuery = useTimeEntryList({ project_id: projectId });
    const contractsQuery = useContractList();
    const employees = useBusinessStore(s => s.employees);
    const { updateProject } = useProjectMutations();
    const { assignMember, removeMember, autoAssignTeam } = useProjectTeamMutations(projectId);

    const project = projectQuery.data;
    const team    = useMemo(() => teamQuery.data ?? [], [teamQuery.data]);
    const timeEntries = useMemo(() => timeEntriesQuery.data?.data ?? [], [timeEntriesQuery.data]);
    const linkedContract = useMemo(
        () => contractsQuery.data?.data.find(c => c.id === project?.contractId),
        [contractsQuery.data, project?.contractId],
    );

    // ── Derived hours / burn-rate figures ────────────────────────────────────
    const budgetHours    = project?.budgetHours ?? 0;
    const consumedHours  = project?.consumedHours ?? 0;
    const remainingHours = Math.max(0, budgetHours - consumedHours);
    const burnPercent    = budgetHours > 0 ? Math.min(100, Math.round((consumedHours / budgetHours) * 100)) : 0;

    // Days-to-budget projection: based on the last 14 days of approved entries.
    // If the recent burn rate continues, this is when consumed will hit budget.
    const daysToBudget = useMemo(() => {
        if (remainingHours <= 0) return 0;
        const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
        const recentApprovedHours = timeEntries
            .filter(t => t.status === 'Approved' && t.date >= cutoff)
            .reduce((sum, t) => sum + t.hours, 0);
        if (recentApprovedHours <= 0) return null;
        const dailyBurn = recentApprovedHours / 14;
        return Math.round(remainingHours / dailyBurn);
    }, [timeEntries, remainingHours]);

    // Per-employee consumed hours (from approved time entries on this project)
    const consumedByEmployee = useMemo(() => {
        const map = new Map<string, number>();
        timeEntries.forEach(t => {
            if (t.status === 'Approved' && t.employeeId) {
                map.set(t.employeeId, (map.get(t.employeeId) ?? 0) + t.hours);
            }
        });
        return map;
    }, [timeEntries]);

    const recentEntries = useMemo(
        () => timeEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
        [timeEntries],
    );

    const totalAllocatedHours = team.reduce((s, a) => s + (a.allocatedHours ?? 0), 0);

    // ── Edit details dialog (kickoff date, PM, budget, end date) ─────────────
    const [editOpen, setEditOpen] = useState(false);
    const [editKickoff, setEditKickoff] = useState('');
    const [editEnd, setEditEnd] = useState('');
    const [editBudget, setEditBudget] = useState('');
    const [editPm, setEditPm] = useState('__none__');

    const openEdit = () => {
        if (!project) return;
        setEditKickoff(project.kickoffDate ?? '');
        setEditEnd(project.endDate ?? '');
        setEditBudget(String(project.budgetHours));
        setEditPm(project.projectManagerId ?? '__none__');
        setEditOpen(true);
    };

    const saveEdit = async () => {
        if (!project) return;
        await updateProject.mutateAsync({
            id: project.id,
            updates: {
                kickoffDate:      editKickoff || undefined,
                endDate:          editEnd     || undefined,
                budgetHours:      Number(editBudget) || 0,
                projectManagerId: editPm === '__none__' ? undefined : editPm,
            },
        });
        setEditOpen(false);
    };

    // ── Status change action ─────────────────────────────────────────────────
    const setStatus = (status: Project['status']) => {
        if (!project) return;
        updateProject.mutate({ id: project.id, updates: { status } });
    };

    // ── Add team member dialog ───────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [newEmployeeId, setNewEmployeeId] = useState('');
    const [newAllocatedHours, setNewAllocatedHours] = useState('40');

    const assignableEmployees = useMemo(() => {
        const onTeam = new Set(team.map(t => t.employeeId));
        return employees.filter(e => e.status === 'Active' && !onTeam.has(e.id));
    }, [employees, team]);

    const handleAddMember = async () => {
        if (!newEmployeeId || !newAllocatedHours) return;
        try {
            await assignMember.mutateAsync({
                employeeId: newEmployeeId,
                allocatedHours: Number(newAllocatedHours),
            });
            setAddOpen(false);
            setNewEmployeeId('');
            setNewAllocatedHours('40');
        } catch {
            // toast surfaced by mutation; keep dialog open so user can retry
        }
    };

    // ── Remove member confirm dialog ─────────────────────────────────────────
    const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
    const removingMember = team.find(t => t.id === removingAssignmentId);

    const handleRemoveMember = async () => {
        if (!removingAssignmentId) return;
        try {
            await removeMember.mutateAsync(removingAssignmentId);
        } finally {
            setRemovingAssignmentId(null);
        }
    };

    // ── AI auto-assign confirm dialog ────────────────────────────────────────
    const [autoAssignOpen, setAutoAssignOpen] = useState(false);

    const handleAutoAssign = async () => {
        try {
            await autoAssignTeam.mutateAsync();
        } finally {
            setAutoAssignOpen(false);
        }
    };

    // ── Render guards ────────────────────────────────────────────────────────
    if (projectQuery.isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Card className="h-32 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
                <Card className="h-64 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
            </div>
        );
    }

    if (projectQuery.isError || !project) {
        return (
            <div className="p-6">
                <Card className="border-[#e6e9ee] shadow-sm">
                    <CardContent className="flex h-40 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">Could not load project.</p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => router.push('/projects')}>Back to projects</Button>
                            <Button variant="outline" onClick={() => projectQuery.refetch()}>Retry</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const statusBadgeClass = (s: Project['status']) =>
        s === 'On Track'    ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20' :
        s === 'At Risk'     ? 'bg-amber-50 text-amber-700 border-amber-200' :
        s === 'Over Budget' ? 'bg-rose-50 text-rose-700 border-rose-200' :
        s === 'Completed'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              'bg-slate-100 text-slate-700 border-slate-200';

    const burnColor =
        burnPercent > 85 ? 'bg-rose-500' :
        burnPercent > 70 ? 'bg-amber-500' :
                           'bg-[#00a7f4]/60';

    const contractWarning = linkedContract && linkedContract.status === 'Draft';

    return (
        <div className="p-6 space-y-6">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <button
                        onClick={() => router.push('/projects')}
                        className="flex items-center gap-1 text-sm text-[#4a4a4a] hover:text-[#171717] mb-2"
                    >
                        <ArrowLeft className="h-4 w-4" /> Back to projects
                    </button>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{project.name}</h1>
                        <Badge variant="outline" className={statusBadgeClass(project.status)}>{project.status}</Badge>
                        <span className="text-xs text-[#8a8a8a]">{project.projectNumber ?? project.id.slice(0, 8)}</span>
                    </div>
                    <p className="text-[#8a8a8a] mt-1">{project.client}</p>
                </div>
                <div className="flex gap-2">
                    <Select value="" onValueChange={(v) => setStatus(v as Project['status'])}>
                        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Change status…" /></SelectTrigger>
                        <SelectContent>
                            {(['Not Started', 'On Track', 'At Risk', 'Over Budget', 'Completed'] as const)
                                .filter(s => s !== project.status)
                                .map(s => <SelectItem key={s} value={s}>Mark {s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={openEdit}>Edit details</Button>
                </div>
            </div>

            {/* ── Soft-gate warning: contract not signed ─────────────────── */}
            {contractWarning && (
                <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
                    <CardContent className="p-4 flex items-center gap-3 text-sm text-amber-900">
                        <FileWarning className="h-5 w-5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="font-medium">Linked contract is still in Draft status.</p>
                            <p className="text-xs mt-0.5">Time logged against this project may not be invoiceable until the contract is signed.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => router.push(`/contracts/${linkedContract.id}`)}>
                            Open contract
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* ── Metadata + linked entities ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <MetaField icon={<Calendar className="h-4 w-4" />} label="Start date" value={project.startDate ?? '—'} />
                            <MetaField icon={<Calendar className="h-4 w-4" />} label="Kickoff date" value={project.kickoffDate ?? '—'} highlight={!project.kickoffDate} />
                            <MetaField icon={<Calendar className="h-4 w-4" />} label="End date" value={project.endDate ?? '—'} />
                            <MetaField icon={<Briefcase className="h-4 w-4" />} label="Project manager" value={project.projectManagerName ?? 'Unassigned'} highlight={!project.projectManagerName} />
                            <MetaField icon={<Users className="h-4 w-4" />} label="Team size" value={`${team.length} ${team.length === 1 ? 'member' : 'members'}`} highlight={team.length === 0} />
                            <MetaField icon={<Clock className="h-4 w-4" />} label="Allocated hours" value={`${totalAllocatedHours}h`} />
                        </div>
                        {linkedContract && (
                            <div className="border-t border-[#e6e9ee] pt-4 flex flex-wrap gap-3 text-sm">
                                <button
                                    onClick={() => router.push(`/contracts/${linkedContract.id}`)}
                                    className="inline-flex items-center gap-1 text-[#00a7f4] hover:underline"
                                >
                                    Linked contract: {linkedContract.contractNumber ?? linkedContract.id.slice(0, 8)} ({linkedContract.status})
                                    <ExternalLink className="h-3 w-3" />
                                </button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Burn-rate card */}
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6 space-y-4">
                        <div>
                            <p className="text-xs font-medium text-[#8a8a8a] uppercase tracking-wide">Budget burn</p>
                            <p className="text-3xl font-bold tracking-tight text-[#171717] mt-1">{consumedHours}<span className="text-base font-medium text-[#8a8a8a]"> / {budgetHours} h</span></p>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-[#4a4a4a]">{burnPercent}% consumed</span>
                                <span className="text-[#8a8a8a]">{remainingHours}h remaining</span>
                            </div>
                            <Progress value={burnPercent} className="h-2" indicatorClassName={burnColor} />
                        </div>
                        <div className="pt-3 border-t border-[#e6e9ee] flex items-center justify-between text-xs">
                            <span className="text-[#8a8a8a]">Days to budget @ recent burn</span>
                            <span className={`font-semibold ${daysToBudget !== null && daysToBudget < 14 ? 'text-rose-600' : 'text-[#171717]'}`}>
                                {daysToBudget === null ? '—' : daysToBudget === 0 ? 'Budget reached' : `~${daysToBudget} days`}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Team roster ────────────────────────────────────────────── */}
            <Card className="shadow-sm border-[#e6e9ee]">
                <CardContent className="p-0">
                    <div className="px-6 py-4 border-b border-[#e6e9ee] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-[#8a8a8a]" />
                            <p className="text-sm font-semibold text-[#171717]">Team roster</p>
                            <span className="text-xs text-[#8a8a8a]">— {team.length} {team.length === 1 ? 'member' : 'members'}</span>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => setAutoAssignOpen(true)}
                                disabled={autoAssignTeam.isPending}
                                title="Rebuild the roster from AI suggestions based on the deal's required roles"
                            >
                                <Wand2 className="h-3.5 w-3.5" />
                                {autoAssignTeam.isPending ? 'Rebuilding…' : 'AI auto-assign'}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => setAddOpen(true)}
                                disabled={assignableEmployees.length === 0}
                                title={assignableEmployees.length === 0 ? 'All active employees are already on this team' : 'Add a team member'}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add member
                            </Button>
                        </div>
                    </div>
                    {team.length === 0 ? (
                        <div className="p-6 text-center text-sm text-[#8a8a8a]">
                            No team members assigned. Click <span className="font-medium">Add member</span> or <span className="font-medium">AI auto-assign</span> above.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow>
                                    <TableHead>Member</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead className="text-right">Allocated</TableHead>
                                    <TableHead className="text-right">Consumed</TableHead>
                                    <TableHead className="w-[160px]">Utilization</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {team.map(assignment => {
                                    const consumed = consumedByEmployee.get(assignment.employeeId) ?? 0;
                                    const util = assignment.allocatedHours > 0 ? Math.min(100, Math.round((consumed / assignment.allocatedHours) * 100)) : 0;
                                    const utilColor = util > 100 ? 'bg-rose-500' : util > 85 ? 'bg-amber-500' : 'bg-emerald-500';
                                    const sourceLabel =
                                        assignment.assignmentSource === 'deal_transfer' ? 'From deal' :
                                        assignment.assignmentSource === 'ai' ? 'AI-suggested' :
                                                                              'Manual';
                                    return (
                                        <TableRow key={assignment.id}>
                                            <TableCell className="font-medium">{assignment.employeeName ?? assignment.employeeId.slice(0, 8)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                                                    {sourceLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{assignment.allocatedHours}h</TableCell>
                                            <TableCell className="text-right text-[#4a4a4a]">{consumed}h</TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <span className="text-xs text-[#4a4a4a]">{util}%</span>
                                                    <Progress value={util} className="h-1.5" indicatorClassName={utilColor} />
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-rose-500 hover:text-rose-600"
                                                    onClick={() => setRemovingAssignmentId(assignment.id)}
                                                    disabled={removeMember.isPending}
                                                    title="Remove from team"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* ── Recent time entries ────────────────────────────────────── */}
            <Card className="shadow-sm border-[#e6e9ee]">
                <CardContent className="p-0">
                    <div className="px-6 py-4 border-b border-[#e6e9ee] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-[#8a8a8a]" />
                            <p className="text-sm font-semibold text-[#171717]">Recent time entries</p>
                            <span className="text-xs text-[#8a8a8a]">— last {recentEntries.length} of {timeEntries.length}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => router.push('/time-tracking')}>
                            Open Time Tracking
                        </Button>
                    </div>
                    {recentEntries.length === 0 ? (
                        <div className="p-6 text-center text-sm text-[#8a8a8a]">
                            No time entries logged on this project yet.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Task</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Hours</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentEntries.map(entry => {
                                    const employeeName =
                                        team.find(t => t.employeeId === entry.employeeId)?.employeeName
                                        ?? employees.find(e => e.id === entry.employeeId)?.name
                                        ?? entry.employeeId.slice(0, 8);
                                    return (
                                        <TableRow key={entry.id}>
                                            <TableCell>{entry.date}</TableCell>
                                            <TableCell>{employeeName}</TableCell>
                                            <TableCell className="text-sm text-[#4a4a4a] max-w-[300px] truncate">{entry.task}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    entry.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    entry.status === 'Pending'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    entry.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                                  'bg-slate-100 text-slate-700 border-slate-200'
                                                }>
                                                    {entry.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{entry.hours}h</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* ── Add team member dialog ────────────────────────────────── */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add team member</DialogTitle>
                        <DialogDescription>Assign an active employee to this project with an hour allocation.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Employee</label>
                            <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
                                <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                                <SelectContent>
                                    {assignableEmployees.map(e => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {e.name}{e.roleName ? ` — ${e.roleName}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {assignableEmployees.length === 0 && (
                                <p className="text-xs text-[#8a8a8a]">All active employees are already on this team.</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Allocated hours</label>
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                value={newAllocatedHours}
                                onChange={e => setNewAllocatedHours(e.target.value)}
                                placeholder="40"
                            />
                            <p className="text-xs text-[#8a8a8a]">Hours budgeted for this person on this project. Drives the utilization bar.</p>
                        </div>
                        <Button
                            className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                            onClick={handleAddMember}
                            disabled={!newEmployeeId || !newAllocatedHours || Number(newAllocatedHours) <= 0 || assignMember.isPending}
                        >
                            {assignMember.isPending ? 'Adding…' : 'Add to team'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Remove member confirm dialog ──────────────────────────── */}
            <Dialog open={!!removingAssignmentId} onOpenChange={open => !open && setRemovingAssignmentId(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Remove team member</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        Remove <span className="font-medium text-[#171717]">{removingMember?.employeeName ?? 'this member'}</span> from the team?
                        Time entries they already logged stay on the project — only the allocation is dropped.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setRemovingAssignmentId(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleRemoveMember} disabled={removeMember.isPending}>
                            {removeMember.isPending ? 'Removing…' : 'Remove'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── AI auto-assign confirm dialog ─────────────────────────── */}
            <Dialog open={autoAssignOpen} onOpenChange={setAutoAssignOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wand2 className="h-4 w-4 text-[#00a7f4]" />
                            Run AI auto-assign?
                        </DialogTitle>
                        <DialogDescription>
                            This will <span className="font-medium text-rose-600">replace the current {team.length}-member roster</span> with
                            an AI-suggested team built from the deal&apos;s required roles and the agency&apos;s active employees.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="text-xs text-[#4a4a4a] bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
                            <p><span className="font-medium text-[#171717]">What stays:</span> time entries already logged.</p>
                            <p><span className="font-medium text-[#171717]">What changes:</span> the team list + allocated hours per member.</p>
                            <p className="text-[#8a8a8a]">If no AI key is configured, a demo distribution by capacity role runs instead.</p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setAutoAssignOpen(false)}>Cancel</Button>
                            <Button
                                className="bg-[#00a7f4] hover:bg-[#0086c4] gap-1.5"
                                onClick={handleAutoAssign}
                                disabled={autoAssignTeam.isPending}
                            >
                                <Wand2 className="h-3.5 w-3.5" />
                                {autoAssignTeam.isPending ? 'Rebuilding…' : 'Yes, rebuild team'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Edit details dialog ────────────────────────────────────── */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit project details</DialogTitle>
                        <DialogDescription>Kickoff scheduling, PM assignment, and budget tuning.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Kickoff date</label>
                                <Input type="date" value={editKickoff} onChange={e => setEditKickoff(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">End date</label>
                                <Input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Project manager</label>
                            <Select value={editPm} onValueChange={setEditPm}>
                                <SelectTrigger><SelectValue placeholder="Select PM…" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Unassigned</SelectItem>
                                    {employees
                                        .filter(e => e.status === 'Active')
                                        .map(e => <SelectItem key={e.id} value={e.id}>{e.name}{e.roleName ? ` — ${e.roleName}` : ''}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Budget hours</label>
                            <Input type="number" min="0" step="1" value={editBudget} onChange={e => setEditBudget(e.target.value)} />
                            <p className="text-xs text-[#8a8a8a]">Consumed: {consumedHours}h · increasing the budget moves the over-budget threshold.</p>
                        </div>
                        <Button
                            className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                            onClick={saveEdit}
                            disabled={updateProject.isPending}
                        >
                            {updateProject.isPending ? 'Saving…' : 'Save changes'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Small subcomponents ───────────────────────────────────────────────────────

function MetaField({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-xs text-[#8a8a8a] mb-0.5">
                {icon}
                <span>{label}</span>
            </div>
            <p className={`text-sm truncate ${highlight ? 'text-amber-700' : 'text-[#171717]'}`}>
                {highlight && <Sparkles className="h-3 w-3 inline mr-1" />}
                {value}
            </p>
        </div>
    );
}
