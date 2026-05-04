'use client';

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
import { departmentSchema, type DepartmentFormValues } from '@/lib/schemas/organization.schema';

interface DepartmentFormProps {
    initialData?: DepartmentFormValues | null;
    onSubmit: (data: DepartmentFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function DepartmentForm({ initialData, onSubmit, onCancel }: DepartmentFormProps) {
    const form = useForm<DepartmentFormValues>({
        resolver: zodResolver(departmentSchema) as any,
        defaultValues: initialData || {
            name: '',
            manager: '',
            headcount: 0,
        },
    });

    const handleSubmit = async (data: DepartmentFormValues) => {
        await onSubmit(data);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Department Name</FormLabel>
                            <FormControl>
                                <Input placeholder="Engineering" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="manager"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Manager</FormLabel>
                            <FormControl>
                                <Input placeholder="Manager Name" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="headcount"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Headcount</FormLabel>
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
                        {form.formState.isSubmitting ? "Saving..." : "Save Department"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
