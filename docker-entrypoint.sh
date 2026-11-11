#!/bin/sh
set -e
# При каждом старте: применить миграции и заполнить базу, если она пустая.
mkdir -p /data
npx prisma migrate deploy
SEED_ONLY_IF_EMPTY=1 npx tsx prisma/seed.ts
# Переносы пар и дедлайны привязаны к дате, обновляем при каждом старте
npx tsx prisma/refresh-demo.ts
exec npx next start -p "${PORT:-8080}" -H 0.0.0.0
