# Phase 3 — CRM & Deals Pipeline

**Effort:** ~3 days  
**Dependency:** Phase 1 (auth + tenant ID), Phase 2 (roles must exist for estimation)  
**Why now:** Deals are the revenue engine of the platform. Everything downstream — contracts, invoices, projects, time tracking — starts from a deal. The Kanban board is the most used screen by the Sales team daily.

---

## Business Context

The CRM pipeline is a Kanban board where each deal card moves through 7 stages:
```
lead → inquiry → opportunity → proposal → contract → won → lost
```

Each deal contains:
- **Core info** — name, client, estimated value, win probability, status
- **Estimation** — breakdown of features × roles × hours (from the Estimation Simulator)
- **Ghost Roles** — unnamed capacity slots for soft booking (e.g. "2 backend engineers, 3 months")
- **Hard Assignments** — named engineers committed once a deal reaches `contract` or `won` stage
- **Deal Overheads** — one-time deal costs (e.g. "AWS Setup Fee $2,000")
- **Financial summary** — base labor cost, overhead, buffer, gross profit estimate

All of this data is currently stored only in Zustand (lost on refresh). This phase wires it all to Laravel.

---

## 3.1 — Laravel API: Deal Endpoints

### List Deals (Kanban Board)

```
GET /api/deals
```

Returns all non-deleted deals for the tenant, sorted by `updated_at DESC`. The Kanban board groups them by `status` client-side.

**Query params (optional):**
- `?status=proposal` — filter by stage
- `?client=Acme` — search by client name

**Response shape:**

```json
{
    "data": [
        {
            "id": "uuid",
            "name": "Cloud Migration",
            "client": "Acme Corp",
            "estimated_value": 120000,
            "win_probability": 75,
            "status": "proposal",
            "client_budget": null,
            "timeline_months": 3,
            "workload_hours": 300,
            "workload_description": "Full cloud migration...",
            "target_margin": 30,
            "base_labor_cost": 84000,
            "overhead_cost": 16800,
            "buffer_cost": 8400,
            "total_estimated_cost": 109200,
            "estimated_gross_profit": 10800,
            "won_at": null,
            "lost_at": null,
            "created_at": "...",
            "updated_at": "..."
        }
    ]
}
```

> Include `ghost_roles` and `hard_assignments` as eager-loaded relations when `GET /api/deals/{id}` is called. For the list endpoint, omit them for performance.

---

### Get Single Deal (with all relations)

```
GET /api/deals/{id}
```

```json
{
    "id": "uuid",
    "name": "Cloud Migration",
    ...all deal fields...,
    "estimation_resources": [
        { "id": "uuid", "feature_name": "Architecture Setup", "role_id": "uuid-text", "hours": 100 }
    ],
    "deal_overheads": [
        { "id": "uuid", "name": "AWS Setup Fee", "cost": 2000 }
    ],
    "ghost_roles": [
        { "id": "uuid", "role_type": "backend", "quantity": 2, "months": 3, "avg_monthly_salary": 7000 }
    ],
    "hard_assignments": [
        { "id": "uuid", "employee_id": "uuid", "allocated_hours": 160 }
    ]
}
```

---

### Create Deal

```
POST /api/deals
```

```json
// Request
{
    "name": "New Project",
    "client": "Client Corp",
    "estimated_value": 50000,
    "win_probability": 30,
    "status": "lead",
    "target_margin": 25
}

// Response 201 — returns full deal object
```

---

### Update Deal

```
PUT /api/deals/{id}
```

Accepts any subset of deal fields. Returns full updated deal.

---

### Update Deal Stage (Kanban drag-and-drop)

```
PATCH /api/deals/{id}/stage
```

```json
// Request
{ "status": "proposal", "win_probability": 60 }
```

Used when a card is dragged between Kanban columns. Lightweight endpoint — only updates `status` and optionally `win_probability`.

---

### Delete Deal

```
DELETE /api/deals/{id}
```

Soft delete — sets `deleted_at`. Never hard-delete a deal that has a contract.

---

## 3.2 — Laravel API: Estimation Resources

Estimation resources are replaced as a complete set whenever the deal form is saved (not individual CRUD). This matches how the Estimation Simulator works — the user edits the full list then saves.

