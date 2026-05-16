// Single combined markup that replaces the previous separate Company Overhead +
// Risk Buffer percentages on /estimation. Business rule (2026-05): "all company
// overhead and risk buffer is 15% of labor used in this project". Project-level
// per-line overheads (deal_overheads) remain separate and are added on top.
export const LABOR_OVERHEAD_PERCENTAGE = 15;

export function calculateLaborOverhead(
    baseLaborCost: number,
    pct: number = LABOR_OVERHEAD_PERCENTAGE,
): number {
    return baseLaborCost * (pct / 100);
}

// Percentage-based overhead for deal/project estimation (markup on labor).
// For P&L monthly reporting, use globalOverheads absolute amounts filtered by period —
// see getFinancialPnL in businessStore.ts.
//
// Retained for non-/estimation surfaces (CRM AI Team Builder roll-up,
// EstimationRoleBuilder card preview) that still expose the legacy two-line
// format. Remove once those are migrated to LABOR_OVERHEAD_PERCENTAGE.
export function calculateOverhead(
    baseLaborCost: number,
    overheadPercentage: number
): number {
    return baseLaborCost * (overheadPercentage / 100);
}

export function calculateRiskBuffer(
    baseLaborCost: number,
    overheadCost: number,
    bufferPercentage: number
): number {
    return (baseLaborCost + overheadCost) * (bufferPercentage / 100);
}

export function calculateSoftBookedHours(
    totalRequiredHours: number,
    probability: number
): number {
    return totalRequiredHours * (probability / 100);
}

export function calculateTotalEstimatedCost(
    baseLaborCost: number,
    overheadCost: number,
    bufferCost: number
): number {
    return baseLaborCost + overheadCost + bufferCost;
}

export function calculateEstimatedGrossProfit(
    clientBudget: number,
    totalEstimatedCost: number
): number {
    return clientBudget - totalEstimatedCost;
}
