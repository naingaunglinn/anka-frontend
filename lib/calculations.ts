// Percentage-based overhead for deal/project estimation (markup on labor).
// For P&L monthly reporting, use globalOverheads absolute amounts filtered by period —
// see getFinancialPnL in businessStore.ts.
export function calculateOverhead(
    baseLaborCost: number,
    overheadPercentage: number
): number {
    return baseLaborCost * (overheadPercentage / 100);
}

export function calculateRiskBuffer(
    baseLaborCost: number,
    bufferPercentage: number
): number {
    return baseLaborCost * (bufferPercentage / 100);
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
