'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Clock, AlertCircle, MoreVertical } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectList, useProjectMutations } from '@/lib/queries/projects';
import { useContractList } from '@/lib/queries/contracts';
import { useDealList } from '@/lib/queries/deals';
import type { Project } from '@/types/business';

export default function ProjectsPage() {
    const router = useRouter();
    const projectsQuery  = useProjectList();
    const contractsQuery = useContractList();
    const dealsQuery     = useDealList();
    const { updateProject } = useProjectMutations();

    const projects  = projectsQuery.data?.data  ?? [];
    const contracts = contractsQuery.data?.data ?? [];
    const deals     = dealsQuery.data?.data     ?? [];

    const statusOptions: Project['status'][] = ['Not Started', 'On Track', 'At Risk', 'Over Budget', 'Completed'];

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Project Delivery</h1>
                    <p className="text-slate-500 mt-1">Track active project status, consumed hours, and budget burn rate.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Active Projects</p>
                            <Clock className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{projects.length}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Total Budgeted Hours</p>
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-emerald-600">
                                {projects.reduce((sum, p) => sum + p.budgetHours, 0)}h
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Total Consumed Hours</p>
                            <AlertCircle className="h-5 w-5 text-rose-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-rose-600">
                                {projects.reduce((sum, p) => sum + p.consumedHours, 0)}h
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {projectsQuery.isLoading ? (
                <Card className="h-64 animate-pulse border-slate-100 bg-slate-100 shadow-sm" />
            ) : projectsQuery.isError ? (
                <Card className="shadow-sm border-slate-100">
                    <div className="flex h-64 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-slate-600">Could not load projects.</p>
                        <Button variant="outline" onClick={() => projectsQuery.refetch()}>Retry</Button>
                    </div>
                </Card>
            ) : (
            <Card className="shadow-sm border-slate-100">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Contract</TableHead>
                            <TableHead>Source Deal</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Budget Hours</TableHead>
                            <TableHead className="text-right">Consumed</TableHead>
                            <TableHead className="w-[200px]">Burn Rate</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {projects.map((project) => {
                            const burnPercentage = project.budgetHours > 0
                                ? Math.min(Math.round((project.consumedHours / project.budgetHours) * 100), 100)
                                : 0;

                            let progressColor = "bg-blue-500";
                            if (burnPercentage > 85) progressColor = "bg-rose-500";
                            else if (burnPercentage > 70) progressColor = "bg-amber-500";

                            const linkedContract = contracts.find(c => c.id === project.contractId);
                            const sourceDeal     = linkedContract
                                ? deals.find(d => d.id === linkedContract.dealId)
                                : undefined;

                            return (
                                <TableRow key={project.id}>
                                    <TableCell>
                                        <div className="font-medium text-slate-900">{project.name}</div>
                                        <div className="text-xs text-slate-500">
                                            {project.projectNumber ?? project.id.slice(0, 8)}
                                        </div>
                                    </TableCell>
                                    <TableCell>{project.client}</TableCell>
                                    <TableCell>
                                        {linkedContract ? (
                                            <button
                                                className="text-sm text-blue-600 hover:underline text-left"
                                                onClick={() => router.push('/contracts')}
                                            >
                                                {linkedContract.contractNumber ?? linkedContract.id.slice(0, 8)}
                                            </button>
                                        ) : (
                                            <span className="text-slate-400 text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {sourceDeal ? (
                                            <button
                                                className="text-sm text-emerald-600 hover:underline text-left"
                                                onClick={() => router.push(`/crm/${sourceDeal.id}`)}
                                            >
                                                {sourceDeal.name}
                                            </button>
                                        ) : (
                                            <span className="text-slate-400 text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            project.status === 'Completed'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            project.status === 'On Track'    ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            project.status === 'At Risk'     ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            project.status === 'Over Budget' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                               'bg-slate-100 text-slate-700 border-slate-200'
                                        }>
                                            {project.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">{project.budgetHours}h</TableCell>
                                    <TableCell className="text-right text-slate-600">{project.consumedHours}h</TableCell>
                                    <TableCell>
                                        <div className="space-y-1 mt-1">
                                            <div className="flex justify-between text-xs">
                                                <span>{burnPercentage}%</span>
                                            </div>
                                            <Progress value={burnPercentage} className="h-2" indicatorClassName={progressColor} />
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {sourceDeal && (
                                                    <DropdownMenuItem onClick={() => router.push(`/crm/${sourceDeal.id}`)}>
                                                        View Source Deal
                                                    </DropdownMenuItem>
                                                )}
                                                {linkedContract && (
                                                    <DropdownMenuItem onClick={() => router.push('/contracts')}>
                                                        View Contract
                                                    </DropdownMenuItem>
                                                )}
                                                {statusOptions.filter(s => s !== project.status).map(s => (
                                                    <DropdownMenuItem
                                                        key={s}
                                                        onClick={() => updateProject.mutate({ id: project.id, updates: { status: s } })}
                                                    >
                                                        Mark as {s}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {projects.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center py-6 text-slate-500">No active projects yet. Win deals in the CRM to launch projects.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
            )}
        </div>
    );
}
