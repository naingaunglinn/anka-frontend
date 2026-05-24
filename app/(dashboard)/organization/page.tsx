'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmployeesTable } from '@/components/tables/EmployeesTable';
import { EmployeeForm } from '@/components/forms/EmployeeForm';
import { DepartmentsTable } from '@/components/tables/DepartmentsTable';
import { DepartmentForm } from '@/components/forms/DepartmentForm';
import { RolesTable } from '@/components/tables/RolesTable';
import { RoleForm } from '@/components/forms/RoleForm';
import { OverheadsTable } from '@/components/tables/OverheadsTable';
import { OverheadForm } from '@/components/forms/OverheadForm';
import { CompanySettingsForm } from '@/components/forms/CompanySettingsForm';
import { SkillsTable } from '@/components/tables/SkillsTable';
import { SkillForm } from '@/components/forms/SkillForm';
import { RanksTable } from '@/components/tables/RanksTable';
import { RankForm } from '@/components/forms/RankForm';
import {
    type DepartmentFormValues,
    type RoleFormValues,
    type EmployeeFormValues,
    type EmployeeCreateValues,
    type OverheadFormValues,
    type SkillFormValues,
    type RankFormValues,
} from '@/lib/schemas/organization.schema';
import { useRanks, useRankMutations } from '@/lib/queries/ranks';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBusinessStore } from '@/store/businessStore';
import { Employee, Department, Role, GlobalOverhead, Skill, Rank } from '@/types/business';
import { useOrganizationSync } from '@/hooks/useOrganizationSync';
import { useTimeEntryList } from '@/lib/queries/timeEntries';
import { HolidaysTab } from '@/components/organization/HolidaysTab';
export default function EmployeesPage() {
    // Connect to Store
    const store = useBusinessStore();
    const { syncing, syncError } = useOrganizationSync();

    // Fetch current-month time entries so the EmployeesTable can compute
    // each employee's "Available Hours" without depending on whether the user
    // already visited /time-tracking. Filtered by date range so the response
    // stays small even on tenants with thousands of historical entries.
    // Note: this query is filtered, so by design it does NOT mirror to
    // businessStore — the table reads from the prop instead.
    const monthEntriesQuery = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const start = new Date(year, month, 1).toISOString().slice(0, 10);
        const end   = new Date(year, month + 1, 0).toISOString().slice(0, 10);
        return { date_from: start, date_to: end, per_page: 200 };
    }, []);
    const timeEntriesThisMonth =
        useTimeEntryList(monthEntriesQuery).data?.data ?? [];

    // Employees State
    const [isEmpDialogOpen, setIsEmpDialogOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

    // Employees filter state — keep client-side; the dataset is small.
    const [empSearchName, setEmpSearchName] = useState('');
    const [empRoleFilter, setEmpRoleFilter] = useState<string>('all');
    const [empStatusFilter, setEmpStatusFilter] = useState<string>('all');

    // Apply the three search filters above the EmployeesTable. All client-side
    // since the employee list is small enough that round-trips would be wasteful.
    const filteredEmployees = useMemo(() => {
        const needle = empSearchName.trim().toLowerCase();
        return store.employees.filter((e) => {
            if (needle && !e.name.toLowerCase().includes(needle)) return false;
            if (empRoleFilter !== 'all' && e.role !== empRoleFilter) return false;
            if (empStatusFilter !== 'all' && e.status !== empStatusFilter) return false;
            return true;
        });
    }, [store.employees, empSearchName, empRoleFilter, empStatusFilter]);

    // Departments State
    const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

    // Roles State
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    // Overheads State
    const [isOverheadDialogOpen, setIsOverheadDialogOpen] = useState(false);
    const [editingOverhead, setEditingOverhead] = useState<GlobalOverhead | null>(null);

    // Skills State
    const [isSkillDialogOpen, setIsSkillDialogOpen] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

    // Ranks State — ranks live outside the Zustand store (TanStack Query
    // only). The Employee form's rank dropdown reads from this same hook,
    // so adding/editing a rank here invalidates the cache and propagates.
    const ranksQuery = useRanks();
    const rankMutations = useRankMutations();
    const ranks = ranksQuery.data ?? [];
    const [isRankDialogOpen, setIsRankDialogOpen] = useState(false);
    const [editingRank, setEditingRank] = useState<Rank | null>(null);

    const [salaryMultiplier, setSalaryMultiplier] = useState(() => ({
        taxes: store.companySettings.employerTaxPercentage,
        benefits: store.companySettings.benefitsPercentage,
    }));
    const [isSavingSalary, setIsSavingSalary] = useState(false);

    // Estimation defaults — drive cost calculations on /estimation when no
    // concrete signal is available. Editable here so each tenant can set
    // their own assumptions instead of inheriting hardcoded literals.
    const [estimationDefaults, setEstimationDefaults] = useState(() => ({
        costToBillRatio:             store.companySettings.costToBillRatio,
        defaultMonthlyCapacityHours: store.companySettings.defaultMonthlyCapacityHours,
        fallbackHourlyCost:          store.companySettings.fallbackHourlyCost,
    }));
    const [isSavingDefaults, setIsSavingDefaults] = useState(false);

    useEffect(() => {
        setSalaryMultiplier({
            taxes: store.companySettings.employerTaxPercentage,
            benefits: store.companySettings.benefitsPercentage,
        });
    }, [
        store.companySettings.employerTaxPercentage,
        store.companySettings.benefitsPercentage,
    ]);

    useEffect(() => {
        setEstimationDefaults({
            costToBillRatio:             store.companySettings.costToBillRatio,
            defaultMonthlyCapacityHours: store.companySettings.defaultMonthlyCapacityHours,
            fallbackHourlyCost:          store.companySettings.fallbackHourlyCost,
        });
    }, [
        store.companySettings.costToBillRatio,
        store.companySettings.defaultMonthlyCapacityHours,
        store.companySettings.fallbackHourlyCost,
    ]);

    // --- Employee Handlers ---
    // Build the EmployeeSkillWithName[] the store/API expects from the form
    // payload by joining each picked skillId against the catalog. Unknown ids
    // are dropped — the schema validates uuids but a skill could have been
    // deleted in another tab between picker open and submit.
    const buildSkills = (
        picked: EmployeeCreateValues['skills'],
    ): Employee['skills'] =>
        picked
            .map(p => {
                const skill = store.skills.find(s => s.id === p.skillId);
                return skill
                    ? {
                          skillId:     skill.id,
                          name:        skill.name,
                          category:    skill.category,
                          proficiency: p.proficiency,
                      }
                    : null;
            })
            .filter((s): s is NonNullable<typeof s> => s !== null);

    const handleAddEmployee = async (data: EmployeeCreateValues) => {
        const role = store.roles.find(r => r.id === data.role);
        await store.addEmployee(
            {
                id: crypto.randomUUID(),
                name: data.name,
                role: data.role,
                roleName: role?.title,
                departmentId: data.departmentId && data.departmentId !== 'none' ? data.departmentId : undefined,
                capacityRole: (data.capacityRole && data.capacityRole !== 'none')
                    ? data.capacityRole as Employee['capacityRole']
                    : undefined,
                // 'none' sentinel from the form's Select component is mapped to
                // null by the store mutation; empty string also reads as null.
                rankId: data.rankId && data.rankId !== 'none' ? data.rankId : null,
                // Spec ①.2 — basicSalary + allowance instead of monthlySalary.
                // monthlySalary is derived (basic + allowance) so legacy readers
                // keep working; the backend recomputes on save.
                basicSalary: data.basicSalary,
                allowance: data.allowance ?? 0,
                monthlySalary: data.basicSalary + (data.allowance ?? 0),
                workableHours: data.workableHours,
                costPerHour: Number(((data.basicSalary + (data.allowance ?? 0)) / data.workableHours).toFixed(2)),
                status: data.status as 'Active' | 'On Leave' | 'Terminated',
                skills: buildSkills(data.skills),
            },
            { email: data.email, password: data.password },
        );
        setIsEmpDialogOpen(false);
    };

    const handleEditEmployee = async (data: EmployeeFormValues) => {
        if (!editingEmployee) return;
        const role = store.roles.find(r => r.id === data.role);
        // Only forward credentials when at least one was actually provided —
        // empty/undefined means "no change" and the backend skips the user update.
        const credentials =
            data.email || data.password
                ? { email: data.email, password: data.password }
                : undefined;
        await store.updateEmployee(
            editingEmployee.id,
            {
                name: data.name,
                role: data.role,
                roleName: role?.title,
                departmentId: data.departmentId && data.departmentId !== 'none' ? data.departmentId : undefined,
                capacityRole: (data.capacityRole && data.capacityRole !== 'none')
                    ? data.capacityRole as Employee['capacityRole']
                    : undefined,
                rankId: data.rankId && data.rankId !== 'none' ? data.rankId : null,
                // Spec ①.2 — basicSalary + allowance instead of monthlySalary.
                // monthlySalary is derived (basic + allowance) so legacy readers
                // keep working; the backend recomputes on save.
                basicSalary: data.basicSalary,
                allowance: data.allowance ?? 0,
                monthlySalary: data.basicSalary + (data.allowance ?? 0),
                workableHours: data.workableHours,
                costPerHour: Number(((data.basicSalary + (data.allowance ?? 0)) / data.workableHours).toFixed(2)),
                status: data.status as 'Active' | 'On Leave' | 'Terminated',
                skills: buildSkills(data.skills),
            },
            credentials,
        );
        setEditingEmployee(null);
    };

    // --- Department Handlers ---
    const handleAddDepartment = async (data: DepartmentFormValues) => {
        const manager = store.employees.find(e => e.id === data.managerId);
        await store.addDepartment({
            id:                  crypto.randomUUID(),
            name:                data.name,
            managerId:           data.managerId,
            managerName:         manager?.name,
            isDeliveryEligible:  data.isDeliveryEligible,
            headcount:           0,
        });
        setIsDeptDialogOpen(false);
    };

    const handleEditDepartment = async (data: DepartmentFormValues) => {
        if (!editingDepartment) return;
        const manager = store.employees.find(e => e.id === data.managerId);
        await store.updateDepartment(editingDepartment.id, {
            name:                data.name,
            managerId:           data.managerId,
            managerName:         manager?.name,
            isDeliveryEligible:  data.isDeliveryEligible,
        });
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

    // --- Skill Handlers ---
    const handleAddSkill = async (data: SkillFormValues) => {
        await store.addSkill({ id: crypto.randomUUID(), ...data });
        setIsSkillDialogOpen(false);
    };

    const handleEditSkill = async (data: SkillFormValues) => {
        if (!editingSkill) return;
        await store.updateSkill(editingSkill.id, data);
        setEditingSkill(null);
    };

    // --- Rank Handlers ---
    const handleAddRank = async (data: RankFormValues) => {
        await rankMutations.create.mutateAsync(data);
        setIsRankDialogOpen(false);
    };
    const handleEditRank = async (data: RankFormValues) => {
        if (!editingRank) return;
        await rankMutations.update.mutateAsync({ id: editingRank.id, payload: data });
        setEditingRank(null);
    };
    const handleDeleteRank = async (id: string) => {
        await rankMutations.remove.mutateAsync(id);
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

    const handleSaveEstimationDefaults = async () => {
        setIsSavingDefaults(true);
        await store.updateCompanySettings({
            costToBillRatio:             estimationDefaults.costToBillRatio,
            defaultMonthlyCapacityHours: estimationDefaults.defaultMonthlyCapacityHours,
            fallbackHourlyCost:          estimationDefaults.fallbackHourlyCost,
        });
        setIsSavingDefaults(false);
    };

    if (syncing) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-sm text-[#4a4a4a] animate-pulse">
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
                    <h2 className="text-3xl font-bold tracking-tight text-[#171717]">Organization Settings</h2>
                    <p className="text-[#4a4a4a] mt-1">Manage your departments, roles, employees, and cost structures.</p>
                </div>
            </div>

            <Tabs defaultValue="employees" className="w-full">
                <TabsList className="grid w-full grid-cols-9 bg-slate-100/50 mb-8 p-1 h-auto rounded-lg">
                    <TabsTrigger value="departments" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Departments</TabsTrigger>
                    <TabsTrigger value="roles" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Roles</TabsTrigger>
                    <TabsTrigger value="employees" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Employees</TabsTrigger>
                    <TabsTrigger value="skills" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Skills</TabsTrigger>
                    <TabsTrigger value="ranks" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Ranks</TabsTrigger>
                    <TabsTrigger value="salary" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Salary Structure</TabsTrigger>
                    <TabsTrigger value="overhead" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Global Overhead</TabsTrigger>
                    <TabsTrigger value="holidays" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Holidays</TabsTrigger>
                    <TabsTrigger value="company" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Company</TabsTrigger>
                </TabsList>

                {/* DEPARTMENTS TAB */}
                <TabsContent value="departments" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">Departments</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">Manage your organizational departments.</p>
                        </div>
                        <Dialog open={isDeptDialogOpen} onOpenChange={setIsDeptDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> Add Department
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Department</DialogTitle>
                                    <DialogDescription>Create a new department for your organization.</DialogDescription>
                                </DialogHeader>
                                <DepartmentForm employees={store.employees} onSubmit={handleAddDepartment} onCancel={() => setIsDeptDialogOpen(false)} />
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
                                    initialData={{ name: editingDepartment.name, managerId: editingDepartment.managerId, isDeliveryEligible: editingDepartment.isDeliveryEligible ?? true }}
                                    employees={store.employees}
                                    onSubmit={handleEditDepartment}
                                    onCancel={() => setEditingDepartment(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* ROLES TAB */}
                <TabsContent value="roles" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">Roles & Rates</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">Define roles and standard billable rates.</p>
                        </div>
                        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
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
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">Employees List</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">Manage your organization&#39;s roster and costs.</p>
                        </div>
                        <Dialog open={isEmpDialogOpen} onOpenChange={setIsEmpDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> Add Employee
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Employee</DialogTitle>
                                    <DialogDescription>Add a new employee to the roster. Cost per hour will be automatically calculated.</DialogDescription>
                                </DialogHeader>
                                <EmployeeForm
                                    roles={store.roles}
                                    departments={store.departments}
                                    skills={store.skills}
                                    ranks={ranks}
                                    onSubmit={handleAddEmployee}
                                    onCancel={() => setIsEmpDialogOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="rounded-xl border border-[#e6e9ee] bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="relative md:flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8a8a]" />
                                <Input
                                    value={empSearchName}
                                    onChange={(e) => setEmpSearchName(e.target.value)}
                                    placeholder="Search by name..."
                                    className="pl-9"
                                />
                            </div>
                            <div className="md:w-48">
                                <Select value={empRoleFilter} onValueChange={setEmpRoleFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All roles" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All roles</SelectItem>
                                        {store.roles.map((r) => (
                                            <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="md:w-48">
                                <Select value={empStatusFilter} onValueChange={setEmpStatusFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All statuses</SelectItem>
                                        <SelectItem value="Active">Active</SelectItem>
                                        <SelectItem value="On Leave">On Leave</SelectItem>
                                        <SelectItem value="Terminated">Terminated</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {(empSearchName || empRoleFilter !== 'all' || empStatusFilter !== 'all') && (
                            <p className="mt-2 text-xs text-[#8a8a8a]">
                                Showing {filteredEmployees.length} of {store.employees.length} employees.
                                <button
                                    type="button"
                                    onClick={() => { setEmpSearchName(''); setEmpRoleFilter('all'); setEmpStatusFilter('all'); }}
                                    className="ml-2 text-slate-700 underline hover:no-underline"
                                >
                                    Clear filters
                                </button>
                            </p>
                        )}
                    </div>

                    <EmployeesTable
                        data={filteredEmployees}
                        roles={store.roles}
                        timeEntries={timeEntriesThisMonth}
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
                                    skills={store.skills}
                                    ranks={ranks}
                                    onSubmit={handleEditEmployee}
                                    onCancel={() => setEditingEmployee(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* SKILLS TAB */}
                <TabsContent value="skills" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">Skills</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">Manage skills that can be assigned to employees.</p>
                        </div>
                        <Dialog open={isSkillDialogOpen} onOpenChange={setIsSkillDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> Add Skill
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Skill</DialogTitle>
                                    <DialogDescription>Create a skill to assign to employees.</DialogDescription>
                                </DialogHeader>
                                <SkillForm onSubmit={handleAddSkill} onCancel={() => setIsSkillDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <SkillsTable
                        data={store.skills}
                        onEdit={setEditingSkill}
                        onDelete={(id) => store.deleteSkill(id)}
                    />

                    <Dialog open={!!editingSkill} onOpenChange={(open) => !open && setEditingSkill(null)}>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Skill</DialogTitle>
                            </DialogHeader>
                            {editingSkill && (
                                <SkillForm
                                    initialData={editingSkill}
                                    onSubmit={handleEditSkill}
                                    onCancel={() => setEditingSkill(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* RANKS TAB */}
                <TabsContent value="ranks" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">Ranks</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">
                                Seniority tiers used by the AI Team Builder. Defaults: Junior, Mid, Senior, Lead.
                                Add custom ranks for your team (e.g. Principal, Staff Engineer).
                            </p>
                        </div>
                        <Dialog open={isRankDialogOpen} onOpenChange={setIsRankDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> Add Rank
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Add New Rank</DialogTitle>
                                    <DialogDescription>
                                        Create a custom seniority rank. Higher level = more senior.
                                    </DialogDescription>
                                </DialogHeader>
                                <RankForm onSubmit={handleAddRank} onCancel={() => setIsRankDialogOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <RanksTable
                        data={ranks}
                        onEdit={setEditingRank}
                        onDelete={handleDeleteRank}
                    />

                    <Dialog open={!!editingRank} onOpenChange={(open) => !open && setEditingRank(null)}>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Edit Rank</DialogTitle>
                            </DialogHeader>
                            {editingRank && (
                                <RankForm
                                    initialData={editingRank}
                                    onSubmit={handleEditRank}
                                    onCancel={() => setEditingRank(null)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* SALARY STRUCTURE TAB */}
                <TabsContent value="salary" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="shadow-sm border-[#e6e9ee]">
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

                        <Card className="shadow-sm border-[#e6e9ee]">
                            <CardHeader>
                                <CardTitle>Estimation Defaults</CardTitle>
                                <CardDescription>
                                    Fallback assumptions used by the Estimation Engine when a deal or role doesn&apos;t supply concrete data.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">
                                        Cost-to-Bill Ratio
                                        <span className="text-[#8a8a8a] text-xs font-normal ml-1">(0–1; e.g. 0.40 = cost is 40% of billable rate)</span>
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="1"
                                        value={estimationDefaults.costToBillRatio}
                                        onChange={(e) => setEstimationDefaults({ ...estimationDefaults, costToBillRatio: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">
                                        Default Monthly Capacity (hours)
                                        <span className="text-[#8a8a8a] text-xs font-normal ml-1">(per employee; typical 160)</span>
                                    </label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="744"
                                        value={estimationDefaults.defaultMonthlyCapacityHours}
                                        onChange={(e) => setEstimationDefaults({ ...estimationDefaults, defaultMonthlyCapacityHours: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">
                                        Fallback Hourly Cost
                                        <span className="text-[#8a8a8a] text-xs font-normal ml-1">(used when no employee or role rate is available)</span>
                                    </label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={estimationDefaults.fallbackHourlyCost}
                                        onChange={(e) => setEstimationDefaults({ ...estimationDefaults, fallbackHourlyCost: Number(e.target.value) })}
                                    />
                                </div>
                                <Button
                                    className="w-full mt-2"
                                    onClick={handleSaveEstimationDefaults}
                                    disabled={isSavingDefaults}
                                >
                                    {isSavingDefaults ? "Saving..." : "Save Defaults"}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* OVERHEAD TAB */}
                <TabsContent value="overhead" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">Global Overhead Categories</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">Define organization-wide fixed monthly overhead costs.</p>
                        </div>
                        <Dialog open={isOverheadDialogOpen} onOpenChange={setIsOverheadDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
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

                {/* HOLIDAYS TAB — public-holiday list. Drives holiday-aware capacity math
                    (Time Tracking utilization KPI, AI scheduler date planning). */}
                <TabsContent value="holidays" className="space-y-4">
                    <HolidaysTab />
                </TabsContent>

                {/* COMPANY TAB — name + logo that render on every contract PDF and customer email. */}
                <TabsContent value="company" className="space-y-4">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <h3 className="text-xl font-bold tracking-tight text-[#171717]">Company Settings</h3>
                        <p className="text-[#4a4a4a] text-sm mt-1">
                            Your company name and logo appear at the top of every contract PDF
                            and in the customer-facing email subject + body.
                        </p>
                    </div>
                    <CompanySettingsForm />
                </TabsContent>
            </Tabs>
        </div>
    );
}
