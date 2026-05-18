'use client';

import React from 'react';
import * as Flags from 'country-flag-icons/react/3x2';

type FlagProps = Readonly<{ className?: string; title?: string }>;

export function FlagIcon({ iso, className }: { iso: string; className?: string }) {
    const upperIso = iso.toUpperCase();
    const FlagComponent = (Flags as Record<string, React.ComponentType<FlagProps>>)[upperIso];

    if (!FlagComponent) {
        return (
            <svg viewBox="0 0 3 2" className={className}>
                <rect width="3" height="2" fill="#e2e8f0" rx="0.1" />
                <text x="1.5" y="1.1" textAnchor="middle" fontSize="0.7" fill="#64748b" fontWeight="600">
                    {upperIso}
                </text>
            </svg>
        );
    }

    return <FlagComponent className={className} title={upperIso} />;
}
