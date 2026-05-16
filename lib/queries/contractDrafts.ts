import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { dealKeys } from '@/lib/queries/deals';
import type { SuggestedTemplateVariant } from '@/types/business';

// ── Types (mirror anka-api Resources) ────────────────────────────────────────

/** Question shown in the wizard step 1 — Path C structured input. */
export interface WizardQuestion {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'time' | 'select' | 'multiselect';
    options?: string[];
    placeholder?: string;
    default?: string | number;
    help?: string;
    required?: boolean;
}

/** One section as defined on the template (the recipe). */
export interface TemplateSection {
    key: string;
    title: string;
    type: 'fixed' | 'slot_only' | 'ai_written' | 'ai_with_slots';
    fixed_text?: string;
    ai_prompt?: string;
    wizard_questions?: WizardQuestion[];
    output_format: 'paragraph' | 'bulleted_pair' | 'bulleted_simple' | 'table';
}

/** One section after rendering — what the editor + DOCX consume. */
export interface RenderedSection {
    key: string;
    title: string;
    type: TemplateSection['type'];
    output_format: TemplateSection['output_format'];
    rendered: string;
    has_todo: boolean;
    user_edited: boolean;
}

export interface ContractTemplate {
    id: string;
    tenant_id: string | null;
    is_global: boolean;
    name: string;
    slug: SuggestedTemplateVariant | string;
    umbrella: 'SES';
    version: number;
    sections?: TemplateSection[];   // only on detail endpoint
    section_count: number;
    is_active: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export type DraftStatus = 'draft' | 'sent_to_customer' | 'signed' | 'superseded';

export interface ContractDraftDealSummary {
    id: string;
    name: string;
    client: string;
    status: string;
    rank: 'C' | 'B' | 'A' | 'S' | 'Dropped';
}

export interface ContractDraftTemplateSummary {
    id: string;
    name: string;
    slug: string;
    umbrella: string;
}

export interface DealContractDraft {
    id: string;
    deal_id: string;
    template_id: string;
    template_version_at_generation: number;
    status: DraftStatus;
    version: number;
    wizard_inputs: Record<string, unknown>;
    ai_outputs?: Record<string, string>;  // only on detail
    sections: RenderedSection[];
    todo_count: number;
    generated_pdf_path: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    signed_at: string | null;
    signed_pdf_path: string | null;
    generated_by_user_id: string | null;
    finalized_by_user_id: string | null;
    deal?: ContractDraftDealSummary | null;
    template?: ContractDraftTemplateSummary | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface MarkSignedResponse {
    document: DealContractDraft;
    auto_won: boolean;
    contract: { id: string } | null;
}

// ── Query key factory ────────────────────────────────────────────────────────

export const contractDraftKeys = {
    all: ['contract-drafts'] as const,
    templates: () => [...contractDraftKeys.all, 'templates'] as const,
    templatesList: (umbrella?: string) =>
        [...contractDraftKeys.templates(), 'list', umbrella ?? 'all'] as const,
    template: (id: string) => [...contractDraftKeys.templates(), 'detail', id] as const,
    forDeal: (dealId: string) => [...contractDraftKeys.all, 'deal', dealId] as const,
    detail: (draftId: string) => [...contractDraftKeys.all, 'detail', draftId] as const,
};

// ── Templates ────────────────────────────────────────────────────────────────

export function useContractTemplates(umbrella: string = 'SES') {
    return useQuery<ContractTemplate[]>({
        queryKey: contractDraftKeys.templatesList(umbrella),
        queryFn: async () => {
            const { data: body } = await api.get('/contract-templates', { params: { umbrella } });
            return (body.data ?? []) as ContractTemplate[];
        },
        staleTime: 5 * 60_000,  // templates rarely change
    });
}

export function useContractTemplate(id: string) {
    return useQuery<ContractTemplate>({
        queryKey: contractDraftKeys.template(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/contract-templates/${id}`);
            return body.data as ContractTemplate;
        },
        enabled: !!id,
        staleTime: 5 * 60_000,
    });
}

// ── Drafts (per deal + by id) ────────────────────────────────────────────────

export function useContractDrafts(dealId: string) {
    return useQuery<DealContractDraft[]>({
        queryKey: contractDraftKeys.forDeal(dealId),
        queryFn: async () => {
            const { data: body } = await api.get(`/deals/${dealId}/contract-drafts`);
            return (body.data ?? []) as DealContractDraft[];
        },
        enabled: !!dealId,
        staleTime: 10_000,
    });
}

export function useContractDraft(id: string) {
    return useQuery<DealContractDraft>({
        queryKey: contractDraftKeys.detail(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/contract-drafts/${id}`);
            return body.data as DealContractDraft;
        },
        enabled: !!id,
        staleTime: 5_000,
    });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export interface GenerateDraftInput {
    dealId: string;
    template_id: string;
    wizard_inputs: Record<string, unknown>;
    /** Per-draft override of the Provider signatory; null/missing →
     *  PDF falls back to the tenant's default signatory at render time. */
    signatory_name_override?: string | null;
    signatory_title_override?: string | null;
}

/**
 * Start a new draft. Fires B → A on first successful Claude call so
 * we invalidate deal caches as well as draft caches.
 */
export function useGenerateDraft() {
    const queryClient = useQueryClient();
    return useMutation<DealContractDraft, Error, GenerateDraftInput>({
        mutationFn: async ({ dealId, template_id, wizard_inputs, signatory_name_override, signatory_title_override }) => {
            const { data: body } = await api.post(`/deals/${dealId}/contract-drafts`, {
                template_id,
                wizard_inputs,
                signatory_name_override,
                signatory_title_override,
            });
            return body.data as DealContractDraft;
        },
        onSettled: (data, _err, vars) => {
            queryClient.invalidateQueries({ queryKey: contractDraftKeys.forDeal(vars.dealId) });
            queryClient.invalidateQueries({ queryKey: dealKeys.detail(vars.dealId) });
            queryClient.invalidateQueries({ queryKey: dealKeys.lists() });
            if (data?.id) {
                queryClient.invalidateQueries({ queryKey: contractDraftKeys.detail(data.id) });
            }
        },
    });
}

export interface UpdateDraftSectionInput {
    draftId: string;
    sectionKey: string;
    content: string;
}

export function useUpdateDraftSection() {
    const queryClient = useQueryClient();
    return useMutation<DealContractDraft, Error, UpdateDraftSectionInput>({
        mutationFn: async ({ draftId, sectionKey, content }) => {
            const { data: body } = await api.patch(
                `/contract-drafts/${draftId}/sections/${sectionKey}`,
                { content },
            );
            return body.data as DealContractDraft;
        },
        onSettled: (data, _err, vars) => {
            queryClient.invalidateQueries({ queryKey: contractDraftKeys.detail(vars.draftId) });
            if (data?.deal_id) {
                queryClient.invalidateQueries({ queryKey: contractDraftKeys.forDeal(data.deal_id) });
            }
        },
    });
}

export interface RegenerateSectionInput {
    draftId: string;
    section_key: string;
    wizard_inputs?: Record<string, unknown>;
}

export function useRegenerateSection() {
    const queryClient = useQueryClient();
    return useMutation<DealContractDraft, Error, RegenerateSectionInput>({
        mutationFn: async ({ draftId, section_key, wizard_inputs }) => {
            const { data: body } = await api.post(
                `/contract-drafts/${draftId}/regenerate-section`,
                { section_key, wizard_inputs },
            );
            return body.data as DealContractDraft;
        },
        onSettled: (_data, _err, vars) => {
            queryClient.invalidateQueries({ queryKey: contractDraftKeys.detail(vars.draftId) });
        },
    });
}

export function useFinaliseDraft() {
    const queryClient = useQueryClient();
    return useMutation<DealContractDraft, Error, string>({
        mutationFn: async (draftId: string) => {
            const { data: body } = await api.post(`/contract-drafts/${draftId}/finalise`);
            return body.data as DealContractDraft;
        },
        onSettled: (_data, _err, draftId) => {
            queryClient.invalidateQueries({ queryKey: contractDraftKeys.detail(draftId) });
        },
    });
}

export interface SendDraftInput {
    draftId: string;
    to_email: string;
    message?: string;
}

export function useSendDraft() {
    const queryClient = useQueryClient();
    return useMutation<DealContractDraft, Error, SendDraftInput>({
        mutationFn: async ({ draftId, to_email, message }) => {
            const { data: body } = await api.post(`/contract-drafts/${draftId}/send`, {
                to_email,
                message,
            });
            return body.data as DealContractDraft;
        },
        onSettled: (data, _err, vars) => {
            queryClient.invalidateQueries({ queryKey: contractDraftKeys.detail(vars.draftId) });
            if (data?.deal_id) {
                queryClient.invalidateQueries({ queryKey: contractDraftKeys.forDeal(data.deal_id) });
            }
        },
    });
}

export interface VerifySignedInput {
    draftId: string;
    signedPdf: File;
}

export interface VerifySignedResult {
    match: boolean;
    signature: boolean;
    notes: string;
}

/**
 * AI-backed pre-check on the customer's returned PDF. Compares against
 * the original we sent and looks for a signature block. Read-only —
 * does not mutate the draft. The wizard uses the verdict to gate
 * mark-signed behind a passing check (with manual override).
 */
export function useVerifySignedDraft() {
    return useMutation<VerifySignedResult, Error, VerifySignedInput>({
        mutationFn: async ({ draftId, signedPdf }) => {
            const form = new FormData();
            form.append('signed_pdf', signedPdf);
            const { data: body } = await api.post(
                `/contract-drafts/${draftId}/verify-signed-pdf`,
                form,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );
            return body.data as VerifySignedResult;
        },
    });
}

export interface MarkSignedInput {
    draftId: string;
    signedPdf: File;
}

/**
 * Counter-signed PDF upload. Fires A → S via win_deal() — invalidate
 * deals + contracts + drafts so all downstream views update.
 */
export function useMarkSigned() {
    const queryClient = useQueryClient();
    return useMutation<MarkSignedResponse, Error, MarkSignedInput>({
        mutationFn: async ({ draftId, signedPdf }) => {
            const form = new FormData();
            form.append('signed_pdf', signedPdf);
            const { data: body } = await api.post(
                `/contract-drafts/${draftId}/mark-signed`,
                form,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );
            return body as MarkSignedResponse;
        },
        onSettled: (data, _err, vars) => {
            queryClient.invalidateQueries({ queryKey: contractDraftKeys.detail(vars.draftId) });
            if (data?.document.deal_id) {
                queryClient.invalidateQueries({ queryKey: contractDraftKeys.forDeal(data.document.deal_id) });
                queryClient.invalidateQueries({ queryKey: dealKeys.detail(data.document.deal_id) });
            }
            queryClient.invalidateQueries({ queryKey: dealKeys.lists() });
            queryClient.invalidateQueries({ queryKey: ['contracts'] });
        },
    });
}
