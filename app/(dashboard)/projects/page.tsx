'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Clock, AlertCircle, MoreVertical, Users, Calendar, FileWarning } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectList, useProjectMutations } from '@/lib/queries/projects';
import { useContractList } from '@/lib/queries/contracts';
import { useDealList } from '@/lib/queries/deals';
import type { Project } from '@/types/business';

// Map ProjectStatus enum (kept as English strings in DB/types) to translation keys.
const PROJECT_STATUS_KEY: Record<Project['status'], string> = {
    'Not Started': 'status_not_started',
    'On Track':    'status_on_track',
    'At Risk':     'status_at_risk',
    'Over Budget': 'status_over_budget',
    'Completed':   'status_completed',
};

export default function ProjectsPage() {
    const t = useTranslations();
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
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">{t('project_delivery')}</h1>
                    <p className="text-[#8a8a8a] mt-1">{t('project_delivery_description')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('active_projects')}</p>
                            <Clock className="h-5 w-5 text-[#00a7f4]" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-[#171717]">{projects.length}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('total_budgeted_hours')}</p>
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-emerald-600">
                                {projects.reduce((sum, p) => sum + p.budgetHours, 0)}h
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-[#e6e9ee]">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[#8a8a8a]">{t('total_consumed_hours')}</p>
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
                <Card className="h-64 animate-pulse border-[#e6e9ee] bg-slate-100 shadow-sm" />
            ) : projectsQuery.isError ? (
                <Card className="shadow-sm border-[#e6e9ee]">
                    <div className="flex h-64 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-[#4a4a4a]">{t('could_not_load_projects')}</p>
                        <Button variant="outline" onClick={() => projectsQuery.refetch()}>{t('retry')}</Button>
                    </div>
                </Card>
            ) : (
            <Card className="shadow-sm border-[#e6e9ee]">
                <Table>
                    <TableHeader className="bg-white">
                        <TableRow>
                            <TableHead>{t('project')}</TableHead>
                            <TableHead>{t('client')}</TableHead>
                            <TableHead>{t('contract')}</TableHead>
                            <TableHead>{t('kickoff')}</TableHead>
                            <TableHead>{t('team')}</TableHead>
                            <TableHead>{t('status')}</TableHead>
                            <TableHead className="text-right">{t('budget_hours_col')}</TableHead>
                            <TableHead className="text-right">{t('consumed')}</TableHead>
                            <TableHead className="w-[180px]">{t('burn_rate')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {projects.map((project) => {
                            const burnPercentage = project.budgetHours > 0
                                ? Math.min(Math.round((project.consumedHours / project.budgetHours) * 100), 100)
                                : 0;

                            let progressColor = "bg-[#00a7f4]/50";
                            if (burnPercentage > 85) progressColor = "bg-rose-500";
                            else if (burnPercentage > 70) progressColor = "bg-amber-500";

                            const linkedContract = contracts.find(c => c.id === project.contractId);
                            const sourceDeal     = linkedContract
                                ? deals.find(d => d.id === linkedContract.dealId)
                                : undefined;

                            return (
                                <TableRow key={project.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                className="font-medium text-[#171717] hover:text-[#00a7f4] hover:underline text-left"
                                                onClick={() => router.push(`/projects/${project.id}`)}
                                            >
                                                {project.name}
                                            </button>
                                            {linkedContract && linkedContract.status === 'Draft' && (
                                                <FileWarning
                                                    className="h-3.5 w-3.5 text-amber-600 flex-shrink-0"
                                                    aria-label={t('contract_not_signed_warning')}
                                                >
                                                    <title>{t('contract_not_signed_warning')}</title>
                                                </FileWarning>
                                            )}
                                        </div>
                                        <div className="text-xs text-[#8a8a8a]">
                                            {project.projectNumber ?? project.id.slice(0, 8)}
                                            {project.projectManagerName && <> · {t('pm_prefix')} {project.projectManagerName}</>}
                                        </div>
                                    </TableCell>
                                    <TableCell>{project.client}</TableCell>
                                    <TableCell>
                                        {linkedContract ? (
                                            <button
                                                className="text-sm text-[#00a7f4] hover:underline text-left"
                                                onClick={() => router.push(`/contracts/${linkedContract.id}`)}
                                            >
                                                {linkedContract.contractNumber ?? linkedContract.id.slice(0, 8)}
                                            </button>
                                        ) : (
                                            <span className="text-[#8a8a8a] text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {project.kickoffDate ? (
                                            <span className="text-sm text-[#171717] inline-flex items-center gap-1">
                                                <Calendar className="h-3.5 w-3.5 text-[#8a8a8a]" />
                                                {project.kickoffDate}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-amber-600 inline-flex items-center gap-1">
                                                <Calendar className="h-3.5 w-3.5" />
                                                {t('not_scheduled')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span className={`text-sm inline-flex items-center gap-1 ${(project.teamSize ?? 0) === 0 ? 'text-rose-600' : 'text-[#171717]'}`}>
                                            <Users className="h-3.5 w-3.5" />
                                            {(project.teamSize ?? 0) === 0 ? t('unstaffed') : t(project.teamSize === 1 ? 'member_singular' : 'member_plural', { count: project.teamSize ?? 0 })}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            project.status === 'Completed'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            project.status === 'On Track'    ? 'bg-[#00a7f4]/5 text-[#0086c4] border-[#00a7f4]/20' :
                                            project.status === 'At Risk'     ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            project.status === 'Over Budget' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                               'bg-slate-100 text-slate-700 border-slate-200'
                                        }>
                                            {t(PROJECT_STATUS_KEY[project.status])}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">{project.budgetHours}h</TableCell>
                                    <TableCell className="text-right text-[#4a4a4a]">{project.consumedHours}h</TableCell>
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
                                                        {t('view_source_deal')}
                                                    </DropdownMenuItem>
                                                )}
                                                {linkedContract && (
                                                    <DropdownMenuItem onClick={() => router.push(`/contracts/${linkedContract.id}`)}>
                                                        {t('view_contract')}
                                                    </DropdownMenuItem>
                                                )}
                                                {statusOptions.filter(s => s !== project.status).map(s => (
                                                    <DropdownMenuItem
                                                        key={s}
                                                        onClick={() => updateProject.mutate({ id: project.id, updates: { status: s } })}
                                                    >
                                                        {t('mark_as', { status: t(PROJECT_STATUS_KEY[s]) })}
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
                                <TableCell colSpan={10} className="text-center py-6 text-[#8a8a8a]">{t('no_active_projects_yet')}</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
            )}
        </div>
    );
}
