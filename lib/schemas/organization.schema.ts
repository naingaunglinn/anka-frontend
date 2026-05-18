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
// email/password are optional on the base schema (used for edit) but required
// on employeeCreateSchema, since every newly-created employee gets a login account.
//
// The preprocess() wrappers convert blank-string inputs to undefined BEFORE the
// inner validator runs. On edit this means leaving the password field empty
// reads as "no change" instead of triggering the .min(6) validator.
const blankToUndefined = (v: unknown) =>
    typeof v === 'string' && v.trim() === '' ? undefined : v;

export const employeeSchema = z.object({
    name:          z.string().min(2, 'Name must be at least 2 characters').max(100),
    role:          z.string().min(1, 'Please select a role.'),
    departmentId:  z.string().optional(),
    capacityRole:  z.string().optional(),
    // Rank — optional. When null the AI Team Builder falls back to keyword
    // matching on the role title. 'none' sentinel is used by the form's
    // <Select> for the same reason capacityRole uses it; the store/API layer
    // converts back to null.
    rankId:        z.string().optional(),
    // Spec ①.2 — salary split into Basic + Allowance. monthlySalary is derived
    // server-side (basic + allowance) and not entered directly.
    basicSalary:   z.coerce.number().min(0, 'Basic salary must be ≥ 0'),
    allowance:     z.coerce.number().min(0, 'Allowance must be ≥ 0').default(0),
    workableHours: z.coerce.number().min(1, 'Must be > 0').max(744, 'Max 744 h/month'),
    status:        z.enum(['Active', 'On Leave', 'Terminated']),
    // Skills the employee has, fed verbatim to the AI Team Builder so Claude
    // can match required project skills against the available pool.
    skills: z.array(z.object({
        skillId:     z.string().uuid('Invalid skill.'),
        proficiency: z.enum(['beginner', 'intermediate', 'expert']),
    })).default([]),
    email: z.preprocess(
        blankToUndefined,
        z.string().email('Please enter a valid email').max(255).optional(),
    ),
    password: z.preprocess(
        blankToUndefined,
        z.string().min(6, 'Password must be at least 6 characters').max(255).optional(),
    ),
});

export const employeeCreateSchema = employeeSchema.extend({
    email:    z.string().email('Please enter a valid email').max(255),
    password: z.string().min(6, 'Password must be at least 6 characters').max(255),
});

export const rankSchema = z.object({
    name:  z.string().min(2, 'Name must be at least 2 characters').max(100),
    // Code is the stable identifier (uniqueness enforced server-side); kept
    // short and alphanumeric so it can appear in dropdowns + badges.
    code:  z.string()
        .min(1, 'Code is required')
        .max(50)
        .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, "_" and "-"'),
    // Level orders ranks (higher = more senior). 0-100 gives plenty of room
    // for tenants to insert custom ranks between the defaults.
    level: z.coerce.number().int('Level must be a whole number').min(0).max(100),
});

export const globalOverheadSchema = z.object({
    category:       z.string().min(2, 'Category must be at least 2 characters').max(100),
    description:    z.string().min(2, 'Description must be at least 2 characters').max(500),
    monthlyCost:    z.coerce.number().min(0, 'Monthly cost must be ≥ 0'),
    // Both undefined = applies to all months. Both set = specific period only.
    effectiveMonth: z.number().int().min(1).max(12).optional(),
    effectiveYear:  z.number().int().min(2000).optional(),
});

export const capacityRoleSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    code: z.string().min(2, 'Code must be at least 2 characters').max(50)
        .regex(/^[a-z0-9_-]+$/, 'Lowercase letters, numbers, hyphens and underscores only'),
});

export const skillSchema = z.object({
    name:     z.string().min(2, 'Name must be at least 2 characters').max(100),
    category: z.string().min(1, 'Please select a category.'),
});

export const employeeSkillSchema = z.object({
    skillId:     z.string().uuid('Please select a skill.'),
    proficiency: z.enum(['beginner', 'intermediate', 'expert']),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;
export type RoleFormValues        = z.infer<typeof roleSchema>;
export type EmployeeFormValues    = z.infer<typeof employeeSchema>;
export type EmployeeCreateValues  = z.infer<typeof employeeCreateSchema>;
export type OverheadFormValues    = z.infer<typeof globalOverheadSchema>;
export type CapacityRoleFormValues = z.infer<typeof capacityRoleSchema>;
export type RankFormValues         = z.infer<typeof rankSchema>;
export type SkillFormValues        = z.infer<typeof skillSchema>;
export type EmployeeSkillFormValues = z.infer<typeof employeeSkillSchema>;
