import { getDb } from "./connection";
import { config } from "../config";
import { logger } from "../middleware/logger";

/**
 * Directories for migrations and seeds. In development the TypeScript sources
 * are run directly (via ts-node); in production the compiled JS is used.
 */
const migrationsDirectory = config.isProd
  ? "./dist/db/migrations"
  : "./src/db/migrations";
const seedsDirectory = config.isProd ? "./dist/db/seeds" : "./src/db/seeds";
const extension = config.isProd ? "js" : "ts";

/**
 * Apply all pending database migrations. Idempotent — safe to run on every
 * startup; already-applied migrations are skipped.
 */
export async function runMigrations(): Promise<void> {
  const db = getDb();
  const [batchNo, log] = await db.migrate.latest({
    directory: migrationsDirectory,
    extension,
  });

  if (log.length === 0) {
    logger.info("No pending migrations — database schema is up to date");
  } else {
    logger.info(
      `Applied ${log.length} migration(s) (batch ${batchNo}): ${log.join(", ")}`
    );
  }
}

/**
 * Seed the database only if it is empty. Guards against re-truncating user
 * data on every server restart.
 */
export async function runSeedIfEmpty(): Promise<void> {
  const db = getDb();

  const existingUser = await db("users").first("id");
  if (existingUser) {
    logger.info("Seed skipped — database already contains data");
    return;
  }

  const [log] = await db.seed.run({
    directory: seedsDirectory,
    extension,
  });
  logger.info(`Seeded database: ${log.join(", ")}`);
}
