import knex, { Knex } from "knex";
import { config } from "../config";

let db: Knex;

export function getDb(): Knex {
  if (!db) {
    db = knex({
      client: "pg",
      connection: config.database.url,
      pool: {
        min: config.isProd ? 2 : 0,
        max: config.isProd ? 20 : 10,
      },
    });
  }
  return db;
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const db = getDb();
    await db.raw("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
  }
}
