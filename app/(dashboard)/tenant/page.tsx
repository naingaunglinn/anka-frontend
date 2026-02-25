import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Building2, Clock, CreditCard } from 'lucide-react';

export default function TenantSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Tenant Settings</h2>
                <p className="text-muted-foreground mt-1">This module is currently under development.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-slate-500" />
                                Organization Profile
                            </CardTitle>
                            <CardDescription>Manage your company's core details.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="orgName">Organization Name</Label>
                                <Input id="orgName" defaultValue="Agency Digital Twin" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subdomain">Tenant Subdomain</Label>
                                <div className="flex items-center">
                                    <Input id="subdomain" defaultValue="agency-dt" className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0" />
                                    <div className="bg-slate-100 border border-l-0 px-3 h-10 rounded-r-md flex items-center text-sm text-slate-500">.truemargin.app</div>
                                </div>
                            </div>
                            <Button className="w-full mt-2 gap-2"><Save className="w-4 h-4" /> Save Profile</Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Clock className="w-5 h-5 text-slate-500" />
                                Operational Defaults
                            </CardTitle>
                            <CardDescription>Configure standard working hours and capacity parameters.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Default Working Hours per Month</Label>
                                    <Input type="number" defaultValue="160" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Standard Billable Utilization Target</Label>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" defaultValue="75" className="w-full" max="100" />
                                        <span className="text-slate-500">%</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t pt-4">
                                <div>
                                    <Label className="text-base font-semibold">Track Non-Billable Internal Time</Label>
                                    <p className="text-sm text-muted-foreground">Require staff to log hours for internal meetings and bench time.</p>
                                </div>
                                <Switch defaultChecked />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-100">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-slate-500" />
                                Billing & Invoicing
                            </CardTitle>
                            <CardDescription>Configure localization and tax defaults for contracts.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Default Currency</Label>
                                    <Select defaultValue="usd">
                                        <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="usd">USD ($)</SelectItem>
                                            <SelectItem value="eur">EUR (€)</SelectItem>
                                            <SelectItem value="gbp">GBP (£)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Default Tax/VAT Rate (%)</Label>
                                    <Input type="number" defaultValue="10" />
                                </div>
                            </div>
                            <Button className="mt-4 gap-2 bg-slate-900"><Save className="w-4 h-4" /> Save Default Settings</Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
