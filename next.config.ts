import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Points next-intl at our request-config module. Cookie-based locale, no
// `[locale]` route segment — keeps every existing route URL unchanged.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// ── Origin resolution ─────────────────────────────────────────────────────────
// Resolved at build time so the CSP string is a static per-deployment value.
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const apiUrl     = process.env.NEXT_PUBLIC_API_URL     ?? 'http://localhost:3001';

// ── Content-Security-Policy ───────────────────────────────────────────────────
// Decisions worth calling out:
//  • 'unsafe-inline' on script-src is required by Next.js App Router hydration
//    scripts. A strict nonce-based policy requires middleware — see SECURITY.md §2.
//  • 'unsafe-inline' on style-src is required by Tailwind CSS and Radix UI's
//    inline positioning styles used by popovers/tooltips.
//  • connect-src is the highest-value directive: prevents data exfiltration via
//    XHR/fetch/WebSocket to attacker-controlled origins.
//  • The Gemini API is called server-side only (app/api/ai-team-builder/route.ts),
//    so it does NOT appear in connect-src.
//  • frame-ancestors 'none' supersedes X-Frame-Options for modern browsers;
//    we include both for legacy IE coverage.
const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    ["connect-src 'self'", backendUrl, apiUrl].filter(Boolean).join(' '),
    // Allow images served by the backend (tenant logo lives at /storage/...
    // on the API host). Both 127.0.0.1 and localhost are listed because env
    // vars commonly mix these for the same backend, and they're distinct
    // origins from the CSP perspective.
    ["img-src 'self' data: blob:", backendUrl, apiUrl,
        'http://127.0.0.1:8000', 'http://localhost:8000']
        .filter(Boolean).join(' '),
    // next/font/google self-hosts fonts at build time — no external font origin needed.
    "font-src 'self' data:",
    // Contract PDF preview is fetched as a blob and mounted in an iframe.
    // Browsers treat the blob: URL as a distinct origin, so without these
    // directives the iframe is blocked even though we just created the blob.
    "frame-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
].join('; ');

const securityHeaders = [
    { key: 'Content-Security-Policy',   value: csp },
    // Belt-and-suspenders framing protection for legacy browsers
    { key: 'X-Frame-Options',           value: 'DENY' },
    // Prevent MIME-type sniffing (e.g. serving JSON that gets executed as JS)
    { key: 'X-Content-Type-Options',    value: 'nosniff' },
    // Send full URL on same-origin; origin only on cross-origin; nothing on downgrade
    { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
    // Disable hardware APIs this app never uses to shrink the supply-chain risk surface
    { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                // Apply to every route: pages, API routes, and static assets
                source: '/(.*)',
                headers: securityHeaders,
            },
        ];
    },
    async redirects() {
        return [
            // /project-pipeline/[id]/staffing is orphaned — staffing belongs to
            // the Task Assign menu now. Send bookmarks back to the deal detail.
            {
                source: '/project-pipeline/:id/staffing',
                destination: '/project-pipeline/:id',
                permanent: false,
            },
            // Legacy /crm/* routes renamed to /project-pipeline/* in chg-009 Phase D.
            // Permanent so old bookmarks/emails get cached redirects.
            { source: '/crm', destination: '/project-pipeline', permanent: true },
            { source: '/crm/:path*', destination: '/project-pipeline/:path*', permanent: true },
        ];
    },
};

export default withNextIntl(nextConfig);
