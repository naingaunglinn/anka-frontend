'use client'

import { useCallback, useEffect, useState } from 'react'
import { useBusinessStore } from '@/store/businessStore'
import { fetchAllOrganizationData } from '@/lib/queries/organization'
import type { Employee, Engineer } from '@/types/business'
import toast from 'react-hot-toast'

function hasCapacityRole(employee: Employee): employee is Employee & { capacityRole: NonNullable<Employee['capacityRole']> } {
    return employee.status === 'Active' && !!employee.capacityRole
}

function employeesToEngineers(employees: Employee[]): Engineer[] {
    return employees
        .filter(hasCapacityRole)
        .map((employee) => ({
            id: employee.id,
            name: employee.name,
            role: employee.capacityRole,
            monthlySalary: employee.monthlySalary,
            monthlyCapacityHours: employee.workableHours,
        }))
}

export function useOrganizationSync() {
    const [syncing, setSyncing] = useState(true)
    const [syncError, setSyncError] = useState<string | null>(null)

    // Sync function exposed so the consumer can offer a Retry button on an
    // error panel. `useCallback` keeps the ref stable across renders.
    const sync = useCallback(async () => {
        setSyncing(true)
        setSyncError(null)
        try {
            const data = await fetchAllOrganizationData()

            useBusinessStore.setState({
                departments: data.departments,
                roles: data.roles,
                employees: data.employees,
                engineers: employeesToEngineers(data.employees),
                globalOverheads: data.globalOverheads,
                skills: data.skills,
                ...(data.companySettings
                    ? { companySettings: data.companySettings }
                    : {}
                ),
            })
        } catch (err) {
            const message = (err as Error).message
            setSyncError(message)
            toast.error(`Could not load organization data: ${message}`)
        } finally {
            setSyncing(false)
        }
    }, [])

    useEffect(() => {
        sync()
    }, [sync])

    return { syncing, syncError, retry: sync }
}
