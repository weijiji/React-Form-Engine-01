import { createApp } from "./app";
import { getDb, closeDb } from "./db/connection";
import { config } from "./config";
import { logger } from "./middleware/logger";

async function main(): Promise<void> {
  const app = createApp();

  // Verify database connection on startup
  try {
    const db = getDb();
    await db.raw("SELECT 1");
    logger.info("Database connection established successfully");
  } catch (err) {
    logger.error({ err }, "Failed to connect to database — server starting in degraded mode");
  }

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
