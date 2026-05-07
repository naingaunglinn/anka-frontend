import { z } from 'zod';

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    // Min-6 matches the server-side rule; bcrypt cost-12 is server-enforced
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
