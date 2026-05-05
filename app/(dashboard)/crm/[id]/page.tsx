'use client';

import { useParams, useRouter } from 'next/navigation';
import { useBusinessStore } from '@/store/businessStore';
import { useDealDetail, useDealMutations } from '@/lib/queries/deals';
import { useContractList } from '@/lib/queries/contracts';
import { useProjectList } from '@/lib/queries/projects';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Edit3, Users, FileText, DollarSign, Target, Calendar, Clock, TrendingUp, Briefcase } from 'lucide-react';
import { useMemo, useState } from 'react';

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
    lead: { label: 'Lead', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    inquiry: { label: 'Inquiry', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    proposal: { label: 'Proposal', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    contract: { label: 'Contract', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    won: { label: 'Won', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    lost: { label: 'Lost', color: 'bg-red-50 text-red-700 border-red-200' },
};

export default function DealDetailPage() {
    const params = useParams();
    const router = useRouter();
    const dealId = params.id as string;
    const store = useBusinessStore();
    const dealQuery = useDealDetail(dealId);
    const { deleteDeal } = useDealMutations();
    const contractsQuery = useContractList();
    const projectsQuery = useProjectList();

    const dealToEdit = dealQuery.data ?? store.deals.find(d => d.id === dealId);
    const contracts = contractsQuery.data?.data ?? [];
    const projects = projectsQuery.data?.data ?? [];

    const [deleteOpen, setDeleteOpen] = useState(false);

    const linkedContract = useMemo(
        () => contracts.find(c => c.client === dealToEdit?.client || c.id === dealToEdit?.id),
        [contracts, dealToEdit]
    );

    const linkedProject = useMemo(
        () => projects.find(p => p.name === dealToEdit?.name || p.id === dealToEdit?.id),
        [projects, dealToEdit]
    );

    const baseLaborCost = useMemo(() => {
        if (!dealToEdit?.ghostRoles) return 0;
        return dealToEdit.ghostRoles.reduce((sum, r) => sum + (r.quantity || 0) * (r.months || 0) * (r.avgMonthlySalary || 0), 0);
    }, [dealToEdit]);

    if (dealQuery.isLoading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <p className="text-sm text-slate-500 animate-pulse">Loading deal...</p>
            </div>
        );
    }

    if (dealQuery.isError || !dealToEdit) {
        return (
            <div className="p-8 space-y-3">
                <p className="text-sm text-destructive">Could not load this deal.</p>
                <Button variant="outline" onClick={() => dealQuery.refetch()}>Retry</Button>
            </div>
        );
    }

    const stage = dealToEdit.status ?? 'inquiry';
    const stageInfo = STAGE_CONFIG[stage] ?? STAGE_CONFIG.inquiry;

    const marginPct = dealToEdit.clientBudget && dealToEdit.clientBudget > 0 && dealToEdit.estimatedGrossProfit !== undefined
        ? (dealToEdit.estimatedGrossProfit / dealToEdit.clientBudget) * 100
        : undefined;

    const getMarginColor = (m: number) => {
        if (m < 0) return 'text-red-500';
        if (m < 10) return 'text-yellow-500';
        return 'text-green-500';
    };

    return (
        <div className="container mx-auto p-6 max-w-6xl space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/crm')} className="hover:bg-slate-100">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{dealToEdit.name}</h1>
                        <p className="text-slate-500 mt-0.5">
                            {dealToEdit.client && <span>{dealToEdit.client} · </span>}
                            <Badge variant="outline" className={stageInfo.color}>{stageInfo.label}</Badge>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => router.push(`/crm/edit/${dealId}`)}>
                        <Edit3 className="h-4 w-4" /> Edit Deal
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => router.push(`/crm/${dealId}/staffing`)}>
                        <Users className="h-4 w-4" /> AI Staffing
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                        Delete
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Client Budget</p>
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            ${(dealToEdit.clientBudget ?? 0).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Est. Total Cost</p>
                            <TrendingUp className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            ${(dealToEdit.totalEstimatedCost ?? 0).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Gross Profit</p>
                            <DollarSign className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold">
                            <span className={marginPct !== undefined ? getMarginColor(marginPct) : 'text-slate-900'}>
                                ${(dealToEdit.estimatedGrossProfit ?? 0).toLocaleString()}
                            </span>
                            {marginPct !== undefined && (
                                <span className={`ml-2 text-sm font-semibold ${getMarginColor(marginPct)}`}>
                                    ({marginPct.toFixed(1)}%)
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Win Probability</p>
                            <Target className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">
                            {dealToEdit.winProbability ?? 0}%
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="text-lg">Deal Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Deal Name</p>
                                    <p className="text-sm font-medium mt-1">{dealToEdit.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Client</p>
                                    <p className="text-sm font-medium mt-1">{dealToEdit.client || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Timeline</p>
                                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        {dealToEdit.timelineMonths ?? 0} month{(dealToEdit.timelineMonths ?? 0) !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Workload</p>
                                    <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                                        {dealToEdit.workloadHours ?? 0} hours
                                    </p>
                                </div>
                            </div>
                            {dealToEdit.workloadDescription && (
                                <div className="mt-5 pt-5 border-t border-slate-100">
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Scope Description</p>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{dealToEdit.workloadDescription}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="text-lg">Ghost Roles and Staffing</CardTitle>
                            <CardDescription>Estimated team composition for delivery</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {dealToEdit.ghostRoles && dealToEdit.ghostRoles.length > 0 ? (
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead>Role</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead className="text-right">Months</TableHead>
                                            <TableHead className="text-right">Monthly Salary</TableHead>
                                            <TableHead className="text-right">Subtotal</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dealToEdit.ghostRoles.map((role, i) => (
                                            <TableRow key={role.id ?? i}>
                                                <TableCell className="font-medium capitalize">{role.roleType}</TableCell>
                                                <TableCell className="text-right">{role.quantity}</TableCell>
                                                <TableCell className="text-right">{role.months}</TableCell>
                                                <TableCell className="text-right">${(role.avgMonthlySalary ?? 0).toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-medium">
                                                    ${(role.quantity * role.months * role.avgMonthlySalary).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-slate-50/50 font-bold">
                                            <TableCell>Total Labor Cost</TableCell>
                                            <TableCell />
                                            <TableCell />
                                            <TableCell />
                                            <TableCell className="text-right">${baseLaborCost.toLocaleString()}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-8 text-center text-sm text-slate-500">
                                    No ghost roles defined. Edit the deal to add staffing estimates.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {(linkedContract || linkedProject) && (
                        <Card className="shadow-sm border-slate-100">
                            <CardHeader className="border-b bg-slate-50/50">
                                <CardTitle className="text-lg">Linked Record</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="space-y-3">
                                    {linkedContract && (
                                        <div className="flex items-center gap-3">
                                            <FileText className="h-4 w-4 text-blue-500" />
                                            <div>
                                                <p className="text-xs text-slate-500">Contract</p>
                                                <p className="text-sm font-medium">{linkedContract.contractNumber ?? linkedContract.id.slice(0, 8)} · {linkedContract.status}</p>
                                            </div>
                                        </div>
                                    )}
                                    {linkedProject && (
                                        <div className="flex items-center gap-3">
                                            <Briefcase className="h-4 w-4 text-purple-500" />
                                            <div>
                                                <p className="text-xs text-slate-500">Project</p>
                                                <p className="text-sm font-medium">{linkedProject.name} · {linkedProject.status}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card className="shadow-sm border-slate-100 sticky top-6">
                        <CardHeader className="bg-slate-50/80 pb-4 border-b border-slate-100">
                            <CardTitle className="text-lg">Financial Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-5 space-y-4">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Client Budget</span>
                                    <span className="font-medium text-slate-700">${(dealToEdit.clientBudget ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Base Labor Cost</span>
                                    <span className="font-medium text-slate-700">${baseLaborCost.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Overhead</span>
                                    <span className="font-medium text-red-500/80">-${(dealToEdit.overheadCost ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Risk Buffer</span>
                                    <span className="font-medium text-red-500/80">-${(dealToEdit.bufferCost ?? 0).toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="border-t border-slate-100 pt-4">
                                <div className="flex justify-between font-bold text-slate-800 mb-2">
                                    <span>Total Est. Cost</span>
                                    <span>${(dealToEdit.totalEstimatedCost ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-800">Gross Profit</span>
                                    <div className="flex flex-col items-end">
                                        <span className={`font-bold text-lg ${marginPct !== undefined ? getMarginColor(marginPct) : 'text-slate-900'}`}>
                                            ${(dealToEdit.estimatedGrossProfit ?? 0).toLocaleString()}
                                        </span>
                                        {marginPct !== undefined && (
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${getMarginColor(marginPct)}`}>
                                                {marginPct.toFixed(1)}% Margin
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Deal</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600">
                        Are you sure you want to delete this deal? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={async () => {
                            await deleteDeal.mutateAsync(dealId);
                            setDeleteOpen(false);
                            router.push('/crm');
                        }} disabled={deleteDeal.isPending}>
                            {deleteDeal.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}