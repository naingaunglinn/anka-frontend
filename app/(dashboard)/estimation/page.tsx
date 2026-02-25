import { EstimationSimulator } from '@/components/estimation/EstimationSimulator';

export default function EstimationPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Estimation Engine</h2>
                <p className="text-muted-foreground mt-1">Simulate margins and calculate project costs with precision.</p>
            </div>

            <EstimationSimulator />
        </div>
    );
}
