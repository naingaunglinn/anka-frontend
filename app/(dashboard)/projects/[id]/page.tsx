'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Calendar, Users, Clock, FileWarning, ExternalLink, Briefcase, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useProjectDetail, useProjectMutations, useProjectTeam, useProjectTeamMutations } from '@/lib/queries/projects';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { useContractList } from '@/lib/queries/contracts';
import { useBusinessStore } from '@/store/businessStore';
import type { Project } from '@/types/business';

// Map ProjectStatus enum to translation keys (kept English internally for stable comparisons).
const PROJECT_STATUS_KEY: Record<Project['status'], string> = {
    'Not Started': 'status_not_started',
    'On Track':    'status_on_track',
    'At Risk':     'status_at_risk',
    'Over Budget': 'status_over_budget',
    'Completed':   'status_completed',
};

const TIME_ENTRY_STATUS_KEY: Record<string, string> = {
    Approved: 'status_approved',
    Pending:  'status_pending',
    Rejected: 'status_rejected',
};

export default function ProjectDetailPage() {
    const t = useTranslations();
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const projectId = params.id;

    const projectQuery   = useProjectDetail(projectId);
    const teamQuery      = useProjectTeam(projectId);
    const timeEntriesQuery = useTimeEntryList({ project_id: projectId });
    const contractsQuery = useContractList();
    const employees = useBusinessStore(s => s.employees);
    const { updateProject } = useProjectMutations();
    const { assignMember, removeMember } = useProjectTeamMutations(projectId);

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
                        <p className="text-sm text-[#4a4a4a]">{t('could_not_load_project')}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => router.push('/projects')}>{t('back_to_projects')}</Button>
                            <Button variant="outline" onClick={() => projectQuery.refetch()}>{t('retry')}</Button>
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
                        <ArrowLeft className="h-4 w-4" /> {t('back_to_projects')}
                    </button>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{project.name}</h1>
                        <Badge variant="outline" className={statusBadgeClass(project.status)}>{t(PROJECT_STATUS_KEY[project.status])}</Badge>
                        <span className="text-xs text-[#8a8a8a]">{project.projectNumber ?? project.id.slice(0, 8)}</span>
                    </div>
                    <p className="text-[#8a8a8a] mt-1">{project.client}</p>
                </div>
                <div className="flex gap-2">
                    <Select value="" onValueChange={(v) => setStatus(v as Project['status'])}>
                        <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('change_status')} /></SelectTrigger>
                        <SelectContent>
                            {(['Not Started', 'On Track', 'At Risk', 'Over Budget', 'Completed'] as const)
                                .filter(s => s !== project.status)
                                .map(s => <SelectItem key={s} value={s}>{t('mark_simple', { status: t(PROJECT_STATUS_KEY[s]) })}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={openEdit}>{t('edit_details')}</Button>
                </div>
            </div>

            {/* ── Soft-gate warning: contract not signed ─────────────────── */}
            {contractWarning && (
                <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
                    <CardContent className="p-4 flex items-center gap-3 text-sm text-amber-900">
                        <FileWarning className="h-5 w-5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="font-medium">{t('linked_contract_draft_warning')}</p>
                            <p className="text-xs mt-0.5">{t('contract_draft_subnote')}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => router.push(`/contracts/${linkedContract.id}`)}>
                            {t('open_contract')}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* ── Metadata + linked entities ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6 space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <MetaField icon={<Calendar className="h-4 w-4" />} label={t('start_date')} value={project.startDate ?? '—'} />
                            <MetaField icon={<Calendar className="h-4 w-4" />} label={t('kickoff_date')} value={project.kickoffDate ?? '—'} highlight={!project.kickoffDate} />
                            <MetaField icon={<Calendar className="h-4 w-4" />} label={t('end_date')} value={project.endDate ?? '—'} />
                            <MetaField icon={<Briefcase className="h-4 w-4" />} label={t('project_manager')} value={project.projectManagerName ?? t('unassigned')} highlight={!project.projectManagerName} />
                            <MetaField icon={<Users className="h-4 w-4" />} label={t('team_size')} value={t(team.length === 1 ? 'member_singular' : 'member_plural', { count: team.length })} highlight={team.length === 0} />
                            <MetaField icon={<Clock className="h-4 w-4" />} label={t('allocated_hours')} value={`${totalAllocatedHours}h`} />
                        </div>
                        {linkedContract && (
                            <div className="border-t border-[#e6e9ee] pt-4 flex flex-wrap gap-3 text-sm">
                                <button
                                    onClick={() => router.push(`/contracts/${linkedContract.id}`)}
                                    className="inline-flex items-center gap-1 text-[#00a7f4] hover:underline"
                                >
                                    {t('linked_contract', { number: linkedContract.contractNumber ?? linkedContract.id.slice(0, 8), status: linkedContract.status })}
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
                            <p className="text-xs font-medium text-[#8a8a8a] uppercase tracking-wide">{t('budget_burn')}</p>
                            <p className="text-3xl font-bold tracking-tight text-[#171717] mt-1">{consumedHours}<span className="text-base font-medium text-[#8a8a8a]"> / {budgetHours} h</span></p>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-[#4a4a4a]">{t('percent_consumed', { percent: burnPercent })}</span>
                                <span className="text-[#8a8a8a]">{t('remaining_hours', { hours: remainingHours })}</span>
                            </div>
                            <Progress value={burnPercent} className="h-2" indicatorClassName={burnColor} />
                        </div>
                        <div className="pt-3 border-t border-[#e6e9ee] flex items-center justify-between text-xs">
                            <span className="text-[#8a8a8a]">{t('days_to_budget')}</span>
                            <span className={`font-semibold ${daysToBudget !== null && daysToBudget < 14 ? 'text-rose-600' : 'text-[#171717]'}`}>
                                {daysToBudget === null ? '—' : daysToBudget === 0 ? t('budget_reached') : t('approx_days', { days: daysToBudget })}
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
                            <p className="text-sm font-semibold text-[#171717]">{t('team_roster')}</p>
                            <span className="text-xs text-[#8a8a8a]">— {t(team.length === 1 ? 'member_singular' : 'member_plural', { count: team.length })}</span>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => setAddOpen(true)}
                                disabled={assignableEmployees.length === 0}
                                title={assignableEmployees.length === 0 ? t('all_active_already_on_team') : t('add_a_team_member_tooltip')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('add_member')}
                            </Button>
                        </div>
                    </div>
                    {team.length === 0 ? (
                        <div className="p-6 text-center text-sm text-[#8a8a8a]">
                            {t('no_team_members')} <span className="font-medium">{t('add_member')}</span> {t('no_team_members_after')}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow>
                                    <TableHead>{t('member')}</TableHead>
                                    <TableHead>{t('source')}</TableHead>
                                    <TableHead className="text-right">{t('allocated')}</TableHead>
                                    <TableHead className="text-right">{t('consumed')}</TableHead>
                                    <TableHead className="w-[160px]">{t('utilization')}</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {team.map(assignment => {
                                    const consumed = consumedByEmployee.get(assignment.employeeId) ?? 0;
                                    const util = assignment.allocatedHours > 0 ? Math.min(100, Math.round((consumed / assignment.allocatedHours) * 100)) : 0;
                                    const utilColor = util > 100 ? 'bg-rose-500' : util > 85 ? 'bg-amber-500' : 'bg-emerald-500';
                                    const sourceLabel =
                                        assignment.assignmentSource === 'deal_transfer' ? t('source_from_deal') :
                                        assignment.assignmentSource === 'ai' ? t('source_ai') :
                                                                              t('source_manual');
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
                                                    title={t('remove_from_team')}
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
                            <p className="text-sm font-semibold text-[#171717]">{t('recent_time_entries')}</p>
                            <span className="text-xs text-[#8a8a8a]">— {t('last_x_of_y', { shown: recentEntries.length, total: timeEntries.length })}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => router.push('/time-tracking')}>
                            {t('open_time_tracking')}
                        </Button>
                    </div>
                    {recentEntries.length === 0 ? (
                        <div className="p-6 text-center text-sm text-[#8a8a8a]">
                            {t('no_time_entries_yet')}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow>
                                    <TableHead>{t('date')}</TableHead>
                                    <TableHead>{t('employee')}</TableHead>
                                    <TableHead>{t('task')}</TableHead>
                                    <TableHead>{t('status')}</TableHead>
                                    <TableHead className="text-right">{t('hours')}</TableHead>
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
                                                    {TIME_ENTRY_STATUS_KEY[entry.status] ? t(TIME_ENTRY_STATUS_KEY[entry.status]) : entry.status}
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
                        <DialogTitle>{t('add_team_member')}</DialogTitle>
                        <DialogDescription>{t('add_team_member_description')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('employee_label')}</label>
                            <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
                                <SelectTrigger><SelectValue placeholder={t('select_employee_placeholder')} /></SelectTrigger>
                                <SelectContent>
                                    {assignableEmployees.map(e => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {e.name}{e.roleName ? ` — ${e.roleName}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {assignableEmployees.length === 0 && (
                                <p className="text-xs text-[#8a8a8a]">{t('all_active_on_team_short')}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('allocated_hours')}</label>
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                value={newAllocatedHours}
                                onChange={e => setNewAllocatedHours(e.target.value)}
                                placeholder="40"
                            />
                            <p className="text-xs text-[#8a8a8a]">{t('allocated_hours_helper')}</p>
                        </div>
                        <Button
                            className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                            onClick={handleAddMember}
                            disabled={!newEmployeeId || !newAllocatedHours || Number(newAllocatedHours) <= 0 || assignMember.isPending}
                        >
                            {assignMember.isPending ? t('adding') : t('add_to_team')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Remove member confirm dialog ──────────────────────────── */}
            <Dialog open={!!removingAssignmentId} onOpenChange={open => !open && setRemovingAssignmentId(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('remove_team_member')}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        {t('remove_member_confirm_prefix')} <span className="font-medium text-[#171717]">{removingMember?.employeeName ?? t('this_member')}</span>{t('remove_member_confirm_suffix')}
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setRemovingAssignmentId(null)}>{t('cancel')}</Button>
                        <Button variant="destructive" onClick={handleRemoveMember} disabled={removeMember.isPending}>
                            {removeMember.isPending ? t('removing') : t('remove')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Edit details dialog ────────────────────────────────────── */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('edit_project_details')}</DialogTitle>
                        <DialogDescription>{t('edit_project_details_description')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">{t('kickoff_date')}</label>
                                <Input type="date" value={editKickoff} onChange={e => setEditKickoff(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">{t('end_date')}</label>
                                <Input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('project_manager')}</label>
                            <Select value={editPm} onValueChange={setEditPm}>
                                <SelectTrigger><SelectValue placeholder={t('select_pm_placeholder')} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">{t('unassigned')}</SelectItem>
                                    {employees
                                        .filter(e => e.status === 'Active')
                                        .map(e => <SelectItem key={e.id} value={e.id}>{e.name}{e.roleName ? ` — ${e.roleName}` : ''}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">{t('budget_hours_label')}</label>
                            <Input type="number" min="0" step="1" value={editBudget} onChange={e => setEditBudget(e.target.value)} />
                            <p className="text-xs text-[#8a8a8a]">{t('consumed_with_note', { hours: consumedHours })}</p>
                        </div>
                        <Button
                            className="w-full bg-[#171717] hover:bg-[#00a7f4]"
                            onClick={saveEdit}
                            disabled={updateProject.isPending}
                        >
                            {updateProject.isPending ? t('saving') : t('save_changes')}
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
