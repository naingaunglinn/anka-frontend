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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { DialogClose } from '@/components/ui/dialog';

const employeeSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    role: z.string().min(1, "Please select a role."),
    monthlySalary: z.coerce.number().min(0, "Salary must be positive."),
    workableHours: z.coerce.number().min(1, "Must be greater than 0."),
    status: z.string().min(1, "Please select status."),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
    initialData?: EmployeeFormValues | null;
    onSubmit: (data: EmployeeFormValues) => void;
    onCancel?: () => void;
}

export function EmployeeForm({ initialData, onSubmit, onCancel }: EmployeeFormProps) {
    const form = useForm<EmployeeFormValues>({
        resolver: zodResolver(employeeSchema) as any,
        defaultValues: initialData || {
            name: '',
            role: '',
            monthlySalary: 0,
            workableHours: 160,
            status: 'Active',
        },
    });

    const handleSubmit = (data: EmployeeFormValues) => {
        onSubmit(data);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                                <Input placeholder="John Doe" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Developer">Developer</SelectItem>
                                    <SelectItem value="Designer">Designer</SelectItem>
                                    <SelectItem value="Project Manager">Project Manager</SelectItem>
                                    <SelectItem value="QA">QA</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="monthlySalary"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Monthly Salary ($)</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="workableHours"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Workable Hours/Mo</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="On Leave">On Leave</SelectItem>
                                    <SelectItem value="Terminated">Terminated</SelectItem>
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
                    <Button type="submit">Save Employee</Button>
                </div>
            </form>
        </Form>
    );
}
