'use client';

import { useEffect, useState } from 'react';
import { EmployeesTable } from '@/components/tables/EmployeesTable';
import { EmployeeForm } from '@/components/forms/EmployeeForm';
import { DepartmentsTable } from '@/components/tables/DepartmentsTable';
import { DepartmentForm } from '@/components/forms/DepartmentForm';
import { RolesTable } from '@/components/tables/RolesTable';
import { RoleForm } from '@/components/forms/RoleForm';
import { OverheadsTable } from '@/components/tables/OverheadsTable';
import { OverheadForm } from '@/components/forms/OverheadForm';
import {
    type DepartmentFormValues,
    type RoleFormValues,
    type EmployeeFormValues,
    type OverheadFormValues,
} from '@/lib/schemas/organization.schema';
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
import { useBusinessStore } from '@/store/businessStore';
import { Employee, Department, Role, GlobalOverhead } from '@/types/business';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';

export default function EmployeesPage() {
    // Connect to Store
    const store = useBusinessStore();
    const { syncing, syncError } = useOrganizationSync();

    // Employees State
    const [isEmpDialogOpen, setIsEmpDialogOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

    // Departments State
    const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

    // Roles State
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    // Overheads State
    const [isOverheadDialogOpen, setIsOverheadDialogOpen] = useState(false);
    const [editingOverhead, setEditingOverhead] = useState<GlobalOverhead | null>(null);

    const [salaryMultiplier, setSalaryMultiplier] = useState(() => ({
        taxes: store.companySettings.employerTaxPercentage,
        benefits: store.companySettings.benefitsPercentage,
    }));
    const [isSavingSalary, setIsSavingSalary] = useState(false);

    useEffect(() => {
        setSalaryMultiplier({
            taxes: store.companySettings.employerTaxPercentage,
            benefits: store.companySettings.benefitsPercentage,
        });
    }, [
        store.companySettings.employerTaxPercentage,
        store.companySettings.benefitsPercentage,
    ]);

    // --- Employee Handlers ---
    const handleAddEmployee = async (data: EmployeeFormValues) => {
        const role = store.roles.find(r => r.id === data.role);
        const dept = store.departments.find(d => d.id === data.departmentId);
        await store.addEmployee({
            id: crypto.randomUUID(),
            name: data.name,
            role: data.role,
            roleName: role?.title,
            departmentId: data.departmentId && data.departmentId !== 'none' ? data.departmentId : undefined,
            capacityRole: (data.capacityRole && data.capacityRole !== 'none')
                ? data.capacityRole as Employee['capacityRole']
                : undefined,
            monthlySalary: data.monthlySalary,
            workableHours: data.workableHours,
            costPerHour: Number((data.monthlySalary / data.workableHours).toFixed(2)),
            status: data.status as 'Active' | 'On Leave' | 'Terminated',
        });
        setIsEmpDialogOpen(false);
    };

    const handleEditEmployee = async (data: EmployeeFormValues) => {
        if (!editingEmployee) return;
        const role = store.roles.find(r => r.id === data.role);
        await store.updateEmployee(editingEmployee.id, {
            name: data.name,
            role: data.role,
            roleName: role?.title,
            departmentId: data.departmentId && data.departmentId !== 'none' ? data.departmentId : undefined,
            capacityRole: (data.capacityRole && data.capacityRole !== 'none')
                ? data.capacityRole as Employee['capacityRole']
                : undefined,
            monthlySalary: data.monthlySalary,
            workableHours: data.workableHours,
            costPerHour: Number((data.monthlySalary / data.workableHours).toFixed(2)),
            status: data.status as 'Active' | 'On Leave' | 'Terminated',
        });
        setEditingEmployee(null);
    };

    // --- Department Handlers ---
    const handleAddDepartment = async (data: DepartmentFormValues) => {
        await store.addDepartment({ id: crypto.randomUUID(), ...data, headcount: 0 });
        setIsDeptDialogOpen(false);
    };

    const handleEditDepartment = async (data: DepartmentFormValues) => {
        if (!editingDepartment) return;
        await store.updateDepartment(editingDepartment.id, data);
        setEditingDepartment(null);
    };

    // --- Role Handlers ---
    const handleAddRole = async (data: RoleFormValues) => {
        const dept = store.departments.find(d => d.id === data.departmentId);
        await store.addRole({
            id: crypto.randomUUID(),
            title: data.title,
            department: dept?.name ?? '',
            departmentId: data.departmentId,
            rate: data.rate,
        });
        setIsRoleDialogOpen(false);
    };

    const handleEditRole = async (data: RoleFormValues) => {
        if (!editingRole) return;
        const dept = store.departments.find(d => d.id === data.departmentId);
        await store.updateRole(editingRole.id, {
            title: data.title,
            department: dept?.name ?? '',
            departmentId: data.departmentId,
            rate: data.rate,
        });
        setEditingRole(null);
    };

    // --- Overhead Handlers ---
    const handleAddOverhead = async (data: OverheadFormValues) => {
        await store.addGlobalOverhead({ id: crypto.randomUUID(), ...data });
        setIsOverheadDialogOpen(false);
    };

    const handleEditOverhead = async (data: OverheadFormValues) => {
        if (!editingOverhead) return;
        await store.updateGlobalOverhead(editingOverhead.id, data);
        setEditingOverhead(null);
    };

    // --- Salary Handlers ---
    const handleSaveSalary = async () => {
        setIsSavingSalary(true);
        await store.updateCompanySettings({
            employerTaxPercentage: salaryMultiplier.taxes,
            benefitsPercentage: salaryMultiplier.benefits,
        });
        setIsSavingSalary(false);
    };

    if (syncing) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-sm text-muted-foreground animate-pulse">
                    Loading organization data...
                </p>
            </div>
        );
    }

    if (syncError) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-sm text-destructive">
                    Failed to connect to database: {syncError}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Organization Settings</h2>
                    <p className="text-muted-foreground mt-1">Manage your departments, roles, employees, and cost structures.</p>
                </div>
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
                        data={store.departments}
                        onEdit={setEditingDepartment}
                        onDelete={(id) => store.deleteDepartment(id)}
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
                                <RoleForm departments={store.departments} onSubmit={handleAddRole} onCancel={() => setIsRoleDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <RolesTable
                        data={store.roles}
                        onEdit={setEditingRole}
                        onDelete={(id) => store.deleteRole(id)}
                    />

                    <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Role</DialogTitle>
                            </DialogHeader>
                            {editingRole && (
                                <RoleForm
                                    initialData={{ title: editingRole.title, departmentId: editingRole.departmentId ?? '', rate: editingRole.rate }}
                                    departments={store.departments}
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
                                <EmployeeForm roles={store.roles} departments={store.departments} onSubmit={handleAddEmployee} onCancel={() => setIsEmpDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <EmployeesTable
                        data={store.employees}
                        roles={store.roles}
                        onEdit={setEditingEmployee}
                        onDelete={(id) => store.deleteEmployee(id)}
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
                                    roles={store.roles}
                                    departments={store.departments}
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
                        data={store.globalOverheads}
                        onEdit={setEditingOverhead}
                        onDelete={(id) => store.deleteGlobalOverhead(id)}
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
