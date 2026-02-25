'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Clock, CheckSquare, Plus, Activity, Users } from 'lucide-react';

const mockTimesheet = [
    { id: '1', project: 'Cloud Migration', task: 'DevOps Setup', mon: 8, tue: 8, wed: 4, thu: 0, fri: 0, billable: true, status: 'Approved' },
    { id: '2', project: 'Internal Tools', task: 'Maintenance', mon: 0, tue: 0, wed: 4, thu: 8, fri: 8, billable: false, status: 'Pending' },
];

export default function TimeTrackingPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Time Tracking</h2>
                    <p className="text-muted-foreground mt-1">Log your hours, submit timesheets, and view utilization.</p>
                </div>
                <div className="flex bg-white rounded-md border p-1 shadow-sm">
                    <Button variant="ghost" className="h-8 text-xs font-semibold bg-slate-100">This Week</Button>
                    <Button variant="ghost" className="h-8 text-xs font-semibold text-muted-foreground">Last Week</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Weekly Total</CardTitle>
                        <Clock className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">32<span className="text-muted-foreground text-sm font-normal">/40 hrs</span></div>
                        <p className="text-xs text-emerald-600 mt-1 font-medium">
                            8 hours remaining
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Utilization %</CardTitle>
                        <Activity className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">62.5%</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            20 billable / 32 logged hrs
                        </p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-100 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Bench Report</CardTitle>
                        <Users className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">3 <span className="text-muted-foreground text-sm font-normal">staff</span></div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Currently unassigned &lt; 50%
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm border-slate-100">
                <CardHeader>
                    <CardTitle>Weekly Timesheet</CardTitle>
                    <CardDescription>Submit your time entries for Sep 4 - Sep 8</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-[200px]">Project</TableHead>
                                <TableHead className="w-[200px]">Task</TableHead>
                                <TableHead className="text-center w-[80px]">Mon</TableHead>
                                <TableHead className="text-center w-[80px]">Tue</TableHead>
                                <TableHead className="text-center w-[80px]">Wed</TableHead>
                                <TableHead className="text-center w-[80px]">Thu</TableHead>
                                <TableHead className="text-center w-[80px]">Fri</TableHead>
                                <TableHead className="text-center">Total</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {mockTimesheet.map(entry => {
                                const total = entry.mon + entry.tue + entry.wed + entry.thu + entry.fri;
                                return (
                                    <TableRow key={entry.id}>
                                        <TableCell className="font-medium">
                                            {entry.project}
                                            {entry.billable && <Badge variant="outline" className="ml-2 text-[10px] uppercase text-emerald-600 border-emerald-200">Billable</Badge>}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{entry.task}</TableCell>
                                        <TableCell className="text-center">{entry.mon}</TableCell>
                                        <TableCell className="text-center">{entry.tue}</TableCell>
                                        <TableCell className="text-center">{entry.wed}</TableCell>
                                        <TableCell className="text-center">{entry.thu}</TableCell>
                                        <TableCell className="text-center">{entry.fri}</TableCell>
                                        <TableCell className="text-center font-bold">{total}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={entry.status === 'Approved' ? 'default' : 'secondary'} className={entry.status === 'Approved' ? 'bg-emerald-500' : 'bg-slate-200 text-slate-700'}>
                                                {entry.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    <div className="p-4 bg-slate-50 border rounded-lg flex gap-3 items-end flex-wrap shadow-inner">
                        <div className="w-[200px] space-y-1">
                            <label className="text-xs font-medium text-slate-500">Project <span className="text-rose-500">*</span></label>
                            <Select>
                                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select Project" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="p1">Cloud Migration</SelectItem>
                                    <SelectItem value="p2">Internal Tools</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-1">
                            <label className="text-xs font-medium text-slate-500">Task / Description <span className="text-rose-500">*</span></label>
                            <Input placeholder="What did you work on?" className="h-9 bg-white" />
                        </div>
                        <div className="w-[80px] space-y-1">
                            <label className="text-xs font-medium text-slate-500">Hours</label>
                            <Input type="number" min="0" max="24" placeholder="0" className="h-9 bg-white" />
                        </div>
                        <div className="w-[80px] space-y-1 pb-2 flex justify-center">
                            <div className="flex items-center space-x-2">
                                <Switch id="billable" defaultChecked />
                                <Label htmlFor="billable" className="text-xs text-slate-500">Billable</Label>
                            </div>
                        </div>
                        <Button className="h-9 gap-2">
                            <Plus className="h-4 w-4" /> Add Entry
                        </Button>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button variant="outline">Save Draft</Button>
                        <Button className="bg-slate-900 gap-2"><CheckSquare className="w-4 h-4" /> Submit Timesheet</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
