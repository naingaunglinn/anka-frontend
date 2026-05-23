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

export default function MySchedulePage() {
    const t = useTranslations();
    const user = useAuthStore((s) => s.user);
    const employeeId = user?.employeeId;

    const projectsQuery = useProjectList();
    const allProjects = projectsQuery.data?.data ?? [];
    // Hide finished projects — employees only log progress against running work.
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
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('my_schedule')}</h1>
                <p className="text-[#8a8a8a] mt-1">
                    {t('my_schedule_description_part1')}
                    <span className="font-medium"> {t('progress_hours')}</span> {t('and')} <span className="font-medium">{t('used_hours')}</span>.
                </p>
            </div>

            <SimulatedDateBar />

            {!employeeId && (
                <Card className="shadow-sm border-amber-200 bg-amber-50">
                    <CardContent className="p-4 text-sm text-amber-800">
                        {t('no_employee_linked_warning')}
                    </CardContent>
                </Card>
            )}

            {employeeId && (
                <>
                    <div className="space-y-1 max-w-full">
                        <label className="text-xs text-[#8a8a8a]">{t('project')}</label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            {/* w-auto = trigger grows to fit the selected
                                project's name; max-w caps it on extreme cases
                                so a 80-char project name doesn't stretch the
                                row off-screen. */}
                            <SelectTrigger className="w-auto max-w-[min(100%,640px)]">
                                <SelectValue placeholder={t('pick_a_project')} />
                            </SelectTrigger>
                            <SelectContent className="max-w-[640px]">
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                                {projects.length === 0 && (
                                    <div className="px-2 py-3 text-sm text-[#8a8a8a]">{t('no_running_projects')}</div>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {projectsQuery.isLoading ? (
                        <LoadingState message={t('loading_projects')} />
                    ) : projectId ? (
                        <MyScheduleEmployeeTable projectId={projectId} employeeId={employeeId} />
                    ) : (
                        <Card variant="plain">
                            <CardContent className="p-6 text-sm text-[#8a8a8a]">
                                {t('pick_project_to_see_phases')}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
