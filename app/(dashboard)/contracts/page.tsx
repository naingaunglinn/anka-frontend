'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, MoreVertical, FileText, CheckCircle2, Clock, Upload, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useBusinessStore } from '@/store/businessStore';

export default function ContractsPage() {
    const store = useBusinessStore();
    const [isNewContractOpen, setIsNewContractOpen] = useState(false);

    const totalContractValue = store.contracts.reduce((sum, c) => sum + c.totalValue, 0);
    const totalRecognized = store.contracts.reduce((sum, c) => sum + c.revenueRecognized, 0);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contracts & Billing</h1>
                    <p className="text-slate-500 mt-1">Manage active contracts, milestones, and client invoices.</p>
                </div>
                <Dialog open={isNewContractOpen} onOpenChange={setIsNewContractOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-slate-900 gap-2">
                            <Plus className="h-4 w-4" /> New Contract
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create Contract</DialogTitle>
                            <DialogDescription>
                                Usually generated automatically when a deal is won in CRM.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Client Name</label>
                                <Input placeholder="Acme Corp" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Total Value</label>
                                <Input type="number" placeholder="50000" />
                            </div>
                            <Button className="w-full bg-slate-900" onClick={() => setIsNewContractOpen(false)}>Save Draft</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Active Contracts</p>
                            <FileText className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{store.contracts.filter(c => c.status === 'Active').length}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Total Contract Value</p>
                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                                <span className="text-emerald-600 font-bold">$</span>
                            </div>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">${totalContractValue.toLocaleString()}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Revenue Recognized</p>
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-emerald-600">${totalRecognized.toLocaleString()}</span>
                            <span className="text-sm font-medium text-slate-500">
                                ({totalContractValue > 0 ? Math.round((totalRecognized / totalContractValue) * 100) : 0}%)
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="contracts" className="space-y-6">
                <TabsList className="bg-slate-100/50 p-1 border border-slate-200/60">
                    <TabsTrigger value="contracts" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Active Contracts</TabsTrigger>
                    <TabsTrigger value="milestones" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Milestones</TabsTrigger>
                    <TabsTrigger value="invoices" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Invoices</TabsTrigger>
                </TabsList>

                <TabsContent value="contracts">
                    <Card className="shadow-sm border-slate-100">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Contract ID</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Total Value</TableHead>
                                    <TableHead className="text-right">Recognized</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {store.contracts.map((contract) => (
                                    <TableRow key={contract.id}>
                                        <TableCell className="font-medium">{contract.id}</TableCell>
                                        <TableCell>{contract.client}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                contract.status === 'Active' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    'bg-slate-100 text-slate-700 border-slate-200'
                                            }>
                                                {contract.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">${contract.totalValue.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-slate-600">${contract.revenueRecognized.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem>View Details</DropdownMenuItem>
                                                    <DropdownMenuItem>Edit Contract</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-rose-600">Archive</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {store.contracts.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-6 text-slate-500">No active contracts found. Win a deal in the CRM to auto-generate a contract.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="milestones">
                    <Card className="shadow-sm border-slate-100">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Contract</TableHead>
                                    <TableHead>Milestone Name</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {store.milestones.map((milestone) => (
                                    <TableRow key={milestone.id}>
                                        <TableCell className="text-slate-600">{milestone.contractId}</TableCell>
                                        <TableCell className="font-medium">{milestone.name}</TableCell>
                                        <TableCell>{milestone.dueDate}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                milestone.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    milestone.status === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        'bg-amber-50 text-amber-700 border-amber-200'
                                            }>
                                                {milestone.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">${milestone.amount.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="sm" className="h-8">Mark Done</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {store.milestones.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-6 text-slate-500">No milestones yet.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="invoices">
                    <Card className="shadow-sm border-slate-100">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Contract</TableHead>
                                    <TableHead>Issue Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {store.invoices.map((invoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell className="font-medium">{invoice.id}</TableCell>
                                        <TableCell className="text-slate-600">{invoice.contractId}</TableCell>
                                        <TableCell>{invoice.issueDate}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    invoice.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        'bg-slate-100 text-slate-700 border-slate-200'
                                            }>
                                                {invoice.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">${invoice.amount.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>
                                                    <DropdownMenuItem><CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Paid</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {store.invoices.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-6 text-slate-500">No invoices yet.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

            </Tabs>
        </div>
    );
}
