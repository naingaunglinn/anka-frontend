import { z } from 'zod';

export const timeEntrySchema = z.object({
    projectId:  z.string().uuid('Invalid project ID'),
    employeeId: z.string().uuid('Invalid employee ID'),
    task:       z.string().min(1, 'Task description is required').max(500),
    date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    // 0.25 = minimum billable unit (15 minutes); 24 = max in one day
    hours:      z.coerce.number().min(0.25, 'Minimum 0.25 hours').max(24, 'Maximum 24 hours/day'),
    billable:   z.boolean(),
    notes:      z.string().max(1000).optional(),
});

export type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;
