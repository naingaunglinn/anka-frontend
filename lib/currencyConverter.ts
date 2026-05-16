import type { Currency } from './currencyConfig'

const DEFAULT_RATES: Record<string, number> = {
    MMK: 4500,
    JPY: 158,
    USD: 1,
}

/**
 * Get the exchange rate for a currency against USD.
 * Tenant overrides take precedence over hardcoded defaults.
 */
export function getExchangeRate(
    currency: string,
    tenantRates?: Record<string, number>
): number {
    return tenantRates?.[currency] ?? DEFAULT_RATES[currency] ?? 1
}

/**
 * Convert an amount from tenant currency to USD.
 * e.g. toUSD(5_000_000, 'MMK') → 1_111.11 (at rate 4500)
 */
export function toUSD(
    amount: number,
    currency: string,
    tenantRates?: Record<string, number>
): number {
    if (currency === 'USD') return amount
    const rate = getExchangeRate(currency, tenantRates)
    return rate > 0 ? amount / rate : amount
}

/**
 * Convert an amount from USD back to tenant currency.
 * e.g. fromUSD(1_111.11, 'MMK') → 5_000_000 (at rate 4500)
 */
export function fromUSD(
    amount: number,
    currency: string,
    tenantRates?: Record<string, number>
): number {
    if (currency === 'USD') return amount
    const rate = getExchangeRate(currency, tenantRates)
    return amount * rate
}

/**
 * Convert an employee's monetary fields to USD.
 */
export function convertEmployeeToUSD<T extends { monthlySalary: number; costPerHour: number }>(
    employee: T,
    currency: string,
    tenantRates?: Record<string, number>
): T {
    return {
        ...employee,
        monthlySalary: toUSD(employee.monthlySalary, currency, tenantRates),
        costPerHour: toUSD(employee.costPerHour, currency, tenantRates),
    }
}

/**
 * Convert an array of employees' monetary fields to USD.
 */
export function convertEmployeesToUSD<T extends { monthlySalary: number; costPerHour: number }>(
    employees: T[],
    currency: string,
    tenantRates?: Record<string, number>
): T[] {
    return employees.map(e => convertEmployeeToUSD(e, currency, tenantRates))
}
