// Готовит отдельную базу и запускает сайт для e2e (порт 3200).
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(root, "data"), { recursive: true });

const env = {
  ...process.env,
  DATABASE_URL: "file:../data/e2e.db",
  NEXT_DIST_DIR: ".next-e2e",
  AI_DAILY_LIMIT: process.env.AI_DAILY_LIMIT || "50",
};
// Без E2E_REAL_AI помощник всегда на заглушке: ответы детерминированы, сеть не нужна
if (process.env.E2E_REAL_AI !== "1") env.AI_PROVIDER = "stub";
delete env.NODE_ENV;

const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const bin = (p) => path.join(root, "node_modules", p);

run([bin("prisma/build/index.js"), "migrate", "deploy"]);
run([bin("tsx/dist/cli.mjs"), "prisma/seed.ts"]);
run([bin("next/dist/bin/next"), "build"]);

const server = spawn(process.execPath, [bin("next/dist/bin/next"), "start", "-p", "3200"], {
  cwd: root,
  env: { ...env, NODE_ENV: "production" },
  stdio: "inherit",
});
const stop = () => server.kill();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
