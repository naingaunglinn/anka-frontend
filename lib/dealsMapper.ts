import type {
    Deal,
    DealLeadSource,
    GhostRole,
    HardAssignment,
    EstimationResource,
    ProjectOverhead,
    Contract,
    Project,
    Invoice,
    TimeEntry,
    RoleType,
} from '@/types/business';

// ─── API response → frontend types (snake_case → camelCase) ──────────────────

interface ApiGhostRole {
    id: string;
    role_type: string;
    quantity: number;
    months: number;
    avg_monthly_salary: number;
    min_monthly_salary?: number;
    max_monthly_salary?: number;
}

function toGhostRole(row: ApiGhostRole): GhostRole {
    const avg = row.avg_monthly_salary ?? 0
    return {
        id: row.id,
        roleType: row.role_type as RoleType,
        quantity: row.quantity,
        months: row.months,
        minMonthlySalary: row.min_monthly_salary ?? avg,
        maxMonthlySalary: row.max_monthly_salary ?? avg,
    };
}

interface ApiHardAssignment {
    employee_id: string;
    allocated_hours: number;
}

interface ApiEstimationResource {
    id: string;
    feature_name: string;
    role_id: string;
    hours: number;
}

interface ApiProjectOverhead {
    id: string;
    name: string;
    cost: number;
}

interface ApiDeal {
    id: string;
    name: string;
    client?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    estimated_value?: number;
    win_probability?: number;
    status?: Deal['status'];
    expected_close_date?: string;
    lead_source?: string;
    client_budget?: number;
    timeline_months?: number;
    workload_hours?: number;
    workload_description?: string;
    wizard_step?: string;
    target_margin?: number;
    base_labor_cost?: number;
    overhead_cost?: number;
    buffer_cost?: number;
    total_estimated_cost?: number;
    estimated_gross_profit?: number;
    win_reason?: string;
    loss_reason?: string;
    ghost_roles?: ApiGhostRole[];
    hard_assignments?: ApiHardAssignment[];
    estimation_resources?: ApiEstimationResource[];
    deal_overheads?: ApiProjectOverhead[];
}

interface ApiContract {
    id: string;
    deal_id: string;
    contract_number?: string;
    client: string;
    total_value?: number;
    revenue_recognized?: number;
    cash_collected?: number;
    status: Contract['status'];
    start_date?: string;
    end_date?: string;
    signed_at?: string | null;
    payment_terms_days?: number;
    po_number?: string | null;
    billing_contact_name?: string | null;
    billing_email?: string | null;
    currency?: string | null;
    tax_jurisdiction?: string | null;
    notes?: string;
    created_at?: string | null;
}

interface ApiProject {
    id: string;
    contract_id: string;
    project_number?: string;
    name: string;
    client: string;
    budget_hours?: number;
    consumed_hours?: number;
    status: Project['status'];
    start_date?: string;
    end_date?: string;
    kickoff_date?: string | null;
    project_manager_id?: string | null;
    project_manager_name?: string | null;
    team_size?: number;
}

interface ApiInvoice {
    id: string;
    contract_id: string;
    milestone_id?: string | null;
    invoice_number?: string;
    issue_date: string;
    due_date?: string | null;
    amount?: number | string;
    tax?: number | string;
    paid_amount?: number | string;
    total?: number | string | null;
    status: Invoice['status'];
    paid_at?: string | null;
    issued_at?: string | null;
    sent_to_email?: string | null;
    reminder_sent_count?: number;
    notes?: string | null;
}

interface ApiTimeEntry {
    id: string;
    project_id: string;
    employee_id: string;
    task: string;
    date: string;
    hours?: number | string;
    billable?: boolean;
    status: TimeEntry['status'];
    approved_at?: string | null;
    approved_by?: number;
    notes?: string | null;
}

function toHardAssignment(row: ApiHardAssignment): HardAssignment {
    return {
        employeeId: row.employee_id,
        allocatedHours: row.allocated_hours,
    };
}

function toEstimationResource(row: ApiEstimationResource): EstimationResource {
    return {
        id: row.id,
        featureName: row.feature_name,
        roleId: row.role_id,
        hours: row.hours,
    };
}

function toProjectOverhead(row: ApiProjectOverhead): ProjectOverhead {
    return {
        id: row.id,
        name: row.name,
        cost: row.cost,
    };
}

export function toDeal(row: ApiDeal): Deal {
    return {
        id: row.id,
        name: row.name,
        client: row.client,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        estimatedValue: row.estimated_value,
        winProbability: row.win_probability,
        status: row.status,
        expectedCloseDate: row.expected_close_date,
        leadSource: row.lead_source ? (row.lead_source as DealLeadSource) : undefined,
        clientBudget: row.client_budget,
        timelineMonths: row.timeline_months,
        workloadHours: row.workload_hours,
        workloadDescription: row.workload_description,
        wizardStep: row.wizard_step as Deal['wizardStep'],
        targetMargin: row.target_margin,
        baseLaborCost: row.base_labor_cost,
        overheadCost: row.overhead_cost,
        bufferCost: row.buffer_cost,
        totalEstimatedCost: row.total_estimated_cost,
        estimatedGrossProfit: row.estimated_gross_profit,
        winReason: row.win_reason,
        lossReason: row.loss_reason,
        ghostRoles: (row.ghost_roles ?? []).map(toGhostRole),
        hardAssignments: (row.hard_assignments ?? []).map(toHardAssignment),
        estimationResources: (row.estimation_resources ?? []).map(toEstimationResource),
        projectOverheads: (row.deal_overheads ?? []).map(toProjectOverhead),
    };
}

