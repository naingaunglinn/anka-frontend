'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Printer, CheckCircle2, Clock } from 'lucide-react';

const mockContracts = [
    { id: 'CON-001', client: 'Acme Corp', value: 120000, revenueRecognized: 40000, status: 'Active' },
    { id: 'CON-002', client: 'Global Tech', value: 45000, revenueRecognized: 45000, status: 'Completed' },
];

const mockInvoices = [
    { id: 'INV-1042', contractId: 'CON-001', date: '2024-03-01', amount: 40000, tax: 4000, status: 'Paid' },
    { id: 'INV-1043', contractId: 'CON-001', date: '2024-04-01', amount: 40000, tax: 4000, status: 'Pending' },
];

const mockMilestones = [
    { id: 'MIL-01', contractId: 'CON-001', name: 'Project Kickoff', dueDate: '2024-03-15', amount: 20000, status: 'Completed' },
    { id: 'MIL-02', contractId: 'CON-001', name: 'Phase 1 Delivery', dueDate: '2024-04-30', amount: 50000, status: 'In Progress' },
    { id: 'MIL-03', contractId: 'CON-001', name: 'Final Handover', dueDate: '2024-06-15', amount: 50000, status: 'Pending' },
];

const mockPayments = [
    { id: 'PAY-8921', invoiceId: 'INV-1042', date: '2024-03-05', amount: 44000, method: 'Wire Transfer', status: 'Cleared' },
];

