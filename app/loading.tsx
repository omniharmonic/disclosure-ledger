export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-40 animate-pulse rounded bg-[var(--color-rule-soft)]" />
      <div className="h-9 w-2/3 animate-pulse rounded bg-[var(--color-rule-soft)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--color-rule-soft)]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-[var(--color-rule-soft)]" />
    </div>
  );
}
