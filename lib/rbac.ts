export type Role = 'Admin' | 'Executive' | 'Sales' | 'Delivery' | 'HR';

export const RolePermissions: Record<Role, string[]> = {
    Admin: ['all'],
    Executive: ['view_dashboard', 'view_reports', 'manage_tenant', 'view_projects', 'view_crm'],
    Sales: ['view_crm', 'manage_crm', 'manage_estimation', 'view_contracts'],
    Delivery: ['view_projects', 'manage_projects', 'track_time'],
    HR: ['manage_organization', 'view_employees', 'manage_employees'],
};

export const hasPermission = (userRole: Role, permission: string): boolean => {
    if (userRole === 'Admin') return true;
    return RolePermissions[userRole]?.includes(permission) || false;
};
