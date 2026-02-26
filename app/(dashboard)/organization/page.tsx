'use client';

import { useState } from 'react';
import { EmployeesTable, Employee } from '@/components/tables/EmployeesTable';
import { EmployeeForm, EmployeeFormValues } from '@/components/forms/EmployeeForm';
import { DepartmentsTable, Department } from '@/components/tables/DepartmentsTable';
import { DepartmentForm, DepartmentFormValues } from '@/components/forms/DepartmentForm';
import { RolesTable, Role } from '@/components/tables/RolesTable';
import { RoleForm, RoleFormValues } from '@/components/forms/RoleForm';
import { OverheadsTable, Overhead } from '@/components/tables/OverheadsTable';
import { OverheadForm, OverheadFormValues } from '@/components/forms/OverheadForm';
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
import { Input } from '@/components/ui/input';

const mockEmployees: Employee[] = [
    { id: '1', name: 'John Doe', role: 'Developer', monthlySalary: 5000, workableHours: 160, costPerHour: 31.25, status: 'Active' },
    { id: '2', name: 'Jane Smith', role: 'Designer', monthlySalary: 4500, workableHours: 160, costPerHour: 28.12, status: 'Active' },
    { id: '3', name: 'Bob Johnson', role: 'Project Manager', monthlySalary: 6000, workableHours: 160, costPerHour: 37.5, status: 'On Leave' },
];

const mockDepartments: Department[] = [
    { id: '1', name: 'Engineering', manager: 'Alice Roberts', headcount: 12 },
    { id: '2', name: 'Design', manager: 'Mark Smith', headcount: 4 },
];

const mockRoles: Role[] = [
    { id: '1', title: 'Senior Developer', department: 'Engineering', rate: 150 },
    { id: '2', title: 'UI/UX Designer', department: 'Design', rate: 120 },
];

const mockOverheads: Overhead[] = [
    { id: '1', category: 'Software Licenses', description: 'AWS, GitHub, Slack, Figma', monthlyCost: 5200 },
    { id: '2', category: 'Office Rent', description: 'HQ Lease', monthlyCost: 12000 },
];

