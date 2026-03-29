import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import Database from "better-sqlite3";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

const relativeDatabasePath = `./tests/.tmp/test-${process.pid}.db`;
const databasePath = resolve(relativeDatabasePath);
const migrationsPath = resolve("prisma/migrations");

process.env.DATABASE_URL = `file:${relativeDatabasePath}`;

await mkdir(resolve("tests/.tmp"), { recursive: true });
await Promise.all(
  [databasePath, `${databasePath}-journal`, `${databasePath}-shm`, `${databasePath}-wal`].map(
    (path) => rm(path, { force: true }),
  ),
);

const migrationDirectories = (await readdir(migrationsPath, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const database = new Database(databasePath);

try {
  for (const migrationDirectory of migrationDirectories) {
    const migrationSql = await readFile(
      resolve(migrationsPath, migrationDirectory, "migration.sql"),
      "utf8",
    );

    database.exec(migrationSql);
  }
} finally {
  database.close();
}
