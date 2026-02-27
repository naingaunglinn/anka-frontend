'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock, Plus, Users, Briefcase, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useBusinessStore } from '@/store/businessStore';
import { TimeEntry } from '@/types/business';

export default function TimeTrackingPage() {
    const store = useBusinessStore();
    const [isAddOpen, setIsAddOpen] = useState(false);

    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [taskDesc, setTaskDesc] = useState('');
    const [hoursLogged, setHoursLogged] = useState('');
    const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);

    const handleSaveTime = () => {
        if (!selectedProjectId || !selectedEmployeeId || !taskDesc || !hoursLogged) return;

        const newEntry: TimeEntry = {
            id: `TIME-${Math.floor(Math.random() * 10000)}`,
            projectId: selectedProjectId,
            employeeId: selectedEmployeeId,
            task: taskDesc,
            date: entryDate,
            hours: Number(hoursLogged),
            billable: true,
            status: 'Approved'
        };

        store.addTimeEntry(newEntry);
        setIsAddOpen(false);
        setTaskDesc('');
        setHoursLogged('');
    };

    const totalHoursLogged = store.timeEntries.reduce((sum, e) => sum + e.hours, 0);
    const activeProjectsCount = new Set(store.timeEntries.map(e => e.projectId)).size;

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Time Tracking & Utilization</h1>
                    <p className="text-slate-500 mt-1">Log hours against active projects to track budget consumption and labor costs.</p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-slate-900 gap-2">
                            <Plus className="h-4 w-4" /> Log Time
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Log Time to Project</DialogTitle>
                            <DialogDescription>
                                Accurately booking time drains the project budget and adds to direct labor costs in the P&L.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Employee</label>
                                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select team member..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {store.employees.map(emp => (
                                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Project</label>
                                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select active project..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {store.projects.map(prj => (
                                            <SelectItem key={prj.id} value={prj.id}>{prj.name} ({prj.client})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date</label>
                                <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Task Description</label>
                                    <Input value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder="e.g. API Integration" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Hours</label>
                                    <Input type="number" min="0.5" step="0.5" value={hoursLogged} onChange={e => setHoursLogged(e.target.value)} placeholder="4.0" />
                                </div>
                            </div>
                            <Button className="w-full bg-slate-900" onClick={handleSaveTime}>Submit Time Entry</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Total Hours Logged</p>
                            <Clock className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{totalHoursLogged}h</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Active Projects Receiving Time</p>
                            <Briefcase className="h-5 w-5 text-indigo-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{activeProjectsCount}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Available Team Utilization</p>
                            <Users className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">
                                {store.employees.length > 0 ? '78%' : '0%'}
                            </span>
                            <span className="text-sm text-slate-500">average this month</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm border-slate-100">
                <CardHeader>
                    <CardTitle className="text-lg">Recent Time Entries</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Task</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Hours</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {store.timeEntries.slice().reverse().map((entry) => {
                                const emp = store.employees.find(e => e.id === entry.employeeId);
                                const prj = store.projects.find(p => p.id === entry.projectId);

                                return (
                                    <TableRow key={entry.id}>
                                        <TableCell className="text-slate-500 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-slate-400" />
                                                {entry.date}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">{emp?.name || 'Unknown'}</TableCell>
                                        <TableCell>{prj?.name || 'Unknown Project'}</TableCell>
                                        <TableCell className="text-slate-600">{entry.task}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                entry.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    'bg-amber-50 text-amber-700 border-amber-200'
                                            }>
                                                {entry.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{entry.hours}h</TableCell>
                                    </TableRow>
                                );
                            })}
                            {store.timeEntries.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-slate-500">No time recorded yet. Log time to see data here.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
