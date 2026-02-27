'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Deal } from './KanbanBoard';

interface DealFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (deal: Omit<Deal, 'id'> | Deal) => void;
    initialData?: Deal | null;
}

export function DealForm({ isOpen, onClose, onSave, initialData }: DealFormProps) {
    const [name, setName] = useState('');
    const [client, setClient] = useState('');
    const [estimatedValue, setEstimatedValue] = useState<number | ''>('');
    const [winProbability, setWinProbability] = useState<number | ''>('');
    const [columnId, setColumnId] = useState('lead');

    useEffect(() => {
        if (initialData && isOpen) {
            setName(initialData.name);
            setClient(initialData.client);
            setEstimatedValue(initialData.estimatedValue);
            setWinProbability(initialData.winProbability);
            setColumnId(initialData.columnId);
        } else if (isOpen) {
            setName('');
            setClient('');
            setEstimatedValue('');
            setWinProbability(50);
            setColumnId('lead');
        }
    }, [initialData, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const dealData = {
            name,
            client,
            estimatedValue: Number(estimatedValue) || 0,
            winProbability: Number(winProbability) || 0,
            columnId,
        };

        if (initialData) {
            onSave({ ...dealData, id: initialData.id });
        } else {
            onSave(dealData);
        }
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{initialData ? 'Edit Deal' : 'Add New Deal'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">Name</Label>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="client" className="text-right">Client</Label>
                            <Input id="client" value={client} onChange={(e) => setClient(e.target.value)} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="value" className="text-right">Value ($)</Label>
                            <Input id="value" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value ? Number(e.target.value) : '')} className="col-span-3" required min="0" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="probability" className="text-left">Win Prob (%)</Label>
                            <Input id="probability" type="number" value={winProbability} onChange={(e) => setWinProbability(e.target.value ? Number(e.target.value) : '')} className="col-span-3" required min="0" max="100" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="stage" className="text-right">Stage</Label>
                            <div className="col-span-3">
                                <Select value={columnId} onValueChange={setColumnId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select stage" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="lead">Lead</SelectItem>
                                        <SelectItem value="opportunity">Opportunity</SelectItem>
                                        <SelectItem value="proposal">Proposal</SelectItem>
                                        <SelectItem value="contract">Contract</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Save changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
