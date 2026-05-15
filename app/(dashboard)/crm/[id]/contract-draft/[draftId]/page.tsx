import { redirect } from 'next/navigation';

export default async function CrmContractDraftDetailRedirect({
    params,
}: {
    params: Promise<{ id: string; draftId: string }>;
}) {
    const { id, draftId } = await params;
    redirect(`/project-pipeline/${id}/contract-draft/${draftId}`);
}
