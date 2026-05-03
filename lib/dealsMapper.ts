import type {
    Deal,
    GhostRole,
    HardAssignment,
    EstimationResource,
    ProjectOverhead,
    Contract,
    Project,
    Invoice,
    TimeEntry,
} from '@/types/business';

// ─── API response → frontend types (snake_case → camelCase) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGhostRole(row: any): GhostRole {
    return {
        id: row.id,
        roleType: row.role_type,
        quantity: row.quantity,
        months: row.months,
        avgMonthlySalary: row.avg_monthly_salary,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toHardAssignment(row: any): HardAssignment {
    return {
        employeeId: row.employee_id,
        allocatedHours: row.allocated_hours,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEstimationResource(row: any): EstimationResource {
    return {
        id: row.id,
        featureName: row.feature_name,
        roleId: row.role_id,
        hours: row.hours,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProjectOverhead(row: any): ProjectOverhead {
    return {
        id: row.id,
        name: row.name,
        cost: row.cost,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toDeal(row: any): Deal {
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

// ─── Win-deal response mappers ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toContract(row: any): Contract {
    return {
        id: row.id,
        dealId: row.deal_id,
        contractNumber: row.contract_number,
        client: row.client,
        totalValue: row.total_value ?? 0,
        revenueRecognized: row.revenue_recognized ?? 0,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        notes: row.notes,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toProject(row: any): Project {
    return {
        id: row.id,
        contractId: row.contract_id,
        projectNumber: row.project_number,
        name: row.name,
        client: row.client,
        budgetHours: row.budget_hours ?? 0,
        consumedHours: row.consumed_hours ?? 0,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toInvoice(row: any): Invoice {
    // Compute overdue client-side: pending invoices whose due_date has passed
    const isOverdue =
        row.status === 'Pending' &&
        row.due_date &&
        new Date(row.due_date) < new Date();

    return {
        id: row.id,
        contractId: row.contract_id,
        milestoneId: row.milestone_id ?? undefined,
        invoiceNumber: row.invoice_number,
        issueDate: row.issue_date,
        dueDate: row.due_date ?? undefined,
        amount: Number(row.amount ?? 0),
        tax: Number(row.tax ?? 0),
        total: row.total != null ? Number(row.total) : undefined,
        status: isOverdue ? 'Overdue' : row.status,
        paidAt: row.paid_at ?? undefined,
        notes: row.notes ?? undefined,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toTimeEntry(row: any): TimeEntry {
    return {
        id: row.id,
        projectId: row.project_id,
        employeeId: row.employee_id,
        task: row.task,
        date: row.date,
        hours: Number(row.hours ?? 0),
        billable: row.billable ?? true,
        status: row.status,
        approvedAt: row.approved_at ?? undefined,
        approvedBy: row.approved_by ?? undefined,
        notes: row.notes ?? undefined,
    };
}

// ─── Frontend types → API payload (camelCase → snake_case) ───────────────────

export function dealToApiPayload(deal: Partial<Deal>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (deal.name !== undefined) payload.name = deal.name;
    if (deal.client !== undefined) payload.client = deal.client;
    if (deal.estimatedValue !== undefined) payload.estimated_value = deal.estimatedValue;
    if (deal.winProbability !== undefined) payload.win_probability = deal.winProbability;
    if (deal.status !== undefined) payload.status = deal.status;
    if (deal.clientBudget !== undefined) payload.client_budget = deal.clientBudget;
    if (deal.timelineMonths !== undefined) payload.timeline_months = deal.timelineMonths;
    if (deal.workloadHours !== undefined) payload.workload_hours = deal.workloadHours;
    if (deal.workloadDescription !== undefined) payload.workload_description = deal.workloadDescription;
    if (deal.targetMargin !== undefined) payload.target_margin = deal.targetMargin;
    if (deal.baseLaborCost !== undefined) payload.base_labor_cost = deal.baseLaborCost;
    if (deal.overheadCost !== undefined) payload.overhead_cost = deal.overheadCost;
    if (deal.bufferCost !== undefined) payload.buffer_cost = deal.bufferCost;
    if (deal.totalEstimatedCost !== undefined) payload.total_estimated_cost = deal.totalEstimatedCost;
    if (deal.estimatedGrossProfit !== undefined) payload.estimated_gross_profit = deal.estimatedGrossProfit;
    return payload;
}