```
PUT /api/deals/{id}/estimation
```

```json
// Request — send the complete list, backend deletes old rows and inserts new ones
{
    "resources": [
        { "feature_name": "Architecture Setup", "role_id": "r-uuid-text", "hours": 100 },
        { "feature_name": "Data Migration", "role_id": "r-uuid-text", "hours": 200 }
    ]
}
```

**Laravel behavior:**
1. Delete all existing `estimation_resources` where `deal_id = ?`
2. Insert the new list
3. Return updated deal with new resources

---

## 3.3 — Laravel API: Deal Overheads

Same replace-all pattern as estimation resources:

```
PUT /api/deals/{id}/overheads
```

```json
{
    "overheads": [
        { "name": "AWS Setup Fee", "cost": 2000 },
        { "name": "Travel Expenses", "cost": 500 }
    ]
}
```

---

## 3.4 — Laravel API: Ghost Roles (Soft Capacity Planning)

```
PUT /api/deals/{id}/ghost-roles
```

```json
{
    "ghost_roles": [
        { "role_type": "backend", "quantity": 2, "months": 3, "avg_monthly_salary": 7000 },
        { "role_type": "design", "quantity": 1, "months": 2, "avg_monthly_salary": 5500 }
    ]
}
```

Ghost roles drive the soft-booking hours in the capacity pool dashboard. Soft-booked hours are calculated as:

```
quantity × months × 160 × (win_probability / 100)
```

This calculation stays on the frontend in `getCapacityPool()` — the backend just stores the raw values.

---

## 3.5 — Laravel API: Hard Assignments

Hard assignments are used when a deal reaches `contract` or `won` stage and named engineers are committed.

```
POST /api/deals/{id}/assignments
```

```json
{ "employee_id": "emp-uuid", "allocated_hours": 160 }
```

```
PUT /api/deals/{id}/assignments/{employeeId}
```

```json
{ "allocated_hours": 240 }
```

```
DELETE /api/deals/{id}/assignments/{employeeId}
```

The unique constraint `(deal_id, employee_id)` in the DB prevents duplicate assignments. The Laravel controller should return a 409 Conflict if a duplicate is attempted (rather than letting the DB throw).

---

## 3.6 — Frontend: Replace Mock Deal Actions in `businessStore`

**File:** `store/businessStore.ts`

Replace mock-only actions with API calls following the same optimistic-update + rollback pattern already used for org data:

```ts
addDeal: async (deal) => {
    const snapshot = get().deals;
    const tempId = `temp-${Date.now()}`;
    set(s => ({ deals: [...s.deals, { ...deal, id: tempId }] }));
    try {
        const { data } = await api.post('/deals', deal);
        // Replace temp entry with real DB record
        set(s => ({ deals: s.deals.map(d => d.id === tempId ? data : d) }));
    } catch (err) {
        set({ deals: snapshot });
        toast.error(`Failed to create deal: ${(err as any).message}`);
    }
},

updateDeal: async (id, updates) => {
    const snapshot = get().deals;
    set(s => ({ deals: s.deals.map(d => d.id === id ? { ...d, ...updates } : d) }));
    try {
        await api.put(`/deals/${id}`, updates);
    } catch (err) {
        set({ deals: snapshot });
        toast.error(`Failed to update deal: ${(err as any).message}`);
    }
},

updateDealStage: async (id, status, probability) => {
    const snapshot = get().deals;
    set(s => ({ deals: s.deals.map(d => d.id === id ? { ...d, status: status as any, winProbability: probability } : d) }));
    try {
        await api.patch(`/deals/${id}/stage`, { status, win_probability: probability });
    } catch (err) {
        set({ deals: snapshot });
        toast.error(`Failed to update deal stage: ${(err as any).message}`);
    }
},

deleteDeal: async (id) => {
    const snapshot = get().deals;
    set(s => ({ deals: s.deals.filter(d => d.id !== id) }));
    try {
        await api.delete(`/deals/${id}`);
    } catch (err) {
        set({ deals: snapshot });
        toast.error(`Failed to delete deal: ${(err as any).message}`);
    }
},
```

---

## 3.7 — Frontend: Load Deals on CRM Page Mount

