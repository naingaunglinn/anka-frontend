/**
 * Frontend feature flags. Backend code stays untouched — these only gate UI
 * surfaces so we can ship the contracts module without billing artifacts and
 * flip them back on later without code archaeology.
 *
 * To re-enable: set the flag to `true`. The /contracts list page brings back
 * its Milestones + Invoices tabs and invoice-derived columns; the detail page
 * brings back the Milestone Timeline, Invoice Ledger, KPI strip, and Money
 * Flow charts.
 */
export const MILESTONES_INVOICES_ENABLED = false;
