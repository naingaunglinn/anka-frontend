'use client';

import { useState } from 'react';
import { EmployeesTable, Employee } from '@/components/tables/EmployeesTable';
import { EmployeeForm, EmployeeFormValues } from '@/components/forms/EmployeeForm';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const mockEmployees: Employee[] = [
    { id: '1', name: 'John Doe', role: 'Developer', monthlySalary: 5000, workableHours: 160, costPerHour: 31.25, status: 'Active' },
    { id: '2', name: 'Jane Smith', role: 'Designer', monthlySalary: 4500, workableHours: 160, costPerHour: 28.12, status: 'Active' },
    { id: '3', name: 'Bob Johnson', role: 'Project Manager', monthlySalary: 6000, workableHours: 160, costPerHour: 37.5, status: 'On Leave' },
];

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

    const handleAddSubmit = (data: EmployeeFormValues) => {
        // In a real app, this would be an API call
        const newEmployee: Employee = {
            id: Math.random().toString(),
            name: data.name,
            role: data.role,
            monthlySalary: data.monthlySalary,
            workableHours: data.workableHours,
            costPerHour: Number((data.monthlySalary / data.workableHours).toFixed(2)),
            status: data.status as 'Active' | 'On Leave' | 'Terminated',
        };

        setEmployees([...employees, newEmployee]);
        setIsDialogOpen(false);
    };

    const handleEditSubmit = (data: EmployeeFormValues) => {
        if (!editingEmployee) return;

        const updatedEmployees = employees.map(emp => {
            if (emp.id === editingEmployee.id) {
                return {
                    ...emp,
                    name: data.name,
                    role: data.role,
                    monthlySalary: data.monthlySalary,
                    workableHours: data.workableHours,
                    costPerHour: Number((data.monthlySalary / data.workableHours).toFixed(2)),
                    status: data.status as 'Active' | 'On Leave' | 'Terminated',
                };
            }
            return emp;
        });

        setEmployees(updatedEmployees);
        setEditingEmployee(null);
    };

    const handleDelete = (id: string) => {
        setEmployees(employees.filter(emp => emp.id !== id));
    };

    const handleEditClick = (employee: Employee) => {
        setEditingEmployee(employee);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Organization Settings</h2>
                <p className="text-muted-foreground mt-1">Manage your departments, roles, employees, and cost structures.</p>
            </div>

            <Tabs defaultValue="employees" className="w-full">
                <TabsList className="grid w-full grid-cols-5 bg-slate-100/50 mb-8 p-1 h-auto rounded-lg">
                    <TabsTrigger value="departments" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Departments</TabsTrigger>
                    <TabsTrigger value="roles" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Roles</TabsTrigger>
                    <TabsTrigger value="employees" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Employees</TabsTrigger>
                    <TabsTrigger value="salary" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Salary Structure</TabsTrigger>
                    <TabsTrigger value="overhead" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Overhead Categories</TabsTrigger>
                </TabsList>

                <TabsContent value="departments" className="space-y-4">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Departments</CardTitle>
                                <CardDescription>Manage your organizational departments.</CardDescription>
                            </div>
                            <Button size="sm" variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Add Department</Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Department Name</TableHead>
                                        <TableHead>Manager</TableHead>
                                        <TableHead className="text-right">Headcount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-medium">Engineering</TableCell>
                                        <TableCell>Alice Roberts</TableCell>
                                        <TableCell className="text-right">12</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium">Design</TableCell>
                                        <TableCell>Mark Smith</TableCell>
                                        <TableCell className="text-right">4</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="roles" className="space-y-4">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Roles & Rates</CardTitle>
                                <CardDescription>Define roles and standard billable rates.</CardDescription>
                            </div>
                            <Button size="sm" variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Add Role</Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Role Title</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead className="text-right">Standard Bill Rate</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-medium">Senior Developer</TableCell>
                                        <TableCell><Badge variant="secondary">Engineering</Badge></TableCell>
                                        <TableCell className="text-right font-medium text-emerald-600">$150/hr</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium">UI/UX Designer</TableCell>
                                        <TableCell><Badge variant="secondary">Design</Badge></TableCell>
                                        <TableCell className="text-right font-medium text-emerald-600">$120/hr</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="employees" className="mt-0">
                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div>
                                <h3 className="text-xl font-bold tracking-tight text-slate-900">Employees List</h3>
                                <p className="text-muted-foreground text-sm mt-1">Manage your organization's roster and costs.</p>
                            </div>

                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                                        <Plus className="w-4 h-4" /> Add Employee
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px]">
                                    <DialogHeader>
                                        <DialogTitle>Add New Employee</DialogTitle>
                                        <DialogDescription>
                                            Fill in the details below to add a new employee to the roster. Cost per hour will be automatically calculated.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <EmployeeForm
                                        onSubmit={handleAddSubmit}
                                        onCancel={() => setIsDialogOpen(false)}
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>

                        <EmployeesTable
                            data={employees}
                            onEdit={handleEditClick}
                            onDelete={handleDelete}
                        />

                        {/* Edit Dialog */}
                        <Dialog
                            open={!!editingEmployee}
                            onOpenChange={(open) => !open && setEditingEmployee(null)}
                        >
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Edit Employee</DialogTitle>
                                    <DialogDescription>
                                        Update the details for {editingEmployee?.name}.
                                    </DialogDescription>
                                </DialogHeader>
                                {editingEmployee && (
                                    <EmployeeForm
                                        initialData={{
                                            name: editingEmployee.name,
                                            role: editingEmployee.role,
                                            monthlySalary: editingEmployee.monthlySalary,
                                            workableHours: editingEmployee.workableHours,
                                            status: editingEmployee.status
                                        }}
                                        onSubmit={handleEditSubmit}
                                        onCancel={() => setEditingEmployee(null)}
                                    />
                                )}
                            </DialogContent>
                        </Dialog>
                    </div>
                </TabsContent>

                <TabsContent value="salary" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="shadow-sm border-slate-100">
                            <CardHeader>
                                <CardTitle>Salary Multipliers</CardTitle>
                                <CardDescription>Configure taxes, benefits, and bonus %.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Employer Taxes (%)</label>
                                    <Input type="number" defaultValue="8" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Benefits/Insurance (%)</label>
                                    <Input type="number" defaultValue="12" />
                                </div>
                                <Button className="w-full mt-2">Save Multipliers</Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="overhead" className="space-y-4">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Overhead Categories</CardTitle>
                                <CardDescription>Define organization-wide fixed monthly overhead costs.</CardDescription>
                            </div>
                            <Button size="sm" variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Add Overhead</Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Monthly Cost</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-medium">Software Licenses</TableCell>
                                        <TableCell className="text-muted-foreground">AWS, GitHub, Slack, Figma</TableCell>
                                        <TableCell className="text-right font-medium text-rose-600">$5,200</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium">Office Rent</TableCell>
                                        <TableCell className="text-muted-foreground">HQ Lease</TableCell>
                                        <TableCell className="text-right font-medium text-rose-600">$12,000</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
