import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db, closeDb } from "./db.js";

const migrationsPath = join(process.cwd(), "../../packages/db/migrations");

async function migrationFiles(path: string) {
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await migrationFiles(entryPath)));
    } else if (entry.name.endsWith(".sql")) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

try {
  for (const migrationPath of await migrationFiles(migrationsPath)) {
    const sql = await readFile(migrationPath, "utf8");
    await db.query(sql);
    console.log(`Applied migration: ${migrationPath}`);
  }
  console.log("Database migrations complete.");
} finally {
  await closeDb();
}
