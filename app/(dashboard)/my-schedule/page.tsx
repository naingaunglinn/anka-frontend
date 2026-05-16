'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { LoadingState } from '@/components/LoadingState';
import { useAuthStore } from '@/store/authStore';
import { useProjectList } from '@/lib/queries/projects';
import { MyScheduleEmployeeTable } from '@/components/time-tracking/MyScheduleEmployeeTable';
import { SimulatedDateBar } from '@/components/SimulatedDateBar';

export default function MySchedulePage() {
    const user = useAuthStore((s) => s.user);
    const employeeId = user?.employeeId;

    const projectsQuery = useProjectList();
    const projects = projectsQuery.data?.data ?? [];

    const [projectId, setProjectId] = useState<string>('');
    useEffect(() => {
        if (!projectId && projects.length > 0) {
            setProjectId(projects[0].id);
        }
    }, [projects, projectId]);

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#171717]">My Schedule</h1>
                <p className="text-[#8a8a8a] mt-1">
                    Per-phase plan for this project. Phases assigned to you have a pencil icon — click it to log today&apos;s
                    <span className="font-medium"> progress hours</span> and <span className="font-medium">used hours</span>.
                </p>
            </div>

            <SimulatedDateBar />

            {!employeeId && (
                <Card className="shadow-sm border-amber-200 bg-amber-50">
                    <CardContent className="p-4 text-sm text-amber-800">
                        Your user account isn&apos;t linked to an employee record yet, so there&apos;s no schedule to load.
                        Ask an administrator to link your account.
                    </CardContent>
                </Card>
            )}

            {employeeId && (
                <>
                    <div className="max-w-md space-y-1">
                        <label className="text-xs text-[#8a8a8a]">Project</label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger><SelectValue placeholder="Pick a project" /></SelectTrigger>
                            <SelectContent>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {projectsQuery.isLoading ? (
                        <LoadingState message="Loading projects..." />
                    ) : projectId ? (
                        <MyScheduleEmployeeTable projectId={projectId} employeeId={employeeId} />
                    ) : (
                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardContent className="p-6 text-sm text-[#8a8a8a]">
                                Pick a project to see your phases.
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
