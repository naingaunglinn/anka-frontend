# anka-frontend — Time Tracking Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Time Tracking | `app/(dashboard)/time-tracking/page.tsx` | Log hours, view all entries, approve or delete |

---

## Time Tracking Page (`/time-tracking`)

**File:** `app/(dashboard)/time-tracking/page.tsx`

### Data Fetched

| Hook | Endpoint | Purpose |
|---|---|---|
| `useProjectList()` | GET `/api/projects` | Project select dropdown in Log Time dialog |
| `useTimeEntryList()` | GET `/api/time-entries` | All time entries |
| `businessStore.employees` | Zustand | Employee select dropdown (seeded by `useOrganizationSync`) |

---

### Time Entry Table

**Columns:**
| Column | Notes |
|---|---|
| Employee | resolved from `store.employees` by `employeeId` |
| Project | resolved from projects list by `projectId` |
| Task | `timeEntry.task` description |
| Date | `timeEntry.date` |
| Hours | decimal hours |
| Billable | Yes / No |
| Status | badge (see colours below) |
| Actions | Approve button + Delete (trash icon) |

**Status badge colours:**
| Status | Colour |
|---|---|
| Draft | slate |
| Pending | amber |
| Approved | emerald |
| Rejected | red |

---

### Actions

| Action | When Visible | API Call |
|---|---|---|
| Log Time | Always (header button) | Opens Log Time dialog |
| Approve | Status ≠ `Approved` | `approveTimeEntry.mutate()` → PATCH `/api/time-entries/{id}/approve` |
| Delete | Always | Confirmation dialog → `deleteTimeEntry.mutate()` → DELETE `/api/time-entries/{id}` |

---

### Log Time Dialog

Triggered by "Log Time" button. Fields:

| Field | Required | Notes |
|---|---|---|
| Team Member | ✅ | select from `businessStore.employees` |
| Project | ✅ | select from projects list |
| Task Description | ✅ | text |
| Date | ✅ | date picker; defaults to today |
| Hours Logged | ✅ | number > 0 |
| Billable | No | switch/checkbox; defaults to `true` |

**Submit:** `createTimeEntry.mutate()` → POST `/api/time-entries`

---

## API Calls

| Action | Hook | HTTP | Endpoint |
|---|---|---|---|
| Load entries | `useTimeEntryList()` | GET | `/api/time-entries` |
| Create entry | `createTimeEntry.mutate()` | POST | `/api/time-entries` |
| Approve entry | `approveTimeEntry.mutate()` | PATCH | `/api/time-entries/{id}/approve` |
| Delete entry | `deleteTimeEntry.mutate()` | DELETE | `/api/time-entries/{id}` |

---

## Backend Approval Logic

`PATCH /api/time-entries/{id}/approve` runs inside a DB transaction with `lockForUpdate()` (pessimistic locking):
1. Sets `time_entries.status = 'Approved'`, records `approved_by` and `approved_at`.
2. Atomically increments `projects.consumed_hours` by the entry's hours.

This ensures `consumed_hours` is never double-counted under concurrent approval requests.

---

## Impact on P&L

Approved time entries drive the **Direct Labor** line in `store.getFinancialPnL()`:

```
directLabor for month = sum of (timeEntry.hours × employee.costPerHour)
                        for approved entries in that month
```

Only `Approved` entries are included in P&L. Draft, Pending, and Rejected entries have no financial impact.

---

## Known Gaps

- No "Reject" dedicated action for time entries in the UI — rejection requires a manual PATCH to `status`.
- `approved_by` field is stored in the DB but not displayed in the table.
- No filtering or search on the time entry table.
- No bulk approve action.
- Status transitions are one-way in the UI — once Approved, there is no "Un-approve" button.
