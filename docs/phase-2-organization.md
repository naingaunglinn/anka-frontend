# Phase 2 — Organization Module

**Effort:** ~1 day  
**Dependency:** Phase 0 complete, Phase 1 in progress (tenant ID must be available)  
**Why now:** Organization data (employees, roles, departments) is master data referenced by every other module — deals need roles for estimation, time entries need employees, capacity pool needs employee `capacityRole`. It must be stable before CRM is wired.

---

## Business Context

The Organization module is the HR and staffing foundation of ANKA. An agency manager uses it to:
- Define the department structure (Engineering, Design, etc.)
- Set billable rates per role (Senior Developer $150/hr)
- Track employees with their salary, capacity, and employment status
- Configure company-wide financial settings (overhead %, buffer %, payroll tax)

This module already has Supabase direct calls in `lib/supabaseOrganization.ts`. The gaps from Phase 0 are now fixed. This phase completes the wiring and verifies end-to-end behavior.

---

## 2.1 — Verify Supabase Tables Exist and Match Schema

Before running the frontend against Supabase, confirm these tables exist in your Supabase project with the exact column names from `ANKA.sql`:

| Table | Key columns to verify |
|---|---|
| `departments` | `id uuid`, `tenant_id uuid`, `name`, `manager`, `headcount`, `deleted_at` |
| `roles` | `id uuid`, `tenant_id uuid`, `department_id uuid`, `title`, `department` (text), `rate` |
| `employees` | `id uuid`, `tenant_id uuid`, `job_role_id uuid`, `name`, `role` (text), `role_name`, `capacity_role`, `monthly_salary`, `workable_hours`, `cost_per_hour` (GENERATED), `status`, `deleted_at` |
| `global_overheads` | `id uuid`, `tenant_id uuid`, `category`, `description`, `monthly_cost`, `deleted_at` |
| `company_settings` | `id text`, `tenant_id uuid UNIQUE`, `overhead_percentage`, `buffer_percentage`, `yearly_fixed_cost`, `employer_tax_percentage`, `benefits_percentage` |

Run `ANKA.sql` against your Supabase project if these tables don't exist yet.

---

## 2.2 — Load Organization Data on App Startup

**File:** `components/providers/AuthInitializer.tsx` (or a dedicated `OrgInitializer.tsx`)

After auth resolves and `activeTenantId` is set, fetch all organization data and populate the Zustand store:

```ts
import { fetchAllOrganizationData } from '@/lib/supabaseOrganization';
import { useBusinessStore } from '@/store/businessStore';

// After auth succeeds:
const orgData = await fetchAllOrganizationData();

useBusinessStore.setState({
    departments: orgData.departments,
    roles: orgData.roles,
    employees: orgData.employees,
    globalOverheads: orgData.globalOverheads,
    ...(orgData.companySettings && { companySettings: orgData.companySettings }),
});
```

This replaces the `MOCK_DEPARTMENTS`, `MOCK_ROLES`, `MOCK_EMPLOYEES`, `MOCK_OVERHEADS`, and `MOCK_SETTINGS` constants in `store/businessStore.ts` as the initial state.

---

## 2.3 — Add `capacityRole` and `roleName` to Insert/Update

**File:** `lib/supabaseOrganization.ts`

After Phase 0 adds `capacityRole` and `roleName` to the `Employee` type, update the Supabase functions:

```ts
export async function insertEmployee(e: Employee): Promise<void> {
    const tenantId = useTenantStore.getState().activeTenantId;
    const { error } = await supabase.from('employees').insert({
        id: e.id,
        tenant_id: tenantId,
        name: e.name,
        role: e.role,
        role_name: e.roleName ?? null,
        capacity_role: e.capacityRole ?? null,
        monthly_salary: e.monthlySalary,
        workable_hours: e.workableHours,
        // cost_per_hour: OMIT — GENERATED column
        status: e.status,
    })
    if (error) throw new Error(error.message)
}
```

Apply the same additions to `updateEmployeeDB`.

---

## 2.4 — Add `department_id` Handling to Role Insert/Update

**File:** `lib/supabaseOrganization.ts`

The `roles` table has `department_id uuid` (FK) alongside the denormalized `department text`. The frontend `Role.department` is the department name string. When inserting a role, look up the department ID from the loaded departments.

```ts
export async function insertRole(r: Role): Promise<void> {
    const tenantId = useTenantStore.getState().activeTenantId;
    const departments = useBusinessStore.getState().departments;
    const dept = departments.find(d => d.name === r.department);

    const { error } = await supabase.from('roles').insert({
        id: r.id,
        tenant_id: tenantId,
        department_id: dept?.id ?? null,
        title: r.title,
        department: r.department,
        rate: r.rate,
    })
    if (error) throw new Error(error.message)
}
```

---

## 2.5 — `company_settings` Upsert with Tenant ID

**File:** `lib/supabaseOrganization.ts`

After Phase 0 fixes the upsert to include `employer_tax_percentage` and `benefits_percentage`, also update the `id` field strategy:

For the current single-tenant prototype, `id: 'singleton'` is fine.

For multi-tenant readiness, change to:

