/** Подпись места проведения: номер получает слово «Аудитория», название («Актовый зал») показывается как есть. */
export function roomLabel(room: string): string {
  return /^\d/.test(room.trim()) ? `Аудитория ${room}` : room;
}
