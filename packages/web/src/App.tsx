import type { HealthResponse } from '@greedy/shared';
import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-slate-900">
      <h1 className="text-4xl font-bold tracking-tight">Greedy</h1>
      <p className="text-slate-500">React + Vite + Tailwind + Fastify + Drizzle</p>
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-4 shadow-sm">
        {health ? (
          <span className="text-green-600">API: {health.status}</span>
        ) : error ? (
          <span className="text-red-600">API error: {error}</span>
        ) : (
          <span className="text-slate-400">Checking API…</span>
        )}
      </div>
    </div>
  );
}
