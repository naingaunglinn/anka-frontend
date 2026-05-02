'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';

const formSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
    const router = useRouter();
    const { login, isLoggingIn } = useAuth();

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const onSubmit = async (values: LoginFormValues) => {
        try {
            await login({ email: values.email, password: values.password });
            router.push('/dashboard');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string } } };
            form.setError('email', {
                message: axiosErr.response?.data?.message ?? 'Login failed. Check your credentials.',
            });
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px]" />

            <Card className="w-full max-w-md relative z-10 shadow-2xl border-white/20 bg-white/80 backdrop-blur-xl">
                <CardHeader className="space-y-1 items-center pb-6">
                    <div className="w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center mb-2 shadow-lg">
                        <LogIn className="w-6 h-6" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
                    <CardDescription className="text-center">
                        Enter your credentials to access the Anka SaaS Platform
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="name@example.com" {...field} className="h-11" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="••••••••" {...field} className="h-11" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full h-11 text-base shadow-sm" disabled={isLoggingIn}>
                                {isLoggingIn ? 'Signing in...' : 'Sign In'}
                            </Button>
                        </form>
                    </Form>

                    <div className="mt-6 text-center text-sm text-gray-500">
                        <p className="mb-1">Demo Credentials:</p>
                        <p>Admin: admin@example.com / 123456</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
