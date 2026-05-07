'use client';

import { ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PermissionGuardProps {
    permission: string;
    children: ReactNode;
    // Optional override for the tooltip message shown when access is denied.
    deniedMessage?: string;
}

/**
 * Wraps any interactive element with RBAC enforcement.
 *
 * When the user lacks the required permission the child element is rendered
 * with pointer-events and opacity reduced (visually disabled), and a tooltip
 * explains why. The element is NEVER hidden — hiding creates ambiguity about
 * whether the feature exists at all.
 *
 * Example:
 *   <PermissionGuard permission="manage_crm">
 *     <Button onClick={handleDelete}>Delete Deal</Button>
 *   </PermissionGuard>
 */
export function PermissionGuard({ permission, children, deniedMessage }: PermissionGuardProps) {
    const { allowed, reason } = usePermission(permission);

    if (allowed) {
        return <>{children}</>;
    }

    return (
        <Tooltip>
            {/*
             * asChild passes the trigger props to the child element so the
             * tooltip anchor sits directly on the disabled control, not a wrapper div.
             * The wrapper span is necessary because disabled buttons don't fire
             * pointer events — the span receives them so the tooltip can appear.
             */}
            <TooltipTrigger asChild>
                <span
                    className="inline-flex cursor-not-allowed"
                    // aria-disabled communicates the disabled state to assistive technology
                    // while keeping the element in the DOM and focusable for screen readers.
                    aria-disabled="true"
                >
                    <span className="pointer-events-none opacity-50">
                        {children}
                    </span>
                </span>
            </TooltipTrigger>
            <TooltipContent>
                {deniedMessage ?? reason}
            </TooltipContent>
        </Tooltip>
    );
}
