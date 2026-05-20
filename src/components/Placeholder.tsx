/** Honest placeholder for routes whose feature lands in a later phase. */
export function Placeholder({ title, phase, children }: {
  title: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-[var(--color-muted)]">{children}</p>
      <p className="font-mono text-xs text-[var(--color-muted)]">Lands in {phase}.</p>
    </div>
  );
}
