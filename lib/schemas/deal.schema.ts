import { z } from 'zod';

// Ghost-role sub-schema — shared between create and edit forms.
// The `id` field is optional so this works for both new roles (no id yet)
// and existing roles loaded from the API (id present).
export const ghostRoleSchema = z.object({
    id: z.string().optional(),
    roleType: z.string().min(1, 'Role type is required'),
    quantity: z.coerce.number().int().min(1, 'At least 1'),
    months: z.coerce.number().int().min(1, 'At least 1 month'),
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

export const dealSchema = z.object({
    name: z.string().min(1, 'Deal name is required').max(255),
    client: z.string().min(1, 'Client / company name is required').max(255),
    contactName: z.string().min(1, 'Contact name is required').max(255),
    contactEmail: z.string().min(1, 'Contact email is required').email('Please enter a valid email address'),
    contactPhone: z.string().min(1, 'Contact phone is required').max(50),
    expectedCloseDate: z.string().optional().default(''),
    leadSource: z.enum([
        'inbound', 'referral', 'cold_outreach', 'social', 'event', 'partner', 'other',
    ]).optional(),
    clientBudget: z.coerce.number().min(0, 'Budget must be ≥ 0'),
    timelineMonths: z.coerce.number().int().min(1, 'Timeline is required'),
    workloadHours: z.coerce.number().min(0, 'Must be ≥ 0'),
    winProbability: z.coerce.number().min(0).max(100),
    workloadDescription: z.string().max(5000).optional(),
    ghostRoles: z.array(ghostRoleSchema).min(1, 'At least one role is required'),
});

export type DealFormValues = z.infer<typeof dealSchema>;
export type GhostRoleFormValues = z.infer<typeof ghostRoleSchema>;
