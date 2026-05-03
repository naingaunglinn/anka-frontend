# Phase 4 — Win Deal Flow

**Effort:** ~1 day  
**Dependency:** Phase 3 (deals must exist in DB), Phase 1 (auth)  
**Why its own phase:** Win Deal is the most critical business event in the platform. It atomically converts a sales deal into an active contract and a delivery project. Getting this wrong means orphaned records, double-contracts, or revenue tracked against the wrong project. It deserves isolated focus.

---

## Business Context

When a Sales manager marks a deal as **Won**, the platform must:

1. Mark the deal `status = 'won'`, `won_at = now()`
2. Auto-generate a `Contract` with the client's agreed budget
3. Auto-generate a `Project` with budget hours from the deal estimation
4. Transition the deal out of the CRM Kanban and into the Contracts and Projects modules

This is not just a status update — it is a cross-module state change that creates records in three tables atomically. It must succeed entirely or not at all.

The SQL schema provides `win_deal(deal_id uuid, tenant_id uuid)` — a PostgreSQL function that handles this atomically with a `FOR UPDATE` row lock. The Laravel controller must call this function rather than replicating its logic in PHP.

---

## 4.1 — Current Frontend Behavior (Mock)

**File:** `store/businessStore.ts` lines 365–402

The current `winDeal(dealId)` function:
1. Calls `updateDealStage(dealId, 'won', 100)`
2. Creates a contract with a random ID (`CON-${Math.random()}`)
3. Creates a project with a random ID (`PRJ-${Math.random()}`)
4. Does not persist anything to the DB

This must be replaced entirely.

---

## 4.2 — Laravel API: Win Deal Endpoint

```
POST /api/deals/{id}/win
```

**Request:** No body required. The deal ID and tenant ID are sufficient.

**Laravel Controller behavior:**

```php
public function win(string $id): JsonResponse
{
    $tenantId = request()->header('X-Tenant-ID');
    
    // Call the DB function — handles atomicity, idempotency, row lock
    DB::statement('SELECT win_deal(?::uuid, ?::uuid)', [$id, $tenantId]);
    
    // Return the created contract and project for the frontend to store
    $contract = Contract::with('milestones')
        ->where('deal_id', $id)
        ->where('tenant_id', $tenantId)
        ->firstOrFail();
        
    $project = Project::where('contract_id', $contract->id)
        ->where('tenant_id', $tenantId)
        ->firstOrFail();
    
    return response()->json([
        'deal'     => Deal::find($id),
        'contract' => $contract,
        'project'  => $project,
    ]);
}
```

**Response 200:**

```json
{
    "deal": {
        "id": "uuid",
        "status": "won",
        "won_at": "2026-05-02T10:00:00Z",
        ...
    },
    "contract": {
        "id": "uuid",
        "contract_number": "CON-0001",
        "deal_id": "uuid",
        "client": "Acme Corp",
        "total_value": 120000,
        "revenue_recognized": 0,
        "status": "Active",
        ...
    },
    "project": {
        "id": "uuid",
        "project_number": "PRJ-101",
        "contract_id": "uuid",
        "name": "Cloud Migration",
        "client": "Acme Corp",
        "budget_hours": 300,
        "consumed_hours": 0,
        "status": "Not Started",
        ...
    }
}
```

**Response 404:** Deal not found for this tenant.  
**Response 409:** Deal is already won (idempotent — the DB function handles this silently, but return a helpful message).

---

## 4.3 — Frontend: Replace `winDeal()` in Business Store

**File:** `store/businessStore.ts`

```ts
winDeal: async (dealId) => {
    const snapshotDeals = get().deals;
    const snapshotContracts = get().contracts;
    const snapshotProjects = get().projects;

    // Optimistic: mark deal as won immediately
    set(s => ({
        deals: s.deals.map(d => d.id === dealId
            ? { ...d, status: 'won', winProbability: 100 }
            : d
        )
    }));

    try {
        const { data } = await api.post(`/deals/${dealId}/win`);

        // Update deal with real won_at timestamp
        set(s => ({
            deals: s.deals.map(d => d.id === dealId ? toDeal(data.deal) : d),
            // Add new contract and project from response
            contracts: [...s.contracts, toContract(data.contract)],
            projects: [...s.projects, toProject(data.project)],
        }));

        toast.success(`Deal won! Contract ${data.contract.contract_number} created.`);
    } catch (err) {
        // Rollback
        set({ deals: snapshotDeals, contracts: snapshotContracts, projects: snapshotProjects });
        toast.error(`Failed to win deal: ${(err as any).response?.data?.message ?? 'Unknown error'}`);
    }
},
```

