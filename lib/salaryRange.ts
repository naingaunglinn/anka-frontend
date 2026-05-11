import type { Employee } from '@/types/business'

type SalaryRange = { min: number; max: number }

/** Return the min/max monthly salary among active employees with the given capacity role. */
export function getSalaryRange(roleType: string, employees: Employee[]): SalaryRange | null {
    const matches = employees.filter(e => e.status === 'Active' && e.capacityRole === roleType)
    if (matches.length === 0) return null

    const salaries = matches.map(e => e.monthlySalary)
    return {
        min: Math.min(...salaries),
        max: Math.max(...salaries),
    }
}

/** Suggested salary range (±30 % of the midpoint of actual employee salaries). */
export function getSuggestedSalaryRange(roleType: string, employees: Employee[]): SalaryRange {
    const actual = getSalaryRange(roleType, employees)
    if (!actual) return { min: 0, max: 0 }

    const midpoint = (actual.min + actual.max) / 2
    const spread = midpoint * 0.3 // ±30 % spread

    return {
        min: Math.max(0, Math.round(midpoint - spread)),
        max: Math.round(midpoint + spread),
    }
}
