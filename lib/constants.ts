// Каталог заявок (раздел 4.4 ТЗ) и статусы. Значения проверяются zod на сервере.
export const REQUEST_TYPES = [
  { value: "Справка об обучении", hint: "Например: нужна справка для банка. Укажите, куда и для чего." },
  { value: "Справка для военкомата", hint: "Укажите, в какой военкомат и к какому сроку нужна справка." },
  { value: "Заявление на пересдачу", hint: "Укажите дисциплину, дату экзамена и причину пересдачи." },
  { value: "Заявление на академическую выписку", hint: "Опишите причину и желаемый срок." },
  { value: "Свободное обращение в деканат", hint: "Опишите вопрос своими словами." },
] as const;

export const REQUEST_TYPE_VALUES = REQUEST_TYPES.map((t) => t.value) as [string, ...string[]];

export const REQUEST_STATUSES = ["Отправлена", "В работе", "Готова", "Отклонена"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Статусы, которые может поставить сотрудник (вернуть в «Отправлена» нельзя). */
export const STAFF_STATUSES = ["В работе", "Готова", "Отклонена"] as const;

export const MAX_REQUESTS_PER_DAY = 10;
