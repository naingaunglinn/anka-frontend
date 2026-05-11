/**
 * Whole-word skill extraction.
 *
 * Returns the subset of `catalog` whose names appear in `text` as a whole
 * word (case-insensitive). Whole-word match avoids false positives like
 * "Java" matching "JavaScript" or "Go" matching "Google".
 *
 * Shared by `AITeamBuilder.tsx`, the Auto-Staff button in
 * `crm/edit/[id]/page.tsx`, and the staffing-page sidebar in
 * `crm/[id]/staffing/page.tsx`. Keep these in lockstep — a substring impl
 * (the previous staffing-page approach) silently changes which skills are
 * flagged as "covered" vs "gap" and confuses users navigating between views.
 */
export function extractRequiredSkills(text: string, catalog: string[]): string[] {
    if (!text || catalog.length === 0) return [];
    return catalog.filter(skill => {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
    });
}
