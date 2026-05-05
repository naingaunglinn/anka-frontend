import { z } from 'zod';

// Ghost-role sub-schema — shared between create and edit forms.
// The `id` field is optional so this works for both new roles (no id yet)
// and existing roles loaded from the API (id present).
export const ghostRoleSchema = z.object({
    id: z.string().optional(),
    roleType: z.string().min(1, 'Role type is required'),
    quantity: z.coerce.number().int().min(1, 'At least 1'),
    months: z.coerce.number().int().min(1, 'At least 1 month'),
    avgMonthlySalary: z.coerce.number().min(0, 'Must be ≥ 0'),
});

export const dealSchema = z.object({
    name: z.string().min(1, 'Deal name is required').max(200),
    client: z.string().max(200).optional().default(''),
    clientBudget: z.coerce.number().min(0, 'Budget must be ≥ 0'),
    timelineMonths: z.coerce.number().int().min(1, 'Timeline is required'),
    workloadHours: z.coerce.number().min(1, 'Workload is required'),
    winProbability: z.coerce.number().min(0).max(100),
    workloadDescription: z.string().max(5000).optional(),
    ghostRoles: z.array(ghostRoleSchema).min(1, 'At least one role is required'),
});

export type DealFormValues = z.infer<typeof dealSchema>;
export type GhostRoleFormValues = z.infer<typeof ghostRoleSchema>;
