import { Badge } from "@/components/ui";

/** Статус заявки: цвет и текст (не только цвет). */
export function StatusBadge({ status }: { status: string }) {
  const tone = status === "Готова" ? "ok" : status === "Отклонена" ? "danger" : status === "В работе" ? "warn" : "brand";
  return <Badge tone={tone}>{status}</Badge>;
}
