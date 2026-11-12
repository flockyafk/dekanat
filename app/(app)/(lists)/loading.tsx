import { PageSkeleton } from "@/components/skeletons";

// Экран загрузки по умолчанию для страниц группы (lists), он же для «Сегодня»
export default function Loading() {
  return <PageSkeleton blocks={["lg", "md", "md", "md", "lg"]} />;
}
