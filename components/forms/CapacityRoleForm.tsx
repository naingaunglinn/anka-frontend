'use client';

import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DialogClose } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { capacityRoleSchema, type CapacityRoleFormValues } from '@/lib/schemas/organization.schema';
import type { CapacityRole } from '@/types/business';

interface CapacityRoleFormProps {
    initialData?: CapacityRole | null;
    onSubmit: (data: CapacityRoleFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function CapacityRoleForm({ initialData, onSubmit, onCancel }: CapacityRoleFormProps) {
    const form = useForm<CapacityRoleFormValues>({
        resolver: zodResolver(capacityRoleSchema),
        mode: 'onBlur',
        defaultValues: {
            name: initialData?.name ?? '',
            code: initialData?.code ?? '',
        },
    });

    async function handleSubmit(data: CapacityRoleFormValues) {
        await onSubmit(data);
    }

    function onFormError(errors: FieldErrors<CapacityRoleFormValues>) {
        const firstKey = Object.keys(errors)[0];
        const el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus?.();
    }

    const errorCount = Object.keys(form.formState.errors).length;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, onFormError)} className="space-y-4">
                {form.formState.isSubmitted && errorCount > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Please fix the highlighted fields before saving.</span>
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role Name <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. Frontend Developer" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Code <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. frontend" {...field} />
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground mt-1">
                                Lowercase letters, numbers, hyphens and underscores only.
                            </p>
                        </FormItem>
                    )}
                />
                <div className="flex justify-end gap-2 pt-2">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? 'Saving...' : 'Save Role Type'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}