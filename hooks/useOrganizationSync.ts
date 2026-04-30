'use client'

import { useEffect, useState } from 'react'
import { useBusinessStore } from '@/store/businessStore'
import { fetchAllOrganizationData } from '@/lib/supabaseOrganization'
import toast from 'react-hot-toast'

export function useOrganizationSync() {
    const [syncing, setSyncing] = useState(true)
    const [syncError, setSyncError] = useState<string | null>(null)

    useEffect(() => {
        async function sync() {
            try {
                const data = await fetchAllOrganizationData()

                useBusinessStore.setState({
                    departments: data.departments,
                    roles: data.roles,
                    employees: data.employees,
                    globalOverheads: data.globalOverheads,
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
        }

        sync()
    }, [])

    return { syncing, syncError }
}
