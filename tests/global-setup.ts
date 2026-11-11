import { execSync } from "node:child_process";

// Тесты идут на отдельной базе data/test.db, рабочая база не трогается.
export default function setup() {
  const env = { ...process.env, DATABASE_URL: "file:../data/test.db" };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });
}
