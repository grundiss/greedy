export function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return v.toFixed(decimals);
}

export function fmtLarge(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return new Intl.NumberFormat().format(Math.round(v));
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
