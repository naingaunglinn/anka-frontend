import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const invoiceSchema = z.object({
    contractId:  z.string().uuid('Invalid contract ID'),
    milestoneId: z.string().uuid('Invalid milestone ID').optional(),
    issueDate:   isoDate,
    dueDate:     isoDate.optional(),
    // Amount must be > 0; tax may be 0 (tax-exempt invoices)
    amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
    tax:    z.coerce.number().min(0, 'Tax must be ≥ 0'),
    notes:  z.string().max(1000).optional(),
    // `total` is a GENERATED ALWAYS column on the backend — never include it in
    // a create/update payload.
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;
