// Single combined markup that replaces the previous separate Company Overhead +
// Risk Buffer percentages on /estimation. Business rule (2026-05): "all company
// overhead and risk buffer is 15% of labor used in this project". Project-level
// per-line overheads (deal_overheads) remain separate and are added on top.
export const LABOR_OVERHEAD_PERCENTAGE = 15;

/**
 * Multiplier that converts an employee's internal cost-per-hour to their
 * sell-price-per-hour. The 15% delta covers company overhead + risk buffer
 * — "we are selling people time" so the agency's per-hour quote already
 * includes those absorbed costs. Used by /organization (sell column on the
 * employee table) and /estimation (per-row rate + labor cost line).
 */
export const SELL_PRICE_MULTIPLIER = 1 + LABOR_OVERHEAD_PERCENTAGE / 100;

export function applySellMarkup(costPerHour: number): number {
    return costPerHour * SELL_PRICE_MULTIPLIER;
}

// Final client-billing multiplier applied on top of the loaded cost
// (raw salary/hour × 1.15). On /organization the employee "Sell / Hr"
// column is loaded_cost × 2, so the agency's quoted hourly rate already
// includes overhead AND the standard 2× markup.
export const BILLING_MARKUP_MULTIPLIER = 2;

export function applyBillingMarkup(loadedCostPerHour: number): number {
    return loadedCostPerHour * BILLING_MARKUP_MULTIPLIER;
}

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
