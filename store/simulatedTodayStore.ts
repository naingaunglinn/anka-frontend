import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * "Time machine" override for testing. When `simulatedDate` is set (YYYY-MM-DD),
 * every schedule-tracking query passes it as `?as_of=...` so the variance
 * algorithm treats that date as today. When null, the real `Carbon::today()` is
 * used server-side.
 *
 * Persisted to localStorage so refresh keeps the test view. URL `?as_of=...`
 * takes precedence on page mount (see `SimulatedDateBar` hydration).
 */
interface SimulatedTodayState {
    simulatedDate: string | null;
    setSimulatedDate: (date: string | null) => void;
    reset: () => void;
}

export const useSimulatedToday = create<SimulatedTodayState>()(
    persist(
        (set) => ({
            simulatedDate: null,
            setSimulatedDate: (date) => set({ simulatedDate: date || null }),
            reset: () => set({ simulatedDate: null }),
        }),
        {
            name: 'simulated-today',
            skipHydration: true,
        },
    ),
);
