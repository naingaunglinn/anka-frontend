import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { dealKeys } from '@/lib/queries/deals';
import { contractKeys } from '@/lib/queries/contracts';

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
    analyzed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface ContractDocumentAnalysis {
    approved?: boolean;
    missing_fields?: string[];
    reasoning?: string;
    required_fields?: string[];
    model?: string;
    error?: string;
    suggestion?: string;
    note?: string;
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
