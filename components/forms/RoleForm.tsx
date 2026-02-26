'use client';

import * as z from 'zod';
import { useForm } from 'react-hook-form';
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

const roleSchema = z.object({
    title: z.string().min(2, "Title must be at least 2 characters."),
    department: z.string().min(2, "Department must be at least 2 characters."),
    rate: z.coerce.number().min(0, "Bill rate must be positive."),
});

export type RoleFormValues = z.infer<typeof roleSchema>;

interface RoleFormProps {
    initialData?: RoleFormValues | null;
    onSubmit: (data: RoleFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function RoleForm({ initialData, onSubmit, onCancel }: RoleFormProps) {
    const form = useForm<RoleFormValues>({
        resolver: zodResolver(roleSchema) as any,
        defaultValues: initialData || {
            title: '',
            department: '',
            rate: 0,
        },
    });

    const handleSubmit = async (data: RoleFormValues) => {
        await onSubmit(data);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role Title</FormLabel>
                            <FormControl>
                                <Input placeholder="Senior Developer" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Department</FormLabel>
                            <FormControl>
                                <Input placeholder="Engineering" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="rate"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Standard Bill Rate ($/hr)</FormLabel>
                            <FormControl>
                                <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end gap-2 pt-4">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Cancel
                            </Button>
                        </DialogClose>
                    )}
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Saving..." : "Save Role"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
