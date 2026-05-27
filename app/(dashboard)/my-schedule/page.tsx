'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { LoadingState } from '@/components/LoadingState';
import { useAuthStore } from '@/store/authStore';
import { useProjectList } from '@/lib/queries/projects';
import { MyScheduleEmployeeTable } from '@/components/time-tracking/MyScheduleEmployeeTable';
import { SimulatedDateBar } from '@/components/SimulatedDateBar';
import { AlertTriangle } from 'lucide-react';

export default function MySchedulePage() {
    const t = useTranslations();
    const user = useAuthStore((s) => s.user);
    const employeeId = user?.employeeId;

    const projectsQuery = useProjectList();
    const allProjects = projectsQuery.data?.data ?? [];
    const projects = useMemo(
        () => allProjects.filter((p) => p.status !== 'Completed'),
        [allProjects],
    );

    const [projectId, setProjectId] = useState<string>('');
    useEffect(() => {
        if (!projectId && projects.length > 0) {
            setProjectId(projects[0].id);
        }
    }, [projects, projectId]);
    useEffect(() => {
        if (projectId && !projects.some((p) => p.id === projectId)) {
            setProjectId(projects[0]?.id ?? '');
        }
    }, [projects, projectId]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('my_schedule')}</h1>
                    <p className="text-[#8a8a8a] mt-1">
                        {t('my_schedule_description_part1')}
                        <span className="font-medium"> {t('progress_hours')}</span> {t('and')} <span className="font-medium">{t('used_hours')}</span>.
                    </p>
                </div>
                <SimulatedDateBar />
            </div>

            {!employeeId && (
                <div className="flex items-center gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">{t('no_employee_linked_warning')}</p>
                </div>
            )}

            {employeeId && (
                <>
                    <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                        <label className="text-sm font-semibold text-slate-800 whitespace-nowrap">{t('project')}:</label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger className="h-9 w-auto max-w-[min(100%,480px)] text-xs bg-white border-slate-300 shadow-sm">
                                <SelectValue placeholder={t('pick_a_project')} />
                            </SelectTrigger>
                            <SelectContent className="max-w-[480px]">
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                                {projects.length === 0 && (
                                    <div className="px-2 py-3 text-sm text-slate-400">{t('no_running_projects')}</div>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {projectsQuery.isLoading ? (
                        <LoadingState message={t('loading_projects')} />
                    ) : projectId ? (
                        <MyScheduleEmployeeTable projectId={projectId} employeeId={employeeId} />
                    ) : (
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="p-6 text-sm text-slate-400 text-center">
                                {t('pick_project_to_see_phases')}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
