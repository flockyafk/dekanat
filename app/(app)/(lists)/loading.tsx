import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 py-6" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </main>
  );
}
