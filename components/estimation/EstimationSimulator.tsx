'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Calculator, Save } from 'lucide-react';

type FeatureResource = {
    id: string;
    featureName: string;
    role: string;
    hours: number;
    costRate: number;
};

const ROLES = [
    { name: 'Senior Developer', rate: 65 },
    { name: 'Mid Developer', rate: 45 },
    { name: 'UI/UX Designer', rate: 55 },
    { name: 'Project Manager', rate: 70 },
    { name: 'QA Engineer', rate: 40 },
];

export function EstimationSimulator() {
    const [resources, setResources] = useState<FeatureResource[]>([
        { id: '1', featureName: 'Authentication', role: 'Senior Developer', hours: 40, costRate: 65 },
        { id: '2', featureName: 'Database Design', role: 'Mid Developer', hours: 60, costRate: 45 },
    ]);

    const [margin, setMargin] = useState([30]); // Target Margin %
    const [version, setVersion] = useState<string>('v1.0 (Draft)');

    // Form states for new entry
    const [newFeature, setNewFeature] = useState('');
    const [newRole, setNewRole] = useState(ROLES[0].name);
    const [newHours, setNewHours] = useState('');

    const handleAdd = () => {
        if (!newFeature || !newHours) return;

        const roleOpt = ROLES.find(r => r.name === newRole) || ROLES[0];

        setResources([...resources, {
            id: Math.random().toString(),
            featureName: newFeature,
            role: roleOpt.name,
            hours: Number(newHours),
            costRate: roleOpt.rate,
        }]);

        setNewFeature('');
        setNewHours('');
    };

    const handleRemove = (id: string) => {
        setResources(resources.filter(r => r.id !== id));
    };

    // Calculations
    const totalCost = resources.reduce((sum, r) => sum + (r.hours * r.costRate), 0);
    // Margin = (Price - Cost) / Price  => Price = Cost / (1 - Margin/100)
    const targetMarginDecimal = margin[0] / 100;
    const suggestedPrice = targetMarginDecimal < 1 ? totalCost / (1 - targetMarginDecimal) : 0;
    const expectedProfit = suggestedPrice - totalCost;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-sm border-slate-100">
                    <CardHeader className="pb-4 border-b">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-lg">Feature Breakdown & Resource Assignment</CardTitle>
                                <CardDescription>Itemize the project scope to calculate base costs.</CardDescription>
                            </div>
                            <Select value={version} onValueChange={setVersion}>
                                <SelectTrigger className="w-[160px] h-8 text-xs bg-slate-50">
                                    <SelectValue placeholder="Version" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="v1.0 (Draft)">v1.0 (Draft)</SelectItem>
                                    <SelectItem value="v1.1 (Revised)">v1.1 (Revised)</SelectItem>
                                    <SelectItem value="v2.0 (Final)">v2.0 (Final)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Feature</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead className="text-right">Rate/hr</TableHead>
                                    <TableHead className="text-right">Hours</TableHead>
                                    <TableHead className="text-right">Cost</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {resources.map((res) => (
                                    <TableRow key={res.id}>
                                        <TableCell className="font-medium">{res.featureName}</TableCell>
                                        <TableCell>{res.role}</TableCell>
                                        <TableCell className="text-right">${res.costRate}</TableCell>
                                        <TableCell className="text-right">{res.hours}</TableCell>
                                        <TableCell className="text-right font-medium">${(res.hours * res.costRate).toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleRemove(res.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <div className="p-4 bg-slate-50 border-t flex gap-3 items-end">
                            <div className="flex-1 space-y-1">
                                <label className="text-xs font-medium text-slate-500">Feature Name</label>
                                <Input value={newFeature} onChange={e => setNewFeature(e.target.value)} placeholder="e.g. User Profile" className="h-9" />
                            </div>
                            <div className="w-[200px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">Role</label>
                                <Select value={newRole} onValueChange={setNewRole}>
                                    <SelectTrigger className="h-9 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ROLES.map(r => (
                                            <SelectItem key={r.name} value={r.name}>{r.name} (${r.rate}/hr)</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="w-[100px] space-y-1">
                                <label className="text-xs font-medium text-slate-500">Hours</label>
                                <Input type="number" min="1" value={newHours} onChange={e => setNewHours(e.target.value)} placeholder="0" className="h-9" />
                            </div>
                            <Button onClick={handleAdd} className="h-9 bg-slate-900 gap-2">
                                <Plus className="h-4 w-4" /> Add
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <Card className="shadow-sm border-slate-100 bg-slate-900 text-white">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg text-white">
                            <Calculator className="h-5 w-5 text-blue-400" />
                            Margin Simulator
                        </CardTitle>
                        <CardDescription className="text-slate-400">Drag to target margin</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-300">Target Margin</span>
                                <span className="text-2xl font-bold text-emerald-400">{margin[0]}%</span>
                            </div>
                            <Slider
                                value={margin}
                                onValueChange={setMargin}
                                max={80}
                                min={10}
                                step={1}
                                className="py-4"
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-800 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Total Project Cost</span>
                                <span className="font-medium">${totalCost.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Expected Profit</span>
                                <span className="font-medium text-emerald-400">+${expectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="pt-2 flex justify-between items-end border-t border-slate-800">
                                <span className="text-sm font-medium text-slate-300">Suggested Price</span>
                                <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                                    ${suggestedPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        </div>

                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 mt-4">
                            <Save className="h-4 w-4" /> Save Estimate {version}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
