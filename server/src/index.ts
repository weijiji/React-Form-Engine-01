import { createApp } from "./app";
import { getDb, closeDb } from "./db/connection";
import { runMigrations, runSeedIfEmpty } from "./db/migrate";
import { startDraftPurge } from "./services/draftPurge";
import { config } from "./config";
import { logger } from "./middleware/logger";

/**
 * Verify the database connection and bring the schema up to date.
 * On failure the server still starts (in degraded mode) so the health
 * endpoint can report the outage rather than crashing the process.
 */
async function initializeDatabase(): Promise<void> {
  try {
    const db = getDb();
    await db.raw("SELECT 1");
    logger.info("Database connection established successfully");

    await runMigrations();
    await runSeedIfEmpty();
  } catch (err) {
    logger.error(
      { err },
      "Failed to initialize database — server starting in degraded mode"
    );
  }
}

async function main(): Promise<void> {
  const app = createApp();

  await initializeDatabase();

  // BR-15 (ADR-0014): 12h purge of expired draft-status instances. Best-effort;
  // instances.ts hides/rejects expired drafts even if the purge lags.
  startDraftPurge();

  const server = app.listen(config.port, () => {
    logger.info(
      `Server started on port ${config.port} [${config.env}]`,
    );
    logger.info(`Health check: http://localhost:${config.port}/api/v1/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await closeDb();
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
