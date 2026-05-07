import type { Employee, GhostRole, HardAssignment } from '@/types/business';

/**
 * Automatically match employees to ghost roles based on capacity role and salary range.
 * For each ghost role, finds up to `quantity` active employees whose capacityRole
 * matches the ghost role's roleType and whose monthlySalary falls within the range.
 * Allocated hours = employee.workableHours × ghostRole.months.
 */
export function autoStaffFromGhostRoles(
    ghostRoles: Array<Omit<GhostRole, 'id'> & { id?: string }>,
    employees: Employee[],
    existingAssignments: HardAssignment[] = []
): { assignments: HardAssignment[]; warnings: string[] } {
    const assignments: HardAssignment[] = [...existingAssignments];
    const warnings: string[] = [];

    for (const gr of ghostRoles) {
        const alreadyAssigned = assignments.filter(a => {
            const emp = employees.find(e => e.id === a.employeeId);
            return emp?.capacityRole === gr.roleType;
        });

        const needed = gr.quantity - alreadyAssigned.length;
        if (needed <= 0) continue;

        const matches = employees
            .filter(e =>
                e.status === 'Active' &&
                e.capacityRole === gr.roleType &&
                e.monthlySalary >= gr.minMonthlySalary &&
                e.monthlySalary <= gr.maxMonthlySalary &&
                !assignments.some(a => a.employeeId === e.id)
            )
            .sort((a, b) => {
                // Prefer employees whose salary is closest to the range midpoint
                const mid = (gr.minMonthlySalary + gr.maxMonthlySalary) / 2;
                return Math.abs(a.monthlySalary - mid) - Math.abs(b.monthlySalary - mid);
            });

        if (matches.length < needed) {
            warnings.push(
                `Need ${needed} more ${gr.roleType}(s) within $${gr.minMonthlySalary.toLocaleString()}–$${gr.maxMonthlySalary.toLocaleString()}, but only ${matches.length} found.`
            );
        }

        const selected = matches.slice(0, needed);
        for (const emp of selected) {
            assignments.push({
                employeeId: emp.id,
                allocatedHours: emp.workableHours * gr.months,
            });
        }
    }

    return { assignments, warnings };
}
