import type { Deal } from '@/types/business';

/**
 * Active pipeline stages — the 4 statuses a deal moves through forward-only.
 * 'lost' is a legacy value that may still appear on old rows during the
 * Phase B → Phase B-breaking migration window; the Kanban filters it out.
 */
export type DealStage = 'lead' | 'qualified' | 'negotiation' | 'won';

/** Every value the backend may return for `deal.status`. */
export type DealStatusValue = NonNullable<Deal['status']>;

/**
 * Rank labels per the manager's "System Flow — ANKA" spec (2026-05-14):
 *   lead        → C (initial contact / nego start)
 *   qualified   → B (estimation in progress, deal still iterating)
 *   negotiation → A (contract drafting started — fields lock)
 *   won         → S (contract signed)
 *
 * The legacy 'lost' status is replaced by Dropped (orthogonal lifecycleStatus
 * flag). Existing 'lost' rows are still readable; new code must not write it.
 */
export const STAGE_RANK: Record<DealStage, 'C' | 'B' | 'A' | 'S'> = {
    lead:        'C',
    qualified:   'B',
    negotiation: 'A',
    won:         'S',
};

export const STAGE_TITLE: Record<DealStage, string> = {
    lead:        'Lead',
    qualified:   'Qualified',
    negotiation: 'Negotiation',
    won:         'Won',
};

export const STAGE_DESCRIPTION: Record<DealStage, string> = {
    lead:        'Initial contact',
    qualified:   'Estimation in progress',
    negotiation: 'Contract being drafted',
    won:         'Contract signed · Booked',
};

/** "B — Qualified" etc. */
export function stageDisplayLabel(stage: DealStage): string {
    return `${STAGE_RANK[stage]} — ${STAGE_TITLE[stage]}`;
}

/** Column order on the Kanban, left-to-right. 4 columns now (D removed). */
export const STAGE_ORDER: DealStage[] = ['lead', 'qualified', 'negotiation', 'won'];

/**
 * Probability weights used by the Forecast module (⑧).
 * Per the manager's spec: C=30, B=50, A=80, S=100.
 */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
    lead:        30,
    qualified:   50,
    negotiation: 80,
    won:         100,
};

/**
 * Stages where a deal's terms are locked (no edits allowed).
 * Once contract drafting fires (A) or contract is signed (S), the
 * estimation handoff fields and customer requirements are frozen.
 * To change scope, drop this deal and start a new one.
 */
export const LOCKED_STAGES: ReadonlyArray<DealStage> = ['negotiation', 'won'];

export function isLockedStage(status: DealStatusValue | undefined): boolean {
    if (!status) return false;
    return (LOCKED_STAGES as ReadonlyArray<string>).includes(status);
}

/** Stages from which a deal can be dropped. S deals cannot be dropped. */
export const DROPPABLE_STAGES: ReadonlyArray<DealStage> = ['lead', 'qualified', 'negotiation'];

export function canDropDeal(deal: Pick<Deal, 'status' | 'lifecycleStatus'>): boolean {
    if (deal.lifecycleStatus === 'dropped') return false;
    if (!deal.status) return false;
    return (DROPPABLE_STAGES as ReadonlyArray<string>).includes(deal.status);
}

/**
 * Resolves the rank shown on a deal card. Returns 'Dropped' when the deal
 * has been dropped — caller can render a different badge style. The backend
 * computes the same value via Deal::getRankAttribute().
 */
export function dealRank(deal: Pick<Deal, 'status' | 'lifecycleStatus'>): 'C' | 'B' | 'A' | 'S' | 'Dropped' {
    if (deal.lifecycleStatus === 'dropped') return 'Dropped';
    if (!deal.status || deal.status === 'lost') return 'C';
    return STAGE_RANK[deal.status] ?? 'C';
}

/**
 * Returns true when the deal has all the Estimation handoff fields needed
 * for contract drafting. Mirrors Deal::isContractEligible() on the backend.
 *
 * Rank A (negotiation) is the contract-drafting stage. The B→A flip is
 * fired by the backend the moment Estimation completes the handoff, so
 * by the time we reach A all the final_* fields are guaranteed present —
 * but we re-check them defensively in case of stale frontend state.
 */
export function isContractEligible(deal: Deal): boolean {
    return (
        deal.status === 'negotiation' &&
        deal.lifecycleStatus !== 'dropped' &&
        deal.finalMonthlyFee != null &&
        deal.finalContractMonths != null &&
        !!deal.finalTeamSummary &&
        !!deal.finalCurrency &&
        !!deal.finalConfirmedAt
    );
}

/**
 * Light per-rank colour palette. Used by the Kanban column header chip,
 * the per-card left-border accent, and the rank chip in the card header.
 * Keep these in sync with STAGE_CONFIG in the deal detail page.
 *
 *   bg     — light wash for the chip background
 *   text   — readable text on the wash
 *   border — accent for the card's left border (slightly stronger than bg)
 */
export const STAGE_COLORS: Record<DealStage, { bg: string; text: string; border: string }> = {
    lead:        { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-l-slate-300' },
    qualified:   { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-l-blue-300' },
    negotiation: { bg: 'bg-purple-50',   text: 'text-purple-700',  border: 'border-l-purple-300' },
    won:         { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-l-emerald-300' },
};

/** Light palette for dropped deals — neutral grey regardless of last-known stage. */
export const DROPPED_COLORS = { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-l-slate-200' };
