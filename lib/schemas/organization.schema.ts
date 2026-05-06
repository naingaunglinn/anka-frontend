import { z } from 'zod';

export const departmentSchema = z.object({
    name:      z.string().min(2, 'Name must be at least 2 characters').max(100),
    managerId: z.string().uuid().optional(),
    // headcount is computed server-side; not a user-entered field
});

export const roleSchema = z.object({
    title:        z.string().min(2, 'Title must be at least 2 characters').max(100),
    departmentId: z.string().min(1, 'Please select a department.'),
    rate:         z.coerce.number().min(0, 'Bill rate must be ≥ 0'),
});

// capacityRole uses 'none' as a sentinel for "unset" because HTML select elements
// cannot natively represent undefined. The store/API layer strips this back to null.
export const employeeSchema = z.object({
    name:          z.string().min(2, 'Name must be at least 2 characters').max(100),
    role:          z.string().min(1, 'Please select a role.'),
    departmentId:  z.string().optional(),
    capacityRole:  z.string().optional(),
    monthlySalary: z.coerce.number().min(0, 'Salary must be ≥ 0'),
    workableHours: z.coerce.number().min(1, 'Must be > 0').max(744, 'Max 744 h/month'),
    status:        z.enum(['Active', 'On Leave', 'Terminated']),
});

export const globalOverheadSchema = z.object({
    category:       z.string().min(2, 'Category must be at least 2 characters').max(100),
    description:    z.string().min(2, 'Description must be at least 2 characters').max(500),
    monthlyCost:    z.coerce.number().min(0, 'Monthly cost must be ≥ 0'),
    // Both undefined = applies to all months. Both set = specific period only.
    effectiveMonth: z.number().int().min(1).max(12).optional(),
    effectiveYear:  z.number().int().min(2000).optional(),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;
export type RoleFormValues        = z.infer<typeof roleSchema>;
export type EmployeeFormValues    = z.infer<typeof employeeSchema>;
export type OverheadFormValues    = z.infer<typeof globalOverheadSchema>;
