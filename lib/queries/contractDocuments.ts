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
    diff_vs_previous?: VerdictDiff | null;
    model?: string;
    note?: string;

    // Failure-path fields (text extraction failed before analysis ran)
    error?: string;
    suggestion?: string;
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
