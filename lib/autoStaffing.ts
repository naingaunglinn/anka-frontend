import type { Employee, GhostRole, HardAssignment, Deal } from '@/types/business';
import { CURRENCY_CONFIG, type Currency } from '@/lib/currencyConfig';

export interface AutoStaffOptions {
    timelineMonths: number
    deals: Deal[]
    currentDealId: string
    requiredSkills?: string[]
    currency?: Currency
}

function getEmployeeMonthlyLoad(employeeId: string, deals: Deal[], excludeDealId: string): number {
    let monthly = 0;
    for (const d of deals) {
        if (d.id === excludeDealId || d.status === 'lost') continue;
        const a = d.hardAssignments?.find(x => x.employeeId === employeeId);
        if (a) monthly += a.allocatedHours / Math.max(1, d.timelineMonths || 1);
    }
    return monthly;
}

function skillMatchScore(emp: Employee, requiredSkills: string[]): number {
    if (!requiredSkills.length) return 0;
    const empSkills = (emp.skills ?? []).map(s => (s.name ?? '').toLowerCase());
    return requiredSkills.filter(rs => empSkills.includes(rs.toLowerCase())).length;
}

function isSenior(emp: Employee): boolean {
    const title = (emp.roleName ?? emp.role ?? '').toLowerCase();
    return /lead|senior|head|principal|manager|master/.test(title);
}

/**
 * Automatically match employees to ghost roles.
 *
 * Sorting priority per role group:
 *   1. Skill match score (more required skills covered → first)
 *   2. Available monthly capacity after other deals (more free → first)
 *   3. Seniority (seniors first — they can handle more complex work)
 *   4. Salary proximity to ghost role midpoint (closest → first)
 */
export function autoStaffFromGhostRoles(
    ghostRoles: Array<Omit<GhostRole, 'id'> & { id?: string }>,
    employees: Employee[],
    existingAssignments: HardAssignment[],
    options: AutoStaffOptions,
): { assignments: HardAssignment[]; warnings: string[] } {
    const { timelineMonths, deals, currentDealId, requiredSkills = [], currency } = options;
    const months = Math.max(1, timelineMonths || 1);
    const sym = currency ? (CURRENCY_CONFIG[currency]?.symbol ?? '') : '';

    const assignments: HardAssignment[] = [...existingAssignments];
    const warnings: string[] = [];

    for (const gr of ghostRoles) {
        const alreadyAssigned = assignments.filter(a => {
            const emp = employees.find(e => e.id === a.employeeId);
            return emp?.capacityRole === gr.roleType;
        });

        const needed = gr.quantity - alreadyAssigned.length;
        if (needed <= 0) continue;

        const allocationFraction = (gr.months || 100) / 100;
        const salaryMid = (gr.minMonthlySalary + gr.maxMonthlySalary) / 2;

        const candidates = employees
            .filter(e =>
                e.status === 'Active' &&
                e.capacityRole === gr.roleType &&
                e.monthlySalary >= gr.minMonthlySalary &&
                e.monthlySalary <= gr.maxMonthlySalary &&
                !assignments.some(a => a.employeeId === e.id),
            )
            .map(e => {
                const otherMonthly = getEmployeeMonthlyLoad(e.id, deals, currentDealId);
                const availableMonthly = Math.max(0, (e.workableHours ?? 0) - otherMonthly);
                return { emp: e, availableMonthly, score: skillMatchScore(e, requiredSkills) };
            })
            // Only include employees who have capacity for at least some of the allocation
            .filter(({ availableMonthly }) => availableMonthly > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.availableMonthly !== a.availableMonthly) return b.availableMonthly - a.availableMonthly;
                const seniorA = isSenior(a.emp) ? 0 : 1;
                const seniorB = isSenior(b.emp) ? 0 : 1;
                if (seniorA !== seniorB) return seniorA - seniorB;
                return Math.abs(a.emp.monthlySalary - salaryMid) - Math.abs(b.emp.monthlySalary - salaryMid);
            });

        if (candidates.length < needed) {
            warnings.push(
                `Need ${needed} ${gr.roleType}(s) (${sym}${gr.minMonthlySalary.toLocaleString()}–${sym}${gr.maxMonthlySalary.toLocaleString()}), only ${candidates.length} available with capacity.`,
            );
        }

        for (const { emp, availableMonthly } of candidates.slice(0, needed)) {
            // Allocate the requested fraction of their capacity, capped at their actual free hours.
            const requestedMonthly = (emp.workableHours ?? 0) * allocationFraction;
            const allocatedMonthly = Math.min(requestedMonthly, availableMonthly);
            const allocatedHours = Math.round(allocatedMonthly * months);

            assignments.push({ employeeId: emp.id, allocatedHours });

            if (allocatedMonthly < requestedMonthly) {
                warnings.push(
                    `${emp.name} allocated ${allocatedHours}h (reduced from ${Math.round(requestedMonthly * months)}h — partially booked on other deals).`,
                );
            }
        }
    }

    return { assignments, warnings };
}
