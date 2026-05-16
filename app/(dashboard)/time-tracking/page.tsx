'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Users, Briefcase, Sparkles, FastForward } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useBusinessStore } from '@/store/businessStore';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useProjectList, useProjectTeam, projectKeys } from '@/lib/queries/projects';
import { scheduleTrackingKeys } from '@/lib/queries/scheduleTracking';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import type { Project } from '@/types/business';
import { MasterAssignTable } from '@/components/time-tracking/MasterAssignTable';
import { SimulatedDateBar } from '@/components/SimulatedDateBar';
import { TeamPreviewDialog } from '@/components/time-tracking/TeamPreviewDialog';

export default function TimeTrackingPage() {
    const store = useBusinessStore();
    const projectsQuery = useProjectList();
    const timeEntriesQuery = useTimeEntryList();
    const queryClient = useQueryClient();
    const projects = projectsQuery.data?.data ?? [];
    const timeEntries = timeEntriesQuery.data?.data ?? [];

    // Master Assign Table — which project's tasks to display
    const [tableProjectId, setTableProjectId] = useState<string>('');
    useEffect(() => {
        if (!tableProjectId && projects.length > 0) {
            setTableProjectId(projects[0].id);
        }
    }, [projects, tableProjectId]);

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
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
                ?? 'AI task assignment failed. Ensure the project has a team and an Estimate file exists.';
            toast.error(msg);
        } finally {
            setAutoAssignLoading(null);
        }
    }

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
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Time Tracking & Utilization</h1>
                <p className="text-[#8a8a8a] mt-1">Track budget consumption and labor costs across active projects.</p>
            </div>

            <SimulatedDateBar />

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
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-[#4a4a4a]">Project:</label>
                        <Select value={tableProjectId} onValueChange={setTableProjectId}>
                            <SelectTrigger className="w-[320px]">
                                <SelectValue placeholder="Select a project to view its task assignments" />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name} {p.client ? `· ${p.client}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                    Assign Tasks Only
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
                    AI Task Assignment
                </Button>
            </div>
        </div>
    );
}