// ─── Win-deal response mappers ───────────────────────────────────────────────

export function toContract(row: ApiContract): Contract {
    return {
        id: row.id,
        dealId: row.deal_id,
        contractNumber: row.contract_number,
        client: row.client,
        totalValue: row.total_value ?? 0,
        revenueRecognized: row.revenue_recognized ?? 0,
        cashCollected: row.cash_collected ?? 0,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
        signedAt: row.signed_at ?? undefined,
        paymentTermsDays: row.payment_terms_days ?? 30,
        poNumber: row.po_number ?? undefined,
        billingContactName: row.billing_contact_name ?? undefined,
        billingEmail: row.billing_email ?? undefined,
        currency: row.currency ?? undefined,
        taxJurisdiction: row.tax_jurisdiction ?? undefined,
        notes: row.notes,
        createdAt: row.created_at ?? undefined,
    };
}

export function toProject(row: ApiProject): Project {
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
        kickoffDate: row.kickoff_date ?? undefined,
        projectManagerId: row.project_manager_id ?? undefined,
        projectManagerName: row.project_manager_name ?? undefined,
        teamSize: row.team_size ?? 0,
    };
}

export function toInvoice(row: ApiInvoice): Invoice {
    // Compute overdue client-side: pending or partially-paid invoices whose due_date has passed.
    // Don't override Partially Paid → Overdue: partial payment is the more informative label,
    // and the row will still be flagged as overdue separately by the UI's date check.
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
        paidAmount: row.paid_amount != null ? Number(row.paid_amount) : 0,
        total: row.total != null ? Number(row.total) : undefined,
        status: isOverdue ? 'Overdue' : row.status,
        paidAt: row.paid_at ?? undefined,
        issuedAt: row.issued_at ?? undefined,
        sentToEmail: row.sent_to_email ?? undefined,
        reminderSentCount: row.reminder_sent_count ?? 0,
        notes: row.notes ?? undefined,
    };
}

export function toTimeEntry(row: ApiTimeEntry): TimeEntry {
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
    if (deal.name !== undefined)          payload.name           = deal.name;
    if (deal.client !== undefined)        payload.client         = deal.client;
    if (deal.contactName !== undefined)   payload.contact_name   = deal.contactName || null;
    if (deal.contactEmail !== undefined)  payload.contact_email  = deal.contactEmail || null;
    if (deal.contactPhone !== undefined)  payload.contact_phone  = deal.contactPhone || null;
    if (deal.expectedCloseDate !== undefined) payload.expected_close_date = deal.expectedCloseDate || null;
    if (deal.leadSource)                  payload.lead_source    = deal.leadSource;
    if (deal.winReason !== undefined)     payload.win_reason     = deal.winReason || null;
    if (deal.lossReason !== undefined)    payload.loss_reason    = deal.lossReason || null;
    if (deal.estimatedValue !== undefined) payload.estimated_value = deal.estimatedValue;
    if (deal.winProbability !== undefined) payload.win_probability = deal.winProbability;
    if (deal.status !== undefined) payload.status = deal.status;
    if (deal.clientBudget !== undefined) payload.client_budget = deal.clientBudget;
    if (deal.timelineMonths !== undefined) payload.timeline_months = deal.timelineMonths;
    if (deal.workloadHours !== undefined) payload.workload_hours = deal.workloadHours;
    if (deal.workloadDescription !== undefined) payload.workload_description = deal.workloadDescription;
    if (deal.wizardStep !== undefined) payload.wizard_step = deal.wizardStep;
    if (deal.targetMargin !== undefined) payload.target_margin = deal.targetMargin;
    if (deal.baseLaborCost !== undefined) payload.base_labor_cost = deal.baseLaborCost;
    if (deal.overheadCost !== undefined) payload.overhead_cost = deal.overheadCost;
    if (deal.bufferCost !== undefined) payload.buffer_cost = deal.bufferCost;
    if (deal.totalEstimatedCost !== undefined) payload.total_estimated_cost = deal.totalEstimatedCost;
    if (deal.estimatedGrossProfit !== undefined) payload.estimated_gross_profit = deal.estimatedGrossProfit;
    if (deal.ghostRoles !== undefined) {
        payload.ghost_roles = deal.ghostRoles.map((role) => ({
            ...(role.id ? { id: role.id } : {}),
            role_type: role.roleType,
            quantity: role.quantity,
            months: role.months,
            avg_monthly_salary: ((role.minMonthlySalary ?? 0) + (role.maxMonthlySalary ?? 0)) / 2,
            min_monthly_salary: role.minMonthlySalary ?? 0,
            max_monthly_salary: role.maxMonthlySalary ?? 0,
        }));
    }
    if (deal.hardAssignments !== undefined) {
        payload.hard_assignments = deal.hardAssignments.map((assignment) => ({
            employee_id: assignment.employeeId,
            allocated_hours: assignment.allocatedHours,
        }));
    }
    if (deal.estimationResources !== undefined) {
        payload.estimation_resources = deal.estimationResources.map((resource) => ({
            feature_name: resource.featureName,
            role_id: resource.roleId,
            hours: resource.hours,
        }));
    }
    if (deal.projectOverheads !== undefined) {
        payload.deal_overheads = deal.projectOverheads.map((overhead) => ({
            name: overhead.name,
            cost: overhead.cost,
        }));
    }
    return payload;
}
