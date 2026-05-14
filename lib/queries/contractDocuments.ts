import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { dealKeys } from '@/lib/queries/deals';
import { contractKeys } from '@/lib/queries/contracts';

// ───────────────────────────────────────────────────────────────────────
// Rich AI-analysis verdict types (mirror app/Services/ContractAnalysisService.php)
// ───────────────────────────────────────────────────────────────────────

export type FieldStatus = 'present' | 'partial' | 'missing' | 'not_applicable';
export type FieldSeverity = 'critical' | 'required' | 'recommended';
export type PaymentPattern =
    | 'monthly_recurring'
    | 'milestone_based'
    | 'per_phase'
    | 'one_time'
    | 'unknown';

export interface FieldGrade {
    field: string;
    label: string;
    status: FieldStatus;
    severity: FieldSeverity;
    score: number;
    evidence: string | null;
    evidence_location: string | null;
    reasoning: string | null;
    suggested_fix: string | null;
}

export interface DisputeRisk {
    concern: string;
    severity: 'high' | 'medium' | 'low';
    clause_quote: string | null;
    suggested_remediation: string;
}

export type DealMatchCheck = 'present' | 'partial' | 'mismatch' | 'not_found' | 'within_5%' | 'within_25%' | 'large_gap' | 'unknown';

export interface DealMatch {
    is_match: boolean;
    confidence: number | null;
    deal_client: string | null;
    doc_parties: string[];
    checks: {
        client_name_match: DealMatchCheck;
        value_alignment: DealMatchCheck;
        project_name_match: DealMatchCheck;
        contact_match: DealMatchCheck;
    };
    discrepancies: string[];
    reasoning: string | null;
}

export interface VerdictDiff {
    improvements: string[];
    regressions: string[];
    still_missing: string[];
    previous_score: number;
    score_delta: number;
}

/**
 * The rich verdict shape Claude returns. All fields are optional on the type
 * because legacy / failed rows in the DB may not have populated them.
 */
export interface ContractDocumentAnalysis {
    // Rich-verdict fields (Claude path)
    approved?: boolean;
    overall_score?: number;
    detected_payment_pattern?: PaymentPattern;
    executive_summary?: string;
    field_grades?: FieldGrade[];
    critical_failures?: string[];
    dispute_risks?: DisputeRisk[];
    deal_match?: DealMatch;
    diff_vs_previous?: VerdictDiff | null;
    model?: string;
    note?: string;

    // Failure-path fields (text extraction failed before analysis ran)
    error?: string;
    suggestion?: string;
}

/** Lightweight deal summary embedded on a ContractDocument when fetched via
 * the tenant-wide list endpoint (drives the queue table's Deal column). */
export interface ContractDocumentDealSummary {
    id: string;
    name: string;
    client: string;
    status: string;
}

// Server-returned shape — kept snake_case to mirror the Laravel resource.
export interface ContractDocument {
    id: string;
    deal_id: string;
    uploaded_by: string | null;
    original_filename: string;
    mime_type: string;
    extension: 'pdf' | 'docx' | 'txt';
    size_bytes: number;
    analysis_status: 'pending' | 'analyzing' | 'approved' | 'rejected' | 'failed';
    analysis_result: ContractDocumentAnalysis | null;
    overall_score: number | null;
    detected_payment_pattern: PaymentPattern | null;
    previous_analysis: ContractDocumentAnalysis | null;
    /** Only present when fetched via the tenant-wide list endpoint
     * (DealContractDocumentResource conditionally exposes this when the
     * `deal` relation is eager-loaded). */
    deal?: ContractDocumentDealSummary | null;
    analyzed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface UploadResponse {
    document: ContractDocument;
    auto_won: boolean;
    deal?: unknown;
    contract?: { id: string } | null;
    project?: unknown;
}

export const contractDocumentKeys = {
    all: ['contract-documents'] as const,
    forDeal: (dealId: string) => [...contractDocumentKeys.all, 'deal', dealId] as const,
    list: (filters: ContractDocumentFilters) => [...contractDocumentKeys.all, 'list', filters] as const,
    detail: (id: string) => [...contractDocumentKeys.all, 'detail', id] as const,
};

export function useContractDocuments(dealId: string) {
    return useQuery<ContractDocument[]>({
        queryKey: contractDocumentKeys.forDeal(dealId),
        queryFn: async () => {
            const { data: body } = await api.get(`/deals/${dealId}/contract-documents`);
            return (body.data ?? []) as ContractDocument[];
        },
        enabled: !!dealId,
        staleTime: 10_000,
    });
}

// ───────────────────────────────────────────────────────────────────────
// Tenant-wide contract documents — feeds the /contract-reviews queue
// page. Server returns paginated data; the deal summary is joined.
// ───────────────────────────────────────────────────────────────────────

export type ContractDocumentStatusFilter =
    | 'all'
    | 'pending'
    | 'analyzing'
    | 'approved'
    | 'rejected'
    | 'failed';

export interface ContractDocumentFilters {
    status?: ContractDocumentStatusFilter;
    search?: string;
    perPage?: number;
}

export interface ContractDocumentListResult {
    data: ContractDocument[];
    meta?: {
        current_page?: number;
        last_page?: number;
        per_page?: number;
        total?: number;
    };
}

export function useAllContractDocuments(filters: ContractDocumentFilters = {}) {
    return useQuery<ContractDocumentListResult>({
        queryKey: contractDocumentKeys.list(filters),
        queryFn: async () => {
            const params: Record<string, string | number> = {};
            if (filters.status && filters.status !== 'all') params.status = filters.status;
            if (filters.search) params.search = filters.search;
            if (filters.perPage) params.per_page = filters.perPage;

            const { data: body } = await api.get('/contract-documents', { params });
            return {
                data: (body.data ?? []) as ContractDocument[],
                meta: body.meta,
            };
        },
        staleTime: 15_000,
    });
}

/** Single-document fetch for the deep-review page. Falls back to the cached
 *  list result if the doc is already in cache from the queue, else hits the
 *  show endpoint. */
export function useContractDocument(id: string) {
    return useQuery<ContractDocument>({
        queryKey: contractDocumentKeys.detail(id),
        queryFn: async () => {
            const { data: body } = await api.get(`/contract-documents/${id}`);
            return body.data as ContractDocument;
        },
        enabled: !!id,
        staleTime: 5_000,
    });
}

export function useContractDocumentMutations(dealId: string) {
    const queryClient = useQueryClient();

    const upload = useMutation<UploadResponse, Error, File>({
        mutationFn: async (file: File) => {
            const form = new FormData();
            form.append('file', file);
            const { data: body } = await api.post(
                `/deals/${dealId}/contract-documents`,
                form,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );
            return body as UploadResponse;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: contractDocumentKeys.forDeal(dealId) });
            queryClient.invalidateQueries({ queryKey: dealKeys.detail(dealId) });
            queryClient.invalidateQueries({ queryKey: dealKeys.lists() });
            queryClient.invalidateQueries({ queryKey: contractKeys.all });
        },
    });

    const remove = useMutation<void, Error, string>({
        mutationFn: async (documentId: string) => {
            await api.delete(`/contract-documents/${documentId}`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: contractDocumentKeys.forDeal(dealId) });
        },
    });

    return { upload, remove };
}
