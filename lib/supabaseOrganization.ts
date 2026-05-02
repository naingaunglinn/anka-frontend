import { supabase } from './supabase'
import type {
    Department,
    Role,
    Employee,
    GlobalOverhead,
    CompanySettings,
} from '@/types/business'

// ─────────────────────────────────────────────────────────────
// ROW MAPPERS  (Supabase snake_case → TypeScript camelCase)
// ─────────────────────────────────────────────────────────────

function toDepartment(row: Record<string, unknown>): Department {
    return {
        id: row.id as string,
        name: row.name as string,
        manager: row.manager as string,
        headcount: row.headcount as number,
    }
}

function toRole(row: Record<string, unknown>): Role {
    return {
        id: row.id as string,
        title: row.title as string,
        department: row.department as string,
        rate: row.rate as number,
    }
}

function toEmployee(row: Record<string, unknown>): Employee {
    return {
        id: row.id as string,
        name: row.name as string,
        role: row.role as string,
        roleName: row.role_name as string | undefined,
        capacityRole: row.capacity_role as Employee['capacityRole'],
        monthlySalary: row.monthly_salary as number,
        workableHours: row.workable_hours as number,
        costPerHour: row.cost_per_hour as number,
        status: row.status as Employee['status'],
    }
}

function toGlobalOverhead(row: Record<string, unknown>): GlobalOverhead {
    return {
        id: row.id as string,
        category: row.category as string,
        description: row.description as string,
        monthlyCost: row.monthly_cost as number,
    }
}

function toCompanySettings(row: Record<string, unknown>): CompanySettings {
    return {
        overheadPercentage: row.overhead_percentage as number,
        bufferPercentage: row.buffer_percentage as number,
        yearlyFixedCost: row.yearly_fixed_cost as number,
        employerTaxPercentage: (row.employer_tax_percentage as number) ?? 0,
        benefitsPercentage: (row.benefits_percentage as number) ?? 0,
    }
}

// ─────────────────────────────────────────────────────────────
// FETCH ALL  (called on page mount to seed Zustand)
// ─────────────────────────────────────────────────────────────

export async function fetchAllOrganizationData(): Promise<{
    departments: Department[]
    roles: Role[]
    employees: Employee[]
    globalOverheads: GlobalOverhead[]
    companySettings: CompanySettings | null
}> {
    const [
        { data: departments, error: dErr },
        { data: roles, error: rErr },
        { data: employees, error: eErr },
        { data: overheads, error: oErr },
        { data: settings },
    ] = await Promise.all([
        supabase.from('departments').select('*').order('created_at'),
        supabase.from('roles').select('*').order('created_at'),
        supabase.from('employees').select('*').order('created_at'),
        supabase.from('global_overheads').select('*').order('created_at'),
        supabase.from('company_settings').select('*').eq('id', 'singleton').single(),
    ])

    if (dErr) throw new Error(`departments: ${dErr.message}`)
    if (rErr) throw new Error(`roles: ${rErr.message}`)
    if (eErr) throw new Error(`employees: ${eErr.message}`)
    if (oErr) throw new Error(`global_overheads: ${oErr.message}`)
    // settings error is non-fatal — row may not exist yet

    return {
        departments: (departments ?? []).map(toDepartment),
        roles: (roles ?? []).map(toRole),
        employees: (employees ?? []).map(toEmployee),
        globalOverheads: (overheads ?? []).map(toGlobalOverhead),
        companySettings: settings ? toCompanySettings(settings as Record<string, unknown>) : null,
    }
}

// ─────────────────────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────────────────────

export async function insertDepartment(d: Department): Promise<void> {
    const { error } = await supabase.from('departments').insert({
        id: d.id, name: d.name, manager: d.manager, headcount: d.headcount,
    })
    if (error) throw new Error(error.message)
}

export async function updateDepartmentDB(d: Department): Promise<void> {
    const { error } = await supabase
        .from('departments')
        .update({ name: d.name, manager: d.manager, headcount: d.headcount })
        .eq('id', d.id)
    if (error) throw new Error(error.message)
}

export async function deleteDepartmentDB(id: string): Promise<void> {
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────
// ROLES
// ─────────────────────────────────────────────────────────────

export async function insertRole(r: Role): Promise<void> {
    const { error } = await supabase.from('roles').insert({
        id: r.id, title: r.title, department: r.department, rate: r.rate,
    })
    if (error) throw new Error(error.message)
}

export async function updateRoleDB(r: Role): Promise<void> {
    const { error } = await supabase
        .from('roles')
        .update({ title: r.title, department: r.department, rate: r.rate })
        .eq('id', r.id)
    if (error) throw new Error(error.message)
}

export async function deleteRoleDB(id: string): Promise<void> {
    const { error } = await supabase.from('roles').delete().eq('id', id)
    if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────────────────────

export async function insertEmployee(e: Employee): Promise<void> {
    const { error } = await supabase.from('employees').insert({
        id: e.id,
        name: e.name,
        role: e.role,
        monthly_salary: e.monthlySalary,
        workable_hours: e.workableHours,
        cost_per_hour: e.costPerHour,
        status: e.status,
    })
    if (error) throw new Error(error.message)
}

export async function updateEmployeeDB(e: Employee): Promise<void> {
    const { error } = await supabase
        .from('employees')
        .update({
            name: e.name,
            role: e.role,
            monthly_salary: e.monthlySalary,
            workable_hours: e.workableHours,
            cost_per_hour: e.costPerHour,
            status: e.status,
        })
        .eq('id', e.id)
    if (error) throw new Error(error.message)
}

export async function deleteEmployeeDB(id: string): Promise<void> {
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────
// GLOBAL OVERHEADS
// ─────────────────────────────────────────────────────────────

export async function insertGlobalOverhead(o: GlobalOverhead): Promise<void> {
    const { error } = await supabase.from('global_overheads').insert({
        id: o.id, category: o.category, description: o.description, monthly_cost: o.monthlyCost,
    })
    if (error) throw new Error(error.message)
}

export async function updateGlobalOverheadDB(o: GlobalOverhead): Promise<void> {
    const { error } = await supabase
        .from('global_overheads')
        .update({ category: o.category, description: o.description, monthly_cost: o.monthlyCost })
        .eq('id', o.id)
    if (error) throw new Error(error.message)
}

export async function deleteGlobalOverheadDB(id: string): Promise<void> {
    const { error } = await supabase.from('global_overheads').delete().eq('id', id)
    if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────
// COMPANY SETTINGS  (singleton row — always upsert)
// ─────────────────────────────────────────────────────────────

export async function upsertCompanySettings(s: CompanySettings): Promise<void> {
    const { error } = await supabase.from('company_settings').upsert({
        id: 'singleton',
        overhead_percentage: s.overheadPercentage,
        buffer_percentage: s.bufferPercentage,
        yearly_fixed_cost: s.yearlyFixedCost,
    })
    if (error) throw new Error(error.message)
}
