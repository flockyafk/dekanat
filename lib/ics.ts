// Сборка файла календаря .ics (RFC 5545) из готового списка пар. Чистые функции без доступа к базе.
export type IcsEvent = {
  uid: string;
  date: string; // ГГГГ-ММ-ДД по Москве
  start: string; // ЧЧ:ММ по Москве
  end: string;
  title: string;
  location: string;
  description: string;
};

/** Экранирование текста по RFC 5545: обратная косая, точка с запятой, запятая, перевод строки. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

/** Длинные строки режутся до 75 байт, продолжение начинается с пробела. Символы не разрываются. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // пробел продолжения занимает один байт
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** Московское время (UTC+3) в формат UTC: 20261116T060000Z. */
export function mskToUtcStamp(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00+03:00`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(events: IcsEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Мой деканат//Концепт для MGIMO AI Challenge//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Мой деканат: расписание",
    "X-WR-TIMEZONE:Europe/Moscow",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${mskToUtcStamp(e.date, e.start)}`,
      `DTEND:${mskToUtcStamp(e.date, e.end)}`,
      `SUMMARY:${escapeIcsText(e.title)}`,
      `LOCATION:${escapeIcsText(e.location)}`,
      `DESCRIPTION:${escapeIcsText(e.description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
