'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Shield, Lock } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import {
    useTenantAppRoles,
    usePermissionCatalog,
    useTenantAppRoleMutations,
    type TenantAppRole,
    type PermissionCatalogEntry,
} from '@/lib/queries/tenantAppRoles';
import { normalizeError } from '@/lib/errorHandler';
import toast from 'react-hot-toast';

export default function TenantRolesPage() {
    const { allowed: canManage } = usePermission('manage_tenant');
    const rolesQ = useTenantAppRoles();
    const catalogQ = usePermissionCatalog();
    const { create, update, remove } = useTenantAppRoleMutations();

    const [editing, setEditing] = useState<TenantAppRole | null>(null);
    const [creating, setCreating] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<TenantAppRole | null>(null);

    const roles = rolesQ.data ?? [];

    // Group catalog entries for display. Memo on the React Query data ref —
    // the array is stable across renders until the query refetches.
    const grouped = useMemo(() => {
        const map = new Map<string, PermissionCatalogEntry[]>();
        for (const entry of (catalogQ.data ?? [])) {
            if (!map.has(entry.group)) map.set(entry.group, []);
            map.get(entry.group)!.push(entry);
        }
        return Array.from(map.entries());
    }, [catalogQ.data]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#171717]">Roles & Permissions</h1>
                    <p className="text-[#8a8a8a] mt-1">
                        Control what each role can see and do. System roles can have their permissions edited but can&apos;t be renamed or deleted.
                    </p>
                </div>
                <Button
                    onClick={() => setCreating(true)}
                    disabled={!canManage}
                    title={canManage ? '' : 'Only users with manage_tenant can create roles.'}
                    className="bg-[#00a7f4] hover:bg-[#0086c4]"
                >
                    <Plus className="h-4 w-4 mr-2" /> New role
                </Button>
            </div>

            <Card className="shadow-sm border-[#e6e9ee]">
                <CardHeader>
                    <CardTitle className="text-base font-semibold">Tenant roles</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Role</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Permissions</TableHead>
                                <TableHead className="w-[120px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rolesQ.isLoading && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-6 text-[#8a8a8a]">Loading roles…</TableCell>
                                </TableRow>
                            )}
                            {!rolesQ.isLoading && roles.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-6 text-[#8a8a8a]">No roles yet.</TableCell>
                                </TableRow>
                            )}
                            {roles.map((role) => (
                                <TableRow key={role.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-[#0086c4]" />
                                            <span className="font-medium text-[#171717]">{role.name}</span>
                                            {role.isSystem && (
                                                <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                                                    <Lock className="h-3 w-3 mr-1" /> System
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-[#4a4a4a]">
                                        {role.description ?? <span className="text-[#a0a0a0]">—</span>}
                                    </TableCell>
                                    <TableCell>
                                        {role.permissions.includes('all') ? (
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">All permissions</Badge>
                                        ) : (
                                            <span className="text-sm text-[#4a4a4a]">{role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setEditing(role)}
                                            disabled={!canManage}
                                            title={canManage ? 'Edit role' : 'Only users with manage_tenant can edit roles.'}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                                            onClick={() => setDeleteTarget(role)}
                                            disabled={!canManage || role.isSystem}
                                            title={
                                                !canManage ? 'Only users with manage_tenant can delete roles.' :
                                                role.isSystem ? 'System roles cannot be deleted.' :
                                                'Delete role'
                                            }
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Create / edit dialog — shared form. Keyed on the role id (or
                'new') so the inner useState defaults re-initialize naturally
                when switching targets, no useEffect needed. */}
            {(creating || editing) && (
                <RoleEditorDialog
                    key={editing?.id ?? 'new'}
                    open
                    role={editing}
                    grouped={grouped}
                    catalogLoading={catalogQ.isLoading}
                    onClose={() => { setCreating(false); setEditing(null); }}
                    onSave={async (payload) => {
                        try {
                            if (editing) {
                                await update.mutateAsync({ id: editing.id, payload });
                                toast.success(`Role "${editing.name}" updated.`);
                            } else {
                                await create.mutateAsync(payload);
                                toast.success(`Role "${payload.name}" created.`);
                            }
                            setCreating(false);
                            setEditing(null);
                        } catch (err) {
                            toast.error(normalizeError(err).message);
                        }
                    }}
                    saving={create.isPending || update.isPending}
                />
            )}

            {/* Delete confirmation */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete role &quot;{deleteTarget?.name}&quot;?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#4a4a4a]">
                        This will permanently delete the role. Users still assigned to this role won&apos;t be deleted —
                        but they will lose all permissions until you reassign them to another role.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button
                            className="bg-rose-600 hover:bg-rose-700"
                            disabled={remove.isPending}
                            onClick={async () => {
                                if (!deleteTarget) return;
                                try {
                                    await remove.mutateAsync(deleteTarget.id);
                                    toast.success(`Role "${deleteTarget.name}" deleted.`);
                                    setDeleteTarget(null);
                                } catch (err) {
                                    toast.error(normalizeError(err).message);
                                }
                            }}
                        >
                            {remove.isPending ? 'Deleting…' : 'Delete role'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Role editor dialog (create + edit share the same form).
// ─────────────────────────────────────────────────────────────────────────

interface RoleEditorDialogProps {
    open: boolean;
    role: TenantAppRole | null;
    grouped: Array<[string, PermissionCatalogEntry[]]>;
    catalogLoading: boolean;
    saving: boolean;
    onClose: () => void;
    onSave: (payload: { name: string; description: string | null; permissions: string[] }) => Promise<void> | void;
}

function RoleEditorDialog({ open, role, grouped, catalogLoading, saving, onClose, onSave }: RoleEditorDialogProps) {
    // Lazy initial state from props — the parent re-keys this component when
    // switching between create / edit / different role, so these initialisers
    // run fresh each time instead of needing a useEffect reset.
    const initialPerms = role?.permissions ?? [];
    const [name, setName] = useState(role?.name ?? '');
    const [description, setDescription] = useState(role?.description ?? '');
    const [perms, setPerms] = useState<string[]>(initialPerms.filter((p) => p !== 'all'));
    const [adminAll, setAdminAll] = useState(initialPerms.includes('all'));

    const isAdminSystem = !!(role?.isSystem && role.name === 'Admin');
    const togglePerm = (key: string) => {
        setPerms((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
    };

    const handleSubmit = () => {
        if (!name.trim()) return;
        const finalPerms = isAdminSystem || adminAll ? ['all'] : perms;
        onSave({
            name: name.trim(),
            description: description.trim() ? description.trim() : null,
            permissions: finalPerms,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{role ? `Edit role: ${role.name}` : 'Create new role'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <Label htmlFor="role-name">Role name</Label>
                        <Input
                            id="role-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={role?.isSystem}
                            placeholder="e.g. Junior Sales"
                            className="mt-1"
                        />
                        {role?.isSystem && (
                            <p className="text-xs text-[#8a8a8a] mt-1">System roles can&apos;t be renamed.</p>
                        )}
                    </div>

                    <div>
                        <Label htmlFor="role-desc">Description (optional)</Label>
                        <Textarea
                            id="role-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this role do?"
                            rows={2}
                            className="mt-1"
                        />
                    </div>

                    <div>
                        <Label className="mb-2 block">Permissions</Label>

                        {isAdminSystem ? (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                                The Admin role always has every permission (&quot;all&quot;). This cannot be changed.
                            </div>
                        ) : (
                            <>
                                <label className="flex items-center gap-2 rounded-md border border-[#e6e9ee] px-3 py-2 mb-3">
                                    <input
                                        type="checkbox"
                                        checked={adminAll}
                                        onChange={(e) => setAdminAll(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm">
                                        <span className="font-medium">Grant all permissions</span>
                                        <span className="text-[#8a8a8a] ml-2">— bypass everything, including future permissions added by Anka.</span>
                                    </span>
                                </label>

                                {catalogLoading ? (
                                    <p className="text-sm text-[#8a8a8a]">Loading permissions…</p>
                                ) : (
                                    <div className={adminAll ? 'opacity-50 pointer-events-none' : ''}>
                                        {grouped.map(([group, entries]) => (
                                            <div key={group} className="mb-4">
                                                <h4 className="text-xs uppercase tracking-wider text-[#8a8a8a] mb-2">{group}</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {entries.map((entry) => (
                                                        <label
                                                            key={entry.key}
                                                            className="flex items-start gap-2 rounded-md border border-[#e6e9ee] px-3 py-2 hover:bg-[#fafcfe] cursor-pointer"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={perms.includes(entry.key)}
                                                                onChange={() => togglePerm(entry.key)}
                                                                className="h-4 w-4 mt-0.5"
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-medium text-[#171717]">{entry.label}</div>
                                                                {entry.description && (
                                                                    <div className="text-xs text-[#8a8a8a]">{entry.description}</div>
                                                                )}
                                                                <div className="text-[10px] font-mono text-[#a0a0a0] mt-0.5">{entry.key}</div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={saving || !name.trim()} className="bg-[#00a7f4] hover:bg-[#0086c4]">
                        {saving ? 'Saving…' : (role ? 'Save changes' : 'Create role')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