export default function ContractsPage() {
    const [selectedInvoice, setSelectedInvoice] = useState(mockInvoices[0]);
    const [isNewContractOpen, setIsNewContractOpen] = useState(false);
    const [viewContract, setViewContract] = useState<any>(null);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center print:hidden">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Contracts & Billing</h2>
                    <p className="text-muted-foreground mt-1">Manage client contracts, track milestones, and issue invoices.</p>
                </div>
                <Dialog open={isNewContractOpen} onOpenChange={setIsNewContractOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-slate-900 gap-2">
                            <FileText className="h-4 w-4" /> New Contract
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Contract</DialogTitle>
                            <DialogDescription>Enter the details for the new client contract.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Client Name</Label>
                                <Input placeholder="Acme Corp" />
                            </div>
                            <div className="space-y-2">
                                <Label>Total Value</Label>
                                <Input type="number" placeholder="100000" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setIsNewContractOpen(false)}>Cancel</Button>
                            <Button onClick={() => setIsNewContractOpen(false)}>Create Contract</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <Tabs defaultValue="list" className="w-full">
                <TabsList className="grid w-full grid-cols-4 bg-slate-100/50 mb-8 p-1 h-auto rounded-lg print:hidden">
                    <TabsTrigger value="list" className="py-2.5 data-[state=active]:bg-white rounded-md">Contracts List</TabsTrigger>
                    <TabsTrigger value="milestones" className="py-2.5 data-[state=active]:bg-white rounded-md">Milestones</TabsTrigger>
                    <TabsTrigger value="invoices" className="py-2.5 data-[state=active]:bg-white rounded-md">Invoices</TabsTrigger>
                    <TabsTrigger value="payments" className="py-2.5 data-[state=active]:bg-white rounded-md">Payments</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader>
                            <CardTitle>Active Contracts</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Contract ID</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead className="text-right">Total Value</TableHead>
                                        <TableHead className="text-right">Revenue Recognized</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mockContracts.map((contract) => (
                                        <TableRow key={contract.id}>
                                            <TableCell className="font-medium text-blue-600">{contract.id}</TableCell>
                                            <TableCell>{contract.client}</TableCell>
                                            <TableCell className="text-right">${contract.value.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">${contract.revenueRecognized.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge variant={contract.status === 'Completed' ? 'default' : 'secondary'} className={contract.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-100 text-blue-700'}>
                                                    {contract.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => setViewContract(contract)}>View Details</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Dialog open={!!viewContract} onOpenChange={(open) => !open && setViewContract(null)}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Contract Details</DialogTitle>
                                <DialogDescription>Information for {viewContract?.id}</DialogDescription>
                            </DialogHeader>
                            {viewContract && (
                                <div className="space-y-4 py-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><p className="text-xs text-muted-foreground">Client</p><p className="font-medium text-slate-900">{viewContract.client}</p></div>
                                        <div><p className="text-xs text-muted-foreground">Status</p>
                                            <Badge variant={viewContract.status === 'Completed' ? 'default' : 'secondary'} className={viewContract.status === 'Completed' ? 'bg-emerald-500 mt-1' : 'bg-blue-100 text-blue-700 mt-1'}>
                                                {viewContract.status}
                                            </Badge>
                                        </div>
                                        <div><p className="text-xs text-muted-foreground">Total Value</p><p className="font-medium text-slate-900">${viewContract.value.toLocaleString()}</p></div>
                                        <div><p className="text-xs text-muted-foreground">Revenue Recognized</p><p className="font-medium text-slate-900">${viewContract.revenueRecognized.toLocaleString()}</p></div>
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button onClick={() => setViewContract(null)}>Close</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                <TabsContent value="invoices" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-2 shadow-sm border-slate-100 print:hidden">
                            <CardHeader>
                                <CardTitle>Recent Invoices</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Invoice #</TableHead>
                                            <TableHead>Contract Focus</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead className="text-right">Tax</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {mockInvoices.map((inv) => (
                                            <TableRow
                                                key={inv.id}
                                                className={`cursor-pointer transition-colors ${selectedInvoice.id === inv.id ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                                                onClick={() => setSelectedInvoice(inv)}
                                            >
                                                <TableCell className="font-medium">{inv.id}</TableCell>
                                                <TableCell className="text-muted-foreground">{inv.contractId}</TableCell>
                                                <TableCell>{inv.date}</TableCell>
                                                <TableCell className="text-right">${inv.tax.toLocaleString()}</TableCell>
                                                <TableCell className="text-right font-bold">${(inv.amount + inv.tax).toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={inv.status === 'Paid' ? 'border-emerald-500 text-emerald-600' : 'border-amber-500 text-amber-600'}>
                                                        {inv.status === 'Paid' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                                                        {inv.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" title="Print Invoice" onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); handlePrint(); }}>
                                                        <Printer className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-slate-100 bg-slate-50 print:bg-white print:border-none print:shadow-none print:w-full print:m-0 print:p-0">
                            <CardHeader className="print:hidden">
                                <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Print Preview</CardTitle>
                            </CardHeader>
                            <CardContent className="print:p-0">
                                <div className="bg-white p-6 border rounded-sm shadow-sm aspect-[1/1.4] flex flex-col mx-auto max-w-sm print:max-w-none print:border-none print:shadow-none print:aspect-auto">
                                    <div className="flex justify-between items-start mb-8">
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-900">INVOICE</h3>
                                            <p className="text-xs text-muted-foreground">#{selectedInvoice.id}</p>
                                        </div>
                                        <div className="text-right text-xs text-muted-foreground">
                                            <p>Agency Digital Twin</p>
                                            <p>123 Tech Lane</p>
                                        </div>
                                    </div>

                                    <div className="text-sm space-y-1 mb-8">
                                        <p className="font-semibold">Billed To:</p>
                                        <p>Acme Corp</p>
                                    </div>

                                    <div className="flex-1 w-full border-t pt-4">
                                        <div className="flex justify-between text-xs font-semibold mb-2">
                                            <span>Description</span>
                                            <span>Amount</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-600 py-1">
                                            <span>Platform License & Services</span>
                                            <span>${selectedInvoice.amount.toLocaleString()}.00</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-600 py-1">
                                            <span>VAT/Tax</span>
                                            <span>${selectedInvoice.tax.toLocaleString()}.00</span>
                                        </div>
                                    </div>

                                    <div className="border-t pt-4 mt-auto">
                                        <div className="flex justify-between font-bold text-slate-900">
                                            <span>Total</span>
                                            <span>${(selectedInvoice.amount + selectedInvoice.tax).toLocaleString()}.00</span>
                                        </div>
                                        <Button className="w-full mt-6 gap-2 print:hidden" variant="outline" onClick={handlePrint}>
                                            <Printer className="w-4 h-4" /> Print PDF
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="milestones" className="space-y-4">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader>
                            <CardTitle>Contract Milestones</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Milestone ID</TableHead>
                                        <TableHead>Contract</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Due Date</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mockMilestones.map((milestone) => (
                                        <TableRow key={milestone.id}>
                                            <TableCell className="font-medium text-slate-500">{milestone.id}</TableCell>
                                            <TableCell>{milestone.contractId}</TableCell>
                                            <TableCell className="font-medium">{milestone.name}</TableCell>
                                            <TableCell>{milestone.dueDate}</TableCell>
                                            <TableCell className="text-right">${milestone.amount.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    milestone.status === 'Completed' ? 'border-emerald-500 text-emerald-600' :
                                                        milestone.status === 'In Progress' ? 'border-blue-500 text-blue-600' :
                                                            'border-slate-300 text-slate-600'
                                                }>
                                                    {milestone.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payments" className="space-y-4">
                    <Card className="shadow-sm border-slate-100">
                        <CardHeader>
                            <CardTitle>Payments Received</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Payment ID</TableHead>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Method</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mockPayments.map((payment) => (
                                        <TableRow key={payment.id}>
                                            <TableCell className="font-medium text-slate-500">{payment.id}</TableCell>
                                            <TableCell className="font-medium text-blue-600">{payment.invoiceId}</TableCell>
                                            <TableCell>{payment.date}</TableCell>
                                            <TableCell>{payment.method}</TableCell>
                                            <TableCell className="text-right font-bold text-emerald-600">${payment.amount.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="border-emerald-500 text-emerald-600 gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> {payment.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
