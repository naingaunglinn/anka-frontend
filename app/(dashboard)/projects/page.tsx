'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useBusinessStore } from '@/store/businessStore';
import { Progress } from '@/components/ui/progress';

export default function ProjectsPage() {
    const store = useBusinessStore();

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
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{store.projects.length}</span>
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
                                {store.projects.reduce((sum, p) => sum + p.budgetHours, 0)}h
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
                                {store.projects.reduce((sum, p) => sum + p.consumedHours, 0)}h
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm border-slate-100">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead>Project ID / Name</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Budget Hours</TableHead>
                            <TableHead className="text-right">Consumed</TableHead>
                            <TableHead className="w-[200px]">Burn Rate</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {store.projects.map((project) => {
                            const burnPercentage = project.budgetHours > 0
                                ? Math.min(Math.round((project.consumedHours / project.budgetHours) * 100), 100)
                                : 0;

                            let progressColor = "bg-blue-500";
                            if (burnPercentage > 85) progressColor = "bg-rose-500";
                            else if (burnPercentage > 70) progressColor = "bg-amber-500";

                            return (
                                <TableRow key={project.id}>
                                    <TableCell>
                                        <div className="font-medium text-slate-900">{project.name}</div>
                                        <div className="text-xs text-slate-500">{project.id}</div>
                                    </TableCell>
                                    <TableCell>{project.client}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            project.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                project.status === 'On Track' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    project.status === 'At Risk' ? 'bg-amber-50 text-amber-700 border-amber-200' :
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
                                </TableRow>
                            );
                        })}
                        {store.projects.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-slate-500">No active projects yet. Win deals in the CRM to launch projects.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