export default function EmployeesPage() {
    // Employees State
    const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
    const [isEmpDialogOpen, setIsEmpDialogOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

    // Departments State
    const [departments, setDepartments] = useState<Department[]>(mockDepartments);
    const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

    // Roles State
    const [roles, setRoles] = useState<Role[]>(mockRoles);
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    // Overheads State
    const [overheads, setOverheads] = useState<Overhead[]>(mockOverheads);
    const [isOverheadDialogOpen, setIsOverheadDialogOpen] = useState(false);
    const [editingOverhead, setEditingOverhead] = useState<Overhead | null>(null);

    // Salary Structure State
    const [salaryMultiplier, setSalaryMultiplier] = useState({ taxes: 8, benefits: 12 });
    const [isSavingSalary, setIsSavingSalary] = useState(false);

    // --- Employee Handlers ---
    const handleAddEmployee = async (data: EmployeeFormValues) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
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
        setIsEmpDialogOpen(false);
    };

    const handleEditEmployee = async (data: EmployeeFormValues) => {
        if (!editingEmployee) return;
        await new Promise((resolve) => setTimeout(resolve, 800));
        setEmployees(employees.map(emp => emp.id === editingEmployee.id ? {
            ...emp,
            name: data.name,
            role: data.role,
            monthlySalary: data.monthlySalary,
            workableHours: data.workableHours,
            costPerHour: Number((data.monthlySalary / data.workableHours).toFixed(2)),
            status: data.status as 'Active' | 'On Leave' | 'Terminated',
        } : emp));
        setEditingEmployee(null);
    };

    // --- Department Handlers ---
    const handleAddDepartment = async (data: DepartmentFormValues) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const newDept: Department = { id: Math.random().toString(), ...data };
        setDepartments([...departments, newDept]);
        setIsDeptDialogOpen(false);
    };

    const handleEditDepartment = async (data: DepartmentFormValues) => {
        if (!editingDepartment) return;
        await new Promise((resolve) => setTimeout(resolve, 800));
        setDepartments(departments.map(d => d.id === editingDepartment.id ? { ...d, ...data } : d));
        setEditingDepartment(null);
    };

    // --- Role Handlers ---
    const handleAddRole = async (data: RoleFormValues) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const newRole: Role = { id: Math.random().toString(), ...data };
        setRoles([...roles, newRole]);
        setIsRoleDialogOpen(false);
    };

    const handleEditRole = async (data: RoleFormValues) => {
        if (!editingRole) return;
        await new Promise((resolve) => setTimeout(resolve, 800));
        setRoles(roles.map(r => r.id === editingRole.id ? { ...r, ...data } : r));
        setEditingRole(null);
    };

    // --- Overhead Handlers ---
    const handleAddOverhead = async (data: OverheadFormValues) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const newOverhead: Overhead = { id: Math.random().toString(), ...data };
        setOverheads([...overheads, newOverhead]);
        setIsOverheadDialogOpen(false);
    };

    const handleEditOverhead = async (data: OverheadFormValues) => {
        if (!editingOverhead) return;
        await new Promise((resolve) => setTimeout(resolve, 800));
        setOverheads(overheads.map(o => o.id === editingOverhead.id ? { ...o, ...data } : o));
        setEditingOverhead(null);
    };

    // --- Salary Handlers ---
    const handleSaveSalary = async () => {
        setIsSavingSalary(true);
        await new Promise((resolve) => setTimeout(resolve, 800));
        setIsSavingSalary(false);
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
                    <TabsTrigger value="overhead" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Global Overhead</TabsTrigger>
                </TabsList>

                {/* DEPARTMENTS TAB */}
                <TabsContent value="departments" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-900">Departments</h3>
                            <p className="text-muted-foreground text-sm mt-1">Manage your organizational departments.</p>
                        </div>
                        <Dialog open={isDeptDialogOpen} onOpenChange={setIsDeptDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                                    <Plus className="w-4 h-4" /> Add Department
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Department</DialogTitle>
                                    <DialogDescription>Create a new department for your organization.</DialogDescription>
                                </DialogHeader>
                                <DepartmentForm onSubmit={handleAddDepartment} onCancel={() => setIsDeptDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <DepartmentsTable
                        data={departments}
                        onEdit={setEditingDepartment}
                        onDelete={(id) => setDepartments(departments.filter(d => d.id !== id))}
                    />

                    <Dialog open={!!editingDepartment} onOpenChange={(open) => !open && setEditingDepartment(null)}>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Department</DialogTitle>
                            </DialogHeader>
                            {editingDepartment && (
                                <DepartmentForm
                                    initialData={editingDepartment}
                                    onSubmit={handleEditDepartment}
                                    onCancel={() => setEditingDepartment(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* ROLES TAB */}
                <TabsContent value="roles" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-900">Roles & Rates</h3>
                            <p className="text-muted-foreground text-sm mt-1">Define roles and standard billable rates.</p>
                        </div>
                        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                                    <Plus className="w-4 h-4" /> Add Role
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Role</DialogTitle>
                                    <DialogDescription>Create a new role structure.</DialogDescription>
                                </DialogHeader>
                                <RoleForm onSubmit={handleAddRole} onCancel={() => setIsRoleDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <RolesTable
                        data={roles}
                        onEdit={setEditingRole}
                        onDelete={(id) => setRoles(roles.filter(r => r.id !== id))}
                    />

                    <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Role</DialogTitle>
                            </DialogHeader>
                            {editingRole && (
                                <RoleForm
                                    initialData={editingRole}
                                    onSubmit={handleEditRole}
                                    onCancel={() => setEditingRole(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* EMPLOYEES TAB */}
                <TabsContent value="employees" className="mt-0 space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-900">Employees List</h3>
                            <p className="text-muted-foreground text-sm mt-1">Manage your organization's roster and costs.</p>
                        </div>
                        <Dialog open={isEmpDialogOpen} onOpenChange={setIsEmpDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                                    <Plus className="w-4 h-4" /> Add Employee
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Employee</DialogTitle>
                                    <DialogDescription>Add a new employee to the roster. Cost per hour will be automatically calculated.</DialogDescription>
                                </DialogHeader>
                                <EmployeeForm onSubmit={handleAddEmployee} onCancel={() => setIsEmpDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <EmployeesTable
                        data={employees}
                        onEdit={setEditingEmployee}
                        onDelete={(id) => setEmployees(employees.filter(emp => emp.id !== id))}
                    />

                    <Dialog open={!!editingEmployee} onOpenChange={(open) => !open && setEditingEmployee(null)}>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Employee</DialogTitle>
                                <DialogDescription>Update the details for {editingEmployee?.name}.</DialogDescription>
                            </DialogHeader>
                            {editingEmployee && (
                                <EmployeeForm
                                    initialData={editingEmployee}
                                    onSubmit={handleEditEmployee}
                                    onCancel={() => setEditingEmployee(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* SALARY STRUCTURE TAB */}
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
                                    <Input
                                        type="number"
                                        value={salaryMultiplier.taxes}
                                        onChange={(e) => setSalaryMultiplier({ ...salaryMultiplier, taxes: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Benefits/Insurance (%)</label>
                                    <Input
                                        type="number"
                                        value={salaryMultiplier.benefits}
                                        onChange={(e) => setSalaryMultiplier({ ...salaryMultiplier, benefits: Number(e.target.value) })}
                                    />
                                </div>
                                <Button
                                    className="w-full mt-2"
                                    onClick={handleSaveSalary}
                                    disabled={isSavingSalary}
                                >
                                    {isSavingSalary ? "Saving..." : "Save Multipliers"}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* OVERHEAD TAB */}
                <TabsContent value="overhead" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-900">Global Overhead Categories</h3>
                            <p className="text-muted-foreground text-sm mt-1">Define organization-wide fixed monthly overhead costs.</p>
                        </div>
                        <Dialog open={isOverheadDialogOpen} onOpenChange={setIsOverheadDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                                    <Plus className="w-4 h-4" /> Add Overhead
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Overhead</DialogTitle>
                                    <DialogDescription>Define a fixed monthly cost.</DialogDescription>
                                </DialogHeader>
                                <OverheadForm onSubmit={handleAddOverhead} onCancel={() => setIsOverheadDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <OverheadsTable
                        data={overheads}
                        onEdit={setEditingOverhead}
                        onDelete={(id) => setOverheads(overheads.filter(o => o.id !== id))}
                    />

                    <Dialog open={!!editingOverhead} onOpenChange={(open) => !open && setEditingOverhead(null)}>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Overhead</DialogTitle>
                            </DialogHeader>
                            {editingOverhead && (
                                <OverheadForm
                                    initialData={editingOverhead}
                                    onSubmit={handleEditOverhead}
                                    onCancel={() => setEditingOverhead(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>
            </Tabs>
        </div>
    );
}
