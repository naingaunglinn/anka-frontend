'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreVertical, FileText, CheckCircle2, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useContractList } from '@/lib/queries/contracts';
import { useInvoiceList, useInvoiceMutations } from '@/lib/queries/invoices';

export default function ContractsPage() {
    const contractsQuery = useContractList();
    const invoicesQuery = useInvoiceList();
    const { payInvoice } = useInvoiceMutations();
    const contracts = useMemo(() => contractsQuery.data?.data ?? [], [contractsQuery.data]);
    const invoices = useMemo(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data]);

    const totalContractValue = contracts.reduce((sum, c) => sum + c.totalValue, 0);
    const totalRecognized = contracts.reduce((sum, c) => sum + c.revenueRecognized, 0);
    const isLoading = contractsQuery.isLoading || invoicesQuery.isLoading;
    const isError = contractsQuery.isError || invoicesQuery.isError;
    const retry = () => {
        contractsQuery.refetch();
        invoicesQuery.refetch();
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contracts & Billing</h1>
                    <p className="text-slate-500 mt-1">Manage active contracts, milestones, and client invoices.</p>
                </div>
            </div>

            {isLoading && (
                <Card className="h-40 animate-pulse border-slate-100 bg-slate-100 shadow-sm" />
            )}

            {isError && (
                <Card className="border-slate-100 shadow-sm">
                    <CardContent className="flex h-40 flex-col items-center justify-center gap-3">
                        <p className="text-sm text-slate-600">Could not load contracts or invoices.</p>
                        <Button variant="outline" onClick={retry}>Retry</Button>
                    </CardContent>
                </Card>
            )}

            {!isLoading && !isError && <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-slate-100">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-500">Active Contracts</p>
                            <FileText className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-slate-900">{contracts.filter(c => c.status === 'Active').length}</span>
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
            </div>}

            {!isLoading && !isError && <Tabs defaultValue="contracts" className="space-y-6">
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
                                {contracts.map((contract) => (
                                    <TableRow key={contract.id}>
                                        <TableCell className="font-medium">{contract.contractNumber ?? contract.id}</TableCell>
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
                                {contracts.length === 0 && (
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
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-slate-500">No milestones endpoint is available yet.</TableCell>
                                </TableRow>
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
                                {invoices.map((invoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell className="font-medium">{invoice.invoiceNumber ?? invoice.id}</TableCell>
                                        <TableCell className="text-slate-600">{invoice.contractId}</TableCell>
                                        <TableCell>{invoice.issueDate}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    invoice.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        invoice.status === 'Overdue' ? 'bg-red-50 text-red-700 border-red-200' :
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
                                                    {invoice.status === 'Pending' || invoice.status === 'Overdue' ? (
                                                        <DropdownMenuItem onClick={() => payInvoice.mutate(invoice.id)}>
                                                            <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Paid
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {invoices.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-6 text-slate-500">No invoices yet.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

            </Tabs>}
        </div>
    );
}
