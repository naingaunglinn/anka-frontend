import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// Projects are created exclusively by the win_deal() stored procedure —
// there is no create schema. Only fields writable via PATCH /projects/:id are exposed.
export const projectUpdateSchema = z.object({
    status:      z.enum(['Not Started', 'On Track', 'At Risk', 'Over Budget', 'Completed']).optional(),
    name:        z.string().min(1).max(200).optional(),
    budgetHours: z.coerce.number().min(0).optional(),
    endDate:     isoDate.optional(),
});

export type ProjectUpdateFormValues = z.infer<typeof projectUpdateSchema>;
