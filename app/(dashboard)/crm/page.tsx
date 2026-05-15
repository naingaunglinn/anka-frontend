import { redirect } from 'next/navigation';

/**
 * Backward-compat redirect. The menu was renamed CRM → Project Pipeline
 * in chg-009 Phase D (2026-05-15). Bookmarked URLs survive for one
 * release cycle. Delete after the release notes go out.
 */
export default function CrmRedirect() {
    redirect('/project-pipeline');
}
