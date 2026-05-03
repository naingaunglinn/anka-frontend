# Phase 6 — Projects & Time Tracking

**Effort:** ~2 days  
**Dependency:** Phase 4 (projects created by win deal), Phase 2 (employees must exist for time entries)  
**Why now:** The Delivery team needs real project health data and an accurate timesheet workflow to track actual hours burned against the budget. This also completes the P&L — direct labor cost comes from approved time entries.

---

## Business Context

Once a deal is won and a project is created, the Delivery team takes over:

1. **Project** — has a `budget_hours` (set from deal estimation) and tracks `consumed_hours`
2. **Time Entries** — engineers log hours daily against the project
3. **Approval Workflow** — time entries go `Draft → Pending → Approved` (or `Rejected`)
4. **Consumed Hours** — only Approved entries increment `projects.consumed_hours`
5. **Project Health** — compared to budget: `On Track / At Risk / Over Budget`

The Financial P&L direct labor cost is the sum of `approved_time_entries.hours × employee.cost_per_hour`.

---

## 6.1 — Laravel API: Projects

### List Projects

```
GET /api/projects
```

Returns all non-deleted projects for the tenant.

**Query params:**
- `?status=On+Track` — filter by health status
- `?client=Acme` — search by client name

**Response:**

```json
{
    "data": [
        {
            "id": "uuid",
            "project_number": "PRJ-101",
            "contract_id": "uuid",
            "name": "Cloud Migration",
            "client": "Acme Corp",
            "budget_hours": 300,
            "consumed_hours": 250,
            "status": "On Track",
            "start_date": "2024-03-01",
            "end_date": "2024-06-30",
            "created_at": "..."
        }
    ]
}
```

### Get Single Project

```
GET /api/projects/{id}
```

Includes time entries summary (total logged hours by status).

### Update Project

```
PUT /api/projects/{id}
```

Allowed updates: `name`, `status`, `start_date`, `end_date`.  
Do not allow direct updates to `consumed_hours` (controlled by time entry approvals only).

---

## 6.2 — Laravel API: Time Entries

### List Time Entries

```
GET /api/time-entries
```

**Query params:**
- `?project_id=uuid` — filter by project
- `?employee_id=uuid` — filter by employee (own timesheets)
- `?status=Pending` — filter by approval status
- `?from=2024-03-01&to=2024-03-31` — filter by date range

Used by:
- Delivery team: own time entries by `employee_id`
- Project manager: all entries for a project
- Finance: approved entries for P&L labor cost

### Get Time Entries for Project

```
GET /api/projects/{projectId}/time-entries
```

### Create Time Entry (Log Hours)

```
POST /api/time-entries
```

```json
{
    "project_id": "uuid",
    "employee_id": "uuid",
    "task": "Database Schema Design",
    "date": "2026-05-02",
    "hours": 6.5,
    "billable": true,
    "notes": "Completed core tables, started indexes."
}
```

`hours` must be `> 0` (enforced by DB CHECK constraint).  
`status` defaults to `'Draft'` — not yet submitted.

### Update Time Entry

```
PUT /api/time-entries/{id}
```

Only allowed while `status = 'Draft'`. Once submitted, the employee cannot edit without re-draft.

### Submit for Approval

```
PATCH /api/time-entries/{id}/submit
```

Transitions `status: Draft → Pending`. No body required.

**Response 409:** Entry is not in `Draft` status.

### Approve Time Entry

```
PATCH /api/time-entries/{id}/approve
```

**Laravel controller — critical: increment `consumed_hours` exactly once:**

```php
DB::transaction(function () use ($entry, $approverId) {
    // Guard: only approve Pending entries
    if ($entry->status !== 'Pending') {
        abort(409, 'Only Pending entries can be approved.');
    }
    
    $entry->update([
        'status'      => 'Approved',
        'approved_by' => $approverId,
        'approved_at' => now(),
    ]);
    
    // Increment consumed_hours on the project
    // This is the ONLY place consumed_hours is incremented
    $entry->project->increment('consumed_hours', $entry->hours);
    
    // Auto-update project health status
    $project = $entry->project->fresh();
    $burnRate = $project->budget_hours > 0
        ? $project->consumed_hours / $project->budget_hours
        : 0;
    
    $healthStatus = match(true) {
        $burnRate >= 1.0 => 'Over Budget',
        $burnRate >= 0.8 => 'At Risk',
        $project->consumed_hours > 0 => 'On Track',
        default => 'Not Started',
    };
    
    $project->update(['status' => $healthStatus]);
});
```

**Response 200:** Updated time entry with `approved_at` and `approved_by`.

> **Warning:** Never add a DB trigger for `consumed_hours`. If an entry's status is changed back from Approved to Pending (e.g. dispute), the trigger would double-decrement. Application code with explicit guards is safer.

### Reject Time Entry

```
PATCH /api/time-entries/{id}/reject
```

Transitions `Pending → Rejected`. The employee can fix and re-submit.

```json
{ "reason": "Date appears incorrect — please recheck." }
```

### Delete Time Entry

```
DELETE /api/time-entries/{id}
```

Only allowed for `Draft` entries. Approved entries must not be deleted (financial audit trail).

---

## 6.3 — Frontend: Load Projects on Projects Page

**File:** `app/(dashboard)/projects/page.tsx`

```ts
useEffect(() => {
    api.get('/projects').then(({ data }) => {
        useBusinessStore.setState({ projects: data.data.map(toProject) });
    });
}, []);
```

---

## 6.4 — Frontend: Load and Submit Time Entries

**File:** `app/(dashboard)/time-tracking/page.tsx`

