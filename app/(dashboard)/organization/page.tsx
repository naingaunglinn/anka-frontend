'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
    const t = useTranslations();
    // Connect to Store
    const store = useBusinessStore();
    const { syncing, syncError } = useOrganizationSync();

    // Fetch current-month time entries so the EmployeesTable can compute
    // each employee's "Available Hours" without depending on whether the user
    // already visited /team-assignment. Filtered by date range so the response
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
    const [empRankFilter, setEmpRankFilter] = useState<string>('all');
    const [empStatusFilter, setEmpStatusFilter] = useState<string>('all');

    // Apply the three search filters above the EmployeesTable. All client-side
    // since the employee list is small enough that round-trips would be wasteful.
    const filteredEmployees = useMemo(() => {
        const needle = empSearchName.trim().toLowerCase();
        return store.employees.filter((e) => {
            if (needle && !e.name.toLowerCase().includes(needle)) return false;
            if (empRoleFilter !== 'all' && e.role !== empRoleFilter) return false;
            if (empRankFilter !== 'all' && e.rankId !== empRankFilter) return false;
            if (empStatusFilter !== 'all' && e.status !== empStatusFilter) return false;
            return true;
        });
    }, [store.employees, empSearchName, empRoleFilter, empRankFilter, empStatusFilter]);

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
                    <h2 className="text-3xl font-bold tracking-tight text-[#171717]">{t('organization_settings')}</h2>
                    <p className="text-[#4a4a4a] mt-1">{t('manage_org_description')}</p>
                </div>
            </div>

            <Tabs defaultValue="employees" className="w-full">
                <TabsList className="grid w-full grid-cols-9 bg-slate-100/50 mb-8 p-1 h-auto rounded-lg">
                    <TabsTrigger value="departments" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('departments')}</TabsTrigger>
                    <TabsTrigger value="roles" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('roles')}</TabsTrigger>
                    <TabsTrigger value="employees" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('employees')}</TabsTrigger>
                    <TabsTrigger value="skills" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('skills')}</TabsTrigger>
                    <TabsTrigger value="ranks" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('ranks')}</TabsTrigger>
                    <TabsTrigger value="salary" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('salary_structure')}</TabsTrigger>
                    <TabsTrigger value="overhead" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('global_overhead')}</TabsTrigger>
                    <TabsTrigger value="holidays" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('holidays')}</TabsTrigger>
                    <TabsTrigger value="company" className="py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">{t('company')}</TabsTrigger>
                </TabsList>

                {/* DEPARTMENTS TAB */}
                <TabsContent value="departments" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">{t('departments')}</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">{t('manage_departments_description')}</p>
                        </div>
                        <Dialog open={isDeptDialogOpen} onOpenChange={setIsDeptDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> {t('add_department')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>{t('new_department')}</DialogTitle>
                                    <DialogDescription>{t('create_dept_description')}</DialogDescription>
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
                                <DialogTitle>{t('edit_department')}</DialogTitle>
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
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">{t('roles_and_rates')}</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">{t('define_roles_rates')}</p>
                        </div>
                        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> {t('add_role')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>{t('new_role')}</DialogTitle>
                                    <DialogDescription>{t('create_new_role_desc')}</DialogDescription>
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
                                <DialogTitle>{t('edit_role')}</DialogTitle>
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
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">{t('employees_list')}</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">{t('manage_roster_costs')}</p>
                        </div>
                        <Dialog open={isEmpDialogOpen} onOpenChange={setIsEmpDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> {t('add_employee')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>{t('new_employee')}</DialogTitle>
                                    <DialogDescription>{t('add_employee_description')}</DialogDescription>
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
                                    placeholder={t('search_by_name')}
                                    className="pl-9"
                                />
                            </div>
                            <div className="md:w-44">
                                <Select value={empRoleFilter} onValueChange={setEmpRoleFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('all_roles')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('all_roles')}</SelectItem>
                                        {store.roles.map((r) => (
                                            <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="md:w-44">
                                <Select value={empRankFilter} onValueChange={setEmpRankFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('all_ranks')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('all_ranks')}</SelectItem>
                                        {ranks.map((r) => (
                                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="md:w-44">
                                <Select value={empStatusFilter} onValueChange={setEmpStatusFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('all_statuses')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('all_statuses')}</SelectItem>
                                        <SelectItem value="Active">{t('active')}</SelectItem>
                                        <SelectItem value="On Leave">{t('on_leave')}</SelectItem>
                                        <SelectItem value="Terminated">{t('terminated')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {(empSearchName || empRoleFilter !== 'all' || empRankFilter !== 'all' || empStatusFilter !== 'all') && (
                            <p className="mt-2 text-xs text-[#8a8a8a]">
                                {t('showing_x_of_y_employees', { filtered: filteredEmployees.length, total: store.employees.length })}
                                <button
                                    type="button"
                                    onClick={() => { setEmpSearchName(''); setEmpRoleFilter('all'); setEmpRankFilter('all'); setEmpStatusFilter('all'); }}
                                    className="ml-2 text-slate-700 underline hover:no-underline"
                                >
                                    {t('clear_filters')}
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
                        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>{t('edit_employee')}</DialogTitle>
                                <DialogDescription>{t('update_employee_desc', { name: editingEmployee?.name ?? '' })}</DialogDescription>
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
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">{t('skills')}</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">{t('manage_skills_description')}</p>
                        </div>
                        <Dialog open={isSkillDialogOpen} onOpenChange={setIsSkillDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> {t('add_skill')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>{t('new_skill')}</DialogTitle>
                                    <DialogDescription>{t('add_skill_description')}</DialogDescription>
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
                                <DialogTitle>{t('edit_skill')}</DialogTitle>
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
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">{t('ranks')}</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">{t('ranks_description')}</p>
                        </div>
                        <Dialog open={isRankDialogOpen} onOpenChange={setIsRankDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> {t('add_rank')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>{t('new_rank')}</DialogTitle>
                                    <DialogDescription>{t('add_rank_description')}</DialogDescription>
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
                                <DialogTitle>{t('edit_rank')}</DialogTitle>
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
                        <Card variant="plain">
                            <CardHeader>
                                <CardTitle>{t('salary_multipliers')}</CardTitle>
                                <CardDescription>{t('salary_multipliers_desc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('employer_taxes')}</label>
                                    <Input
                                        type="number"
                                        value={salaryMultiplier.taxes}
                                        onChange={(e) => setSalaryMultiplier({ ...salaryMultiplier, taxes: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('benefits_insurance')}</label>
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
                                    {isSavingSalary ? t('saving') : t('save_multipliers')}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card variant="plain">
                            <CardHeader>
                                <CardTitle>{t('estimation_defaults')}</CardTitle>
                                <CardDescription>{t('estimation_defaults_desc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">
                                        {t('cost_to_bill_ratio')}
                                        <span className="text-[#8a8a8a] text-xs font-normal ml-1">{t('cost_to_bill_hint')}</span>
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
                                        {t('default_monthly_capacity_hours')}
                                        <span className="text-[#8a8a8a] text-xs font-normal ml-1">{t('default_capacity_hint')}</span>
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
                                        {t('fallback_hourly_cost')}
                                        <span className="text-[#8a8a8a] text-xs font-normal ml-1">{t('fallback_hourly_hint')}</span>
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
                                    {isSavingDefaults ? t('saving') : t('save_defaults')}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* OVERHEAD TAB */}
                <TabsContent value="overhead" className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-[#e6e9ee]">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-[#171717]">{t('global_overhead_categories')}</h3>
                            <p className="text-[#4a4a4a] text-sm mt-1">{t('manage_overhead_description')}</p>
                        </div>
                        <Dialog open={isOverheadDialogOpen} onOpenChange={setIsOverheadDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 bg-[#171717] hover:bg-[#00a7f4]">
                                    <Plus className="w-4 h-4" /> {t('add_overhead')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>{t('new_overhead')}</DialogTitle>
                                    <DialogDescription>{t('add_overhead_description')}</DialogDescription>
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
                                <DialogTitle>{t('edit_overhead')}</DialogTitle>
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
                        <h3 className="text-xl font-bold tracking-tight text-[#171717]">{t('company_settings')}</h3>
                        <p className="text-[#4a4a4a] text-sm mt-1">{t('company_logo_description')}</p>
                    </div>
                    <CompanySettingsForm />
                </TabsContent>
            </Tabs>
        </div>
    );
}
