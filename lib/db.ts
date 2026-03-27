import { PrismaClient } from "@prisma/client";

import { sqliteAdapter } from "@/lib/prisma-adapter";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: sqliteAdapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

export const prisma = db;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
