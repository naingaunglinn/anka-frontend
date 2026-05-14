import { redirect } from 'next/navigation';

export default async function CrmContractDraftNewRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/project-pipeline/${id}/contract-draft/new`);
}
