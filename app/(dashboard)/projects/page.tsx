import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Briefcase, AlertTriangle, CheckCircle2 } from 'lucide-react';

const mockProjects = [
    {
        id: 'PRJ-101',
        name: 'Cloud Migration',
        client: 'Acme Corp',
        budgetHours: 500,
        consumedHours: 250,
        status: 'On Track'
    },
    {
        id: 'PRJ-102',
        name: 'Security Audit',
        client: 'Global Tech',
        budgetHours: 120,
        consumedHours: 115,
        status: 'At Risk'
    },
    {
        id: 'PRJ-103',
        name: 'ERP Implementation',
        client: 'Mega Retail',
        budgetHours: 2000,
        consumedHours: 2150,
        status: 'Over Budget'
    }
];

export default function ProjectsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Project Delivery</h2>
                <p className="text-muted-foreground mt-1">Monitor budget vs consumed hours and track project health.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mockProjects.map(project => {
                    const burnRate = project.consumedHours / project.budgetHours;
                    const percentage = Math.min(Math.round(burnRate * 100), 100);

                    let alertStatus = 'success';
                    if (burnRate >= 1) alertStatus = 'destructive';
                    else if (burnRate >= 0.85) alertStatus = 'warning';

                    return (
                        <Card key={project.id} className={`shadow-sm border-slate-100 ${alertStatus === 'destructive' ? 'border-rose-200' : ''}`}>
                            <CardHeader className="pb-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Briefcase className="w-4 h-4 text-slate-500" />
                                            {project.name}
                                        </CardTitle>
                                        <CardDescription>{project.client} • {project.id}</CardDescription>
                                    </div>
                                    {alertStatus === 'destructive' && (
                                        <Badge variant="destructive" className="bg-rose-500 gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Over Budget
                                        </Badge>
                                    )}
                                    {alertStatus === 'warning' && (
                                        <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
                                            <AlertTriangle className="w-3 h-3" /> High Burn
                                        </Badge>
                                    )}
                                    {alertStatus === 'success' && (
                                        <Badge variant="outline" className="border-emerald-500 text-emerald-600 gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> On Track
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-muted-foreground font-medium">Burn Rate</span>
                                            <span className="font-bold">{Math.round(burnRate * 100)}%</span>
                                        </div>
                                        <Progress value={percentage} className={`h-2 ${alertStatus === 'destructive' ? 'bg-rose-100 [&>div]:bg-rose-500' : alertStatus === 'warning' ? 'bg-amber-100 [&>div]:bg-amber-500' : ''}`} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Budget</p>
                                            <p className="text-lg font-bold">{project.budgetHours}h</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Consumed</p>
                                            <p className={`text-lg font-bold ${alertStatus === 'destructive' ? 'text-rose-600' : ''}`}>{project.consumedHours}h</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
