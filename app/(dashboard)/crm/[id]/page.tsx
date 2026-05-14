import { redirect } from 'next/navigation';

export default async function CrmDealRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/project-pipeline/${id}`);
}