```ts
export async function upsertCompanySettings(s: CompanySettings): Promise<void> {
    const tenantId = useTenantStore.getState().activeTenantId;
    const { error } = await supabase.from('company_settings').upsert({
        id: tenantId ?? 'singleton',   // use tenant ID if available
        tenant_id: tenantId,
        overhead_percentage: s.overheadPercentage,
        buffer_percentage: s.bufferPercentage,
        yearly_fixed_cost: s.yearlyFixedCost,
        employer_tax_percentage: s.employerTaxPercentage,
        benefits_percentage: s.benefitsPercentage,
    }, { onConflict: 'tenant_id' })
    if (error) throw new Error(error.message)
}
```

---

## 2.6 — Soft Delete Handling

**File:** `lib/supabaseOrganization.ts`

Currently `deleteDepartmentDB`, `deleteRoleDB`, `deleteEmployeeDB` use hard `.delete()`. The SQL schema uses soft deletes (`deleted_at`). Switching to soft delete prevents accidentally breaking historical references.

```ts
export async function deleteDepartmentDB(id: string): Promise<void> {
    const { error } = await supabase
        .from('departments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
    if (error) throw new Error(error.message)
}
```

Apply to: `deleteDepartmentDB`, `deleteRoleDB`, `deleteEmployeeDB`, `deleteGlobalOverheadDB`.

Also add `.is('deleted_at', null)` to all select queries in `fetchAllOrganizationData()`:

```ts
supabase.from('departments').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at')
```

---

## 2.7 — `headcount` Sync

The `departments.headcount` column is maintained by application code when employees are added or removed. The frontend currently shows `headcount` from the `Department` object.

When adding or removing an employee, also update the department headcount:

```ts
// In businessStore addEmployee — after successful DB insert:
const dept = get().departments.find(d => d.name === emp.role /* or dept field */);
if (dept) {
    await updateDepartmentDB({ ...dept, headcount: dept.headcount + 1 });
}
```

For now this is a nice-to-have. The department headcount can also be computed on-the-fly from `employees.filter(e => e.departmentId === dept.id && e.status === 'Active').length` to avoid sync issues.

---

## 2.8 — `EmployeeForm` and `RoleForm` Updates

**Files:** `components/forms/EmployeeForm.tsx`, `components/forms/RoleForm.tsx`

After Phase 0 adds `capacityRole` to `Employee`, the EmployeeForm needs a dropdown for it:

```
Capacity Role: [ frontend | backend | pm | qa | design | (none) ]
```

This feeds the capacity pool dashboard and the AI team builder. Without it, new employees won't appear in any capacity pool bucket.

---

## 2.9 — Remove Mock Organization Data from Store

**File:** `store/businessStore.ts` lines 40–68

Once `fetchAllOrganizationData()` is called on startup and populates the store, the mock constants `MOCK_DEPARTMENTS`, `MOCK_ROLES`, `MOCK_EMPLOYEES`, `MOCK_OVERHEADS`, `MOCK_SETTINGS` should be removed from the initial state.

Replace initial state values with empty arrays / null defaults:

```ts
departments: [],
roles: [],
employees: [],
engineers: [],      // populated from employees with capacityRole set
globalOverheads: [],
companySettings: {
    overheadPercentage: 20,
    bufferPercentage: 10,
    yearlyFixedCost: 0,
    employerTaxPercentage: 8,
    benefitsPercentage: 12,
},
```

Add a loading state to show a skeleton until org data is fetched.

---

## 2.10 — Supabase RLS Policies

Once the frontend is tenant-aware (Phase 0.8–0.9 complete), enable Row Level Security on the org tables in Supabase:

```sql
-- Enable RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_overheads ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Example policy: users can only see their own tenant's data
-- (Replace 'auth.uid()' with your Supabase auth mapping to tenant_id)
CREATE POLICY "tenant_isolation" ON departments
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

The exact RLS policy depends on how you map Supabase Auth to tenant IDs. For the current setup where Laravel handles auth and Supabase is a DB-only client, use the Supabase service key on the server side and anon key only for reads with RLS.

---

## API Endpoints (Organization via Laravel — Optional)

If you choose to route all org data through Laravel instead of Supabase direct, these are the endpoints:

```
GET    /api/departments
POST   /api/departments
PUT    /api/departments/{id}
DELETE /api/departments/{id}     → soft delete

GET    /api/roles
POST   /api/roles
PUT    /api/roles/{id}
DELETE /api/roles/{id}           → soft delete

GET    /api/employees
POST   /api/employees
PUT    /api/employees/{id}
DELETE /api/employees/{id}       → soft delete (set deleted_at, status='Terminated')

GET    /api/overheads
POST   /api/overheads
PUT    /api/overheads/{id}
DELETE /api/overheads/{id}       → soft delete

GET    /api/settings             → returns singleton company_settings for tenant
PUT    /api/settings             → upsert
```

---

## Acceptance Criteria

- [ ] Refreshing the Organization page loads real data from Supabase (not mock data)
- [ ] Adding a department persists to DB and survives page refresh
- [ ] Adding a role with a department correctly sets both `department` text and `department_id` FK
- [ ] Adding an employee with `capacityRole = 'backend'` appears in the capacity pool dashboard
- [ ] Deleting an employee sets `deleted_at` (soft delete) — not removed from DB
- [ ] Company settings save with all 5 fields including `employerTaxPercentage` and `benefitsPercentage`
- [ ] No employee data from other tenants is visible
- [ ] `cost_per_hour` is computed correctly by DB and returned in employee rows