**File:** `app/(dashboard)/crm/page.tsx`

Currently the Kanban board renders from Zustand state (mock data). Add a `useEffect` to fetch real deals on mount:

```ts
useEffect(() => {
    api.get('/deals').then(({ data }) => {
        useBusinessStore.setState({ deals: data.data.map(toDeal) });
    });
}, []);
```

Add a `toDeal()` mapper that converts snake_case API response to camelCase frontend `Deal` type:

```ts
function toDeal(row: any): Deal {
    return {
        id: row.id,
        name: row.name,
        client: row.client,
        estimatedValue: row.estimated_value,
        winProbability: row.win_probability,
        status: row.status,
        clientBudget: row.client_budget,
        timelineMonths: row.timeline_months,
        workloadHours: row.workload_hours,
        workloadDescription: row.workload_description,
        targetMargin: row.target_margin,
        baseLaborCost: row.base_labor_cost,
        overheadCost: row.overhead_cost,
        bufferCost: row.buffer_cost,
        totalEstimatedCost: row.total_estimated_cost,
        estimatedGrossProfit: row.estimated_gross_profit,
        ghostRoles: (row.ghost_roles ?? []).map(toGhostRole),
        hardAssignments: (row.hard_assignments ?? []).map(toHardAssignment),
        estimationResources: (row.estimation_resources ?? []).map(toEstimationResource),
        projectOverheads: (row.deal_overheads ?? []).map(toProjectOverhead),
    };
}
```

---

## 3.8 — Kanban Drag-and-Drop: PATCH Stage on Drop

**File:** `components/crm/KanbanBoard.tsx`

The `onDragEnd` handler currently calls `updateDealStage` which is mock-only. After Phase 3.6, `updateDealStage` will call the API, so the Kanban board requires no changes in its drag logic — it just needs `updateDealStage` to be async-aware.

---

## 3.9 — Remove Mock Deal Data from Store

**File:** `store/businessStore.ts` lines 70–110

Once `GET /api/deals` is called on CRM page mount, the `MOCK_DEALS` constant can be removed from the initial state:

```ts
deals: [],   // populated from API on CRM page load
```

---

## Field Name Mapping Reference

| Frontend (camelCase) | API / SQL (snake_case) |
|---|---|
| `estimatedValue` | `estimated_value` |
| `winProbability` | `win_probability` |
| `clientBudget` | `client_budget` |
| `timelineMonths` | `timeline_months` |
| `workloadHours` | `workload_hours` |
| `workloadDescription` | `workload_description` |
| `targetMargin` | `target_margin` |
| `baseLaborCost` | `base_labor_cost` |
| `overheadCost` | `overhead_cost` |
| `bufferCost` | `buffer_cost` |
| `totalEstimatedCost` | `total_estimated_cost` |
| `estimatedGrossProfit` | `estimated_gross_profit` |
| `ghostRoles[].roleType` | `ghost_roles[].role_type` |
| `ghostRoles[].avgMonthlySalary` | `ghost_roles[].avg_monthly_salary` |
| `hardAssignments[].employeeId` | `hard_assignments[].employee_id` |
| `hardAssignments[].allocatedHours` | `hard_assignments[].allocated_hours` |
| `estimationResources[].featureName` | `estimation_resources[].feature_name` |
| `estimationResources[].roleId` | `estimation_resources[].role_id` |
| `projectOverheads[]` | `deal_overheads[]` |

---

## Acceptance Criteria

- [ ] CRM Kanban board loads real deals from API on page mount
- [ ] Creating a new deal from the form persists to DB and appears in Kanban immediately (optimistic)
- [ ] Dragging a deal card to a new column calls `PATCH /deals/{id}/stage` and persists
- [ ] Refreshing the page after moving a deal shows it in the correct column
- [ ] Deal estimation (features + hours + roles) saves via `PUT /deals/{id}/estimation`
- [ ] Ghost roles save and contribute to capacity pool soft-booking
- [ ] Deal financial summary (base labor, overhead, buffer, gross profit) saves to DB
- [ ] Hard assignments save to `deal_hard_assignments` table
- [ ] Deleting a deal sets `deleted_at` (not visible in board after refresh)
- [ ] `GET /api/deals` returns only the active tenant's deals
