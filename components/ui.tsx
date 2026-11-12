import type { ReactNode } from "react";

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="content" tabIndex={-1} className="mx-auto w-full max-w-xl flex-1 px-4 py-6 outline-none">
      <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
      <div className="space-y-4">{children}</div>
    </main>
  );
}

export function Card({
  title,
  children,
  id,
}: {
  title?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-line bg-surface p-4"
    >
      {title && (
        <h2 id={id} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-muted">{children}</p>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-line ${className}`} />;
}

export function Badge({ tone, children }: { tone: "warn" | "danger" | "ok" | "brand"; children: ReactNode }) {
  const cls = {
    warn: "bg-warn-bg text-warn",
    danger: "bg-danger-bg text-danger",
    ok: "bg-ok-bg text-ok",
    brand: "bg-brand-soft text-brand",
  }[tone];
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <PageShell title={title}>
      <Card>
        <EmptyText>Этот раздел появится в ближайших шагах.</EmptyText>
      </Card>
    </PageShell>
  );
}
