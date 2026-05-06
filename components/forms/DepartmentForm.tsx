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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DialogClose } from '@/components/ui/dialog';
import { Employee } from '@/types/business';
import { departmentSchema, type DepartmentFormValues } from '@/lib/schemas/organization.schema';

interface DepartmentFormProps {
    initialData?: DepartmentFormValues | null;
    employees?: Employee[];
    onSubmit: (data: DepartmentFormValues) => void | Promise<void>;
    onCancel?: () => void;
}

export function DepartmentForm({ initialData, employees = [], onSubmit, onCancel }: DepartmentFormProps) {
    const form = useForm<DepartmentFormValues>({
        resolver: zodResolver(departmentSchema) as any,
        defaultValues: initialData || {
            name:      '',
            managerId: undefined,
        },
    });

    const activeEmployees = employees.filter(e => e.status === 'Active');

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
                    name="managerId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Manager <span className="text-muted-foreground font-normal">(optional — assign after adding employees)</span></FormLabel>
                            <Select
                                onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                                defaultValue={field.value ?? 'none'}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Assign later" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="none">— Unassigned —</SelectItem>
                                    {activeEmployees.map(e => (
                                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
