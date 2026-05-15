import { redirect } from 'next/navigation';

export default async function CrmEditRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/project-pipeline/edit/${id}`);
}
