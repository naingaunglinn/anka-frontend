import api from '@/lib/api'
import type {
    Department,
    Role,
    Employee,
    GlobalOverhead,
    CompanySettings,
    CapacityRole,
    Skill,
} from '@/types/business'

// ── Response mappers (API snake_case → TypeScript camelCase) ──────────────────

// Optional-string helper: API returns JSON `null` for nullable columns, but
// our Zod form schemas use `.optional()`, which accepts `undefined` and
// rejects `null`. Coerce here so the rest of the app sees a clean undefined.
function optStr(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function optNum(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function toDepartment(row: Record<string, unknown>): Department {
    return {
        id:          row.id as string,
        name:        row.name as string,
        managerId:   optStr(row.manager_id),
        managerName: optStr(row.manager_name),
        headcount:   row.headcount as number,
    }
}

function toRole(row: Record<string, unknown>): Role {
    return {
        id:           row.id as string,
        title:        row.title as string,
        department:   row.department as string,
        departmentId: optStr(row.department_id),
        rate:         row.rate as number,
    }
}

function toEmployee(row: Record<string, unknown>): Employee {
    const rankRaw = row.rank as Record<string, unknown> | null | undefined;
    return {
        id:               row.id as string,
        name:             row.name as string,
        role:             row.role as string,
        roleName:         optStr(row.role_name),
        departmentId:     optStr(row.department_id),
        departmentName:   optStr(row.department_name),
        jobRoleId:        optStr(row.job_role_id),
        capacityRole:     optStr(row.capacity_role) as Employee['capacityRole'],
        capacityRoleId:   optStr(row.capacity_role_id),
        capacityRoleName: optStr(row.capacity_role_name),
        rankId:           optStr(row.rank_id) ?? null,
        rank:             rankRaw ? {
            id:    rankRaw.id as string,
            name:  rankRaw.name as string,
            code:  rankRaw.code as string,
            level: rankRaw.level as number,
        } : null,
        basicSalary:      Number(row.basic_salary ?? row.monthly_salary ?? 0),
        allowance:        Number(row.allowance ?? 0),
        monthlySalary:    row.monthly_salary as number,
        workableHours:    row.workable_hours as number,
        costPerHour:      row.cost_per_hour as number,
        status:           row.status as Employee['status'],
        email:            optStr(row.email),
        skills:           toEmployeeSkillsArray(row.skills),
    }
}

function toEmployeeSkillsArray(skills: unknown): { skillId: string; name: string; category: string; proficiency?: 'beginner' | 'intermediate' | 'expert' }[] | undefined {
    if (!Array.isArray(skills)) return undefined;
    return skills.map((s: Record<string, unknown>) => ({
        skillId:     s.id as string,
        name:        s.name as string,
        category:    s.category as string,
        proficiency: s.proficiency as 'beginner' | 'intermediate' | 'expert' | undefined,
    }))
}

function toGlobalOverhead(row: Record<string, unknown>): GlobalOverhead {
    return {
        id:             row.id as string,
        category:       row.category as string,
        description:    row.description as string,
        monthlyCost:    row.monthly_cost as number,
        effectiveMonth: optNum(row.effective_month),
        effectiveYear:  optNum(row.effective_year),
    }
}

function toCompanySettings(row: Record<string, unknown>): CompanySettings {
    return {
        overheadPercentage:           row.overhead_percentage as number,
        bufferPercentage:             row.buffer_percentage as number,
        yearlyFixedCost:              row.yearly_fixed_cost as number,
        annualInitialBudget:          (row.annual_initial_budget as number) ?? 1_000_000_000,
        employerTaxPercentage:        (row.employer_tax_percentage as number) ?? 0,
        benefitsPercentage:           (row.benefits_percentage as number) ?? 0,
        // New estimation defaults — fall back to the same baked-in numbers the
        // backend migration uses, so older rows that haven't been re-saved
        // since the migration still produce sensible estimates.
        costToBillRatio:              (row.cost_to_bill_ratio as number) ?? 0.40,
        defaultMonthlyCapacityHours:  (row.default_monthly_capacity_hours as number) ?? 160,
        fallbackHourlyCost:           (row.fallback_hourly_cost as number) ?? 50,
    }
}

// Laravel resource collections wrap in { data: [...] }
function unwrapList(axiosData: unknown): Record<string, unknown>[] {
    const d = axiosData as { data?: unknown[] } | unknown[]
    if (Array.isArray(d)) return d as Record<string, unknown>[]
    return ((d as { data?: unknown[] }).data ?? []) as Record<string, unknown>[]
}

// Laravel single resources wrap in { data: {...} }
function unwrapItem(axiosData: unknown): Record<string, unknown> {
    const d = axiosData as { data?: unknown }
    return (d.data !== undefined ? d.data : d) as Record<string, unknown>
}

// ── Bulk fetch (called by useOrganizationSync on page mount) ──────────────────

export async function fetchAllOrganizationData(): Promise<{
    departments:     Department[]
    roles:           Role[]
    employees:       Employee[]
    globalOverheads: GlobalOverhead[]
    companySettings: CompanySettings | null
    skills:          Skill[]
}> {
    const [dRes, rRes, eRes, oRes, sRes, skRes] = await Promise.all([
        api.get('/departments'),
        api.get('/roles'),
        api.get('/employees'),
        api.get('/global-overheads'),
        api.get('/company-settings').catch(() => null),
        api.get('/skills').catch(() => null),
    ])

    return {
        departments:     unwrapList(dRes.data).map(toDepartment),
        roles:           unwrapList(rRes.data).map(toRole),
        employees:       unwrapList(eRes.data).map(toEmployee),
        globalOverheads: unwrapList(oRes.data).map(toGlobalOverhead),
        companySettings: sRes ? toCompanySettings(unwrapItem(sRes.data)) : null,
        skills:          skRes ? unwrapList(skRes.data).map(toSkill) : [],
    }
}

// ── Departments ───────────────────────────────────────────────────────────────

export async function insertDepartment(d: Department): Promise<void> {
    await api.post('/departments', {
        id:         d.id,
        name:       d.name,
        manager_id: d.managerId ?? null,
    })
}

export async function updateDepartmentDB(d: Department): Promise<void> {
    await api.put(`/departments/${d.id}`, {
        name:       d.name,
        manager_id: d.managerId ?? null,
    })
}

export async function deleteDepartmentDB(id: string): Promise<void> {
    await api.delete(`/departments/${id}`)
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function insertRole(r: Role): Promise<void> {
    await api.post('/roles', {
        id:            r.id,
        title:         r.title,
        department:    r.department,
        department_id: r.departmentId ?? null,
        rate:          r.rate,
    })
}

export async function updateRoleDB(r: Role): Promise<void> {
    await api.put(`/roles/${r.id}`, {
        title:         r.title,
        department:    r.department,
        department_id: r.departmentId ?? null,
        rate:          r.rate,
    })
}

export async function deleteRoleDB(id: string): Promise<void> {
    await api.delete(`/roles/${id}`)
}

// ── Employees ─────────────────────────────────────────────────────────────────

export async function insertEmployee(
    e: Employee,
    credentials?: { email: string; password: string },
): Promise<void> {
    const skills = (e.skills ?? []).map(s => ({
        skill_id: s.skillId,
        proficiency: s.proficiency ?? 'intermediate',
    }))
    await api.post('/employees', {
        id:               e.id,
        name:             e.name,
        role:             e.role,
        role_name:        e.roleName ?? null,
        department_id:    e.departmentId ?? null,
        job_role_id:      e.jobRoleId ?? e.role ?? null,
        capacity_role:    e.capacityRole ?? null,
        capacity_role_id: e.capacityRoleId ?? null,
        rank_id:          e.rankId ?? null,
        // Spec ①.2 — basic + allowance instead of single monthly_salary.
        // Backend derives monthly_salary = basic + allowance.
        basic_salary:     e.basicSalary,
        allowance:        e.allowance,
        workable_hours:   e.workableHours,
        status:           e.status,
        skills,
        ...(credentials ? { email: credentials.email, password: credentials.password } : {}),
    })
}

export async function updateEmployeeDB(
    e: Employee,
    credentials?: { email?: string; password?: string },
): Promise<void> {
    const skills = (e.skills ?? []).map(s => ({
        skill_id: s.skillId,
        proficiency: s.proficiency ?? 'intermediate',
    }))
    const payload: Record<string, unknown> = {
        name:             e.name,
        role:             e.role,
        role_name:        e.roleName ?? null,
        department_id:    e.departmentId ?? null,
        job_role_id:      e.jobRoleId ?? e.role ?? null,
        capacity_role:    e.capacityRole ?? null,
        capacity_role_id: e.capacityRoleId ?? null,
        rank_id:          e.rankId ?? null,
        // Spec ①.2 — basic + allowance instead of single monthly_salary.
        basic_salary:     e.basicSalary,
        allowance:        e.allowance,
        workable_hours:   e.workableHours,
        status:           e.status,
        skills,
    };
    if (credentials?.email)    payload.email    = credentials.email;
    if (credentials?.password) payload.password = credentials.password;

    await api.put(`/employees/${e.id}`, payload);
}

export async function deleteEmployeeDB(id: string): Promise<void> {
    await api.delete(`/employees/${id}`)
}

// ── Global Overheads ──────────────────────────────────────────────────────────

export async function insertGlobalOverhead(o: GlobalOverhead): Promise<void> {
    await api.post('/global-overheads', {
        id:               o.id,
        category:         o.category,
        description:      o.description,
        monthly_cost:     o.monthlyCost,
        effective_month:  o.effectiveMonth ?? null,
        effective_year:   o.effectiveYear ?? null,
    })
}

export async function updateGlobalOverheadDB(o: GlobalOverhead): Promise<void> {
    await api.put(`/global-overheads/${o.id}`, {
        category:         o.category,
        description:      o.description,
        monthly_cost:     o.monthlyCost,
        effective_month:  o.effectiveMonth ?? null,
        effective_year:   o.effectiveYear ?? null,
    })
}

export async function deleteGlobalOverheadDB(id: string): Promise<void> {
    await api.delete(`/global-overheads/${id}`)
}

// ── Company Settings ──────────────────────────────────────────────────────────

export async function upsertCompanySettings(s: CompanySettings): Promise<void> {
    await api.put('/company-settings', {
        overhead_percentage:             s.overheadPercentage,
        buffer_percentage:               s.bufferPercentage,
        yearly_fixed_cost:               s.yearlyFixedCost,
        annual_initial_budget:           s.annualInitialBudget,
        employer_tax_percentage:         s.employerTaxPercentage,
        benefits_percentage:             s.benefitsPercentage,
        cost_to_bill_ratio:              s.costToBillRatio,
        default_monthly_capacity_hours:  s.defaultMonthlyCapacityHours,
        fallback_hourly_cost:            s.fallbackHourlyCost,
    })
}

// ── Capacity Roles ──────────────────────────────────────────────────────────

export function toCapacityRole(row: Record<string, unknown>): CapacityRole {
    return {
        id:   row.id as string,
        name: row.name as string,
        code: row.code as string,
    }
}

export async function fetchCapacityRoles(): Promise<CapacityRole[]> {
    const res = await api.get('/capacity-roles')
    return unwrapList(res.data).map(toCapacityRole)
}

export async function insertCapacityRole(r: CapacityRole): Promise<void> {
    await api.post('/capacity-roles', { name: r.name, code: r.code })
}

export async function updateCapacityRoleDB(r: CapacityRole): Promise<void> {
    await api.put(`/capacity-roles/${r.id}`, { name: r.name, code: r.code })
}

export async function deleteCapacityRoleDB(id: string): Promise<void> {
    await api.delete(`/capacity-roles/${id}`)
}

// ── Skills ──────────────────────────────────────────────────────────────────

export function toSkill(row: Record<string, unknown>): Skill {
    return {
        id:       row.id as string,
        name:     row.name as string,
        category: row.category as string,
    }
}

export async function fetchSkills(): Promise<Skill[]> {
    const res = await api.get('/skills')
    return unwrapList(res.data).map(toSkill)
}

export async function insertSkill(s: Skill): Promise<void> {
    await api.post('/skills', { name: s.name, category: s.category })
}

export async function updateSkillDB(s: Skill): Promise<void> {
    await api.put(`/skills/${s.id}`, { name: s.name, category: s.category })
}

export async function deleteSkillDB(id: string): Promise<void> {
    await api.delete(`/skills/${id}`)
}

// ── Employee Skills ─────────────────────────────────────────────────────────

export async function fetchEmployeeSkills(employeeId: string): Promise<{ skillId: string; name: string; category: string; proficiency: string }[]> {
    const res = await api.get(`/employees/${employeeId}/skills`)
    const data = (res.data as { data?: unknown[] }).data
    return (data ?? []) as { skillId: string; name: string; category: string; proficiency: string }[]
}

export async function assignSkillToEmployee(
    employeeId: string,
    skillId: string,
    proficiency: 'beginner' | 'intermediate' | 'expert',
): Promise<void> {
    await api.post(`/employees/${employeeId}/skills`, { skill_id: skillId, proficiency })
}

export async function removeSkillFromEmployee(employeeId: string, skillId: string): Promise<void> {
    await api.delete(`/employees/${employeeId}/skills/${skillId}`)
}
