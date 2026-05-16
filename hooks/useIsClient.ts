import { useSyncExternalStore } from 'react';

/**
 * Returns true after hydration on the client; false during SSR / first render.
 *
 * Use this in place of the common pattern:
 *
 *   const [mounted, setMounted] = useState(false);
 *   useEffect(() => setMounted(true), []);
 *
 * The setState-in-effect form trips `react-hooks/set-state-in-effect` (lint
 * flags the cascading-render cost). `useSyncExternalStore` with a no-op
 * subscribe and asymmetric snapshots (`true` on client, `false` on server)
 * achieves the same gate without any state update or effect, and avoids the
 * extra render cycle.
 *
 * Useful for SSR-incompatible widgets like `@hello-pangea/dnd` (Kanban) and
 * for staffing-page logic that needs to wait for `window` before reading
 * persisted store data.
 */
const emptyUnsubscribe = () => {};
const subscribe = () => emptyUnsubscribe;

export function useIsClient(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => true,   // client snapshot
        () => false,  // server snapshot
    );
}
