# anka-frontend — Organization Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Organization Settings | `app/(dashboard)/organization/page.tsx` | Manage departments, roles, employees, salary structure, and global overheads |

---

## Organization Page (`/organization`)

**File:** `app/(dashboard)/organization/page.tsx`

Single page with 5 tabs. All data is loaded from `businessStore` (seeded on mount by `useOrganizationSync`). Write operations call `businessStore` methods which optimistically update Zustand state and then call the API.

### Data Sources

| Source | Purpose |
|---|---|
| `store.departments` | Departments tab |
| `store.roles` | Roles tab |
| `store.employees` | Employees tab |
| `store.globalOverheads` | Overhead tab |
| `store.companySettings` | Salary Structure tab |

`useOrganizationSync()` runs on mount and calls `fetchAllOrganizationData()` from `lib/queries/organization.ts`, seeding the store. Shows a loading skeleton while `syncing === true`. Shows an error message if `syncError` is set.

---

## Tab: Departments

**Columns:**
| Column | Notes |
|---|---|
| Name | department name |
| Manager | manager name (resolved from employees) |
| Headcount | employee count |
| Actions | Edit button + Delete button |

**Add/Edit Department Dialog:**
| Field | Required | Notes |
|---|---|---|
| Name | ✅ | text |
| Manager | No | select from `store.employees` |

**On submit (add):**
- Resolves manager name from store
- Calls `store.addDepartment()` → `POST /api/departments`
- Closes dialog

**On submit (edit):**
- Calls `store.updateDepartment(id, data)` → `PUT /api/departments/{id}`
- Clears `editingDepartment` state

**Delete:** `store.deleteDepartment(id)` → `DELETE /api/departments/{id}` (no confirmation dialog)

---

## Tab: Roles

**Columns:**
| Column | Notes |
|---|---|
| Title | role name |
| Department | department name |
| Rate ($/hr) | billable hourly rate |
| Actions | Edit + Delete |

**Add/Edit Role Dialog:**
| Field | Required | Notes |
|---|---|---|
| Title | ✅ | text |
| Department | ✅ | select from `store.departments` |
| Rate ($/hr) | ✅ | number |

**On submit:** resolves department name from store, calls `store.addRole()` / `store.updateRole()`.

**Delete:** `store.deleteRole(id)` → `DELETE /api/roles/{id}`

---

## Tab: Employees

**Columns:**
| Column | Notes |
|---|---|
| Name | employee name |
| Role | role name (resolved) |
| Department | department name (resolved) |
| Capacity Role | `frontend`, `backend`, `pm`, `qa`, `design` |
| Monthly Salary | formatted |
| Cost/hr | `monthly_salary / workable_hours` (DB-computed, displayed from store) |
| Status | `Active`, `On Leave`, `Terminated` |
| Actions | Edit + Delete |

**Add/Edit Employee Dialog:**
| Field | Required | Notes |
|---|---|---|
| Name | ✅ | text |
| Role | ✅ | select from `store.roles` |
| Department | No | select from `store.departments` |
| Capacity Role | No | select: frontend, backend, pm, qa, design, none |
| Monthly Salary | ✅ | number |
| Workable Hours | ✅ | number |
| Status | ✅ | select: Active, On Leave, Terminated |

`costPerHour` is computed client-side as `monthlySalary / workableHours` in the handler before passing to the store. This matches the server's generated column value.

**Delete:** `store.deleteEmployee(id)` → `DELETE /api/employees/{id}`

---

## Tab: Salary Structure

Not a table — a card with two numeric inputs.

| Field | Notes |
|---|---|
| Employer Taxes (%) | pre-filled from `store.companySettings.employerTaxPercentage` |
| Benefits/Insurance (%) | pre-filled from `store.companySettings.benefitsPercentage` |

Local state (`salaryMultiplier`) is initialized from `companySettings` and synced via `useEffect` when store updates. "Save Multipliers" button calls `store.updateCompanySettings()` → `PUT /api/company-settings`.

⚠️ This tab only exposes `employer_tax_percentage` and `benefits_percentage`. The other company settings fields (`overhead_percentage`, `buffer_percentage`, `yearly_fixed_cost`) have no UI — they can only be set directly via the API.

---

## Tab: Global Overhead

**Columns:**
| Column | Notes |
|---|---|
| Category | overhead category name |
| Description | text |
| Monthly Cost | formatted currency |
| Effective Month | optional |
| Effective Year | optional |
| Actions | Edit + Delete |

**Add/Edit Overhead Dialog:**
| Field | Required | Notes |
|---|---|---|
| Category | ✅ | text |
| Description | ✅ | text |
| Monthly Cost | ✅ | number |
| Effective Month | No | 1–12 |
| Effective Year | No | number |

**Delete:** `store.deleteGlobalOverhead(id)` → `DELETE /api/global-overheads/{id}`

---

## API Calls

| Action | Store Method | HTTP | Endpoint |
|---|---|---|---|
| Load all org data | `fetchAllOrganizationData()` | GET (multiple) | `/api/departments`, `/api/roles`, `/api/employees`, `/api/global-overheads`, `/api/company-settings` |
| Create department | `store.addDepartment()` | POST | `/api/departments` |
| Update department | `store.updateDepartment()` | PUT | `/api/departments/{id}` |
| Delete department | `store.deleteDepartment()` | DELETE | `/api/departments/{id}` |
| Create role | `store.addRole()` | POST | `/api/roles` |
| Update role | `store.updateRole()` | PUT | `/api/roles/{id}` |
| Delete role | `store.deleteRole()` | DELETE | `/api/roles/{id}` |
| Create employee | `store.addEmployee()` | POST | `/api/employees` |
| Update employee | `store.updateEmployee()` | PUT | `/api/employees/{id}` |
| Delete employee | `store.deleteEmployee()` | DELETE | `/api/employees/{id}` |
| Create overhead | `store.addGlobalOverhead()` | POST | `/api/global-overheads` |
| Update overhead | `store.updateGlobalOverhead()` | PUT | `/api/global-overheads/{id}` |
| Delete overhead | `store.deleteGlobalOverhead()` | DELETE | `/api/global-overheads/{id}` |
| Update settings | `store.updateCompanySettings()` | PUT | `/api/company-settings` |

---

## Schemas

Forms are validated via Zod schemas in `lib/schemas/organization.schema.ts`:
- `DepartmentFormValues`
- `RoleFormValues`
- `EmployeeFormValues`
- `OverheadFormValues`

---

## Known Gaps

- No confirmation dialog on any delete action (employees, roles, departments, overheads).
- `overhead_percentage`, `buffer_percentage`, and `yearly_fixed_cost` from `company_settings` have no UI — only tax/benefits percentages are editable.
- Deleting a department does not re-assign or warn about employees still in that department.
