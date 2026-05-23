'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Briefcase, Sparkles, FastForward } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeError } from '@/lib/errorHandler';
import { useProjectList, useProjectTeam, projectKeys } from '@/lib/queries/projects';
import { scheduleTrackingKeys, useProgressLogSummary } from '@/lib/queries/scheduleTracking';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import type { Project } from '@/types/business';
import { MasterAssignTable } from '@/components/time-tracking/MasterAssignTable';
import { SimulatedDateBar } from '@/components/SimulatedDateBar';
import { TeamPreviewDialog } from '@/components/time-tracking/TeamPreviewDialog';

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

    // Total Hours Logged is sourced from phase_progress_logs and scoped to the
    // project picked in the Master Assign Table selector below. Filterable by
    // date range + phase status via the controls inside the KPI card itself.
    const [hoursDateFrom, setHoursDateFrom] = useState<string>('');
    const [hoursDateTo,   setHoursDateTo]   = useState<string>('');
    const [hoursPhaseStatus, setHoursPhaseStatus] = useState<'all' | '未着手' | '進行中' | '完了'>('all');
    const hoursSummaryQuery = useProgressLogSummary({
        dateFrom:    hoursDateFrom || undefined,
        dateTo:      hoursDateTo   || undefined,
        phaseStatus: hoursPhaseStatus === 'all' ? undefined : hoursPhaseStatus,
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
                        <div className="mt-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={hoursDateFrom}
                                    onChange={(e) => setHoursDateFrom(e.target.value)}
                                    className="h-7 text-xs px-2 border border-[#e6e9ee] rounded flex-1 min-w-0"
                                    aria-label={t('from_date')}
                                />
                                <span className="text-xs text-[#8a8a8a]">{t('to')}</span>
                                <input
                                    type="date"
                                    value={hoursDateTo}
                                    onChange={(e) => setHoursDateTo(e.target.value)}
                                    className="h-7 text-xs px-2 border border-[#e6e9ee] rounded flex-1 min-w-0"
                                    aria-label={t('to_date')}
                                />
                            </div>
                            <Select
                                value={hoursPhaseStatus}
                                onValueChange={(v) => setHoursPhaseStatus(v as 'all' | '未着手' | '進行中' | '完了')}
                            >
                                <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('all_phase_statuses')}</SelectItem>
                                    <SelectItem value="未着手">{t('phase_not_started')}</SelectItem>
                                    <SelectItem value="進行中">{t('phase_in_progress')}</SelectItem>
                                    <SelectItem value="完了">{t('phase_done')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
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
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-[#4a4a4a]">{t('project_label')}</label>
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
                        runAssignTasks(id);
                    }
                }}
            />
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
        <Card variant="plain">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#00a7f4]" />
                    {t('ai_task_assignment')}
                </CardTitle>
                <CardDescription>
                    <span className="block">
                        {t('ai_task_assignment_description')}
                    </span>
                    <span className="block mt-1">
                        {t('assign_tasks_only_description')}
                    </span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
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
    const teamCount = teamQuery.data?.length ?? 0;
    const hasTeam = teamCount > 0;
    const isBusy = autoAssignLoading === project.id;

    return (
        <div className="flex items-center justify-between rounded-lg border border-[#e6e9ee] bg-white p-4">
            <div>
                <p className="text-sm font-medium text-[#171717]">{project.name}</p>
                <p className="text-xs text-[#8a8a8a]">
                    {project.client} · {project.status}
                    {!teamQuery.isLoading && (
                        <span className="ml-2 text-[#8a8a8a]">
                            · {t(teamCount === 1 ? 'team_member_singular' : 'team_member_plural', { count: teamCount })}
                        </span>
                    )}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onAssignTasksOnly(project.id)}
                    disabled={isBusy || teamQuery.isLoading || !hasTeam}
                    title={!hasTeam ? t('add_team_members_before_assigning') : t('skip_team_build_tooltip')}
                >
                    {isBusy ? (
                        <Clock className="h-4 w-4 animate-spin" />
                    ) : (
                        <FastForward className="h-4 w-4" />
                    )}
                    Assign tasks with AI
                </Button>
                <Button
                    size="sm"
                    className="gap-2 bg-[#171717] hover:bg-[#00a7f4]"
                    onClick={() => onAutoAssign(project.id)}
                    disabled={isBusy || teamQuery.isLoading}
                    title={t('preview_ai_team_tooltip')}
                >
                    {isBusy ? (
                        <Clock className="h-4 w-4 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4" />
                    )}
                    Build the team and assign tasks with AI
                </Button>
            </div>
        </div>
    );
}
