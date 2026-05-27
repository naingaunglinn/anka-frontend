import { z } from 'zod';

export const CAPACITY_ROLE_OPTIONS = [
    { value: 'frontend', label: 'Frontend' },
    { value: 'backend',  label: 'Backend' },
    { value: 'pm',       label: 'Project Manager' },
    { value: 'qa',       label: 'QA Engineer' },
    { value: 'design',   label: 'Designer' },
] as const;

export type CapacityRole = (typeof CAPACITY_ROLE_OPTIONS)[number]['value'];

// Ghost-role sub-schema — shared between create and edit forms.
// The `id` field is optional so this works for both new roles (no id yet)
// and existing roles loaded from the API (id present).
export const ghostRoleSchema = z.object({
    id: z.string().optional(),
    roleType: z.enum(['frontend', 'backend', 'pm', 'qa', 'design']),
    quantity: z.coerce.number().int().min(1, 'At least 1'),
    months: z.coerce.number().min(1).max(100).default(100), // allocation percentage (1-100%), default 100%
    minMonthlySalary: z.coerce.number().min(0, 'Must be ≥ 0'),
    maxMonthlySalary: z.coerce.number().min(0, 'Must be ≥ 0'),
}).refine(data => data.maxMonthlySalary >= data.minMonthlySalary, {
    message: 'Max salary must be ≥ min salary',
    path: ['maxMonthlySalary'],
});

export const LEAD_SOURCE_OPTIONS = [
    { value: 'inbound',       label: 'Inbound / Website' },
    { value: 'referral',      label: 'Referral' },
    { value: 'cold_outreach', label: 'Cold Outreach' },
    { value: 'social',        label: 'Social Media' },
    { value: 'event',         label: 'Event / Conference' },
    { value: 'partner',       label: 'Partner' },
    { value: 'other',         label: 'Other' },
] as const;

/**
 * OT/overage policy options shown in the deal intake form. The structured
 * value drives ⑦ Profit Calculate (absorbed OT subtracts from profit) and
 * the AI contract drafting prompt (renders the OT clause). See
 * types/business.ts OtPolicyModel for the canonical type definition.
 */
export const OT_POLICY_OPTIONS = [
    {
        value: 'customer_pays_per_hour',
        label: 'Customer pays per hour',
        help: 'Every OT hour is billed to the customer. Profit unaffected.',
    },
    {
        value: 'capped_then_customer_pays',
        label: 'Capped — first N hours included',
        help: 'First N hours/month absorbed by us; beyond that customer pays.',
    },
    {
        value: 'absorbed_by_provider',
        label: 'Absorbed by us',
        help: 'We eat all OT cost. ⑦ Profit Calculate subtracts it from profit.',
    },
    {
        value: 'no_overtime_allowed',
        label: 'No overtime',
        help: 'Contract forbids OT. Used for fixed-scope work.',
    },
] as const;

export type OtPolicyOption = (typeof OT_POLICY_OPTIONS)[number]['value'];

export const dealSchema = z.object({
    name: z.string().min(1, 'Deal name is required').max(255),
    client: z.string().min(1, 'Client / company name is required').max(255),
    contactName: z.string().min(1, 'Contact name is required').max(255),
    contactEmail: z.string().min(1, 'Contact email is required').email('Please enter a valid email address'),
    contactPhone: z.string().min(1, 'Contact phone is required').max(50),
    // Optional. Used by Invoice XLSX export's "To," block — sales reps
    // capture it during deal entry so the eventual invoice can render it.
    customerAddress: z.string().max(1000).optional(),
    expectedCloseDate: z.string().min(1, 'Expected start date is required'),
    leadSource: z.enum([
        'inbound', 'referral', 'cold_outreach', 'social', 'event', 'partner', 'other',
    ]).optional(),
    clientBudget: z.coerce.number().min(0, 'Budget must be ≥ 0'),
    // Stored as integer in the DB (timeline_months on deals). The backend's
    // Laravel validator rejects non-integer values, so we coerce + .int()
    // here so the form fails fast instead of round-tripping a 422.
    timelineMonths: z.coerce.number().int('Timeline must be a whole number of months').min(1, 'Timeline must be at least 1 month'),
    workloadHours: z.coerce.number().min(0, 'Must be ≥ 0'),
    winProbability: z.coerce.number().min(0).max(100),
    workloadDescription: z.string().max(5000).optional(),
    // OT/overage expectation captured at nego. otPolicyModel is optional
    // here (deal can be saved without it set) but the contract drafting
    // wizard will surface a TODO marker until it's filled.
    otPolicyModel: z.enum([
        'customer_pays_per_hour',
        'capped_then_customer_pays',
        'absorbed_by_provider',
        'no_overtime_allowed',
    ]).nullable().optional(),
    otRatePerHour: z.coerce.number().min(0, 'Rate must be ≥ 0').nullable().optional(),
    otIncludedHoursPerMonth: z.coerce.number().int().min(0).max(744).nullable().optional(),
    otNotes: z.string().max(2000).nullable().optional(),
    // Customer requirements collected progressively during nego.
    // All optional — salespeople fill them in as customer conversations
    // surface the details. Surfaced as a checklist on the deal detail page.
    customerSupportObligations: z.string().max(2000).nullable().optional(),
    outOfScopePolicy: z.string().max(2000).nullable().optional(),
    workingHours: z.string().max(500).nullable().optional(),
    testingRange: z.string().max(1000).nullable().optional(),
    ghostRoles: z.array(ghostRoleSchema).min(1, 'At least one role is required'),
}).refine(
    // capped model requires both rate AND included hours to be useful.
    (data) => {
        if (data.otPolicyModel !== 'capped_then_customer_pays') return true;
        return data.otRatePerHour != null && data.otIncludedHoursPerMonth != null;
    },
    {
        message: 'Capped model requires both the rate per hour and the included hours.',
        path: ['otIncludedHoursPerMonth'],
    },
).refine(
    // customer_pays model requires a rate.
    (data) => {
        if (data.otPolicyModel !== 'customer_pays_per_hour') return true;
        return data.otRatePerHour != null;
    },
    {
        message: 'Customer-pays model requires the per-hour rate.',
        path: ['otRatePerHour'],
    },
);

export type DealFormValues = z.infer<typeof dealSchema>;
export type GhostRoleFormValues = z.infer<typeof ghostRoleSchema>;
