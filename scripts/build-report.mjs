// Сборка PDF-описания работы из docs/report-short.md.
// Без новых зависимостей: простой конвертер markdown и Chromium из Playwright.
// Запуск: npm run report
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "docs/report-short.md");
const OUT_DIR = resolve(ROOT, "docs/report");
const OUT_PDF = resolve(OUT_DIR, "moy-dekanat-opisanie.pdf");

const TITLE = "Мой деканат. Описание работы";
const SITE = "https://dekanat-flockyafk.msk1.amvera.tech";
const AUTHOR = "Автор проекта: flockyafk (GitHub), репозиторий flockyafk/dekanat";
const NOTE = "Концепт для MGIMO AI Challenge. Не официальный сервис вуза";
const SUBTITLE = "MGIMO AI Challenge, номинация «Вайб-кодинг». Все данные вымышленные.";

const PHONE_CM = 6; // ширина скриншота с телефона
const DESKTOP_CM = 14; // ширина скриншота с компьютера

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Размер PNG из заголовка файла.
function pngSize(path) {
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function dataUri(path) {
  return "data:image/png;base64," + readFileSync(path).toString("base64");
}

// Встроенное оформление: код, жирный, ссылки.
function inline(text) {
  const codes = [];
  let t = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${esc(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  t = esc(t);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1">$1</a>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function figure(alt, rel) {
  const path = resolve(ROOT, rel);
  const { w, h } = pngSize(path);
  const cm = h > w ? PHONE_CM : DESKTOP_CM;
  return `<figure style="width:${cm}cm"><img src="${dataUri(path)}" style="width:${cm}cm" alt="${esc(alt)}"><figcaption>${esc(alt)}</figcaption></figure>`;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function convert(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^---+$/.test(line.trim())) { i++; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++; continue;
    }
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i]); i++; }
      const head = splitRow(rows[0]);
      const body = rows.slice(2).map(splitRow);
      out.push(
        "<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        body.map((r) => "<tr>" + r.map((c) => `<td${/^\d{2}\.\d{2}$/.test(c) ? ' class="nw"' : ""}>${inline(c)}</td>`).join("") + "</tr>").join("") +
        "</tbody></table>"
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>` + items.map((x) => `<li>${inline(x)}</li>`).join("") + `</${tag}>`);
      continue;
    }
    // Абзац: строки до пустой строки или до начала другого блока.
    const para = [];
    while (
      i < lines.length && lines[i].trim() && !/^(#{1,3}\s|---+$|\|)/.test(lines[i].trim()) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) { para.push(lines[i].trim()); i++; }
    const text = para.join(" ");
    const imgs = [...text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
    if (imgs.length && text.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim() === "") {
      out.push('<div class="row">' + imgs.map((m) => figure(m[1], m[2])).join("") + "</div>");
    } else {
      out.push(`<p${text.endsWith(":") ? ' class="lead"' : ""}>${inline(text)}</p>`);
    }
  }
  return out.join("\n");
}

// Первый заголовок и вводные строки до первой горизонтальной линии заменяет титульный блок.
function stripIntro(md) {
  const idx = md.indexOf("\n---");
  return idx === -1 ? md : md.slice(idx + 4);
}

const CSS = `
@page { size: A4; }
* { box-sizing: border-box; }
html { font-family: Arial, "Helvetica Neue", "Liberation Sans", sans-serif; font-size: 11pt; line-height: 1.3; color: #1a1a1a; }
body { margin: 0; }
.cover { border-bottom: 1px solid #888; padding-bottom: 6mm; margin-bottom: 6mm; }
.cover h1 { font-size: 22pt; margin: 0 0 3mm; line-height: 1.2; }
.cover p { margin: 1mm 0; }
.cover .note { margin-top: 3mm; font-style: italic; }
h2 { font-size: 15pt; margin: 7mm 0 3mm; line-height: 1.25; break-after: avoid; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; break-after: avoid; }
p { margin: 0 0 3mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0 0 1mm; }
code { font-family: "Courier New", Menlo, monospace; font-size: 9.5pt; background: #f1f1f1; padding: 0 1mm; border-radius: 1mm; overflow-wrap: anywhere; }
a { color: #0b4f9c; text-decoration: none; overflow-wrap: anywhere; }
table { border-collapse: collapse; width: 100%; margin: 0 0 4mm; font-size: 10pt; line-height: 1.25; }
th, td { border: 0.4pt solid #888; padding: 1.2mm 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
th { background: #eee; }
tr { break-inside: avoid; }
td.nw { white-space: nowrap; }
p.lead { break-after: avoid; }
.row { display: flex; justify-content: center; gap: 6mm; margin: 2mm 0 5mm; break-inside: avoid; }
figure { margin: 0; break-inside: avoid; }
figure img { display: block; height: auto; border: 0.4pt solid #bbb; }
figcaption { font-size: 9pt; line-height: 1.2; margin-top: 1.5mm; text-align: center; color: #333; }
`;

async function main() {
  const body = convert(stripIntro(readFileSync(SOURCE, "utf8")));
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(TITLE)}</title><style>${CSS}</style></head><body>
<div class="cover">
<h1>${esc(TITLE)}</h1>
<p>${esc(SUBTITLE)}</p>
<p>Сайт: <a href="${SITE}">${SITE}</a></p>
<p>${esc(AUTHOR)}</p>
<p class="note">${esc(NOTE)}</p>
</div>
${body}
</body></html>`;

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: OUT_PDF,
      format: "A4",
      margin: { top: "18mm", right: "18mm", bottom: "18mm", left: "18mm" },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:9px;font-family:Arial,sans-serif;color:#555;text-align:center;">' +
        '<span class="pageNumber"></span> из <span class="totalPages"></span></div>',
    });
  } finally {
    await browser.close();
  }
  console.log("Готово:", OUT_PDF);
}

main().catch((e) => { console.error(e); process.exit(1); });
