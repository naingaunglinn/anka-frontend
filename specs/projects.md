# anka-frontend — Projects Module Spec

## Pages

| Page | File | Purpose |
|---|---|---|
| Project Delivery | `app/(dashboard)/projects/page.tsx` | Project list with status + burn rate |
| Time Tracking | `app/(dashboard)/time-tracking/page.tsx` | Log and approve hours |

⚠️ There is no Project detail page. All project management is inline on the list page.

---

## Projects Page (`/projects`)

**File:** `app/(dashboard)/projects/page.tsx`

### Data fetched
| Hook | Endpoint | Purpose |
|---|---|---|
| `useProjectList()` | GET `/api/projects` | All tenant projects |
| `useContractList()` | GET `/api/contracts` | Resolve contract number per project |
| `useDealList()` | GET `/api/deals` | Resolve source deal per project (via contract.dealId) |

### Summary KPI cards
| Card | Calculation |
|---|---|
| Active Projects | total project count |
| Total Budgeted Hours | sum of budgetHours |
| Total Consumed Hours | sum of consumedHours |

### Project Table

**Columns:**
| Column | Notes |
|---|---|
| Project | name (bold) + projectNumber or ID (small text) |
| Client | project.client |
| Contract | contractNumber; clickable → `/contracts` |
| Source Deal | deal.name; clickable → `/crm/:dealId` |
| Status | badge with colour coding |
| Budget Hours | right-aligned |
| Consumed | right-aligned |
| Burn Rate | progress bar + % |
| Actions | dropdown menu |

**Status badge colours:**
| Status | Colour |
|---|---|
| Completed | emerald |
| On Track | blue |
| At Risk | amber |
| Over Budget | rose |
| Not Started | slate |

**Burn rate progress bar colours:**
| Percentage | Colour |
|---|---|
| < 70% | blue |
| 70–85% | amber |
| > 85% | rose |

**Row actions (dropdown):**
- View Source Deal → `/crm/:dealId` (only if deal found)
- View Contract → `/contracts` (only if contract found)
- Mark as [status] → `updateProject.mutate()` for all statuses except current

---

## Time Tracking Page (`/time-tracking`)

**File:** `app/(dashboard)/time-tracking/page.tsx`

### Data fetched
| Hook | Endpoint | Purpose |
|---|---|---|
| `useProjectList()` | GET `/api/projects` | Project select dropdown |
| `useTimeEntryList()` | GET `/api/time-entries` | All time entries |
| `businessStore.employees` | Zustand | Employee select dropdown |

### Time Entry Table columns
| Column | Notes |
|---|---|
| Employee | resolved from store |
| Project | resolved from projects list |
| Task | time entry task description |
| Date | entry date |
| Hours | decimal hours |
| Billable | yes/no |
| Status | badge: Draft/Pending/Approved/Rejected |
| Actions | approve button + trash |

**Status badge colours:**
| Status | Colour |
|---|---|
| Draft | slate |
| Pending | amber |
| Approved | emerald |
| Rejected | red |

### Log Time Dialog (triggered by "Log Time" button)

**Fields:**
| Field | Required | Notes |
|---|---|---|
| Team Member | ✅ | select from businessStore.employees |
| Project | ✅ | select from projects list |
| Task Description | ✅ | text |
| Date | ✅ | defaults to today |
| Hours Logged | ✅ | number > 0 |
| Billable | No | switch/checkbox, default true |

### Actions
| Action | When Visible | API Call |
|---|---|---|
| Log Time | Always | `createTimeEntry.mutate()` → POST `/api/time-entries` |
| Approve | Status ≠ Approved | `approveTimeEntry.mutate()` → PATCH `/api/time-entries/{id}/approve` |
| Delete | Always | confirmation → `deleteTimeEntry.mutate()` → DELETE `/api/time-entries/{id}` |

---

## API Calls

### Projects module
| Action | Hook | HTTP | Endpoint |
|---|---|---|---|
| Load projects | `useProjectList()` | GET | `/api/projects` |
| Update status | `updateProject.mutate()` | PATCH | `/api/projects/{id}` |
| Delete project | `deleteProject.mutate()` | DELETE | `/api/projects/{id}` |

### Time Tracking module
| Action | Hook | HTTP | Endpoint |
|---|---|---|---|
| Load entries | `useTimeEntryList()` | GET | `/api/time-entries` |
| Create entry | `createTimeEntry.mutate()` | POST | `/api/time-entries` |
| Approve entry | `approveTimeEntry.mutate()` | PATCH | `/api/time-entries/{id}/approve` |
| Delete entry | `deleteTimeEntry.mutate()` | DELETE | `/api/time-entries/{id}` |

---

## Pre-fill from Contract

| Data | Status | Notes |
|---|---|---|
| Project name | ✅ EXISTS | Carried from Deal name by win_deal() SP |
| Client name | ✅ EXISTS | Carried from Deal/Contract by win_deal() SP |
| Budget hours | ⚠️ PARTIAL | Default 0; must be set manually via PATCH |
| Start / end dates | ⚠️ PARTIAL | Default null; must be set manually |
| Contract link | ✅ EXISTS | contractId FK, shown in table with link |
| Source deal link | ✅ EXISTS | Chained via contract.dealId |

---

## Team Assignment UI

| Feature | Status | Notes |
|---|---|---|
| Team members on Project | ⚠️ NOT IMPLEMENTED | No direct team assignment on Project model |
| Who works on project | Tracked via TimeEntry | employee_id on each time entry |
| Hard assignments from Deal | ✅ AT DEAL LEVEL | deal_hard_assignments — not carried to project |

---

## Known Gaps

- No Project detail page — only list view with inline status dropdown.
- No "Reject" dedicated action for time entries — rejection would require a PATCH to status.
- `approved_by` field is not displayed in the UI (stored in DB, not shown in table).
- No project start trigger — `start_date` is always null until manually patched.
- Burn rate thresholds (70%, 85%) are hardcoded in the component, not configurable.
