'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { ArrowRight, PhoneCall, ShieldCheck, UserPlus } from 'lucide-react';

import api from '@/lib/axios';
import { registerSchema, type RegisterFormValues } from '@/lib/schemas/auth.schema';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PHONE_COUNTRIES } from '@/lib/phoneCountries';
import { FlagIcon } from '@/components/FlagIcon';

export default function RegisterPage() {
    const t = useTranslations();
    const router = useRouter();
    const [serverMessage, setServerMessage] = useState<string | null>(null);
    const [countryIso, setCountryIso] = useState('US');
    const [phoneLocal, setPhoneLocal] = useState('');

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        mode: 'onBlur',
        defaultValues: {
            email: '',
            phoneNumber: '',
            password: '',
        },
    });

    const onSubmit = async (values: RegisterFormValues) => {
        setServerMessage(null);
        try {
            await api.post('/auth/register', {
                email: values.email,
                phone_number: values.phoneNumber,
                password: values.password,
            });
            router.push('/login');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string } } };
            setServerMessage(axiosErr.response?.data?.message ?? t('sign_up_failed'));
        }
    };

    const selectedCountry = PHONE_COUNTRIES.find((c) => c.iso === countryIso) ?? PHONE_COUNTRIES[0];
    const syncPhoneNumber = (iso: string, localInput: string) => {
        const country = PHONE_COUNTRIES.find((c) => c.iso === iso) ?? PHONE_COUNTRIES[0];
        const digitsOnly = localInput.replace(/\D/g, '');
        form.setValue('phoneNumber', `${country.dial}${digitsOnly}`, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
        });
    };

    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--color-bg-page)] text-[var(--color-text-default)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(0,167,244,0.24),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.22),transparent_34%),radial-gradient(circle_at_75%_85%,rgba(2,132,199,0.18),transparent_36%)]" />

            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-10 md:px-10 lg:grid-cols-2">
                <section>
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-brand-500)]/30 bg-white px-4 py-2 shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-[var(--color-brand-500)]" />
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-500)]">ANKA</span>
                    </div>

                    <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                        {t('create_your')}
                        <span className="block text-[var(--color-brand-500)]">{t('gross_profit_workspace')}</span>
                    </h1>

                    <p className="mt-5 max-w-xl text-base leading-7 text-[var(--color-text-default)]/75 md:text-lg">
                        {t('register_subtitle')}
                    </p>

                    <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
                        <article className="rounded-xl border border-[var(--color-brand-500)]/25 bg-white/90 p-3 shadow-sm">
                            <UserPlus className="mb-2 h-4 w-4 text-[var(--color-brand-500)]" />
                            <p className="text-xs font-semibold">{t('fast_signup')}</p>
                        </article>
                        <article className="rounded-xl border border-[var(--color-brand-500)]/25 bg-white/90 p-3 shadow-sm">
                            <PhoneCall className="mb-2 h-4 w-4 text-[var(--color-brand-500)]" />
                            <p className="text-xs font-semibold">{t('intl_phone_ready')}</p>
                        </article>
                        <article className="rounded-xl border border-[var(--color-brand-500)]/25 bg-white/90 p-3 shadow-sm">
                            <ShieldCheck className="mb-2 h-4 w-4 text-[var(--color-brand-500)]" />
                            <p className="text-xs font-semibold">{t('secure_access')}</p>
                        </article>
                    </div>
                </section>

                <section>
                    <Card className="mx-auto w-full max-w-md border-[var(--color-brand-500)]/20 bg-white/92 shadow-[var(--shadow-xl)] backdrop-blur-sm">
                        <CardHeader className="space-y-2 pb-5">
                            <CardTitle className="text-2xl font-bold">{t('sign_up')}</CardTitle>
                            <CardDescription className="text-[var(--color-text-default)]/65">
                                {t('create_free_account')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[var(--color-text-default)]/90">{t('email')}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder={t('placeholder_email_co')}
                                                        {...field}
                                                        className="h-11 border-[var(--color-text-default)]/20 bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/30"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="phoneNumber"
                                        render={() => (
                                            <FormItem>
                                                <FormLabel className="text-[var(--color-text-default)]/90">{t('phone_number_intl')}</FormLabel>
                                                <div className="grid grid-cols-[110px_1fr] gap-2">
                                                    <Select
                                                        value={countryIso}
                                                        onValueChange={(nextIso) => {
                                                            setCountryIso(nextIso);
                                                            syncPhoneNumber(nextIso, phoneLocal);
                                                        }}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 w-full border-[var(--color-text-default)]/20 bg-white focus:ring-2 focus:ring-[var(--color-brand-500)]/30">
                                                                <div className="flex items-center gap-2">
                                                                    <FlagIcon iso={selectedCountry.iso} className="h-3.5 w-5 shrink-0 rounded-sm" />
                                                                    <SelectValue>{selectedCountry.dial}</SelectValue>
                                                                </div>
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {PHONE_COUNTRIES.map((country) => (
                                                                <SelectItem key={country.iso} value={country.iso}>
                                                                    <div className="flex items-center gap-2">
                                                                        <FlagIcon iso={country.iso} className="h-3.5 w-5 shrink-0 rounded-sm" />
                                                                        <span>{country.label} {country.dial}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>

                                                    <Input
                                                        placeholder={t('placeholder_phone')}
                                                        value={phoneLocal}
                                                        onChange={(event) => {
                                                            const nextLocal = event.target.value;
                                                            setPhoneLocal(nextLocal);
                                                            syncPhoneNumber(countryIso, nextLocal);
                                                        }}
                                                        className="h-11 w-full border-[var(--color-text-default)]/20 bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/30"
                                                    />
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[var(--color-text-default)]/90">{t('password')}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        placeholder={t('at_least_8_characters')}
                                                        {...field}
                                                        className="h-11 border-[var(--color-text-default)]/20 bg-white focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]/30"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {serverMessage && (
                                        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                            {serverMessage}
                                        </p>
                                    )}

                                    <Button
                                        type="submit"
                                        variant="primary"
                                        className="h-11 w-full text-base font-semibold"
                                        disabled={form.formState.isSubmitting}
                                    >
                                        {form.formState.isSubmitting ? t('creating_account') : t('sign_up')}
                                        {!form.formState.isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
                                    </Button>
                                </form>
                            </Form>

                            <p className="mt-5 text-center text-sm text-[var(--color-text-default)]/70">
                                {t('already_have_account')}{' '}
                                <Link href="/login" className="font-semibold text-[var(--color-brand-500)] hover:underline">
                                    {t('sign_in_link')}
                                </Link>
                            </p>
                            <p className="mt-3 text-center text-sm text-[var(--color-text-default)]/70">
                                <Link href="/" className="font-semibold text-[var(--color-brand-500)] hover:underline">
                                    {t('back_to_home')}
                                </Link>
                            </p>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </main>
    );
}
