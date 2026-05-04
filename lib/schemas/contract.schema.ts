import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// Contracts are created exclusively by the win_deal() stored procedure —
// there is no create schema. Only fields writable via PATCH /contracts/:id are exposed.
export const contractUpdateSchema = z.object({
    status:     z.enum(['Active', 'Completed', 'Draft', 'Cancelled']).optional(),
    notes:      z.string().max(5000).optional(),
    endDate:    isoDate.optional(),
    totalValue: z.coerce.number().min(0).optional(),
});

export type ContractUpdateFormValues = z.infer<typeof contractUpdateSchema>;