```ts
useEffect(() => {
    api.get('/time-entries').then(({ data }) => {
        useBusinessStore.setState({ timeEntries: data.data.map(toTimeEntry) });
    });
}, []);
```

Wire the `addTimeEntry` action to call the API:

```ts
addTimeEntry: async (entry) => {
    const snapshot = get().timeEntries;
    const tempId = `temp-${Date.now()}`;
    set(s => ({ timeEntries: [...s.timeEntries, { ...entry, id: tempId }] }));
    try {
        const { data } = await api.post('/time-entries', {
            project_id: entry.projectId,
            employee_id: entry.employeeId,
            task: entry.task,
            date: entry.date,
            hours: entry.hours,
            billable: entry.billable,
        });
        set(s => ({
            timeEntries: s.timeEntries.map(t => t.id === tempId ? toTimeEntry(data) : t)
        }));
    } catch (err) {
        set({ timeEntries: snapshot });
        toast.error(`Failed to log time: ${(err as any).message}`);
    }
},
```

Add actions for submit and approve flows:

```ts
submitTimeEntry: async (id) => {
    // Optimistic status change
    set(s => ({ timeEntries: s.timeEntries.map(t => t.id === id ? { ...t, status: 'Pending' as const } : t) }));
    try {
        await api.patch(`/time-entries/${id}/submit`);
    } catch (err) {
        // Rollback
        toast.error('Failed to submit time entry.');
    }
},

approveTimeEntry: async (id) => {
    const project = get().projects.find(p => {
        const entry = get().timeEntries.find(t => t.id === id);
        return entry && p.id === entry.projectId;
    });
    set(s => ({ timeEntries: s.timeEntries.map(t => t.id === id ? { ...t, status: 'Approved' as const } : t) }));
    try {
        const { data } = await api.patch(`/time-entries/${id}/approve`);
        // Refresh project consumed_hours from server response
        if (data.project) {
            set(s => ({ projects: s.projects.map(p => p.id === data.project.id ? toProject(data.project) : p) }));
        }
    } catch (err) {
        toast.error('Failed to approve time entry.');
    }
},
```

---

## 6.5 — Remove the `addTimeEntry` Auto-Increment of `consumed_hours`

**File:** `store/businessStore.ts` lines 404–413

Currently `addTimeEntry` immediately increments `project.consumedHours`:

```ts
// REMOVE THIS BLOCK:
const updatedProjects = state.projects.map(p => {
    if (p.id === entry.projectId) {
        return { ...p, consumedHours: p.consumedHours + entry.hours, status: 'On Track' as any };
    }
    return p;
});
```

This is wrong — only **Approved** entries should count. Move consumed hours update to `approveTimeEntry` (which gets the real number from the server).

---

## 6.6 — Time Entry Mapper

```ts
export function toTimeEntry(row: any): TimeEntry {
    return {
        id: row.id,
        projectId: row.project_id,
        employeeId: row.employee_id,
        task: row.task,
        date: row.date,
        hours: row.hours,
        billable: row.billable,
        status: row.status,
        approvedAt: row.approved_at ?? undefined,
        approvedBy: row.approved_by ?? undefined,
        notes: row.notes ?? undefined,
    };
}
```

Add `approvedAt?: string` and `approvedBy?: number` to the `TimeEntry` type in `types/business.ts`.

---

## 6.7 — Project Health Auto-Update

The Laravel `approve` endpoint auto-updates `project.status` based on burn rate. The frontend should accept this updated status from the API response and store it.

If the `approveTimeEntry` response includes the updated project:

```ts
// Response from PATCH /time-entries/{id}/approve:
{
    "time_entry": { ...approvedEntry },
    "project": { ...updatedProjectWithNewConsumedHours }
}
```

---

## 6.8 — P&L Direct Labor Calculation

**File:** `store/businessStore.ts` line 538–545

The P&L labor cost currently uses all time entries. After this phase:

```ts
state.timeEntries
    .filter(entry => entry.status === 'Approved')   // ADD: only approved entries
    .forEach(entry => {
        const month = new Date(entry.date).toLocaleString('default', { month: 'short' });
        const emp = state.employees.find(e => e.id === entry.employeeId);
        const hourlyCost = emp ? emp.costPerHour : 0;
        monthlyData[month].directLabor += (entry.hours * hourlyCost);
    });
```

---

## 6.9 — Remove Mock Project and Time Entry Data

**File:** `store/businessStore.ts` lines 126–133

```ts
projects: [],
timeEntries: [],
```

---

## Field Mapping Reference

| Frontend | API / SQL |
|---|---|
| `projectNumber` | `project_number` |
| `contractId` | `contract_id` |
| `budgetHours` | `budget_hours` |
| `consumedHours` | `consumed_hours` |
| `startDate` | `start_date` |
| `endDate` | `end_date` |
| `projectId` | `project_id` |
| `employeeId` | `employee_id` |
| `approvedAt` | `approved_at` |
| `approvedBy` | `approved_by` |

---

## Acceptance Criteria

- [ ] Projects page loads real projects from `GET /api/projects`
- [ ] Consumed hours on project update only after an entry is Approved (not on log)
- [ ] Time tracking page shows real entries filtered by employee or project
- [ ] Logging a new time entry creates a `Draft` entry in DB
- [ ] Submitting an entry changes status to `Pending`
- [ ] Approving an entry increments `projects.consumed_hours` exactly once
- [ ] Approving the same entry twice returns 409 (idempotency guard)
- [ ] P&L direct labor cost only counts Approved time entries
- [ ] Project status auto-updates to `At Risk` when burn > 80%, `Over Budget` when > 100%
- [ ] Time entries cannot be deleted once Approved
- [ ] All project/time entry data is scoped to the active tenant
