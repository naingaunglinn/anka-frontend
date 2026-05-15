import { redirect } from 'next/navigation';

export default async function CrmStaffingRedirect({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/project-pipeline/${id}/staffing`);
}
