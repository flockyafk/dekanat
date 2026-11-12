// Дополнительные данные только для e2e-базы (data/e2e.db): студент без данных, чтобы проверять пустые состояния.
// Рабочая и демо-база это не затрагивает: скрипт сам отказывается работать на любой другой базе.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Точное значение, а не «содержит»: другой путь (рабочий, демо, боевой) не подойдёт. Проверка идёт до подключения.
if (process.env.DATABASE_URL !== "file:../data/e2e.db") {
  throw new Error("extra-seed работает только на e2e-базе (file:../data/e2e.db)");
}

const prisma = new PrismaClient();

async function main() {
  if (await prisma.user.findUnique({ where: { login: "empty1" } })) {
    console.log("e2e: студент без данных уже есть");
    return;
  }
  const group = await prisma.group.create({ data: { name: "ПУСТО-001" } });
  await prisma.user.create({
    data: {
      login: "empty1",
      passwordHash: bcrypt.hashSync("demo-empty-1", 10),
      role: "student",
      profile: {
        create: {
          fullName: "Пустов Павел Павлович",
          faculty: "Международных отношений",
          direction: "Международные отношения",
          course: 1,
          groupId: group.id,
          recordBook: "Т-99001",
          email: "pavel.pustov@example.test",
        },
      },
    },
  });
  console.log("e2e: добавлен студент без данных (empty1)");
}

main().finally(() => prisma.$disconnect());
