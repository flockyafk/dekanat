// Проверка ВСЕЙ истории git на секреты перед тем, как сделать репозиторий публичным: `npm run scan:history`.
// Ищет значение AI_API_KEY из локального .env (если файл есть), токены, приватные ключи, пароли кроме демо-паролей из сида,
// а также файлы .env, data/ и базы, которые когда-либо попадали в коммиты.
// Значения секретов НЕ выводятся: печатаются только тип находки, коммит и файл. Код выхода 1, если что-то найдено.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const cwd = process.cwd();

// Настоящий ключ из .env (его значение нигде не печатается)
let apiKey = "";
if (existsSync(".env")) {
  const m = /^AI_API_KEY=["']?([^"'\r\n]+)["']?\s*$/m.exec(readFileSync(".env", "utf8"));
  apiKey = m?.[1]?.trim() ?? "";
}

// Пароли из сида вымышленные и публичные (README, страница «О проекте»): их находками не считаем
const DEMO_PASSWORD = /demo-(student-\d|staff-\d|empty-\d)/;

// Заведомо поддельные строки из тестов (приманки, по которым тесты проверяют, что вопросы и ключ не попадают в журнал и ответы)
const TEST_DECOYS = /(СЕКРЕТНЫЙ-ВОПРОС|NOT-A-REAL-KEY|test-key-not-real|test-key-NOT)/i;

const patterns = [
  ["токен Bearer", /Bearer\s+[A-Za-z0-9._-]{20,}/],
  ["ключ вида sk-", /\bsk-[A-Za-z0-9]{20,}/],
  ["токен GitHub", /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ["ключ AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["приватный ключ", /BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY/],
  ["AI_API_KEY с настоящим значением", /^\+?\s*AI_API_KEY=(?!\s*$)(?!<)(?!["']?<)\S{12,}/],
  ["пароль в коде или настройках", /(password|passwd|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i],
];

const SKIP_FILES = /^(package-lock\.json|docs\/screens\/.*)$/;
const FORBIDDEN_PATHS = /^(\.env|data\/.*|.*\.db|.*\.db-journal|.*\.sqlite)$/;

const log = execSync("git log --all -p --no-color --format=\"@@commit %H\"", { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });

const findings = [];
let commit = "";
let file = "";
let commits = 0;
for (const line of log.split("\n")) {
  if (line.startsWith("@@commit ")) {
    commit = line.slice(9, 16);
    commits += 1;
    continue;
  }
  if (line.startsWith("+++ b/")) {
    file = line.slice(6);
    continue;
  }
  if (line.startsWith("+++ ") || !line.startsWith("+")) continue; // только добавленные строки
  if (SKIP_FILES.test(file)) continue;
  if (apiKey.length >= 12 && line.includes(apiKey)) findings.push({ kind: "ЗНАЧЕНИЕ AI_API_KEY ИЗ .env", commit, file });
  for (const [kind, re] of patterns) {
    if (re.test(line) && !DEMO_PASSWORD.test(line) && !TEST_DECOYS.test(line)) findings.push({ kind, commit, file });
  }
}

// Запрещённые файлы, которые когда-либо были в истории
const names = execSync("git log --all --name-only --pretty=format:", { cwd, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
for (const n of new Set(names)) {
  if (FORBIDDEN_PATHS.test(n) && n !== ".env.example") findings.push({ kind: "файл, которого не должно быть в истории", commit: "(история)", file: n });
}

const unique = [...new Map(findings.map((f) => [`${f.kind}|${f.commit}|${f.file}`, f])).values()];
console.log(`Коммитов проверено: ${commits}. Ключ из .env ${apiKey ? "искался" : "не искался (нет .env или ключа)"}.`);
if (unique.length === 0) {
  console.log("Находок нет: в истории git нет ключей, токенов, приватных ключей, паролей (кроме демо-паролей из сида) и запрещённых файлов.");
  process.exit(0);
}
console.log(`НАЙДЕНО (${unique.length}). Значения не показываются, смотрите коммит и файл:`);
for (const f of unique) console.log(` - ${f.kind}: коммит ${f.commit}, файл ${f.file}`);
process.exit(1);
