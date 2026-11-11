#!/bin/sh
set -e
# При каждом старте: применить миграции и заполнить базу, если она пустая.
mkdir -p /data
npx prisma migrate deploy
npx tsx prisma/seed.ts
exec npx next start -p "${PORT:-8080}" -H 0.0.0.0
