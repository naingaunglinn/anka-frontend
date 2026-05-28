'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Clock, Briefcase, Sparkles, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeError } from '@/lib/errorHandler';
import { useProjectList, useProjectTeam, useProjectTaskAssignments, projectKeys } from '@/lib/queries/projects';
import { scheduleTrackingKeys, useProgressLogSummary } from '@/lib/queries/scheduleTracking';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import type { Project } from '@/types/business';
import { MasterAssignTable } from '@/components/team-assignment/MasterAssignTable';
import { SimulatedDateBar, SimulatedDateBanner } from '@/components/SimulatedDateBar';
import { TeamPreviewDialog } from '@/components/team-assignment/TeamPreviewDialog';

export default function TimeTrackingPage() {
    const t = useTranslations();
    const projectsQuery = useProjectList();
    const timeEntriesQuery = useTimeEntryList();
    const queryClient = useQueryClient();
    const projects = projectsQuery.data?.data ?? [];
    const timeEntries = timeEntriesQuery.data?.data ?? [];

    // This page is the manager's view of *currently running* work — projects
    // whose budget can still drain and whose tasks still need scheduling.
    // Completed projects belong on the historical reporting pages (Finance,
    // archives) so they don't clutter the dropdown or the AI-assign card here.
    const runningProjects = useMemo(
        () => projects.filter((p) => p.status !== 'Completed'),
        [projects],
    );

    // Master Assign Table — which project's tasks to display
    const [tableProjectId, setTableProjectId] = useState<string>('');
    useEffect(() => {
        if (!tableProjectId && runningProjects.length > 0) {
            setTableProjectId(runningProjects[0].id);
        }
    }, [runningProjects, tableProjectId]);
    // If the previously-selected project flipped to Completed since last load,
    // drop it from the picker so we don't show a stale selection.
    useEffect(() => {
        if (tableProjectId && !runningProjects.some((p) => p.id === tableProjectId)) {
            setTableProjectId(runningProjects[0]?.id ?? '');
        }
    }, [runningProjects, tableProjectId]);

    // AI Task Assignment — preview/confirm flow (per-project loading flag)
    const [autoAssignLoading, setAutoAssignLoading] = useState<string | null>(null);
    const [teamPreviewProjectId, setTeamPreviewProjectId] = useState<string | null>(null);
    const [destructiveConfirm, setDestructiveConfirm] = useState<{
        projectId: string;
        manualEdits: number;
        editedDates: number;
    } | null>(null);

    const teamPreviewProjectName = teamPreviewProjectId
        ? projects.find((p) => p.id === teamPreviewProjectId)?.name
        : undefined;

    function handleAutoAssign(projectId: string) {
        // Open the team-build preview dialog. The dialog calls the AI to
        // propose employees for the project's planned ghost-role structure.
        // The actual /assign-tasks call fires AFTER the user confirms via
        // `runAssignTasks` below.
        setTeamPreviewProjectId(projectId);
    }

    // Re-running assign-tasks deletes ProjectTaskAssignment rows (FK cascades
    // to phase assignments and progress logs). If the user has manually edited
    // anything on this project, warn them before we wipe it. Read straight from
    // the React Query cache so there's no extra network call.
    function inspectDestructiveImpact(projectId: string) {
        const cached = queryClient.getQueryData<{ data?: Array<{ phases?: Array<{ assignmentSource?: string; plannedDatesEditedAt?: string | null }> }> }>(
            projectKeys.taskAssignments(projectId),
        );
        const tasks = cached?.data ?? [];
        let manualEdits = 0;
        let editedDates = 0;
        for (const t of tasks) {
            for (const p of (t.phases ?? [])) {
                if (p.assignmentSource === 'manual') manualEdits++;
                if (p.plannedDatesEditedAt) editedDates++;
            }
        }
        return { manualEdits, editedDates };
    }

    function maybeConfirmThenAssign(projectId: string) {
        const impact = inspectDestructiveImpact(projectId);
        if (impact.manualEdits === 0 && impact.editedDates === 0) {
            runAssignTasks(projectId);
            return;
        }
        setDestructiveConfirm({ projectId, ...impact });
    }

    async function runAssignTasks(projectId: string) {
        setAutoAssignLoading(projectId);
        try {
            const res = await api.post(`/projects/${projectId}/assign-tasks`);
            const data = res.data.data ?? [];
            const phases = res.data.meta?.active_phases ?? [];
            const count = Array.isArray(data) ? data.length : 0;
            const phaseCount = Array.isArray(phases) ? phases.length : 0;
            toast.success(count > 0
                ? t('ai_assigned_summary', { count, phaseCount })
                : t('task_assignment_finished')
            );
            setTableProjectId(projectId);
            queryClient.invalidateQueries({ queryKey: projectKeys.taskAssignments(projectId) });
            queryClient.invalidateQueries({ queryKey: scheduleTrackingKeys.all });
        } catch (err) {
            // Show the backend's actual message (e.g. "Upload an estimation
            // (xlsx) for this project before building the team.") instead of
            // a generic fallback. normalizeError reads `response.data.message`
            // which matches the Laravel API convention used across the app.
            toast.error(normalizeError(err).message);
        } finally {
            setAutoAssignLoading(null);
        }
    }

    // KPIs scoped to currently-running projects only — completed projects
    // belong on historical reporting (Finance), not on the live ops view.
    const runningProjectIds = useMemo(
        () => new Set(runningProjects.map((p) => p.id)),
        [runningProjects],
    );
    const runningTimeEntries = useMemo(
        () => timeEntries.filter((e) => runningProjectIds.has(e.projectId)),
        [timeEntries, runningProjectIds],
    );

    const hoursSummaryQuery = useProgressLogSummary({
        projectId:   tableProjectId || undefined,
    });
    const totalHoursLogged = hoursSummaryQuery.data?.totalUsedHours ?? 0;
    const selectedProjectName = tableProjectId
        ? projects.find((p) => p.id === tableProjectId)?.name
        : undefined;

    const activeProjectsCount = new Set(runningTimeEntries.map(e => e.projectId)).size;
    const isLoading = projectsQuery.isLoading || timeEntriesQuery.isLoading;
    const isError = projectsQuery.isError || timeEntriesQuery.isError;
    const retry = () => {
        projectsQuery.refetch();
        timeEntriesQuery.refetch();
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('time_tracking_utilization')}</h1>
                <p className="text-[#8a8a8a] mt-1">{t('time_tracking_description')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card variant="plain">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('total_hours_logged')}</p>
                            <Clock className="h-5 w-5 text-[#00a7f4]" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">
                                {hoursSummaryQuery.isLoading ? '—' : `${totalHoursLogged}h`}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-[#8a8a8a] truncate" title={selectedProjectName ?? ''}>
                            {selectedProjectName ? `For ${selectedProjectName}` : 'Pick a project below to scope'}
                        </p>
                    </CardContent>
                </Card>
                <Card variant="plain">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('active_projects_receiving_time')}</p>
                            <Briefcase className="h-5 w-5 text-indigo-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{activeProjectsCount}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* AI Auto-Assign Section — currently running projects only */}
            {!isLoading && !isError && (
                <AutoAssignCard
                    projects={runningProjects}
                    onAutoAssign={handleAutoAssign}
                    onAssignTasksOnly={runAssignTasks}
                    autoAssignLoading={autoAssignLoading}
                />
            )}

            {isLoading ? (
                <Card variant="plain" className="h-64 animate-pulse bg-slate-100" />
            ) : isError ? (
                <Card variant="plain">
                    <CardContent className="flex h-64 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">{t('could_not_load_projects')}</p>
                        <Button variant="outline" onClick={retry}>{t('retry')}</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-10">
                    <div className="flex flex-wrap items-center justify-between gap-y-3">
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-semibold text-slate-800">{t('project_label')}</label>
                            <Select value={tableProjectId} onValueChange={setTableProjectId}>
                                <SelectTrigger className="w-auto max-w-[min(100%,520px)]">
                                    <SelectValue placeholder={t('select_project_to_view_tasks')} />
                                </SelectTrigger>
                                <SelectContent className="max-w-[520px]">
                                    {runningProjects.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name} {p.client ? `· ${p.client}` : ''}
                                        </SelectItem>
                                    ))}
                                    {runningProjects.length === 0 && (
                                        <div className="px-2 py-3 text-sm text-[#8a8a8a]">{t('no_running_projects')}</div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center">
                            <SimulatedDateBar />
                        </div>
                    </div>
                    <SimulatedDateBanner />
                    {tableProjectId ? (
                        <MasterAssignTable projectId={tableProjectId} />
                    ) : (
                        <Card variant="plain">
                            <CardContent className="py-10 text-center text-sm text-[#8a8a8a]">
                                {t('select_project_for_assign_table')}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            <TeamPreviewDialog
                open={!!teamPreviewProjectId}
                projectId={teamPreviewProjectId}
                projectName={teamPreviewProjectName}
                onClose={() => setTeamPreviewProjectId(null)}
                onConfirmed={() => {
                    if (teamPreviewProjectId) {
                        const id = teamPreviewProjectId;
                        setTeamPreviewProjectId(null);
                        maybeConfirmThenAssign(id);
                    }
                }}
            />

            <Dialog open={!!destructiveConfirm} onOpenChange={(open) => !open && setDestructiveConfirm(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            This will discard manual edits
                        </DialogTitle>
                        <DialogDescription className="pt-2 space-y-2 text-sm text-slate-600">
                            <span className="block">Re-running task assignment deletes and rebuilds this project's phase rows. You will lose:</span>
                            <span className="block">
                                {destructiveConfirm?.manualEdits ? (
                                    <span className="block">• <strong>{destructiveConfirm.manualEdits}</strong> manually re-assigned phase{destructiveConfirm.manualEdits === 1 ? '' : 's'}</span>
                                ) : null}
                                {destructiveConfirm?.editedDates ? (
                                    <span className="block">• <strong>{destructiveConfirm.editedDates}</strong> phase{destructiveConfirm.editedDates === 1 ? '' : 's'} with manually edited planned dates</span>
                                ) : null}
                                <span className="block mt-2 text-amber-700">All phase progress logs for this project will also be deleted.</span>
                            </span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-2">
                        <Button variant="outline" onClick={() => setDestructiveConfirm(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                const id = destructiveConfirm?.projectId;
                                setDestructiveConfirm(null);
                                if (id) runAssignTasks(id);
                            }}
                        >
                            Discard and re-assign
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
    onAssignTasksOnly,
    autoAssignLoading,
}: {
    projects: Project[];
    onAutoAssign: (projectId: string) => void;
    onAssignTasksOnly: (projectId: string) => void;
    autoAssignLoading: string | null;
}) {
    const t = useTranslations();
    return (
        <Card className="shadow-sm mb-10 border-[#e6e9ee]">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 shrink-0">
                            <Sparkles className="h-3.5 w-3.5 text-white" />
                        </div>
                        {t('ai_task_assignment')}
                    </CardTitle>
                </div>
                <CardDescription className="text-xs mt-1">
                    {t('ai_task_assignment_description')}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="space-y-2">
                    {projects.map(project => (
                        <AutoAssignProjectRow
                            key={project.id}
                            project={project}
                            onAutoAssign={onAutoAssign}
                            onAssignTasksOnly={onAssignTasksOnly}
                            autoAssignLoading={autoAssignLoading}
                        />
                    ))}
                    {projects.length === 0 && (
                        <p className="text-sm text-[#8a8a8a] text-center py-4">
                            {t('no_active_projects_to_assign')}
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
    onAssignTasksOnly,
    autoAssignLoading,
}: {
    project: Project;
    onAutoAssign: (projectId: string) => void;
    onAssignTasksOnly: (projectId: string) => void;
    autoAssignLoading: string | null;
}) {
    const t = useTranslations();
    const teamQuery = useProjectTeam(project.id);
    const taskQuery = useProjectTaskAssignments(project.id);
    const teamCount = teamQuery.data?.length ?? 0;
    const hasTeam = teamCount > 0;
    const taskCount = taskQuery.data?.data?.length ?? 0;
    const hasTasks = taskCount > 0;
    const isFullyAssigned = hasTeam && hasTasks;
    const isBusy = autoAssignLoading === project.id;

    return (
        <div className="flex flex-wrap justify-between item-center rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 space-y-2">
            <div className="min-w-0">
                <p className="text-sm font-medium text-[#171717] truncate">{project.name}</p>
                <p className="text-xs text-[#8a8a8a] mt-0.5">
                    {project.client} · {project.status}
                    {!teamQuery.isLoading && (
                        <span className="ml-1.5">
                            · {t(teamCount === 1 ? 'team_member_singular' : 'team_member_plural', { count: teamCount })}
                        </span>
                    )}
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    className="gap-1.5 text-xs h-8 bg-[#171717] opacity-40 cursor-not-allowed"
                    disabled
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI team build + assign tasks
                </Button>
            </div>
        </div>
    );
}
