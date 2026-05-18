'use client';

import { useEffect, useMemo, useState } from 'react';
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
                ? `AI assigned ${count} ${count === 1 ? 'task' : 'tasks'} across ${phaseCount} ${phaseCount === 1 ? 'phase' : 'phases'} from the project's Estimate file.`
                : 'Task assignment finished.'
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
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Time Tracking & Utilization</h1>
                <p className="text-[#8a8a8a] mt-1">Track budget consumption and labor costs across active projects.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">Total Hours Logged</p>
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
                                    aria-label="From date"
                                />
                                <span className="text-xs text-[#8a8a8a]">to</span>
                                <input
                                    type="date"
                                    value={hoursDateTo}
                                    onChange={(e) => setHoursDateTo(e.target.value)}
                                    className="h-7 text-xs px-2 border border-[#e6e9ee] rounded flex-1 min-w-0"
                                    aria-label="To date"
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
                                    <SelectItem value="all">All phase statuses</SelectItem>
                                    <SelectItem value="未着手">未着手 (Not started)</SelectItem>
                                    <SelectItem value="進行中">進行中 (In progress)</SelectItem>
                                    <SelectItem value="完了">完了 (Done)</SelectItem>
                                </SelectContent>
                            </Select>
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
                <Card className="h-64 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
            ) : isError ? (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="flex h-64 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">Could not load projects.</p>
                        <Button variant="outline" onClick={retry}>Retry</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-[#4a4a4a]">Project:</label>
                            <Select value={tableProjectId} onValueChange={setTableProjectId}>
                                <SelectTrigger className="w-auto max-w-[min(100%,520px)]">
                                    <SelectValue placeholder="Select a project to view its task assignments" />
                                </SelectTrigger>
                                <SelectContent className="max-w-[520px]">
                                    {runningProjects.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name} {p.client ? `· ${p.client}` : ''}
                                        </SelectItem>
                                    ))}
                                    {runningProjects.length === 0 && (
                                        <div className="px-2 py-3 text-sm text-[#8a8a8a]">No running projects.</div>
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
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="py-10 text-center text-sm text-[#8a8a8a]">
                                Select a project to view its master assign table.
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
    return (
        <Card className="shadow-sm border-[#e6e9ee]">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#00a7f4]" />
                    AI Task Assignment
                </CardTitle>
                <CardDescription>
                    <span className="block">
                        <strong>AI Task Assignment</strong> — preview the AI&apos;s proposed team additions, confirm, then schedule tasks.
                    </span>
                    <span className="block mt-1">
                        <strong>Assign Tasks Only</strong> — skip team build and schedule tasks against the project&apos;s current team.
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
                            No active projects. Win a deal to create a project.
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
    const teamQuery = useProjectTeam(project.id);
    const hasTeam = (teamQuery.data?.length ?? 0) > 0;
    const isBusy = autoAssignLoading === project.id;

    return (
        <div className="flex items-center justify-between rounded-lg border border-[#e6e9ee] bg-white p-4">
            <div>
                <p className="text-sm font-medium text-[#171717]">{project.name}</p>
                <p className="text-xs text-[#8a8a8a]">
                    {project.client} · {project.status}
                    {!teamQuery.isLoading && (
                        <span className="ml-2 text-[#8a8a8a]">
                            · {teamQuery.data?.length ?? 0} team member{(teamQuery.data?.length ?? 0) === 1 ? '' : 's'}
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
                    title={!hasTeam ? 'Add team members before assigning tasks' : 'Skip team build and schedule tasks against the current team'}
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
                    title="Preview AI team build, then assign tasks"
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