---

## 4.4 — Response Mappers

Add these camelCase mappers for the win-deal response:

```ts
// In a new file: lib/mappers.ts  (or alongside existing toDeal mapper)

export function toContract(row: any): Contract {
    return {
        id: row.id,
        dealId: row.deal_id,
        contractNumber: row.contract_number,
        client: row.client,
        totalValue: row.total_value,
        revenueRecognized: row.revenue_recognized,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        notes: row.notes,
    };
}

export function toProject(row: any): Project {
    return {
        id: row.id,
        contractId: row.contract_id,
        projectNumber: row.project_number,
        name: row.name,
        client: row.client,
        budgetHours: row.budget_hours,
        consumedHours: row.consumed_hours,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
    };
}
```

---

## 4.5 — Win Deal UI Trigger

**File:** `components/crm/KanbanBoard.tsx` or `components/crm/DealForm.tsx`

The Win Deal button/action currently calls `useBusinessStore().winDeal(dealId)`. No change needed in the UI layer — the store action signature stays the same. The UI will now get a toast with the real contract number.

---

## 4.6 — What `win_deal()` Does (DB Function Summary)

The PostgreSQL function `win_deal(p_deal_id, p_tenant_id)`:

1. Locks the deal row (`FOR UPDATE`) to prevent concurrent wins
2. Returns early if `status = 'won'` (idempotent)
3. Sets `deals.status = 'won'`, `won_at = now()`
4. Checks if a contract for this deal already exists — returns if yes
5. Inserts a `contracts` row (`contract_number` auto from sequence, `status = 'Active'`)
6. Uses `deal.client_budget` for `total_value`, falls back to `estimated_value`
7. Calculates `budget_hours` from `deal.workload_hours` or `SUM(estimation_resources.hours)`
8. Inserts a `projects` row (`project_number` auto from sequence, `status = 'Not Started'`)

**Do not replicate this logic in PHP.** Call the function via `DB::statement('SELECT win_deal(?, ?)', [...])`.

---

## 4.7 — Verify Sequence Values

The sequences in the schema seed at specific starting points:
- `contract_number_seq` starts at `1` → first contract is `CON-0001`
- `invoice_number_seq` starts at `1042` → first invoice is `INV-1042`
- `project_number_seq` starts at `101` → first project is `PRJ-101`

These match the mock data IDs (`CON-001`, `INV-1042`, `PRJ-101`) which makes the demo seed data feel realistic.

---

## 4.8 — Post-Win: Capacity Pool Update

When a deal is won, its ghost roles must stop counting as soft-booked hours and the hard assignments take over. The `getCapacityPool()` selector in `businessStore.ts` already handles this:

```ts
if (status === "won" || status === "contract") {
    // Use hard assignments for booked hours
} else {
    // Use ghost roles × win_probability for soft booking
}
```

This logic is correct and needs no changes. Once `winDeal()` sets `status = 'won'` in the store, the capacity pool will automatically recalculate on the next render.

---

## Acceptance Criteria

- [ ] Clicking "Mark as Won" calls `POST /api/deals/{id}/win`
- [ ] A real contract is created with an auto-generated `contract_number` (e.g. `CON-0001`)
- [ ] A real project is created with an auto-generated `project_number` (e.g. `PRJ-101`)
- [ ] Budget hours on the project match the deal's `workload_hours` (or sum of estimation resources)
- [ ] Calling win-deal a second time on the same deal does not create a duplicate contract
- [ ] The won deal disappears from the active Kanban pipeline (or shows in a "Won" column)
- [ ] The new contract appears immediately in the Contracts page
- [ ] The new project appears immediately in the Projects page
- [ ] Ghost role soft-booking for the won deal no longer appears in capacity pool
- [ ] Toast shows the real contract number on success
