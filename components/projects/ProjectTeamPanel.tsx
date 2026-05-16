'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Sparkles, Plus, Trash2, Users } from 'lucide-react'
import { useBusinessStore } from '@/store/businessStore'
import type { ProjectTeamAssignment } from '@/types/business'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface Props {
    projectId: string
    assignments: ProjectTeamAssignment[]
    onAssignmentsChange: (assignments: ProjectTeamAssignment[]) => void
}

export function ProjectTeamPanel({ projectId, assignments, onAssignmentsChange }: Props) {
    const [loadingAI, setLoadingAI] = useState(false)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
    const [allocatedHours, setAllocatedHours] = useState('')
    const [addErrors, setAddErrors] = useState<{ employee?: string; hours?: string }>({})

    const employees = useBusinessStore(s => s.employees)

    const unassignedEmployees = employees.filter(
        e => e.status === 'Active' && !assignments.some(a => a.employeeId === e.id)
    )

    async function handleAIAutoAssign() {
        setLoadingAI(true)
        try {
            const res = await api.post(`/projects/${projectId}/auto-assign`)
            const data = res.data.data ?? res.data
            const mapped = (Array.isArray(data) ? data : []).map((a: Record<string, unknown>) => ({
                id: a.id as string,
                projectId: a.project_id as string,
                employeeId: a.employee_id as string,
                employeeName: a.employee_name as string,
                allocatedHours: a.allocated_hours as number,
                assignmentSource: (a.assignment_source ?? 'ai') as 'manual' | 'ai' | 'deal_transfer',
                costPerHour: a.cost_per_hour as number | undefined,
                monthlySalary: a.monthly_salary as number | undefined,
            }))
            onAssignmentsChange(mapped)
            toast.success('Team auto-assigned based on skills!')
        } catch (err) {
            toast.error('Auto-assign failed. Try again.')
        } finally {
            setLoadingAI(false)
        }
    }

    async function handleAddAssignment() {
        const errs: typeof addErrors = {}
        if (!selectedEmployeeId) errs.employee = 'Select a team member.'
        if (!allocatedHours || Number(allocatedHours) <= 0) errs.hours = 'Enter valid hours.'
        setAddErrors(errs)
        if (Object.keys(errs).length > 0) return

        try {
            const res = await api.post(`/projects/${projectId}/team`, {
                employee_id: selectedEmployeeId,
                allocated_hours: Number(allocatedHours),
            })
            const a = res.data.data ?? res.data
            const assignment: ProjectTeamAssignment = {
                id: a.id,
                projectId: a.project_id,
                employeeId: a.employee_id,
                employeeName: a.employee_name,
                allocatedHours: a.allocated_hours,
                assignmentSource: a.assignment_source ?? 'manual',
            }
            onAssignmentsChange([...assignments, assignment])
            setIsAddOpen(false)
            setSelectedEmployeeId('')
            setAllocatedHours('')
            setAddErrors({})
            toast.success('Team member assigned!')
        } catch {
            toast.error('Failed to assign team member.')
        }
    }

    async function handleRemoveAssignment(id: string) {
        try {
            await api.delete(`/projects/${projectId}/team/${id}`)
            onAssignmentsChange(assignments.filter(a => a.id !== id))
            toast.success('Team member removed.')
        } catch {
            toast.error('Failed to remove team member.')
        }
    }

    const totalAssignedHours = assignments.reduce((sum, a) => sum + a.allocatedHours, 0)

    return (
        <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 bg-slate-50/80 border-b border-slate-100 rounded-t-xl">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-indigo-600" />
                        Project Team
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleAIAutoAssign}
                            disabled={loadingAI}
                            className="gap-1.5"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            {loadingAI ? 'Assigning...' : 'AI Auto-Assign'}
                        </Button>
                        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="gap-1.5">
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Member
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[400px]">
                                <DialogHeader>
                                    <DialogTitle>Assign Team Member</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">Employee</label>
                                        <Select value={selectedEmployeeId} onValueChange={v => { setSelectedEmployeeId(v); setAddErrors(p => ({ ...p, employee: undefined })); }}>
                                            <SelectTrigger aria-invalid={!!addErrors.employee}>
                                                <SelectValue placeholder="Select team member..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {unassignedEmployees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {addErrors.employee && <p className="text-xs text-destructive">{addErrors.employee}</p>}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium">Allocated Hours</label>
                                        <Input
                                            type="number"
                                            min="1"
                                            placeholder="e.g. 80"
                                            value={allocatedHours}
                                            onChange={e => { setAllocatedHours(e.target.value); setAddErrors(p => ({ ...p, hours: undefined })); }}
                                            aria-invalid={!!addErrors.hours}
                                        />
                                        {addErrors.hours && <p className="text-xs text-destructive">{addErrors.hours}</p>}
                                    </div>
                                    <Button className="w-full" onClick={handleAddAssignment}>
                                        Assign to Project
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                {assignments.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        <p className="text-sm">No team members assigned yet.</p>
                        <p className="text-xs mt-1">Use AI Auto-Assign or add manually.</p>
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50">
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead className="text-right">Allocated Hours</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {assignments.map(a => {
                                    const emp = employees.find(e => e.id === a.employeeId)
                                    const sourceBadge = {
                                        manual: 'bg-slate-100 text-slate-600',
                                        ai: 'bg-indigo-100 text-indigo-600',
                                        deal_transfer: 'bg-emerald-100 text-emerald-600',
                                    }[a.assignmentSource] ?? 'bg-slate-100'
                                    return (
                                        <TableRow key={a.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                                        {a.employeeName?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) ?? '?'}
                                                    </div>
                                                    <span className="font-medium text-slate-700">{a.employeeName ?? emp?.name ?? 'Unknown'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={sourceBadge}>
                                                    {a.assignmentSource === 'deal_transfer' ? 'From Deal' : a.assignmentSource}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{a.allocatedHours}h</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                                    onClick={() => handleRemoveAssignment(a.id)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                        <div className="flex justify-end mt-3 pt-3 border-t">
                            <span className="text-sm font-medium text-slate-600">
                                Total: <span className="text-slate-900">{totalAssignedHours}h</span>
                            </span>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}