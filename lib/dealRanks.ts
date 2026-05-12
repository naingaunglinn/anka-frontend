import type { Deal } from '@/types/business';

export type DealStage = NonNullable<Deal['status']>;

/**
 * Rank labels shown on the Kanban board.
 *   lead        → C (initial contact)
 *   qualified   → B (Qualified + old Proposal merged)
 *   negotiation → A (contract-document upload gate lives here)
 *   won         → S (deal closed)
 *   lost        → D (deal lost)
 */
export const STAGE_RANK: Record<DealStage, string> = {
    lead:        'C',
    qualified:   'B',
    negotiation: 'A',
    won:         'S',
    lost:        'D',
};

export const STAGE_TITLE: Record<DealStage, string> = {
    lead:        'Lead',
    qualified:   'Qualified',
    negotiation: 'Negotiation',
    won:         'Won',
    lost:        'Lost',
};

export const STAGE_DESCRIPTION: Record<DealStage, string> = {
    lead:        'Initial contact',
    qualified:   'Qualified · Proposal sent',
    negotiation: 'Contract being settled',
    won:         'Contract approved · Booked',
    lost:        'No longer in play',
};

/** "B — Qualified" etc. */
export function stageDisplayLabel(stage: DealStage): string {
    return `${STAGE_RANK[stage]} — ${STAGE_TITLE[stage]}`;
}

/** Column order, left-to-right. Lost is terminal at the far right. */
export const STAGE_ORDER: DealStage[] = ['lead', 'qualified', 'negotiation', 'won', 'lost'];

/** Stage probability defaults — matches DealController stageProbabilities map. */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
    lead:        10,
    qualified:   40,
    negotiation: 75,
    won:         100,
    lost:        0,
};
